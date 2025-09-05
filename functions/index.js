// ESM + firebase-functions v2
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { createSeason } from "./simulation/season.js";
export { createSeason };

// Simulations-Engine
import { runSimulation } from "./simulation/engine.js";

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();
setGlobalOptions({ region: "europe-west3" });

// ---- Helper ----
const toNumber = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

async function incrementTeamBalance(teamId, delta) {
  const ref = db.collection("teams").doc(teamId);
  await ref.set(
    {
      budget: admin.firestore.FieldValue.increment(delta),
      balance: admin.firestore.FieldValue.increment(delta),
    },
    { merge: true }
  );
}

async function addTransaction(teamId, tx) {
  const ref = db.collection("teams").doc(teamId).collection("transactions").doc();
  await ref.set({
    ...tx,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    currency: tx.currency || "EUR",
    type: tx.type || "transfer",
  });
  return ref.id;
}

// ---- Persistenz: Disziplin & Verletzungen (nur Pflichtspiele) ----
async function applyPostMatchEffects(gameDoc, finalState, gameAfter) {
  const isFS = (gameAfter?.competitionCategory || '').toUpperCase() === 'FS';
  if (isFS) return; // in Freundschaftsspielen nichts persistieren

  const batch = db.batch();

  // 1) Gelbe increment
  const yellowInc = finalState.postMatch?.yellowIncrements || {};
  Object.entries(yellowInc).forEach(([playerId, inc]) => {
    const pRef = db.collection('players').doc(playerId);
    batch.set(pRef, { discipline: { yellows: admin.firestore.FieldValue.increment(inc) } }, { merge: true });
  });

  // 2) Sperren (aus Rot/2xGelb)
  const susp = Array.isArray(finalState.postMatch?.suspensions) ? finalState.postMatch.suspensions : [];
  susp.forEach(s => {
    if (!s?.playerId || !s?.matches) return;
    const pRef = db.collection('players').doc(s.playerId);
    // Competition-spezifische Sperre
    const key = `discipline.suspensions.${gameAfter.competitionCode || 'GEN'}`;
    batch.set(pRef, { [key]: admin.firestore.FieldValue.increment(s.matches) }, { merge: true });
  });

  // 3) Verletzungen
  const injuries = Array.isArray(finalState.postMatch?.injuries) ? finalState.postMatch.injuries : [];
  injuries.forEach(i => {
    if (!i?.playerId || !i?.matches) return;
    const pRef = db.collection('players').doc(i.playerId);
    batch.set(pRef, {
      injury: {
        matchesRemaining: i.matches,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }
    }, { merge: true });
  });

  await batch.commit();
}

