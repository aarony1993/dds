const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT_ID = 'deadlineday-sim';
initializeApp({ projectId: PROJECT_ID });

const db = getFirestore();

// --- NEU: Spielerdaten mit Team-Zuweisung ---
const playersData = [
    // Team A
    { id: 'p01', name: "Max Keeper", skill: 85, positionGroup: "TOR", teamId: "teamA", age: 28, nationality: "de" },
    { id: 'p02', name: "Leo Verteidiger", skill: 82, positionGroup: "DEF", teamId: "teamA", age: 26, nationality: "de" },
    { id: 'p03', name: "Leo Stratege", skill: 88, positionGroup: "MID", teamId: "teamA", age: 24, nationality: "fr" },
    { id: 'p04', name: "Tim Torjäger", skill: 90, positionGroup: "ANG", teamId: "teamA", age: 22, nationality: "br" },
    // Team B
    { id: 'p05', name: "Tom Tormann", skill: 84, positionGroup: "TOR", teamId: "teamB", age: 31, nationality: "es" },
    { id: 'p06', name: "Ben Back", skill: 80, positionGroup: "DEF", teamId: "teamB", age: 29, nationality: "gb" },
    { id: 'p07', name: "Sam Spielmacher", skill: 87, positionGroup: "MID", teamId: "teamB", age: 27, nationality: "pt" },
    { id: 'p08', name: "Alex Abschluss", skill: 89, positionGroup: "ANG", teamId: "teamB", age: 25, nationality: "ar" },
];

const teamsData = [
  { id: "teamA", name: "FC Kicker", logoUrl: "/team-logos/kicker.png" },
  { id: "teamB", name: "Borussia Goals", logoUrl: "/team-logos/borussia.png" }
];

const usersData = [
    { uid: 'iORvqhW7CMBJgW4LYTmZLj1FLbUN', displayName: "Manager FCB", teamId: "teamA" },
    { uid: 'qihATzecExj1BxdXFVycc9Fqla3f', displayName: "Manager BVB", teamId: "teamB" },
];

async function seedDatabase() {
    console.log('Starte Seeding-Prozess...');
    const batch = db.batch();

    // 1. Spieler erstellen
    playersData.forEach(player => {
        const playerRef = db.collection('players').doc(player.id);
        batch.set(playerRef, player);
    });
    console.log('- Spieler werden erstellt...');

    // 2. Teams erstellen UND Spieler-IDs zuweisen
    teamsData.forEach(team => {
        const teamRef = db.collection('teams').doc(team.id);
        // Finde alle Spieler-IDs, die zu diesem Team gehören
        const playerIdsForTeam = playersData
            .filter(p => p.teamId === team.id)
            .map(p => p.id);
            
        batch.set(teamRef, {
            ...team,
            players: playerIdsForTeam // <-- HIER wird das entscheidende Array hinzugefügt!
        });
    });
    console.log('- Teams inkl. Spieler-Referenzen werden erstellt...');

    // 3. Benutzer erstellen
    usersData.forEach(user => {
        const userRef = db.collection('users').doc(user.uid);
        batch.set(userRef, { displayName: user.displayName, teamId: user.teamId });
    });
    console.log('- Benutzer werden erstellt...');

    try {
        await batch.commit();
        console.log("✅ Datenbank-Seeding erfolgreich abgeschlossen!");
    } catch (error) {
        console.error("❌ Fehler beim Seeding:", error);
    }
}

seedDatabase().then(() => process.exit());