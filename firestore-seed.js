const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT_ID = 'deadlineday-sim';
initializeApp({ projectId: PROJECT_ID });

const db = getFirestore();

const placeholderImage = "https://randomuser.me/api/portraits/lego/1.jpg";

const teams = [
  {
    name: "FC Bayern München",
    short: "FCB",
    managerUid: "test-uid-fcb",
    formation: [],
    tactics: { defenseLine: 50, pressing: 50 },
    budget: 120000000,
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/1/1b/FCBayernMuenchen.svg",
    league: "Bundesliga",
    teamColor: "#d2001a",
    createdAt: new Date(),
    players: [
      // Torhüter
      { name: "Manuel Neuer", position: "TOR", strength: 91, birth: "1986-03-27", nationality: "Deutschland", marketValue: 5000000, shirtNumber: 1, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Sven Ulreich", position: "TOR", strength: 77, birth: "1988-08-03", nationality: "Deutschland", marketValue: 1000000, shirtNumber: 26, injuryStatus: "fit", photoUrl: placeholderImage },

      // Abwehr
      { name: "Min-jae Kim", position: "DEF", strength: 85, birth: "1996-11-15", nationality: "Südkorea", marketValue: 60000000, shirtNumber: 3, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Matthijs de Ligt", position: "DEF", strength: 84, birth: "1999-08-12", nationality: "Niederlande", marketValue: 65000000, shirtNumber: 4, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Dayot Upamecano", position: "DEF", strength: 83, birth: "1998-10-27", nationality: "Frankreich", marketValue: 40000000, shirtNumber: 2, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Alphonso Davies", position: "DEF", strength: 86, birth: "2000-11-02", nationality: "Kanada", marketValue: 70000000, shirtNumber: 19, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Bouna Sarr", position: "DEF", strength: 70, birth: "1992-01-31", nationality: "Senegal", marketValue: 1000000, shirtNumber: 20, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Josip Stanišić", position: "DEF", strength: 76, birth: "2000-04-02", nationality: "Kroatien", marketValue: 12000000, shirtNumber: 44, injuryStatus: "fit", photoUrl: placeholderImage },

      // Mittelfeld
      { name: "Joshua Kimmich", position: "MID", strength: 89, birth: "1995-02-08", nationality: "Deutschland", marketValue: 60000000, shirtNumber: 6, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Leon Goretzka", position: "MID", strength: 84, birth: "1995-02-06", nationality: "Deutschland", marketValue: 35000000, shirtNumber: 8, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Jamal Musiala", position: "MID", strength: 87, birth: "2003-02-26", nationality: "Deutschland", marketValue: 110000000, shirtNumber: 42, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Konrad Laimer", position: "MID", strength: 82, birth: "1997-05-27", nationality: "Österreich", marketValue: 20000000, shirtNumber: 27, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Raphaël Guerreiro", position: "MID", strength: 80, birth: "1993-12-22", nationality: "Portugal", marketValue: 15000000, shirtNumber: 22, injuryStatus: "fit", photoUrl: placeholderImage },

      // Sturm
      { name: "Kingsley Coman", position: "ATT", strength: 85, birth: "1996-06-13", nationality: "Frankreich", marketValue: 60000000, shirtNumber: 11, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Serge Gnabry", position: "ATT", strength: 83, birth: "1995-07-14", nationality: "Deutschland", marketValue: 35000000, shirtNumber: 7, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Harry Kane", position: "ATT", strength: 90, birth: "1993-07-28", nationality: "England", marketValue: 110000000, shirtNumber: 9, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Mathys Tel", position: "ATT", strength: 77, birth: "2005-04-27", nationality: "Frankreich", marketValue: 30000000, shirtNumber: 39, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Eric Maxim Choupo-Moting", position: "ATT", strength: 77, birth: "1989-03-23", nationality: "Kamerun", marketValue: 2500000, shirtNumber: 13, injuryStatus: "fit", photoUrl: placeholderImage }
    ]
  },
  {
    name: "Borussia Dortmund",
    short: "BVB",
    managerUid: "test-uid-bvb",
    formation: [],
    tactics: { defenseLine: 50, pressing: 50 },
    budget: 90000000,
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/6/67/Borussia_Dortmund_logo.svg",
    league: "Bundesliga",
    teamColor: "#ffe800",
    createdAt: new Date(),
    players: [
      // Torhüter
      { name: "Gregor Kobel", position: "TOR", strength: 87, birth: "1997-12-06", nationality: "Schweiz", marketValue: 40000000, shirtNumber: 1, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Alexander Meyer", position: "TOR", strength: 76, birth: "1991-04-13", nationality: "Deutschland", marketValue: 1000000, shirtNumber: 35, injuryStatus: "fit", photoUrl: placeholderImage },

      // Abwehr
      { name: "Mats Hummels", position: "DEF", strength: 84, birth: "1988-12-16", nationality: "Deutschland", marketValue: 3000000, shirtNumber: 15, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Nico Schlotterbeck", position: "DEF", strength: 82, birth: "1999-12-01", nationality: "Deutschland", marketValue: 35000000, shirtNumber: 4, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Ian Maatsen", position: "DEF", strength: 78, birth: "2002-03-10", nationality: "Niederlande", marketValue: 18000000, shirtNumber: 22, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Niklas Süle", position: "DEF", strength: 82, birth: "1995-09-03", nationality: "Deutschland", marketValue: 28000000, shirtNumber: 25, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Julian Ryerson", position: "DEF", strength: 79, birth: "1997-11-17", nationality: "Norwegen", marketValue: 12000000, shirtNumber: 26, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Marius Wolf", position: "DEF", strength: 76, birth: "1995-05-27", nationality: "Deutschland", marketValue: 6000000, shirtNumber: 17, injuryStatus: "fit", photoUrl: placeholderImage },

      // Mittelfeld
      { name: "Emre Can", position: "MID", strength: 82, birth: "1994-01-12", nationality: "Deutschland", marketValue: 18000000, shirtNumber: 23, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Julian Brandt", position: "MID", strength: 84, birth: "1996-05-02", nationality: "Deutschland", marketValue: 40000000, shirtNumber: 19, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Felix Nmecha", position: "MID", strength: 79, birth: "2000-10-10", nationality: "Deutschland", marketValue: 15000000, shirtNumber: 8, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Salih Özcan", position: "MID", strength: 78, birth: "1998-01-11", nationality: "Türkei", marketValue: 9000000, shirtNumber: 6, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Marcel Sabitzer", position: "MID", strength: 80, birth: "1994-03-17", nationality: "Österreich", marketValue: 14000000, shirtNumber: 20, injuryStatus: "fit", photoUrl: placeholderImage },

      // Sturm
      { name: "Donyell Malen", position: "ATT", strength: 81, birth: "1999-01-19", nationality: "Niederlande", marketValue: 30000000, shirtNumber: 21, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Niclas Füllkrug", position: "ATT", strength: 82, birth: "1993-02-09", nationality: "Deutschland", marketValue: 14000000, shirtNumber: 14, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Sebastien Haller", position: "ATT", strength: 80, birth: "1994-06-22", nationality: "Elfenbeinküste", marketValue: 10000000, shirtNumber: 9, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Youssoufa Moukoko", position: "ATT", strength: 77, birth: "2004-11-20", nationality: "Deutschland", marketValue: 25000000, shirtNumber: 18, injuryStatus: "fit", photoUrl: placeholderImage },
      { name: "Marco Reus", position: "ATT", strength: 81, birth: "1989-05-31", nationality: "Deutschland", marketValue: 9000000, shirtNumber: 11, injuryStatus: "fit", photoUrl: placeholderImage }
    ]
  }
];

// Löschen
async function deleteAllPlayers() {
  const snap = await db.collection('players').get();
  const batch = db.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  console.log('Alle Spieler gelöscht!');
}

async function deleteAllTeams() {
  const snap = await db.collection('teams').get();
  const batch = db.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  console.log('Alle Teams gelöscht!');
}

async function createTeamsAndPlayers() {
  for (const team of teams) {
    const teamDoc = {
      name: team.name,
      short: team.short,
      managerUid: team.managerUid,
      formation: [],
      tactics: team.tactics,
      budget: team.budget,
      logoUrl: team.logoUrl,
      league: team.league,
      teamColor: team.teamColor,
      createdAt: team.createdAt
    };
    const teamRef = await db.collection('teams').add(teamDoc);

    for (const player of team.players) {
      await db.collection('players').add({
        ...player,
        teamId: teamRef.id,
        createdAt: new Date()
      });
    }
  }
  console.log('Teams und Spieler erstellt!');
}

(async function seed() {
  await deleteAllPlayers();
  await deleteAllTeams();
  await createTeamsAndPlayers();
  process.exit();
})();
