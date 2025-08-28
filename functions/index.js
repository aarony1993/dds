// functions/index.js
// Nutzt firebase-functions v2 (ESM-Stil) + firebase-admin

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

// --- INIT ---
admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();
setGlobalOptions({ region: "europe-west3" });

// ---------------------------------------------------------
// Helper: Zahl normalisieren
const toNumber = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

// Helper: Budget/Balance per increment anpassen
async function incrementTeamBalance(teamId, delta) {
  const ref = db.collection("teams").doc(teamId);
  // Parallel budget und – falls vorhanden – balance korrigieren.
  await ref.set(
    {
      budget: admin.firestore.FieldValue.increment(delta),
      balance: admin.firestore.FieldValue.increment(delta),
    },
    { merge: true }
  );
}

// Helper: Transaktion anlegen
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

// ========================================================================================
// 1) SPIEL-SIMULATION (status: scheduled -> live  löst Simulation aus)
// ========================================================================================
export const startSimulation = onDocumentUpdated("games/{gameId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const gameId = event.params.gameId;

  if (!before || !after) return null;

  // Nur starten, wenn explizit von "scheduled" -> "live" gewechselt wurde
  if (!(before.status === "scheduled" && after.status === "live")) {
    logger.info(`Kein Start für Spiel ${gameId}, Statusänderung nicht relevant.`);
    return null;
  }

  logger.info(`✅ Simulation für Spiel ${gameId} wird vorbereitet...`);
  const gameRef = db.collection("games").doc(gameId);

  try {
    const homeTeamDoc = await db.collection("teams").doc(after.teamHomeId).get();
    const awayTeamDoc = await db.collection("teams").doc(after.teamAwayId).get();
    if (!homeTeamDoc.exists || !awayTeamDoc.exists) {
      throw new Error("Ein oder beide Teams wurden nicht gefunden.");
    }

    const homeTeam = { id: homeTeamDoc.id, ...homeTeamDoc.data() };
    const awayTeam = { id: awayTeamDoc.id, ...awayTeamDoc.data() };

    const homeLineup = homeTeam.defaultFormation || [];
    const awayLineup = awayTeam.defaultFormation || [];
    if (homeLineup.length < 11 || awayLineup.length < 11) {
      throw new Error("Aufstellungen unvollständig.");
    }

    const allPlayerIds = [
      ...homeLineup.map((p) => p.playerId),
      ...awayLineup.map((p) => p.playerId),
    ];
    const playerDocs = await Promise.all(
      allPlayerIds.map((id) => db.collection("players").doc(id).get())
    );
    const players = playerDocs.map((snap) => ({ id: snap.id, ...snap.data() }));

    logger.info(`Spieler geladen (${players.length}). Starte Engine...`);
    const finalGameState = runSimulation(
      homeTeam,
      awayTeam,
      players,
      homeLineup,
      awayLineup
    );

    await gameRef.update({
      status: "finished",
      homeScore: finalGameState.homeScore,
      awayScore: finalGameState.awayScore,
      simulationLog: finalGameState.log,
      playerRatings: finalGameState.playerRatings,
      playerStats: finalGameState.playerStats,
      homeFormationKey: homeTeam.formationKey || "Unbekannt",
      awayFormationKey: awayTeam.formationKey || "Unbekannt",
      lineupHome: homeLineup,
      lineupAway: awayLineup,
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      simulationMode: "batch",
    });

    logger.info(`✅ Ergebnis für Spiel ${gameId} gespeichert.`);
  } catch (error) {
    logger.error(`❌ Fehler in Simulation für ${gameId}:`, error);
    await gameRef.update({
      status: "error",
      simulationLog: admin.firestore.FieldValue.arrayUnion(
        `Simulationsfehler: ${error.message}`
      ),
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
// 3) GEPLANTE SPIELE AUTOMATISCH STARTEN (setzt scheduled -> live)
// ========================================================================================
export const checkScheduledGames = onSchedule("every 1 minutes", async () => {
  logger.info("Suche nach zu startenden Spielen…");
  const now = new Date();
  const q = db
    .collection("games")
    .where("status", "==", "scheduled")
    .where("scheduledStartTime", "<=", now);

  const snap = await q.get();
  if (snap.empty) {
    logger.info("Keine Spiele zum Starten gefunden.");
    return null;
  }

  const batch = db.batch();
  snap.docs.forEach((doc) => batch.update(doc.ref, { status: "live" }));
  await batch.commit();
  logger.info(`${snap.size} Spiel(e) auf 'live' gesetzt.`);
  return null;
});

// ========================================================================================
// 4) ALTE EINLADUNGEN AUFRÄUMEN
// ========================================================================================
export const cleanupOldInvites = onSchedule("every 1 hours", async () => {
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const q = db
    .collection("game_invites")
    .where("status", "==", "pending")
    .where("createdAt", "<=", cutoff);
  const snap = await q.get();
  if (snap.empty) return null;

  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  logger.info(`${snap.size} alte Einladung(en) gelöscht.`);
  return null;
});

// ========================================================================================
// 5) ADMIN-ROLLE VERGEBEN
// ========================================================================================
export const addAdminRole = onCall(async (request) => {
  try {
    const userRec = await auth.getUserByEmail(request.data.email);
    await auth.setCustomUserClaims(userRec.uid, { admin: true });
    logger.info(`User ${request.data.email} ist jetzt Admin.`);
    return { message: `Erfolg! ${request.data.email} ist jetzt Admin.` };
  } catch (err) {
    logger.error("Fehler beim Hinzufügen der Admin-Rolle:", err);
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
    throw new HttpsError(
      "failed-precondition",
      `Transfer im falschen Status (${t.status}).`
    );
  }

  const myPlayers = Array.isArray(t.myPlayers) ? t.myPlayers : [];
  const oppPlayers = Array.isArray(t.oppPlayers) ? t.oppPlayers : [];

  // Netto-Geldfluss: myAmount (vom fromTeam) minus oppAmount (vom toTeam)
  const myAmount = toNumber(t.myAmount);
  const oppAmount = toNumber(t.oppAmount);
  const net = myAmount - oppAmount; // >0: fromTeam zahlt toTeam; <0: toTeam zahlt fromTeam

  const fromTeamId = t.fromTeamId; // der Anbieter (dein UI schreibt das so)
  const toTeamId = t.toTeamId;

  // Teamnamen für Transaktionsbeschreibung nachladen (best effort)
  const [fromTeamSnap, toTeamSnap] = await Promise.all([
    db.collection("teams").doc(fromTeamId).get(),
    db.collection("teams").doc(toTeamId).get(),
  ]);
  const fromTeamName = fromTeamSnap.data()?.name || fromTeamId;
  const toTeamName = toTeamSnap.data()?.name || toTeamId;

  try {
    const batch = db.batch();

    // Spieler tauschen
    myPlayers.forEach((pid) =>
      batch.update(db.collection("players").doc(pid), { teamId: toTeamId })
    );
    oppPlayers.forEach((pid) =>
      batch.update(db.collection("players").doc(pid), { teamId: fromTeamId })
    );

    // Transferstatus abschließen
    batch.update(transferRef, {
      status: "completed",
      executedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    // Finanzbuchungen (außer wenn net = 0, dann nur History)
    if (net !== 0) {
      // fromTeam verliert "net" (wenn net>0) bzw. gewinnt (wenn net<0)
      await Promise.all([
        incrementTeamBalance(fromTeamId, -net),
        incrementTeamBalance(toTeamId, net),
      ]);

      // Transaktionseinträge
      const descFrom =
        net > 0
          ? `Ablöse an ${toTeamName} (Transfer ${transferId})`
          : `Ablöse von ${toTeamName} erhalten (Transfer ${transferId})`;
      const descTo =
        net > 0
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

    // Transfer-Historie (Top-Level)
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
      netFlowFromFromTeamToToTeam: net, // >0: Geld floss von from->to
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdFromTransferAt: t.createdAt || null,
    });

    logger.info(`✅ Transfer ${transferId} abgeschlossen und verbucht.`);
    return { success: true, net };
  } catch (err) {
    logger.error(`Fehler bei executeTransfer ${transferId}:`, err);
    throw new HttpsError("internal", "Fehler beim Ausführen des Transfers.");
  }
});
