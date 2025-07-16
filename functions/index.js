const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const logger = require("firebase-functions/logger");

initializeApp({ projectId: "deadlineday-sim" });
const db = getFirestore();
const auth = getAuth();

const positionModifiers = {
  "TW":  { saving: 1.5, passing: 0.7, tackling: 0.5, shooting: 0.1 },
  "IV":  { passing: 0.8, tackling: 1.3, shooting: 0.4 },
  "LV":  { passing: 0.9, tackling: 1.1, shooting: 0.6 },
  "RV":  { passing: 0.9, tackling: 1.1, shooting: 0.6 },
  "ZDM": { passing: 1.1, tackling: 1.2, shooting: 0.6 },
  "ZM":  { passing: 1.2, tackling: 0.9, shooting: 0.8 },
  "LM":  { passing: 1.1, tackling: 0.8, shooting: 0.9 },
  "RM":  { passing: 1.1, tackling: 0.8, shooting: 0.9 },
  "ZOM": { passing: 1.3, tackling: 0.6, shooting: 1.1 },
  "HS":  { passing: 1.0, tackling: 0.6, shooting: 1.3 },
  "ST":  { passing: 0.8, tackling: 0.5, shooting: 1.4 },
  "MS":  { passing: 0.7, tackling: 0.5, shooting: 1.5 },
  "LA":  { passing: 0.9, tackling: 0.6, shooting: 1.2 },
  "RA":  { passing: 0.9, tackling: 0.6, shooting: 1.2 },
};

function getModifiersForPositionKey(posKey) {
  if (!positionModifiers[posKey]) {
    if (posKey.startsWith("IV")) return positionModifiers["IV"];
    if (posKey.startsWith("ZM")) return positionModifiers["ZM"];
    if (posKey.startsWith("ST")) return positionModifiers["ST"];
    if (posKey.startsWith("TW")) return positionModifiers["TW"];
    if (posKey.startsWith("LV")) return positionModifiers["LV"];
    if (posKey.startsWith("RV")) return positionModifiers["RV"];
    if (posKey.startsWith("LM")) return positionModifiers["LM"];
    if (posKey.startsWith("RM")) return positionModifiers["RM"];
    if (posKey.startsWith("ZDM")) return positionModifiers["ZDM"];
    if (posKey.startsWith("ZOM")) return positionModifiers["ZOM"];
    if (posKey.startsWith("HS")) return positionModifiers["HS"];
    if (posKey.startsWith("MS")) return positionModifiers["MS"];
    if (posKey.startsWith("LA")) return positionModifiers["LA"];
    if (posKey.startsWith("RA")) return positionModifiers["RA"];
  }
  return positionModifiers[posKey] || { passing: 1.0, tackling: 1.0, shooting: 1.0, saving: 1.0 };
}

const runWeightedDuel = (playerA_Strength, playerB_Strength) => {
    const total = playerA_Strength + playerB_Strength;
    if (total === 0) return Math.random() < 0.5;
    return Math.random() * total < playerA_Strength;
};

