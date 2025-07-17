const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'deadlineday-sim'
});

const db = admin.firestore();

async function addNameFieldToAllPlayers() {
  const playersRef = db.collection('players');
  const snapshot = await playersRef.get();

  let updateCount = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();

    // Nur aktualisieren, wenn 'name' noch nicht existiert und vorname/nachname vorhanden sind
    if (!data.name && data.vorname && data.nachname) {
      const name = `${data.vorname} ${data.nachname}`;
      await doc.ref.update({ name });
      console.log(`Updated ${name}`);
      updateCount++;
    }
  }

  console.log(`Fertig! Insgesamt ${updateCount} Spieler aktualisiert.`);
}

addNameFieldToAllPlayers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Fehler:", err);
    process.exit(1);
  });
