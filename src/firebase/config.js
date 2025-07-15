// src/firebase/config.js
import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyAmzhuDVPUVuj_yYZ6HucEE1xhkD3MqWsI",
  authDomain: "deadlineday-sim.firebaseapp.com",
  projectId: "deadlineday-sim",
  storageBucket: "deadlineday-sim.appspot.com",
  messagingSenderId: "409985248528",
  appId: "1:409985248528:web:49487f61fb193015364995"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

// **Funktionen korrekt mit Region initialisieren**
const functions = getFunctions(app, "europe-west3");

if (window.location.hostname === "localhost") {
  connectAuthEmulator(auth, "http://localhost:9099");
  connectFirestoreEmulator(db, "localhost", 8080);
  connectFunctionsEmulator(functions, "localhost", 5001);
}

export { auth, db, functions };
