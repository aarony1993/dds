import { createContext, useState, useEffect, useContext } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config'; // Stellt sicher, dass db hier exportiert wird

// Erstellt den Kontext
const AuthContext = createContext();

// Hook, um den Kontext einfach zu verwenden
export const useAuth = () => {
  return useContext(AuthContext);
};

// Provider-Komponente, die die Logik enthält
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // Wichtig für den Ladezustand

  useEffect(() => {
    // Diese Funktion wird bei jeder Änderung des Login-Status aufgerufen
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Benutzer ist eingeloggt, jetzt holen wir seine Daten aus Firestore
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          // Kombiniere Auth-Daten mit Firestore-Daten (inkl. teamId)
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            ...userDoc.data(), // Hier wird die teamId hinzugefügt!
          });
        } else {
          // Fallback, falls kein User-Dokument existiert
          setUser(firebaseUser);
          console.warn("Benutzer ist eingeloggt, aber es wurde kein zugehöriges Dokument in der 'users'-Collection gefunden.");
        }
      } else {
        // Benutzer ist ausgeloggt
        setUser(null);
      }
      setLoading(false); // Ladevorgang abschließen
    });

    // Aufräumfunktion, um den Listener zu entfernen
    return () => unsubscribe();
  }, []);

  const value = {
    user,
    loading, // Wir exportieren den Ladezustand
  };

  // Wir rendern die Kinder erst, wenn der Ladevorgang abgeschlossen ist
  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};