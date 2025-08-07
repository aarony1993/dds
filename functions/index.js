// functions/index.js
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const logger = require("firebase-functions/logger");

const { getNextGameState } = require('./simulation/engine');

initializeApp({ projectId: "deadlineday-sim" });
const db = getFirestore();
const auth = getAuth();

// --- HILFSFUNKTION: Spielerbewertungen berechnen ---
function calculateRatingsFromEvents(events, homePlayers, awayPlayers) {
  const ratings = {};
  [...homePlayers, ...awayPlayers].forEach((player) => {
    ratings[player.id] = 6.0;
  });
  events.forEach((ev) => {
    const pid = ev.playerId;
    if (!pid || ratings[pid] === undefined) return;
    switch (ev.type) {
      case 'goal':    ratings[pid] -= 1.0; break;
      case 'assist':  ratings[pid] -= 0.7; break;
      case 'pass':    ratings[pid] += ev.success ? -0.05 : +0.2; break;
      case 'duel':    ratings[pid] += ev.success ? -0.1  : +0.2; break;
      case 'foul':    ratings[pid] += 0.5; break;
      default: break;
    }
  });
  Object.keys(ratings).forEach((pid) => {
    ratings[pid] = Math.min(10.0, Math.max(1.0, Number(ratings[pid].toFixed(1))));
  });
  return ratings;
}

// --- SPIEL-SIMULATION ---
exports.startSimulation = onDocumentUpdated(
  {
    document: "games/{gameId}",
    region: "europe-west3",
    memory: "512MiB",
    timeoutSeconds: 600,
  },
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();

    // Nur beim Statuswechsel scheduled → live starten
    if (before.status === "scheduled" && after.status === "live") {
      const gameId  = event.params.gameId;
      const gameRef = db.collection("games").doc(gameId);

      logger.info(`✅ Simulation für Spiel ${gameId} startet jetzt!`);

      try {
        // 1. Teams laden
        const [teamHomeDoc, teamAwayDoc] = await Promise.all([
          db.collection("teams").doc(after.teamHomeId).get(),
          db.collection("teams").doc(after.teamAwayId).get(),
        ]);
        if (!teamHomeDoc.exists || !teamAwayDoc.exists) {
          throw new Error("Team nicht gefunden.");
        }
        const teamHome = { id: teamHomeDoc.id, ...teamHomeDoc.data() };
        const teamAway = { id: teamAwayDoc.id, ...teamAwayDoc.data() };

        // 2. Formation aus dem Team‐Doc extrahieren
        //    Annahme: teamHome.formation ist entweder Array von IDs oder Objekt mapping pos→ID
        const lineupHome = Array.isArray(teamHome.formation)
          ? teamHome.formation
          : Object.values(teamHome.formation || {});
        const lineupAway = Array.isArray(teamAway.formation)
          ? teamAway.formation
          : Object.values(teamAway.formation || {});

        // 3. Formation ins Spiel-Dokument schreiben
        await gameRef.update({ lineupHome, lineupAway });

        // 4. Alle Spieler des Kaders laden
        const [homeSnap, awaySnap] = await Promise.all([
          db.collection("players").where("teamId", "==", teamHome.id).get(),
          db.collection("players").where("teamId", "==", teamAway.id).get(),
        ]);
        const allHomePlayers = homeSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const allAwayPlayers = awaySnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 5. Simulation initialisieren
        let gameState = {
          minute: 0,
          events: [],
          score: { home: 0, away: 0 },
          playerWithBall: null,
          possession: null,
          ballZone: null,
          justWonDuel: false,
          attackTicks: 0,
          playerRatings: {},
          ratingEventsBuffer: [],
        };

        const totalTicks = 120;
        let tickCount = 0;

        // 6. Simulationstakt
        const interval = setInterval(async () => {
          try {
            tickCount++;

            // Hier wird jetzt die Formation übergeben:
            gameState = getNextGameState(
              gameState,
              teamHome,
              teamAway,
              allHomePlayers,
              allAwayPlayers,
              lineupHome,
              lineupAway
            );

            // Aktuelles Event ans Game‐Doc hängen
            const latestEvent = gameState.events[gameState.events.length - 1];
            await gameRef.update({
              liveTickerEvents: FieldValue.arrayUnion(latestEvent),
              minute:           gameState.minute,
              scoreHome:        gameState.score.home,
              scoreAway:        gameState.score.away,
            });

            // Ende der Simulation?
            if (tickCount >= totalTicks || gameState.minute >= 90) {
              clearInterval(interval);

              // Spielerbewertungen berechnen
              const ratings = calculateRatingsFromEvents(
                gameState.events,
                allHomePlayers,
                allAwayPlayers
              );
              await gameRef.update({
                status:        "finished",
                playerRatings: ratings,
              });
              logger.info(`✅ Simulation für Spiel ${gameId} beendet.`);
            }
          } catch (err) {
            clearInterval(interval);
            logger.error("Fehler im Simulationstakt:", err);
            await gameRef.update({
              status:           "error",
              liveTickerEvents: FieldValue.arrayUnion({ text: `Simulationsfehler: ${err.message}` })
            });
          }
        }, 5000);
      } catch (err) {
        logger.error(`Fehler beim Start der Simulation ${gameId}:`, err);
        await gameRef.update({
          status:           "error",
          liveTickerEvents: FieldValue.arrayUnion({ text: `Initialfehler: ${err.message}` })
        });
      }
    }

    return null;
  }
);

