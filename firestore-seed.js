// firestore-seed.js
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ projectId: 'deadlineday-sim' });

const db = getFirestore();

async function deleteCollection(collectionName) {
  const snap = await db.collection(collectionName).get();
  const deletes = snap.docs.map(doc => doc.ref.delete());
  await Promise.all(deletes);
}

async function main() {
  // 1. Leere vorher alles!
  await deleteCollection('players');
  await deleteCollection('teams');
  await deleteCollection('users');

  // 2. User-Dokumente (NICHT im Auth, nur in Firestore!)
  const users = [
    {
      uid: "bayernUser",
      displayName: "Bayern Manager",
      email: "bayern@sim.de",
      teamId: "fcb"
    },
    {
      uid: "bvbUser",
      displayName: "BVB Manager",
      email: "bvb@sim.de",
      teamId: "bvb"
    }
  ];

  // 3. Teams
  const teams = [
    {
      id: "fcb",
      name: "FC Bayern München",
      logoUrl: "https://upload.wikimedia.org/wikipedia/commons/1/1f/FC_Bayern_München_Logo.svg",
      budget: 250000000,
      managerUid: "bayernUser"
    },
    {
      id: "bvb",
      name: "Borussia Dortmund",
      logoUrl: "https://upload.wikimedia.org/wikipedia/commons/6/67/Borussia_Dortmund_logo.svg",
      budget: 180000000,
      managerUid: "bvbUser"
    }
  ];

  // 4. Spieler Bayern München (20 Beispiele)
  const bayernSpieler = [
    { vorname: "Manuel", nachname: "Neuer", nationalitaet: "Deutschland", positionGroup: "TOR", strength: 91, avatarUrl: "", marktwert: 5000000, geburtsdatum: "1986-03-27" },
    { vorname: "Sven", nachname: "Ulreich", nationalitaet: "Deutschland", positionGroup: "TOR", strength: 79, avatarUrl: "", marktwert: 1000000, geburtsdatum: "1988-08-03" },
    { vorname: "Matthijs", nachname: "de Ligt", nationalitaet: "Niederlande", positionGroup: "DEF", strength: 85, avatarUrl: "", marktwert: 55000000, geburtsdatum: "1999-08-12" },
    { vorname: "Dayot", nachname: "Upamecano", nationalitaet: "Frankreich", positionGroup: "DEF", strength: 84, avatarUrl: "", marktwert: 40000000, geburtsdatum: "1998-10-27" },
    { vorname: "Minjae", nachname: "Kim", nationalitaet: "Südkorea", positionGroup: "DEF", strength: 84, avatarUrl: "", marktwert: 40000000, geburtsdatum: "1996-11-15" },
    { vorname: "Joshua", nachname: "Kimmich", nationalitaet: "Deutschland", positionGroup: "MID", strength: 88, avatarUrl: "", marktwert: 75000000, geburtsdatum: "1995-02-08" },
    { vorname: "Leon", nachname: "Goretzka", nationalitaet: "Deutschland", positionGroup: "MID", strength: 85, avatarUrl: "", marktwert: 45000000, geburtsdatum: "1995-02-06" },
    { vorname: "Jamal", nachname: "Musiala", nationalitaet: "Deutschland", positionGroup: "MID", strength: 86, avatarUrl: "", marktwert: 110000000, geburtsdatum: "2003-02-26" },
    { vorname: "Serge", nachname: "Gnabry", nationalitaet: "Deutschland", positionGroup: "ATT", strength: 84, avatarUrl: "", marktwert: 35000000, geburtsdatum: "1995-07-14" },
    { vorname: "Kingsley", nachname: "Coman", nationalitaet: "Frankreich", positionGroup: "ATT", strength: 86, avatarUrl: "", marktwert: 60000000, geburtsdatum: "1996-06-13" },
    { vorname: "Leroy", nachname: "Sané", nationalitaet: "Deutschland", positionGroup: "ATT", strength: 86, avatarUrl: "", marktwert: 70000000, geburtsdatum: "1996-01-11" },
    { vorname: "Harry", nachname: "Kane", nationalitaet: "England", positionGroup: "ATT", strength: 90, avatarUrl: "", marktwert: 110000000, geburtsdatum: "1993-07-28" },
    { vorname: "Eric", nachname: "Dier", nationalitaet: "England", positionGroup: "DEF", strength: 78, avatarUrl: "", marktwert: 10000000, geburtsdatum: "1994-01-15" },
    { vorname: "Alphonso", nachname: "Davies", nationalitaet: "Kanada", positionGroup: "DEF", strength: 84, avatarUrl: "", marktwert: 70000000, geburtsdatum: "2000-11-02" },
    { vorname: "Noussair", nachname: "Mazraoui", nationalitaet: "Marokko", positionGroup: "DEF", strength: 81, avatarUrl: "", marktwert: 25000000, geburtsdatum: "1997-11-14" },
    { vorname: "Raphaël", nachname: "Guerreiro", nationalitaet: "Portugal", positionGroup: "MID", strength: 81, avatarUrl: "", marktwert: 18000000, geburtsdatum: "1993-12-22" },
    { vorname: "Bryan", nachname: "Zirkzee", nationalitaet: "Niederlande", positionGroup: "ATT", strength: 74, avatarUrl: "", marktwert: 12000000, geburtsdatum: "2001-05-22" },
    { vorname: "Thomas", nachname: "Müller", nationalitaet: "Deutschland", positionGroup: "MID", strength: 83, avatarUrl: "", marktwert: 12000000, geburtsdatum: "1989-09-13" },
    { vorname: "Aleksandar", nachname: "Pavlović", nationalitaet: "Deutschland", positionGroup: "MID", strength: 75, avatarUrl: "", marktwert: 8000000, geburtsdatum: "2004-05-03" },
    { vorname: "Mathys", nachname: "Tel", nationalitaet: "Frankreich", positionGroup: "ATT", strength: 77, avatarUrl: "", marktwert: 30000000, geburtsdatum: "2005-04-27" },
  ];

  // 5. Spieler BVB (20 Beispiele)
  const bvbSpieler = [
    { vorname: "Gregor", nachname: "Kobel", nationalitaet: "Schweiz", positionGroup: "TOR", strength: 86, avatarUrl: "", marktwert: 35000000, geburtsdatum: "1997-12-06" },
    { vorname: "Alexander", nachname: "Meyer", nationalitaet: "Deutschland", positionGroup: "TOR", strength: 75, avatarUrl: "", marktwert: 700000, geburtsdatum: "1991-04-13" },
    { vorname: "Nico", nachname: "Schlotterbeck", nationalitaet: "Deutschland", positionGroup: "DEF", strength: 83, avatarUrl: "", marktwert: 40000000, geburtsdatum: "1999-12-01" },
    { vorname: "Mats", nachname: "Hummels", nationalitaet: "Deutschland", positionGroup: "DEF", strength: 81, avatarUrl: "", marktwert: 7000000, geburtsdatum: "1988-12-16" },
    { vorname: "Ian", nachname: "Maatsen", nationalitaet: "Niederlande", positionGroup: "DEF", strength: 78, avatarUrl: "", marktwert: 25000000, geburtsdatum: "2002-03-10" },
    { vorname: "Julian", nachname: "Ryerson", nationalitaet: "Norwegen", positionGroup: "DEF", strength: 80, avatarUrl: "", marktwert: 18000000, geburtsdatum: "1997-11-17" },
    { vorname: "Ramy", nachname: "Bensebaini", nationalitaet: "Algerien", positionGroup: "DEF", strength: 81, avatarUrl: "", marktwert: 18000000, geburtsdatum: "1995-04-16" },
    { vorname: "Salih", nachname: "Özcan", nationalitaet: "Deutschland", positionGroup: "MID", strength: 77, avatarUrl: "", marktwert: 13000000, geburtsdatum: "1998-01-11" },
    { vorname: "Emre", nachname: "Can", nationalitaet: "Deutschland", positionGroup: "MID", strength: 81, avatarUrl: "", marktwert: 18000000, geburtsdatum: "1994-01-12" },
    { vorname: "Felix", nachname: "Nmecha", nationalitaet: "Deutschland", positionGroup: "MID", strength: 79, avatarUrl: "", marktwert: 20000000, geburtsdatum: "2000-10-10" },
    { vorname: "Julian", nachname: "Brandt", nationalitaet: "Deutschland", positionGroup: "MID", strength: 84, avatarUrl: "", marktwert: 40000000, geburtsdatum: "1996-05-02" },
    { vorname: "Marcel", nachname: "Sabitzer", nationalitaet: "Österreich", positionGroup: "MID", strength: 80, avatarUrl: "", marktwert: 18000000, geburtsdatum: "1994-03-17" },
    { vorname: "Karim", nachname: "Adeyemi", nationalitaet: "Deutschland", positionGroup: "ATT", strength: 80, avatarUrl: "", marktwert: 28000000, geburtsdatum: "2002-01-18" },
    { vorname: "Youssoufa", nachname: "Moukoko", nationalitaet: "Deutschland", positionGroup: "ATT", strength: 76, avatarUrl: "", marktwert: 25000000, geburtsdatum: "2004-11-20" },
    { vorname: "Niclas", nachname: "Füllkrug", nationalitaet: "Deutschland", positionGroup: "ATT", strength: 82, avatarUrl: "", marktwert: 16000000, geburtsdatum: "1993-02-09" },
    { vorname: "Donyell", nachname: "Malen", nationalitaet: "Niederlande", positionGroup: "ATT", strength: 83, avatarUrl: "", marktwert: 30000000, geburtsdatum: "1999-01-19" },
    { vorname: "Jamie", nachname: "Bynoe-Gittens", nationalitaet: "England", positionGroup: "ATT", strength: 75, avatarUrl: "", marktwert: 18000000, geburtsdatum: "2004-08-08" },
    { vorname: "Jadon", nachname: "Sancho", nationalitaet: "England", positionGroup: "ATT", strength: 83, avatarUrl: "", marktwert: 35000000, geburtsdatum: "2000-03-25" },
    { vorname: "Marco", nachname: "Reus", nationalitaet: "Deutschland", positionGroup: "MID", strength: 80, avatarUrl: "", marktwert: 9000000, geburtsdatum: "1989-05-31" },
    { vorname: "Marius", nachname: "Wolf", nationalitaet: "Deutschland", positionGroup: "DEF", strength: 77, avatarUrl: "", marktwert: 7000000, geburtsdatum: "1995-05-27" },
  ];

  // 6. In Firestore schreiben
  for (const user of users) {
    await db.collection('users').doc(user.uid).set(user);
  }
  for (const t of teams) {
    await db.collection('teams').doc(t.id).set(t);
  }
  for (const p of bayernSpieler) {
    await db.collection('players').add({ ...p, teamId: "fcb" });
  }
  for (const p of bvbSpieler) {
    await db.collection('players').add({ ...p, teamId: "bvb" });
  }

  console.log("Seed abgeschlossen! (Nur Firestore)");
}

main();