exports.startSimulation = onDocumentUpdated(
  {
    document: "games/{gameId}",
    region: "europe-west3",
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async (event) => {
    const dataBefore = event.data.before.data();
    const dataAfter = event.data.after.data();

    if (dataBefore.status === "scheduled" && dataAfter.status === "live") {
      const gameId = event.params.gameId;
      const gameRef = db.collection("games").doc(gameId);
      logger.info(`✅ Simulation V9 für Spiel ${gameId} wird gestartet!`);

      try {
        // Teams laden
        const [teamHomeDoc, teamAwayDoc] = await Promise.all([
          db.collection("teams").doc(dataAfter.teamHomeId).get(),
          db.collection("teams").doc(dataAfter.teamAwayId).get(),
        ]);
        if (!teamHomeDoc.exists || !teamAwayDoc.exists) throw new Error(`Team nicht gefunden.`);
        const teamHomeData = { id: teamHomeDoc.id, ...teamHomeDoc.data() };
        const teamAwayData = { id: teamAwayDoc.id, ...teamAwayDoc.data() };

        // Spieler laden
        const [homePlayersSnap, awayPlayersSnap] = await Promise.all([
            db.collection("players").where("teamId", "==", teamHomeData.id).get(),
            db.collection("players").where("teamId", "==", teamAwayData.id).get(),
        ]);
        const allHomePlayers = homePlayersSnap.docs.map((doc) => ({id: doc.id, ...doc.data()}));
        const allAwayPlayers = awayPlayersSnap.docs.map((doc) => ({id: doc.id, ...doc.data()}));

        // Formation: Zuordnung von Spieler zu Feldpositionen (positionKey NUR temporär für diese Aufstellung!)
        let homeOnPitch = (teamHomeData.formation || []).map(p => {
            const player = allHomePlayers.find(pl => pl.id === p.playerId);
            // positionKey existiert nur in der formation (z.B. "IV1"), im Spielerobjekt NUR position und positionGroup!
            return player ? { ...player, positionKey: p.positionKey } : null;
        }).filter(Boolean);
        let awayOnPitch = (teamAwayData.formation || []).map(p => {
            const player = allAwayPlayers.find(pl => pl.id === p.playerId);
            return player ? { ...player, positionKey: p.positionKey } : null;
        }).filter(Boolean);

        // Torwart-Check, weiterhin nur anhand positionGroup und positionKey
        if (
          homeOnPitch.length === 0 || awayOnPitch.length === 0 ||
          !homeOnPitch.some(p => p.positionGroup === "TOR" && p.positionKey.startsWith("TW")) ||
          !awayOnPitch.some(p => p.positionGroup === "TOR" && p.positionKey.startsWith("TW"))
        ) {
          throw new Error("Beide Teams brauchen einen Torhüter auf der Torwart-Position!");
        }

        let gameState = {
            minute: 0,
            possession: "home",
            ballPosition: "midfield",
            playState: "open_play",
            playerWithBall: homeOnPitch.find(p => p.positionKey.includes("ZM")) || homeOnPitch[Math.floor(homeOnPitch.length / 2)],
            score: { home: 0, away: 0 },
            playerRatings: [...homeOnPitch, ...awayOnPitch].reduce((acc, p) => ({ ...acc, [p.id]: { rating: 6.0 } }), {}),
        };

        const tickRate = 100;
        const gameDuration = 10;
        const totalTicks = Math.floor((gameDuration * 60 * 1000) / tickRate);
        let currentTick = 0;

        const gameInterval = setInterval(async () => {
          try {
            currentTick++;
            gameState.minute = (currentTick / totalTicks) * 90;
            let eventObj = { text: "", teamId: null, type: "commentary", timestamp: new Date() };
            let ratingChanges = [];

            const attackingTeamData = gameState.possession === "home" ? teamHomeData : teamAwayData;
            const defendingTeamData = gameState.possession === "home" ? teamAwayData : teamHomeData;
            const attackingTeam = gameState.possession === "home" ? homeOnPitch : awayOnPitch;
            const defendingTeam = gameState.possession === "home" ? awayOnPitch : homeOnPitch;

            let attacker = gameState.playerWithBall;
            if (!attacker || !attackingTeam.find(p => p.id === attacker.id)) {
                attacker = attackingTeam[Math.floor(Math.random() * attackingTeam.length)];
            }
            let defender = defendingTeam[Math.floor(Math.random() * defendingTeam.length)];

            // Simulationslogik (wie bisher, Fokus auf positionKey nur temporär)
            if (gameState.playState === 'open_play') {
                if(gameState.ballPosition === 'attack') {
                    const shooter = attacker;
                    const keeper = defendingTeam.find(p => p.positionGroup === "TOR" && p.positionKey.startsWith("TW"));
                    if (!keeper) throw new Error("Gegner hat keinen Torwart aufgestellt!");

                    const shooterMod = getModifiersForPositionKey(shooter.positionKey);
                    const keeperMod = getModifiersForPositionKey(keeper.positionKey);

                    const shotStrength = shooter.strength * (shooterMod.shooting || 1.0);
                    const saveStrength = keeper.strength * (keeperMod.saving || 1.0);

                    eventObj = { text: `${Math.round(gameState.minute)}' - ${shooter.name} mit der Schusschance!`, teamId: attackingTeamData.id, type: "shot"};
                    if (runWeightedDuel(shotStrength, saveStrength)) {
                        eventObj.text += ` TOR!!!`;
                        eventObj.type = 'goal';
                        if (gameState.possession === 'home') gameState.score.home++; else gameState.score.away++;
                        ratingChanges.push({ playerId: shooter.id, change: 1.0 });
                        ratingChanges.push({ playerId: keeper.id, change: -0.5 });
                    } else {
                        eventObj.text += ` Glanzparade von ${keeper.name}!`;
                        eventObj.type = 'save';
                        ratingChanges.push({ playerId: keeper.id, change: 0.5 });
                    }
                    gameState.possession = gameState.possession === 'home' ? 'away' : 'home';
                    gameState.playerWithBall = defendingTeam.find(p => p.positionKey.startsWith("IV")) || defendingTeam[2];
                    gameState.ballPosition = "defense";
                } else {
                    const actionRoll = Math.random();
                    if (actionRoll > 0.5) {
                        const attackerMod = getModifiersForPositionKey(attacker.positionKey);
                        const defenderMod = getModifiersForPositionKey(defender.positionKey);

                        if (runWeightedDuel(
                            attacker.strength * (attackerMod.tackling || 1.0),
                            defender.strength * (defenderMod.tackling || 1.0))
                        ) {
                            eventObj = { text: `${Math.round(gameState.minute)}' - ${attacker.name} geht ins Dribbling und setzt sich durch!`, teamId: attackingTeamData.id, type: "dribble_success" };
                            gameState.ballPosition = gameState.ballPosition === 'defense' ? 'midfield' : 'attack';
                            ratingChanges.push({ playerId: attacker.id, change: 0.2 });
                        } else {
                            if (Math.random() < 0.2) {
                                eventObj = { text: `${Math.round(gameState.minute)}' - Foul von ${defender.name}! Freistoß.`, teamId: defendingTeamData.id, type: "foul" };
                                gameState.playState = 'free_kick';
                                ratingChanges.push({ playerId: defender.id, change: -0.3 });
                            } else {
                                eventObj = { text: `${Math.round(gameState.minute)}' - ${defender.name} gewinnt den Zweikampf!`, teamId: defendingTeamData.id, type: "tackle_win" };
                                ratingChanges.push({ playerId: attacker.id, change: -0.1 });
                                ratingChanges.push({ playerId: defender.id, change: 0.2 });
                                gameState.possession = gameState.possession === 'home' ? 'away' : 'home';
                                gameState.playerWithBall = defender;
                            }
                        }
                    } else {
                        const nextPlayer = attackingTeam[Math.floor(Math.random() * attackingTeam.length)];
                        const attackerMod = getModifiersForPositionKey(attacker.positionKey);
                        const defenderMod = getModifiersForPositionKey(defender.positionKey);

                        if (runWeightedDuel(
                            attacker.strength * (attackerMod.passing || 1.0),
                            defender.strength * (defenderMod.tackling || 1.0))
                        ) {
                            eventObj = { text: `${Math.round(gameState.minute)}' - ${attacker.name} passt zu ${nextPlayer.name}.`, teamId: attackingTeamData.id, type: "pass_success" };
                            gameState.playerWithBall = nextPlayer;
                            ratingChanges.push({ playerId: attacker.id, change: 0.1 });
                        } else {
                            eventObj = { text: `${Math.round(gameState.minute)}' - Fehlpass von ${attacker.name}!`, teamId: attackingTeamData.id, type: "error" };
                            ratingChanges.push({ playerId: attacker.id, change: -0.2 });
                            gameState.possession = gameState.possession === 'home' ? 'away' : 'home';
                            gameState.playerWithBall = defender;
                        }
                    }
                }
            } else if (gameState.playState === 'free_kick') {
                eventObj = { text: `${Math.round(gameState.minute)}' - Freistoß für ${attackingTeamData.name}. Der Ball wird sicher in die eigenen Reihen gespielt.`, teamId: attackingTeamData.id, type: "set_piece" };
                gameState.ballPosition = 'midfield';
                gameState.playState = 'open_play';
            }

            const ratingsUpdate = { ...gameState.playerRatings };
            ratingChanges.forEach(change => {
              const currentRating = ratingsUpdate[change.playerId]?.rating || 6.0;
              ratingsUpdate[change.playerId] = {
                rating: Math.max(1.0, Math.min(10.0, currentRating + change.change))
              };
            });

            await gameRef.update({
              liveTickerEvents: FieldValue.arrayUnion(eventObj),
              scoreHome: gameState.score.home,
              scoreAway: gameState.score.away,
              playerRatings: ratingsUpdate
            });

            if (currentTick >= totalTicks) {
                clearInterval(gameInterval);
                await gameRef.update({ status: "finished" });
                logger.info(`✅ Simulation für Spiel ${gameId} beendet.`);
            }
          } catch(err) {
            logger.error("Fehler im Tick:", err);
            clearInterval(gameInterval);
          }
        }, tickRate);
      } catch (error) {
        logger.error(`Fehler in Simulation ${gameId}:`, error);
        await gameRef.update({ status: 'error', liveTickerEvents: FieldValue.arrayUnion({text: `Simulationsfehler: ${error.message}`}) });
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
      scoreHome: 0,
      scoreAway: 0,
      liveTickerEvents: []
    });
    await inviteRef.delete();
    return { message: "Spiel erfolgreich angesetzt!" };
  }
);

// --- SPIEL-AUTO-STARTER ---
exports.checkScheduledGames = onSchedule("every 5 minutes", async (event) => {
  logger.info("Suche nach zu startenden Spielen...");
  const now = new Date();
  const q = db.collection("games").where("status", "==", "scheduled").where("scheduledStartTime", "<=", now);
  const snapshot = await q.get();

  if (snapshot.empty) {
    logger.info("Keine Spiele zum Starten gefunden.");
    return null;
  }

  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    logger.info(`Starte Spiel ${doc.id}...`);
    batch.update(doc.ref, { status: 'live' });
  });

  await batch.commit();
  return null;
});

// --- CLEANUP INVITES ---
exports.cleanupOldInvites = onSchedule("every 1 hours", async (event) => {
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const q = db.collection('game_invites').where("status", "==", "pending").where("createdAt", "<=", twelveHoursAgo);
  const snapshot = await q.get();
  if (snapshot.empty) return null;

  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    logger.info(`Lösche abgelaufene Einladung: ${doc.id}`);
    batch.delete(doc.ref);
  });
  await batch.commit();
  return null;
});

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
