// src/pages/AdminToolPage.js
import React, { useState } from 'react';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';

function AdminToolPage() {
  const [email, setEmail] = useState('');

  const makeAdmin = async () => {
    if (!email) {
      alert("Bitte eine E-Mail-Adresse eingeben.");
      return;
    }
    const addAdminRole = httpsCallable(functions, 'addAdminRole');
    try {
      const result = await addAdminRole({ email: email });
      if (result.data.message) {
        alert(result.data.message);
      } else if (result.data.error) {
        alert(`Fehler: ${result.data.error}`);
      }
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <div>
      <h2>Make User Admin</h2>
      <input 
        type="email" 
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="E-Mail des Benutzers"
        style={{ padding: '8px', marginRight: '10px' }}
      />
      <button onClick={makeAdmin}>Zum Admin machen</button>
    </div>
  );
}

export default AdminToolPage;