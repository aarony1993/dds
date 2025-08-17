// --- MODERNE IMPORTS ---
// Stellt sicher, dass alle benötigten Funktionen importiert werden.
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

// Import unserer Simulations-Engine
import { runSimulation } from "./simulation/engine.js";

// --- INITIALISIERUNG ---
admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();
setGlobalOptions({ region: "europe-west3" });

// ========================================================================================
// 1. SPIEL-SIMULATION
// ========================================================================================
export const startSimulation = onDocumentUpdated("games/{gameId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const gameId = event.params.gameId;

  if (before.status !== "scheduled" || after.status !== "live") {
    logger.info(`Kein Start für Spiel ${gameId}, Statusänderung nicht relevant.`);
    return null;
  }

  logger.info(`✅ Simulation für Spiel ${gameId} wird vorbereitet...`);
  const gameRef = db.collection("games").doc(gameId);

  try {
    const homeTeamDoc = await db.collection("teams").doc(after.teamHomeId).get();
    const awayTeamDoc = await db.collection("teams").doc(after.teamAwayId).get();
    if (!homeTeamDoc.exists || !awayTeamDoc.exists) throw new Error("Ein oder beide Teams wurden nicht gefunden.");
    
    const homeTeam = { id: homeTeamDoc.id, ...homeTeamDoc.data() };
    const awayTeam = { id: awayTeamDoc.id, ...awayTeamDoc.data() };

    const homeLineup = homeTeam.defaultFormation || [];
    const awayLineup = awayTeam.defaultFormation || [];
    if (homeLineup.length < 11 || awayLineup.length < 11) throw new Error(`Aufstellungen unvollständig.`);

    const allPlayerIds = [...homeLineup.map(p => p.playerId), ...awayLineup.map(p => p.playerId)];
    const playerPromises = allPlayerIds.map(id => db.collection("players").doc(id).get());
    const playerDocs = await Promise.all(playerPromises);
    const players = playerDocs.map(doc => ({ id: doc.id, ...doc.data() }));

    logger.info(`Daten für ${players.length} aufgestellte Spieler geladen. Starte Engine...`);
    
    const finalGameState = runSimulation(homeTeam, awayTeam, players, homeLineup, awayLineup);

    logger.info(`Simulation für ${gameId} beendet. Endstand: ${finalGameState.homeScore}-${finalGameState.awayScore}.`);
    
    await gameRef.update({
      status: "finished",
      homeScore: finalGameState.homeScore,
      awayScore: finalGameState.awayScore,
      simulationLog: finalGameState.log,
      playerRatings: finalGameState.playerRatings,
      playerStats: finalGameState.playerStats,
      homeFormationKey: homeTeam.formationKey || 'Unbekannt',
      awayFormationKey: awayTeam.formationKey || 'Unbekannt',      
      lineupHome: homeLineup,
      lineupAway: awayLineup,      
    });

    logger.info(`✅ Ergebnis für Spiel ${gameId} erfolgreich gespeichert.`);

  } catch (error) {
    logger.error(`Ein schwerwiegender Fehler ist in der Simulation für ${gameId} aufgetreten:`, error);
    await gameRef.update({
      status: "error",
      simulationLog: admin.firestore.FieldValue.arrayUnion(`Simulationsfehler: ${error.message}`),
    });
  }
  return null;
});

// ========================================================================================
// 2. SPIEL-EINLADUNG ANNEHMEN
// ========================================================================================
export const acceptGameInvite = onCall(async (request) => {
  const { inviteId } = request.data;
  if (!inviteId) throw new HttpsError('invalid-argument', 'inviteId fehlt.');

  const invRef = db.collection('game_invites').doc(inviteId);
  const invSnap = await invRef.get();
  if (!invSnap.exists) throw new HttpsError('not-found', 'Einladung nicht gefunden.');

  const inv = invSnap.data();
  const gameRef = db.collection('games').doc();

  await gameRef.set({
    teamHomeId: inv.proposingTeamId,
    teamAwayId: inv.receivingTeamId,
    teamIds: [inv.proposingTeamId, inv.receivingTeamId],
    scheduledStartTime: inv.proposedDate,
    status: 'scheduled',
    type: 'FS',
    competitionCategory: 'FS',
    competitionCode: null,
    homeScore: 0,
    awayScore: 0,
    simulationLog: []
  });

  await invRef.delete();
  return { message: "Spiel erfolgreich angesetzt!" };
});

// ========================================================================================
// 3. GEPLANTE SPIELE AUTOMATISCH STARTEN
// ========================================================================================
export const checkScheduledGames = onSchedule("every 1 minutes", async () => {
  logger.info("Suche nach zu startenden Spielen...");
  const now = new Date();
  const q = db.collection("games")
    .where("status", "==", "scheduled")
    .where("scheduledStartTime", "<=", now);

  const snap = await q.get();
  if (snap.empty) {
    logger.info("Keine Spiele zum Starten gefunden.");
    return null;
  }

  const batch = db.batch();
  snap.docs.forEach(doc => batch.update(doc.ref, { status: 'live' }));
  await batch.commit();
  logger.info(`${snap.size} Spiel(e) auf 'live' gesetzt.`);
  return null;
});

// ========================================================================================
// 4. ALTE EINLADUNGEN AUFRÄUMEN
// ========================================================================================
export const cleanupOldInvites = onSchedule("every 1 hours", async () => {
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const q = db.collection('game_invites')
    .where("status", "==", "pending")
    .where("createdAt", "<=", cutoff);
  const snap = await q.get();
  if (snap.empty) return null;

  const batch = db.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  logger.info(`${snap.size} alte Einladung(en) gelöscht.`);
  return null;
});

// ========================================================================================
// 5. ADMIN-ROLLE VERGEBEN
// ========================================================================================
export const addAdminRole = onCall(async (request) => {
  try {
    const userRec = await auth.getUserByEmail(request.data.email);
    await auth.setCustomUserClaims(userRec.uid, { admin: true });
    logger.info(`User ${request.data.email} ist jetzt Admin.`);
    return { message: `Erfolg! ${request.data.email} ist jetzt Admin.` };
  } catch (err) {
    logger.error("Fehler beim Hinzufügen der Admin-Rolle:", err);
    throw new HttpsError('internal', err.message);
  }
});

// ========================================================================================
// 6. TRANSFER AUSFÜHREN (Admin)
// ========================================================================================
export const executeTransfer = onCall(async (request) => {
  const { transferId } = request.data;
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

  try {
    const batch = db.batch();
    myPlayers.forEach(pid => batch.update(db.collection("players").doc(pid), { teamId: t.toTeamId }));
    oppPlayers.forEach(pid => batch.update(db.collection("players").doc(pid), { teamId: t.fromTeamId }));
    batch.update(transferRef, { status: "completed", executedAt: admin.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
    logger.info(`✅ Transfer ${transferId} abgeschlossen.`);
    return { success: true };
  } catch (err) {
    logger.error(`Fehler bei executeTransfer ${transferId}:`, err);
    throw new HttpsError("internal", "Fehler beim Ausführen des Transfers.");
  }
});