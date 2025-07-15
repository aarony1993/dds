import React, { useState, useEffect } from 'react';
import { db, functions } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Typography, Button, Paper, List, ListItem, ListItemText } from '@mui/material';
import { toast } from 'react-toastify';

function GameInvites({ myTeam }) {
  const [invites, setInvites] = useState([]);

  useEffect(() => {
    if (!myTeam) return;
    const q = query(
      collection(db, "game_invites"),
      where("receivingTeamId", "==", myTeam.id),
      where("status", "==", "pending")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setInvites(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [myTeam]);

  const handleAccept = async (inviteId) => {
    const acceptInvite = httpsCallable(functions, 'acceptGameInvite');
    try {
      await acceptInvite({ inviteId: inviteId });
      toast.success("Einladung angenommen! Das Spiel wurde angesetzt.");
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleDecline = async (inviteId) => {
    const inviteRef = doc(db, 'game_invites', inviteId);
    try {
      await deleteDoc(inviteRef);
      toast.info('Einladung abgelehnt.');
    } catch (error) {
      toast.error('Fehler beim Ablehnen.');
    }
  };

  if (invites.length === 0) return null;

  return (
    <Paper sx={{ p: 2, mt: 4 }}>
      <Typography variant="h5" gutterBottom>Eingegangene Einladungen</Typography>
      <List>
        {invites.map(invite => (
          <ListItem key={invite.id} secondaryAction={
            <>
              <Button edge="end" color="primary" onClick={() => handleAccept(invite.id)}>Annehmen</Button>
              <Button edge="end" color="warning" sx={{ ml: 1 }} onClick={() => handleDecline(invite.id)}>Ablehnen</Button>
            </>
          }>
            <ListItemText 
              primary={`Einladung von Team: ${invite.proposingTeamId}`} 
              secondary={`Wunschtermin: ${new Date(invite.proposedDate.seconds * 1000).toLocaleString('de-DE')}`} 
            />
          </ListItem>
        ))}
      </List>
    </Paper>
  );
}
export default GameInvites;