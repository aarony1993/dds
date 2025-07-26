// functions/index.js
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const logger = require("firebase-functions/logger");

const { getNextGameState } = require("./simulationEngine");

initializeApp({ projectId: "deadlineday-sim" });
const db = getFirestore();
const auth = getAuth();

// --- HILFSFUNKTION: Spielerbewertungen berechnen ---
function calculateRatingsFromEvents(events, homePlayers, awayPlayers) {
  const ratings = {};
  // Initialnote 6.0 für alle teilnehmenden Spieler
  [...homePlayers, ...awayPlayers].forEach((player) => {
    ratings[player.id] = 6.0;
  });

  // Durch alle Ereignisse iterieren
  events.forEach((ev) => {
    const pid = ev.playerId;
    if (!pid || ratings[pid] === undefined) return;
    switch (ev.type) {
      case 'goal':
        ratings[pid] -= 1.0;
        break;
      case 'assist':
        ratings[pid] -= 0.7;
        break;
      case 'pass':
        ratings[pid] += ev.success ? -0.05 : +0.2;
        break;
      case 'duel':
        ratings[pid] += ev.success ? -0.1 : +0.2;
        break;
      case 'foul':
        ratings[pid] += 0.5;
        break;
      default:
        break;
    }
  });

  // Auf Bereich [1.0, 10.0] beschränken und auf 1 Dezimalstelle runden
  Object.keys(ratings).forEach((pid) => {
    ratings[pid] = Math.min(10.0, Math.max(1.0, Number(ratings[pid].toFixed(1))));
  });

  return ratings;
}

// --- SPIEL-SIMULATION (NEU, MODULAR) ---
exports.startSimulation = onDocumentUpdated(
  {
    document: "games/{gameId}",
    region: "europe-west3",
    memory: "512MiB",
    timeoutSeconds: 600,
  },
  async (event) => {
    const dataBefore = event.data.before.data();
    const dataAfter = event.data.after.data();

    // Nur bei Statuswechsel von scheduled zu live starten
    if (dataBefore.status === "scheduled" && dataAfter.status === "live") {
      const gameId = event.params.gameId;
      const gameRef = db.collection("games").doc(gameId);
      logger.info(`✅ Simulation für Spiel ${gameId} gestartet!`);

      try {
        // Teams und Spieler laden
        const [teamHomeDoc, teamAwayDoc] = await Promise.all([
          db.collection("teams").doc(dataAfter.teamHomeId).get(),
          db.collection("teams").doc(dataAfter.teamAwayId).get(),
        ]);
        if (!teamHomeDoc.exists || !teamAwayDoc.exists) throw new Error(`Team nicht gefunden.`);
        const teamHomeData = { id: teamHomeDoc.id, ...teamHomeDoc.data() };
        const teamAwayData = { id: teamAwayDoc.id, ...teamAwayDoc.data() };

        const [homePlayersSnap, awayPlayersSnap] = await Promise.all([
          db.collection("players").where("teamId", "==", teamHomeData.id).get(),
          db.collection("players").where("teamId", "==", teamAwayData.id).get(),
        ]);
        const allHomePlayers = homePlayersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const allAwayPlayers = awayPlayersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        // Initialen Spielstand anlegen
        let gameState = {
          minute: 0,
          events: [],
          score: { home: 0, away: 0 },
        };

        const totalTicks = 120;
        let currentTick = 0;
        const tickInterval = setInterval(async () => {
          try {
            currentTick++;
            gameState = getNextGameState(
              gameState,
              teamHomeData,
              teamAwayData,
              allHomePlayers,
              allAwayPlayers
            );

            const latestEvent = gameState.events[gameState.events.length - 1];

            await gameRef.update({
              liveTickerEvents: FieldValue.arrayUnion(latestEvent),
              minute: gameState.minute,
              scoreHome: gameState.score.home,
              scoreAway: gameState.score.away,
            });

            if (currentTick >= totalTicks || gameState.minute >= 90) {
              clearInterval(tickInterval);
              // Spielerbewertungen berechnen und speichern
              const ratings = calculateRatingsFromEvents(
                gameState.events,
                allHomePlayers,
                allAwayPlayers
              );
              await gameRef.update({
                status: "finished",
                playerRatings: ratings,
              });
              logger.info(`✅ Simulation für Spiel ${gameId} beendet.`);
            }
          } catch (err) {
            logger.error("Fehler im Simulationstakt:", err);
            clearInterval(tickInterval);
            await gameRef.update({
              status: "error",
              liveTickerEvents: FieldValue.arrayUnion({ text: `Simulationsfehler: ${err.message}` }),
            });
          }
        }, 5000);
      } catch (error) {
        logger.error(`Fehler in Simulation ${gameId}:`, error);
        await db.collection("games").doc(gameId).update({
          status: "error",
          liveTickerEvents: FieldValue.arrayUnion({ text: `Simulationsfehler: ${error.message}` }),
        });
      }
    }
    return null;
  }
);

