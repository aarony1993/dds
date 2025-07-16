import React, { useEffect, useState } from "react";
import {
  Typography,
  Box,
  Paper,
  Grid,
  Button,
} from "@mui/material";
import { collection, getDocs, query, where, doc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getFunctions, httpsCallable } from "firebase/functions";

const PendingActions = () => {
  const { user } = useAuth();
  const [pendingInvites, setPendingInvites] = useState([]);
  const [pendingTransfers, setPendingTransfers] = useState([]);

  useEffect(() => {
    if (!user) return;

    // Lade offene Spiel-Einladungen für den aktuellen User
    const loadInvites = async () => {
      const invitesQuery = query(
        collection(db, "gameInvites"),
        where("inviteeUid", "==", user.uid)
      );
      const snapshot = await getDocs(invitesQuery);
      setPendingInvites(
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      );
    };

    // Lade offene Transferangebote für den aktuellen User
    const loadTransfers = async () => {
      const transfersQuery = query(
        collection(db, "transfers"),
        where("recipientUid", "==", user.uid)
      );
      const snapshot = await getDocs(transfersQuery);
      setPendingTransfers(
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      );
    };

    loadInvites();
    loadTransfers();
  }, [user]);

  // Annahme oder Ablehnung von Spieleinladungen über Callable Functions
  const functions = getFunctions(undefined, "europe-west3");

  const handleAcceptInvite = async (inviteId) => {
    const acceptInvite = httpsCallable(functions, "acceptGameInvite");
    await acceptInvite({ inviteId });
    await deleteDoc(doc(db, "gameInvites", inviteId));
    setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
  };

  const handleDeclineInvite = async (inviteId) => {
    await deleteDoc(doc(db, "gameInvites", inviteId));
    setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
  };

  // (Platzhalter: Transfer-Aktionen wie Annehmen/Ablehnen könnten hier analog ergänzt werden.)

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Offene Einladungen
      </Typography>
      <Grid container spacing={2}>
        {pendingInvites.length === 0 && (
          <Grid lg={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="body1">Keine offenen Einladungen.</Typography>
            </Paper>
          </Grid>
        )}
        {pendingInvites.map((invite) => (
          <Grid key={invite.id} lg={4}>
            <Paper sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1 }}>
              <Typography variant="subtitle1">
                Von: {invite.inviterName || "Unbekannt"}
              </Typography>
              <Typography variant="body2">
                Team: {invite.inviterTeamName || "-"}
              </Typography>
              <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => handleAcceptInvite(invite.id)}
                >
                  Annehmen
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => handleDeclineInvite(invite.id)}
                >
                  Ablehnen
                </Button>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Typography variant="h5" sx={{ mt: 4 }} gutterBottom>
        Offene Transferangebote
      </Typography>
      <Grid container spacing={2}>
        {pendingTransfers.length === 0 && (
          <Grid lg={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="body1">Keine offenen Transferangebote.</Typography>
            </Paper>
          </Grid>
        )}
        {/* Hier könnte die Transfer-Aktionen-Liste ergänzt werden */}
      </Grid>
    </Box>
  );
};

export default PendingActions;
