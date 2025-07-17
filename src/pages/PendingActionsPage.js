import React, { useEffect, useState } from "react";
import {
  Typography,
  Box,
  Paper,
  Grid,
  Button,
  List,
  ListItem,
  ListItemText
} from "@mui/material";
import { collection, query, where, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db, functions } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { httpsCallable } from "firebase/functions";
import { toast } from "react-toastify";

const PendingActionsPage = () => {
  const { user } = useAuth();
  const [pendingInvites, setPendingInvites] = useState([]);
  const [pendingTransfers, setPendingTransfers] = useState([]);

  useEffect(() => {
    if (!user) return;

    // Spiel-Einladungen laden (einheitlich: Collection "game_invites")
    const loadInvites = async () => {
      const invitesQuery = query(
        collection(db, "game_invites"),
        where("receivingTeamId", "==", user.teamId), // Annahme: teamId im Userobjekt
        where("status", "==", "pending")
      );
      const snapshot = await getDocs(invitesQuery);
      setPendingInvites(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    };

    // Offene Transfers laden (wenn du eine Status-Logik hast)
    const loadTransfers = async () => {
      const transfersQuery = query(
        collection(db, "transfers"),
        where("status", "==", "pending"),
        where("receivingTeamId", "==", user.teamId) // oder passendes Feld!
      );
      const snapshot = await getDocs(transfersQuery);
      setPendingTransfers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    };

    loadInvites();
    loadTransfers();
  }, [user]);

  const handleAcceptInvite = async (inviteId) => {
    const acceptInvite = httpsCallable(functions, "acceptGameInvite");
    try {
      await acceptInvite({ inviteId });
      toast.success("Einladung angenommen! Das Spiel wurde angesetzt.");
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleDeclineInvite = async (inviteId) => {
    try {
      await deleteDoc(doc(db, "game_invites", inviteId));
      toast.info('Einladung abgelehnt.');
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (error) {
      toast.error('Fehler beim Ablehnen.');
    }
  };

  // (Analog: Handler für Transfers anlegen, falls nötig.)

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Offene Freundschaftsspiel-Einladungen
      </Typography>
      {pendingInvites.length === 0 ? (
        <Paper sx={{ p: 2, mb: 4 }}>
          <Typography variant="body1">Keine offenen Einladungen.</Typography>
        </Paper>
      ) : (
        <List>
          {pendingInvites.map((invite) => (
            <ListItem
              key={invite.id}
              secondaryAction={
                <>
                  <Button variant="contained" color="primary" onClick={() => handleAcceptInvite(invite.id)}>Annehmen</Button>
                  <Button variant="outlined" color="warning" sx={{ ml: 1 }} onClick={() => handleDeclineInvite(invite.id)}>Ablehnen</Button>
                </>
              }
            >
              <ListItemText
                primary={`Von Team: ${invite.proposingTeamId}`}
                secondary={`Wunschtermin: ${invite.proposedDate?.seconds ? new Date(invite.proposedDate.seconds * 1000).toLocaleString('de-DE') : '-'}`}
              />
            </ListItem>
          ))}
        </List>
      )}

      <Typography variant="h5" sx={{ mt: 4 }} gutterBottom>
        Offene Transferangebote
      </Typography>
      {/* Hier kannst du das Transferangebot-Handling analog ergänzen */}
      {pendingTransfers.length === 0 ? (
        <Paper sx={{ p: 2 }}>
          <Typography variant="body1">Keine offenen Transferangebote.</Typography>
        </Paper>
      ) : (
        <List>
          {pendingTransfers.map((transfer) => (
            <ListItem key={transfer.id}>
              <ListItemText
                primary={`Transfer von Team ${transfer.proposingTeamId} zu Team ${transfer.receivingTeamId}`}
                secondary={`Spieler: ${transfer.offeredPlayerIds?.join(", ")} - Status: ${transfer.status}`}
              />
              {/* Buttons für Genehmigen/Ablehnen hier ergänzen */}
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
};

export default PendingActionsPage;
