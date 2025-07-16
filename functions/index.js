import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

// --- KORREKTUR 1: Projekt-ID an Emulator angepasst ---
// Die Projekt-ID wurde auf "deadlineday-sim" geändert, um den Konflikt zu beheben.
initializeApp({ projectId: "deadlineday-sim" });

const db = getFirestore();

// Hilfsfunktion, um Modifikatoren basierend auf der taktischen Position zu erhalten.
// Diese Logik ist bereits korrekt und nutzt den 'positionKey' aus der Formation.
const getModifiersForPositionKey = (positionKey) => {
    const modifiers = {
        // Angreifer bekommen Boni auf den Abschluss
        "ST": { shooting: 5, passing: -2 },
        // Offensive Mittelfeldspieler sind Allrounder
        "OM": { shooting: 2, passing: 3, dribbling: 3 },
        // Zentrale Mittelfeldspieler sind stark im Passspiel
        "ZM": { shooting: 0, passing: 5, dribbling: 2 },
        // Defensive Mittelfeldspieler stärken die Defensive
        "DM": { defending: 5, passing: 2 },
        // Außenverteidiger sind schnell und gut im Dribbling
        "AV": { dribbling: 4, speed: 3 },
        // Innenverteidiger sind defensiv stark
        "IV": { defending: 6 },
        // Standard-Modifikator, falls keine spezifische Rolle passt
        "DEFAULT": { shooting: 0, passing: 0, dribbling: 0, defending: 0, speed: 0 }
    };
    // Extrahiert den Rollen-Typ (z.B. "ST" aus "ST1")
    const role = positionKey.replace(/\d/g, '');
    return modifiers[role] || modifiers["DEFAULT"];
};

// Hauptfunktion zur Simulation eines Spiels
export const startSimulation = onCall({ region: "europe-west3" }, async (request) => {
    logger.info("startSimulation wurde aufgerufen mit:", request.data);
    const { teamId, opponentId } = request.data;

    if (!teamId || !opponentId) {
        throw new HttpsError("invalid-argument", "Team-ID und Gegner-ID sind erforderlich.");
    }

    try {
        // Lade Team- und Spielerdaten
        const teamSnap = await db.collection("teams").doc(teamId).get();
        if (!teamSnap.exists) throw new HttpsError("not-found", "Dein Team wurde nicht gefunden.");
        const teamData = teamSnap.data();

        const playerDocs = await db.collection("players").where("teamId", "==", teamId).get();
        teamData.players = playerDocs.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Füge die taktische Rolle ('positionKey') aus der Formation zu den Spielerdaten hinzu
        teamData.players.forEach(p => {
            const formationEntry = teamData.formation.find(f => f.playerId === p.id);
            if (formationEntry) {
                p.positionKey = formationEntry.positionKey;
            }
        });

        // --- KORREKTUR 2: Logik an neues Datenmodell angepasst ---
        // Der Torwart wird jetzt über das korrekte Feld 'positionGroup' gefunden.
        const goalkeeper = teamData.players.find(p => p.positionGroup === "TOR");
        if (!goalkeeper) {
             // Wichtiger Check: Wirft einen Fehler, wenn kein aufgestellter Torwart gefunden wird.
            throw new HttpsError("failed-precondition", "Kein Torwart ('positionGroup: TOR') im Team gefunden.");
        }
        
        const simulationLog = [];
        let homeScore = 0;
        let awayScore = 0;

        for (let minute = 1; minute <= 90; minute++) {
            // Vereinfachte Simulation: Jede 10. Minute eine Torchance
            if (minute % 10 === 0) {
                const shootingPlayer = teamData.players.find(p => p.positionKey && p.positionKey.startsWith('ST'));
                if (shootingPlayer) {
                    const modifiers = getModifiersForPositionKey(shootingPlayer.positionKey);
                    const finalSkill = shootingPlayer.skill + (modifiers.shooting || 0);
                    
                    if (Math.random() * 100 < finalSkill / 5) {
                        homeScore++;
                        simulationLog.push(`${minute}': Tor für ${teamData.name}! Torschütze: ${shootingPlayer.name}.`);
                    } else {
                        simulationLog.push(`${minute}': ${shootingPlayer.name} schießt, aber der Torwart hält!`);
                    }
                }
            }
        }

        const finalScore = `${homeScore} - ${awayScore}`;
        logger.info(`Simulation beendet. Endstand: ${finalScore}`);
        return { success: true, log: simulationLog, finalScore };

    } catch (error) {
        logger.error("Fehler bei der Spielsimulation:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", "Ein interner Fehler ist bei der Simulation aufgetreten.");
    }
});