// --- SPIEL-EINLADUNG ---
exports.acceptGameInvite = onCall(
  { region: "europe-west3" },
  async (request) => {
    const { inviteId } = request.data;
    if (!inviteId) throw new HttpsError('invalid-argument', 'inviteId fehlt.');
    const inviteRef = db.collection('game_invites').doc(inviteId);
    const inviteDoc = await inviteRef.get();
    if (!inviteDoc.exists) throw new HttpsError('not-found', 'Einladung nicht gefunden.');

    const inviteData = inviteDoc.data();
    const gameRef = db.collection('games').doc();
    await gameRef.set({
      teamHomeId: inviteData.proposingTeamId,
      teamAwayId: inviteData.receivingTeamId,
      teamIds: [inviteData.proposingTeamId, inviteData.receivingTeamId],
      scheduledStartTime: inviteData.proposedDate,
      status: 'scheduled',
      type: 'FS',
      competitionCategory: 'FS',
      competitionCode: null,
      scoreHome: 0,
      scoreAway: 0,
      liveTickerEvents: []
    });
    await inviteRef.delete();
    return { message: "Spiel erfolgreich angesetzt!" };
  }
);

// --- SPIEL-AUTO-STARTER ---
exports.checkScheduledGames = onSchedule(
  { region: "europe-west3", schedule: "every 1 minutes" },
  async (event) => {
    logger.info("Suche nach zu startenden Spielen...");
    const now = new Date();
    const q = db.collection("games")
      .where("status", "==", "scheduled")
      .where("scheduledStartTime", "<=", now);
    const snapshot = await q.get();

    if (snapshot.empty) {
      logger.info("Keine Spiele zum Starten gefunden.");
      return null;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      logger.info(`Starte Spiel ${doc.id}...`);
      batch.update(doc.ref, { status: 'live' });
    });

    await batch.commit();
    return null;
  }
);

// --- CLEANUP INVITES ---
exports.cleanupOldInvites = onSchedule(
  { region: "europe-west3", schedule: "every 1 hours" },
  async (event) => {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const q = db.collection('game_invites')
      .where("status", "==", "pending")
      .where("createdAt", "<=", twelveHoursAgo);
    const snapshot = await q.get();
    if (snapshot.empty) return null;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      logger.info(`Lösche abgelaufene Einladung: ${doc.id}`);
      batch.delete(doc.ref);
    });
    await batch.commit();
    return null;
  }
);

// --- ADMIN ROLE ---
exports.addAdminRole = onCall({ region: "europe-west3" }, async (request) => {
  try {
    const email = request.data.email;
    const user = await auth.getUserByEmail(email);
    await auth.setCustomUserClaims(user.uid, { admin: true });
    logger.info(`Erfolg! User ${email} ist jetzt ein Admin.`);
    return { message: `Erfolg! ${email} ist jetzt ein Admin.` };
  } catch (error) {
    logger.error("Fehler beim Hinzufügen der Admin-Rolle:", error);
    throw new HttpsError('internal', error.message);
  }
});

// --- TRANSFER AUSFÜHREN ---
exports.executeTransfer = onCall({ region: "europe-west3" }, async (request) => {
  const { transferId } = request.data;
  if (!transferId) throw new HttpsError('invalid-argument', 'transferId fehlt.');

  const transferRef = db.collection('transfers').doc(transferId);
  try {
    const transferDoc = await transferRef.get();
    if (!transferDoc.exists) throw new HttpsError('not-found', 'Transfer nicht gefunden.');

    const transferData = transferDoc.data();
    const batch = db.batch();

    transferData.offeredPlayerIds.forEach(playerId => {
      const playerRef = db.collection('players').doc(playerId);
      batch.update(playerRef, { teamId: transferData.receivingTeamId });
    });

    transferData.requestedPlayerIds.forEach(playerId => {
      const playerRef = db.collection('players').doc(playerId);
      batch.update(playerRef, { teamId: transferData.proposingTeamId });
    });

    batch.update(transferRef, { status: 'completed' });
    await batch.commit();
    logger.info(`Transfer ${transferId} erfolgreich ausgeführt.`);
    return { message: "Transfer erfolgreich!" };
  } catch (error) {
    logger.error(`Fehler bei Transfer ${transferId}:`, error);
    throw new HttpsError('internal', 'Transfer konnte nicht ausgeführt werden.');
  }
});
