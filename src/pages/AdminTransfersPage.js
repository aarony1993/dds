import React, { useState, useEffect } from 'react';
import { db, functions } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore'; // 'updateDoc' wurde hier hinzugefügt
import { httpsCallable } from 'firebase/functions';
import { toast } from 'react-toastify';

function AdminTransfersPage() {
  const [pendingTransfers, setPendingTransfers] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "transfers"), where("status", "==", "pending_admin_approval"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingTransfers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleApprove = async (transfer) => {
    const executeTransfer = httpsCallable(functions, 'executeTransfer');
    try {
      await executeTransfer({ transferId: transfer.id });
      toast.success('Transfer erfolgreich durchgeführt!');
    } catch (error) {
      toast.error('Fehler bei der Durchführung des Transfers.');
      console.error("Transfer approval failed: ", error);
    }
  };

  const handleReject = async (transferId) => {
    const transferRef = doc(db, 'transfers', transferId);
    await updateDoc(transferRef, { status: 'rejected_by_admin' });
    toast.error('Transfer vom Admin abgelehnt.');
  };

  return (
    <div>
      <h1>Admin: Transfer-Freigaben</h1>
      {pendingTransfers.length === 0 ? (
        <p>Keine Transfers zur Freigabe vorhanden.</p>
      ) : (
        pendingTransfers.map(t => (
          <div key={t.id} style={{ border: '1px solid #555', padding: '15px', margin: '10px 0' }}>
            <p><strong>Transfer ID:</strong> {t.id}</p>
            <p><strong>Von Team:</strong> {t.proposingTeamId}</p>
            <p><strong>An Team:</strong> {t.receivingTeamId}</p>
            <button onClick={() => handleApprove(t)}>Genehmigen</button>
            <button onClick={() => handleReject(t.id)} style={{ marginLeft: '10px' }}>Ablehnen</button>
          </div>
        ))
      )}
    </div>
  );
}

export default AdminTransfersPage;