// ========================================================================================
// 1) SPIEL-SIMULATION (scheduled -> live)
// ========================================================================================
export const startSimulation = onDocumentUpdated("games/{gameId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const gameId = event.params.gameId;

  if (!before || !after) return null;
  if (!(before.status === "scheduled" && after.status === "live")) {
    logger.info(`Kein Start für Spiel ${gameId}, Statusänderung nicht relevant.`);
    return null;
  }

  logger.info(`✅ Simulation für Spiel ${gameId} wird vorbereitet...`);
  const gameRef = db.collection("games").doc(gameId);

  try {
    const [homeTeamDoc, awayTeamDoc] = await Promise.all([
      db.collection("teams").doc(after.teamHomeId).get(),
      db.collection("teams").doc(after.teamAwayId).get(),
    ]);
    if (!homeTeamDoc.exists || !awayTeamDoc.exists) throw new Error("Ein oder beide Teams wurden nicht gefunden.");

    const homeTeam = { id: homeTeamDoc.id, ...homeTeamDoc.data() };
    const awayTeam = { id: awayTeamDoc.id, ...awayTeamDoc.data() };

    const homeLineup = homeTeam.defaultFormation || [];
    const awayLineup = awayTeam.defaultFormation || [];
    if (homeLineup.length < 11 || awayLineup.length < 11) throw new Error("Aufstellungen unvollständig.");

    const allPlayerIds = [...homeLineup.map(p => p.playerId), ...awayLineup.map(p => p.playerId)];
    const playerDocs = await Promise.all(allPlayerIds.map(id => db.collection("players").doc(id).get()));
    const players = playerDocs.map(snap => ({ id: snap.id, ...snap.data() }));

    logger.info(`Spieler geladen (${players.length}). Starte Engine...`);

    const options = {
      competitionCategory: after.competitionCategory || 'FS',
      competitionCode: after.competitionCode || null,
    };
    const finalGameState = runSimulation(homeTeam, awayTeam, players, homeLineup, awayLineup, options);

    // Logs: keine undefined
    const safeLog = (finalGameState.log || []).map(e => ({
      minute: Number.isFinite(e.minute) ? e.minute : 0,
      type: String(e.type || 'INFO'),
      data: e.data || {},
    }));

    await gameRef.update({
      status: "finished",
      homeScore: finalGameState.homeScore,
      awayScore: finalGameState.awayScore,
      simulationLog: safeLog,
      playerRatings: finalGameState.playerRatings || {},
      playerStats: finalGameState.playerStats || {},
      homeFormationKey: homeTeam.formationKey || "Unbekannt",
      awayFormationKey: awayTeam.formationKey || "Unbekannt",
      lineupHome: homeLineup,
      lineupAway: awayLineup,
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      simulationMode: "batch",
    });

    // Persistente Effekte anwenden (nur Pflichtspiel)
    await applyPostMatchEffects(gameRef, finalGameState, after);

    logger.info(`✅ Ergebnis für Spiel ${gameId} gespeichert.`);
  } catch (error) {
    logger.error(`Error: ❌ Fehler in Simulation für ${gameId}: ${error}`);
    await gameRef.update({
      status: "error",
      simulationLog: admin.firestore.FieldValue.arrayUnion(`Simulationsfehler: ${error.message}`),
    });
  }
  return null;
});

