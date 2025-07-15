import React, { useState, useEffect } from 'react';
import { db, functions } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Box, Typography, Button, Paper, List, ListItem, ListItemText, Divider } from '@mui/material';
import { toast } from 'react-toastify';

function PendingActions({ myTeam }) {
  const [transfers, setTransfers] = useState([]);
  const [invites, setInvites] = useState([]);

  // Listener für Transferangebote
  useEffect(() => {
    if (!myTeam) return;
    const q = query(
      collection(db, "transfers"),
      where("receivingTeamId", "==", myTeam.id),
      where("status", "==", "pending_receiver_action")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTransfers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [myTeam]);

  // Listener für Spieleinladungen
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

  const handleAcceptInvite = async (inviteId) => {
    const acceptInvite = httpsCallable(functions, 'acceptGameInvite');
    try {
      await acceptInvite({ inviteId: inviteId });
      toast.success("Einladung angenommen! Das Spiel wurde angesetzt.");
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleDeclineInvite = async (inviteId) => {
    await deleteDoc(doc(db, 'game_invites', inviteId));
    toast.info('Einladung abgelehnt.');
  };
  
  // (Hier könnte man noch handleAccept/DeclineTransfer hinzufügen)

  if (transfers.length === 0 && invites.length === 0) {
    return null;
  }

  return (
    <Paper sx={{ p: 2, mt: 4, mb: 4 }}>
      <Typography variant="h5" gutterBottom>Offene Aktionen</Typography>
      {invites.length > 0 && (
        <Box>
          <Typography variant="h6" sx={{mt: 2}}>Spieleinladungen</Typography>
          <List>
            {invites.map(invite => (
              <ListItem key={invite.id} secondaryAction={
                <>
                  <Button edge="end" color="primary" onClick={() => handleAcceptInvite(invite.id)}>Annehmen</Button>
                  <Button edge="end" color="warning" sx={{ ml: 1 }} onClick={() => handleDeclineInvite(invite.id)}>Ablehnen</Button>
                </>
              }>
                <ListItemText primary={`Einladung von Team ${invite.proposingTeamId}`} secondary={`Wunschtermin: ${new Date(invite.proposedDate.seconds * 1000).toLocaleString('de-DE')}`} />
              </ListItem>
            ))}
          </List>
          <Divider />
        </Box>
      )}
      {transfers.length > 0 && (
        <Box>
           <Typography variant="h6" sx={{mt: 2}}>Transferangebote</Typography>
           {/* Hier würde die Liste der Transferangebote gerendert werden */}
        </Box>
      )}
    </Paper>
  );
}

export default PendingActions;