// --- SPIEL-EINLADUNG ---
exports.acceptGameInvite = onCall(
  { region: "europe-west3" },
  async (req) => {
    const { inviteId } = req.data;
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
      scoreHome: 0,
      scoreAway: 0,
      liveTickerEvents: []
    });
    await invRef.delete();
    return { message: "Spiel erfolgreich angesetzt!" };
  }
);

// --- SPIEL-AUTO-STARTER ---
exports.checkScheduledGames = onSchedule(
  { region: "europe-west3", schedule: "every 1 minutes" },
  async () => {
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
    return null;
  }
);

// --- CLEANUP INVITES ---
exports.cleanupOldInvites = onSchedule(
  { region: "europe-west3", schedule: "every 1 hours" },
  async () => {
    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const q = db.collection('game_invites')
      .where("status", "==", "pending")
      .where("createdAt", "<=", cutoff);
    const snap = await q.get();
    if (snap.empty) return null;
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    return null;
  }
);

// --- ADMIN ROLE ---
exports.addAdminRole = onCall(
  { region: "europe-west3" },
  async (req) => {
    try {
      const userRec = await auth.getUserByEmail(req.data.email);
      await auth.setCustomUserClaims(userRec.uid, { admin: true });
      logger.info(`User ${req.data.email} ist jetzt Admin.`);
      return { message: `Erfolg! ${req.data.email} ist jetzt Admin.` };
    } catch (err) {
      logger.error("Fehler beim Hinzufügen der Admin-Rolle:", err);
      throw new HttpsError('internal', err.message);
    }
  }
);

// --- TRANSFER AUSFÜHREN (Admin) ---
exports.executeTransfer = onCall(
  { region: "europe-west3" },
  async (req) => {
    const { transferId } = req.data;
    if (!transferId) {
      throw new HttpsError("invalid-argument", "transferId fehlt.");
    }

    const transferRef = db.collection("transfers").doc(transferId);
    const snap = await transferRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Transfer nicht gefunden.");
    }
    const t = snap.data();
    logger.info(`executeTransfer aufgerufen für ${transferId}, status=${t.status}`);

    // Nur Transfers bearbeiten, die der Empfänger bereits akzeptiert hat
    if (t.status !== "acceptedByUser") {
      throw new HttpsError(
        "failed-precondition",
        `Transfer im falschen Status (${t.status}). Nur 'acceptedByUser' ist zulässig.`
      );
    }

    const myPlayers  = Array.isArray(t.myPlayers )  ? t.myPlayers  : [];
    const oppPlayers = Array.isArray(t.oppPlayers) ? t.oppPlayers : [];

    try {
      const batch = db.batch();

      // Eigene Spieler → Gegner-Team
      myPlayers.forEach(pid => {
        const pRef = db.collection("players").doc(pid);
        batch.update(pRef, { teamId: t.toTeamId });
      });
      // Gegner-Spieler → eigenes Team
      oppPlayers.forEach(pid => {
        const pRef = db.collection("players").doc(pid);
        batch.update(pRef, { teamId: t.fromTeamId });
      });

      // Transfer abschließen
      batch.update(transferRef, {
        status:     "completed",
        executedAt: FieldValue.serverTimestamp()
      });

      await batch.commit();
      logger.info(`✅ Transfer ${transferId} abgeschlossen.`);
      return { success: true };
    } catch (err) {
      logger.error(`Fehler bei executeTransfer ${transferId}:`, err);
      throw new HttpsError("internal", "Fehler beim Ausführen des Transfers.");
    }
  }
);
