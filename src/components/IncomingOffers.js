// src/components/IncomingOffers.js
import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { toast } from 'react-toastify';

function IncomingOffers({ teamId }) {
  const [offers, setOffers] = useState([]);

  useEffect(() => {
    if (!teamId) return;

    // Echtzeit-Listener für alle Angebote, die an mein Team gerichtet sind
    // und noch auf meine Reaktion warten.
    const q = query(
      collection(db, "transfers"),
      where("receivingTeamId", "==", teamId),
      where("status", "==", "pending_receiver_action")
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const incomingOffers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOffers(incomingOffers);
    });

    return () => unsubscribe();
  }, [teamId]);

  const handleAccept = async (offerId) => {
    const offerRef = doc(db, 'transfers', offerId);
    await updateDoc(offerRef, {
      status: 'pending_admin_approval'
    });
    toast.success('Angebot angenommen! Warte auf Admin-Freigabe.');
  };

  const handleDecline = async (offerId) => {
    const offerRef = doc(db, 'transfers', offerId);
    await updateDoc(offerRef, {
      status: 'rejected_by_receiver'
    });
    toast.error('Angebot abgelehnt.');
  };

  if (offers.length === 0) {
    return <p>Keine offenen Angebote.</p>;
  }

  return (
    <div style={{ marginTop: '30px' }}>
      <h3>Eingehende Transferangebote</h3>
      {offers.map(offer => (
        <div key={offer.id} style={{ border: '1px solid #555', padding: '15px', margin: '10px 0' }}>
          <p><strong>Angebot von Team:</strong> {offer.proposingTeamId}</p>
          <p><strong>Gebotene Spieler-IDs:</strong> {offer.offeredPlayerIds.join(', ')}</p>
          <p><strong>Gebotenes Geld:</strong> {offer.offeredMoney}</p>
          <p><strong>Geforderte Spieler-IDs:</strong> {offer.requestedPlayerIds.join(', ')}</p>
          <button onClick={() => handleAccept(offer.id)}>Annehmen</button>
          <button onClick={() => handleDecline(offer.id)} style={{ marginLeft: '10px' }}>Ablehnen</button>
        </div>
      ))}
    </div>
  );
}

export default IncomingOffers;