// ========================================================================================
// 2) SPIEL-EINLADUNG ANNEHMEN -> Game anlegen
// ========================================================================================
export const acceptGameInvite = onCall(async (request) => {
  const { inviteId } = request.data || {};
  if (!inviteId) throw new HttpsError("invalid-argument", "inviteId fehlt.");

  const invRef = db.collection("game_invites").doc(inviteId);
  const invSnap = await invRef.get();
  if (!invSnap.exists) throw new HttpsError("not-found", "Einladung nicht gefunden.");

  const inv = invSnap.data();
  const gameRef = db.collection("games").doc();

  await gameRef.set({
    teamHomeId: inv.proposingTeamId,
    teamAwayId: inv.receivingTeamId,
    teamIds: [inv.proposingTeamId, inv.receivingTeamId],
    scheduledStartTime: inv.proposedDate,
    status: "scheduled",
    type: "FS",
    competitionCategory: "FS",
    competitionCode: null,
    homeScore: 0,
    awayScore: 0,
    simulationLog: [],
    simulationMode: "batch",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await invRef.delete();
  return { message: "Spiel erfolgreich angesetzt!", gameId: gameRef.id };
});

// ========================================================================================
// 3) GEPLANTE SPIELE AUTOMATISCH STARTEN
// ========================================================================================
export const checkScheduledGames = onSchedule("every 1 minutes", async () => {
  const now = new Date();
  const q = db.collection("games").where("status", "==", "scheduled").where("scheduledStartTime", "<=", now);
  const snap = await q.get();
  if (snap.empty) return null;

  const batch = db.batch();
  snap.docs.forEach((doc) => batch.update(doc.ref, { status: "live" }));
  await batch.commit();
  return null;
});

// ========================================================================================
// 4) ALTE EINLADUNGEN AUFRÄUMEN
// ========================================================================================
export const cleanupOldInvites = onSchedule("every 1 hours", async () => {
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const q = db.collection("game_invites").where("status", "==", "pending").where("createdAt", "<=", cutoff);
  const snap = await q.get();
  if (snap.empty) return null;

  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return null;
});

// ========================================================================================
// 5) ADMIN-ROLLE VERGEBEN
// ========================================================================================
export const addAdminRole = onCall(async (request) => {
  try {
    const userRec = await auth.getUserByEmail(request.data.email);
    await auth.setCustomUserClaims(userRec.uid, { admin: true });
    return { message: `Erfolg! ${request.data.email} ist jetzt Admin.` };
  } catch (err) {
    throw new HttpsError("internal", err.message);
  }
});

// ========================================================================================
// 6) TRANSFER AUSFÜHREN (Admin)  **MIT BUCHUNG + HISTORIE**
// ========================================================================================
export const executeTransfer = onCall(async (request) => {
  const { transferId } = request.data || {};
  if (!transferId) throw new HttpsError("invalid-argument", "transferId fehlt.");

  const transferRef = db.collection("transfers").doc(transferId);
  const snap = await transferRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Transfer nicht gefunden.");

  const t = snap.data();
  if (t.status !== "acceptedByUser") {
    throw new HttpsError("failed-precondition", `Transfer im falschen Status (${t.status}).`);
  }

  const myPlayers = Array.isArray(t.myPlayers) ? t.myPlayers : [];
  const oppPlayers = Array.isArray(t.oppPlayers) ? t.oppPlayers : [];
  const myAmount = toNumber(t.myAmount);
  const oppAmount = toNumber(t.oppAmount);
  const net = myAmount - oppAmount;

  const fromTeamId = t.fromTeamId;
  const toTeamId = t.toTeamId;

  const [fromTeamSnap, toTeamSnap] = await Promise.all([
    db.collection("teams").doc(fromTeamId).get(),
    db.collection("teams").doc(toTeamId).get(),
  ]);
  const fromTeamName = fromTeamSnap.data()?.name || fromTeamId;
  const toTeamName = toTeamSnap.data()?.name || toTeamId;

  try {
    const batch = db.batch();

    myPlayers.forEach((pid) => batch.update(db.collection("players").doc(pid), { teamId: toTeamId }));
    oppPlayers.forEach((pid) => batch.update(db.collection("players").doc(pid), { teamId: fromTeamId }));

    batch.update(transferRef, {
      status: "completed",
      executedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    if (net !== 0) {
      await Promise.all([
        incrementTeamBalance(fromTeamId, -net),
        incrementTeamBalance(toTeamId, net),
      ]);

      const descFrom = net > 0
        ? `Ablöse an ${toTeamName} (Transfer ${transferId})`
        : `Ablöse von ${toTeamName} erhalten (Transfer ${transferId})`;
      const descTo = net > 0
        ? `Ablöse von ${fromTeamName} erhalten (Transfer ${transferId})`
        : `Ablöse an ${fromTeamName} (Transfer ${transferId})`;

      await Promise.all([
        addTransaction(fromTeamId, {
          amount: Math.abs(net),
          direction: net > 0 ? "out" : "in",
          description: descFrom,
          relatedTransferId: transferId,
          counterpartyTeamId: toTeamId,
          counterpartyTeamName: toTeamName,
        }),
        addTransaction(toTeamId, {
          amount: Math.abs(net),
          direction: net > 0 ? "in" : "out",
          description: descTo,
          relatedTransferId: transferId,
          counterpartyTeamId: fromTeamId,
          counterpartyTeamName: fromTeamName,
        }),
      ]);
    }

    await db.collection("transfer_history").add({
      transferId,
      fromTeamId,
      toTeamId,
      fromTeamName,
      toTeamName,
      myPlayers,
      oppPlayers,
      myAmount,
      oppAmount,
      netFlowFromFromTeamToToTeam: net,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdFromTransferAt: t.createdAt || null,
    });

    return { success: true, net };
  } catch (err) {
    throw new HttpsError("internal", "Fehler beim Ausführen des Transfers.");
  }
});
