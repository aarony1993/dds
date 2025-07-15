// src/components/TransferOfferModal.js
import React, { useState } from 'react';

// Das ist unser Pop-up-Fenster für das Transferangebot
function TransferOfferModal({ ownPlayers, targetPlayer, onCancel, onSubmit }) {
  const [offeredPlayerIds, setOfferedPlayerIds] = useState([]);
  const [offeredMoney, setOfferedMoney] = useState(0);

  const handlePlayerSelect = (e) => {
    // Erlaubt die Auswahl mehrerer Spieler aus der Liste
    const options = [...e.target.selectedOptions];
    const values = options.map(option => option.value);
    setOfferedPlayerIds(values);
  };

  const handleSubmit = () => {
    // Ruft die Funktion auf, die den Transfer in der Datenbank speichert
    onSubmit({
      targetPlayer,
      offeredPlayerIds,
      offeredMoney
    });
  };

  const modalStyle = {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    backgroundColor: '#333', padding: '20px', zIndex: 1000, border: '1px solid #555',
    width: '500px'
  };
  const overlayStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)', zIndex: 999
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h2>Transferangebot für {targetPlayer.name}</h2>
        
        <div style={{ margin: '15px 0' }}>
          <h4>Ich biete meine Spieler:</h4>
          <select multiple onChange={handlePlayerSelect} style={{ width: '100%', height: '100px' }}>
            {ownPlayers.map(p => (
              <option key={p.id} value={p.id}>{p.name} (Stärke: {p.strength})</option>
            ))}
          </select>
        </div>

        <div style={{ margin: '15px 0' }}>
          <h4>+ Geldangebot:</h4>
          <input 
            type="number" 
            value={offeredMoney} 
            onChange={e => setOfferedMoney(parseInt(e.target.value) || 0)}
            style={{ padding: '8px' }}
          />
        </div>

        <button onClick={handleSubmit}>Angebot abschicken</button>
        <button onClick={onCancel} style={{ marginLeft: '10px' }}>Abbrechen</button>
      </div>
    </div>
  );
}

export default TransferOfferModal;