const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  projectId: 'deadlineday-sim',
});

const db = getFirestore();

const TEAMS = [
  {
    id: 'teamA',
    name: 'FC Alpha',
    land: 'Deutschland',
    liga: 'Bundesliga',
    logoUrl: 'https://dummyimage.com/120x120/001f4d/ffffff&text=Alpha',
    managerUid: 'uid-alpha-001',
    budget: 50000000 // 50 Mio Startbudget
  },
  {
    id: 'teamB',
    name: 'Real Beta',
    land: 'Spanien',
    liga: 'La Liga',
    logoUrl: 'https://dummyimage.com/120x120/4d0c00/ffffff&text=Beta',
    managerUid: 'uid-beta-002',
    budget: 45000000 // 45 Mio Startbudget
  },
];

const NATIONALITIES = ['Deutschland', 'Spanien', 'Frankreich', 'England', 'Italien', 'Brasilien', 'Niederlande'];

const POSITIONS = [
  // Torhüter
  { pos: 'TW', group: 'TOR' },
  // Abwehr (DEF)
  { pos: 'LV', group: 'DEF' }, { pos: 'IV', group: 'DEF' }, { pos: 'IV', group: 'DEF' }, { pos: 'RV', group: 'DEF' },
  { pos: 'LV', group: 'DEF' }, { pos: 'RV', group: 'DEF' },
  // Mittelfeld (MID)
  { pos: 'ZM', group: 'MID' }, { pos: 'ZM', group: 'MID' }, { pos: 'LM', group: 'MID' },
  { pos: 'RM', group: 'MID' }, { pos: 'DM', group: 'MID' }, { pos: 'OM', group: 'MID' },
  // Sturm (ATT)
  { pos: 'ST', group: 'ATT' }, { pos: 'ST', group: 'ATT' }, { pos: 'MS', group: 'ATT' }
];

function randomName(list) { return list[Math.floor(Math.random() * list.length)]; }
const FIRSTNAMES = ['Max', 'Lukas', 'Jonas', 'Paul', 'Leon', 'Luis', 'Tim', 'Fabian', 'Simon', 'Nico'];
const LASTNAMES = ['Müller', 'Schmidt', 'García', 'Fernandez', 'Santos', 'de Jong', 'Silva', 'Weber', 'Klein', 'Bauer'];
function randomBirthday() {
  const year = 1988 + Math.floor(Math.random() * 16);
  const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
  const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function randomStrength(group) {
  if (group === "TOR") return 74 + Math.floor(Math.random() * 7);
  if (group === "DEF") return 70 + Math.floor(Math.random() * 11);
  if (group === "MID") return 72 + Math.floor(Math.random() * 11);
  if (group === "ATT") return 74 + Math.floor(Math.random() * 9);
  return 70 + Math.floor(Math.random() * 11);
}
function randomMarketValue(strength) {
  return 1000000 * strength + 500000 + Math.floor(Math.random() * 800000);
}

async function clearFirestore() {
  const collections = ['teams', 'players'];
  for (const col of collections) {
    const snap = await db.collection(col).get();
    for (const doc of snap.docs) {
      await doc.ref.delete();
    }
  }
}

async function seed() {
  // 1. Firestore leeren
  console.log('Lösche alte Daten...');
  await clearFirestore();

  // 2. Teams anlegen
  for (const team of TEAMS) {
    await db.collection('teams').doc(team.id).set(team);
  }

  // 3. Spieler pro Team anlegen
  for (const team of TEAMS) {
    for (let i = 0; i < 17; i++) {
      // Torhüter
      let posObj;
      if (i < 2) posObj = { pos: 'TW', group: 'TOR' };
      else if (i < 8) posObj = POSITIONS[1 + (i - 2) % 6];
      else if (i < 14) posObj = POSITIONS[7 + (i - 8) % 6];
      else posObj = POSITIONS[13 + (i - 14) % 3];

      const strength = randomStrength(posObj.group);
      const spielernummer = i + 1;

      await db.collection('players').add({
        spielernummer,
        vorname: randomName(FIRSTNAMES),
        nachname: randomName(LASTNAMES),
        position: posObj.pos,
        positionGroup: posObj.group,
        staerke: strength,
        teamId: team.id,
        geburtsdatum: randomBirthday(),
        nationalitaet: randomName(NATIONALITIES),
        marktwert: randomMarketValue(strength),
        avatarUrl: "https://dummyimage.com/80x80/eeeeee/333333&text=" + posObj.pos
      });
    }
  }
  console.log('Seed abgeschlossen!');
}

seed().then(() => process.exit(0));
