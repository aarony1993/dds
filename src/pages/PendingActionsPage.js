// src/pages/PendingActionsPage.js
import React, { useEffect, useState } from "react";
import {
  Typography,
  Box,
  Paper,
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  ListItemText,
  Button,
  Divider,
} from "@mui/material";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db, functions } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { httpsCallable } from "firebase/functions";
import { toast } from "react-toastify";

export default function PendingActionsPage() {
  const { user } = useAuth();
  const [teamsById, setTeamsById] = useState({});
  const [playersById, setPlayersById] = useState({});
  const [pendingInvites, setPendingInvites] = useState([]);
  const [pendingTransfers, setPendingTransfers] = useState([]);

  // 1. Alle Teams und Spieler lokal cachen
  useEffect(() => {
    const loadTeamsAndPlayers = async () => {
      // Teams
      const teamSnap = await getDocs(collection(db, "teams"));
      const teams = {};
      teamSnap.docs.forEach(d => {
        teams[d.id] = { id: d.id, name: d.data().name };
      });
      setTeamsById(teams);

      // Spieler
      const playerSnap = await getDocs(collection(db, "players"));
      const players = {};
      playerSnap.docs.forEach(d => {
        const pd = d.data();
        players[d.id] = {
          id: d.id,
          name: `${pd.vorname} ${pd.nachname}`,
        };
      });
      setPlayersById(players);
    };
    loadTeamsAndPlayers();
  }, []);

  // 2. Einladungen und Transfers laden
  useEffect(() => {
    if (!user?.teamId) return;

    const loadInvites = async () => {
      const q = query(
        collection(db, "game_invites"),
        where("receivingTeamId", "==", user.teamId),
        where("status", "==", "pending")
      );
      const snap = await getDocs(q);
      setPendingInvites(
        snap.docs.map(d => ({ id: d.id, ...d.data() }))
      );
    };

    const loadTransfers = async () => {
      const q = query(
        collection(db, "transfers"),
        where("toTeamId", "==", user.teamId),
        where("status", "==", "pending")
      );
      const snap = await getDocs(q);
      setPendingTransfers(
        snap.docs.map(d => ({ id: d.id, ...d.data() }))
      );
    };

    loadInvites();
    loadTransfers();
  }, [user, teamsById, playersById]);

  // 3. Invite annehmen/ablehnen
  const handleAcceptInvite = async inviteId => {
    try {
      const acceptFn = httpsCallable(functions, "acceptGameInvite");
      await acceptFn({ inviteId });
      toast.success("Einladung angenommen! Das Spiel wird angesetzt.");
      setPendingInvites(prev => prev.filter(i => i.id !== inviteId));
    } catch (err) {
      toast.error(err.message || "Fehler beim Annehmen der Einladung.");
    }
  };

  const handleDeclineInvite = async inviteId => {
    try {
      await deleteDoc(doc(db, "game_invites", inviteId));
      toast.info("Einladung abgelehnt.");
      setPendingInvites(prev => prev.filter(i => i.id !== inviteId));
    } catch {
      toast.error("Fehler beim Ablehnen der Einladung.");
    }
  };

  // 4. Transfer annehmen/ablehnen (Zwischenschritt)
  const handleAcceptTransfer = async transferId => {
    try {
      await updateDoc(
        doc(db, "transfers", transferId),
        { status: "acceptedByUser" }
      );
      toast.success("Transferangebot angenommen! Warten auf Admin-Freigabe.");
      setPendingTransfers(prev => prev.filter(t => t.id !== transferId));
    } catch {
      toast.error("Fehler beim Annehmen des Transfers.");
    }
  };

  const handleDeclineTransfer = async transferId => {
    try {
      await updateDoc(
        doc(db, "transfers", transferId),
        { status: "declinedByUser" }
      );
      toast.info("Transferangebot abgelehnt.");
      setPendingTransfers(prev => prev.filter(t => t.id !== transferId));
    } catch {
      toast.error("Fehler beim Ablehnen des Transfers.");
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Spiel-Einladungen */}
      <Typography variant="h5" gutterBottom>
        Offene Freundschaftsspiel-Einladungen
      </Typography>
      {pendingInvites.length === 0 ? (
        <Paper sx={{ p: 2, mb: 4 }}>
          <Typography>Keine offenen Einladungen.</Typography>
        </Paper>
      ) : (
        <List>
          {pendingInvites.map(inv => (
            <React.Fragment key={inv.id}>
              <ListItem
                secondaryAction={
                  <>
                    <Button
                      variant="contained"
                      onClick={() => handleAcceptInvite(inv.id)}
                    >
                      Annehmen
                    </Button>
                    <Button
                      variant="outlined"
                      color="warning"
                      sx={{ ml: 1 }}
                      onClick={() => handleDeclineInvite(inv.id)}
                    >
                      Ablehnen
                    </Button>
                  </>
                }
              >
                <ListItemAvatar>
                  <Avatar>
                    {teamsById[inv.proposingTeamId]?.name?.[0] || "?"}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={`Von: ${
                    teamsById[inv.proposingTeamId]?.name || inv.proposingTeamId
                  }`}
                  secondary={`Status: ${inv.status}`}
                />
              </ListItem>
              <Divider />
            </React.Fragment>
          ))}
        </List>
      )}

      {/* Transferangebote */}
      <Typography variant="h5" sx={{ mt: 4 }} gutterBottom>
        Offene Transferangebote
      </Typography>
      {pendingTransfers.length === 0 ? (
        <Paper sx={{ p: 2 }}>
          <Typography>Keine offenen Transferangebote.</Typography>
        </Paper>
      ) : (
        <List>
          {pendingTransfers.map(tr => (
            <React.Fragment key={tr.id}>
              <ListItem
                secondaryAction={
                  <>
                    <Button
                      variant="contained"
                      onClick={() => handleAcceptTransfer(tr.id)}
                    >
                      Annehmen
                    </Button>
                    <Button
                      variant="outlined"
                      color="warning"
                      sx={{ ml: 1 }}
                      onClick={() => handleDeclineTransfer(tr.id)}
                    >
                      Ablehnen
                    </Button>
                  </>
                }
              >
                <ListItemAvatar>
                  <Avatar>
                    {teamsById[tr.fromTeamId]?.name?.[0] || "?"}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={`Transfer von ${teamsById[tr.fromTeamId]?.name || tr.fromTeamId}`}
                  secondary={
                    <>
                      Deine Spieler:{" "}
                      {tr.myPlayers
                        .map(id => playersById[id]?.name || id)
                        .join(", ") ||
                        "-"}{" "}
                      + {tr.myAmount} €<br />
                      Gegenspieler:{" "}
                      {tr.oppPlayers
                        .map(id => playersById[id]?.name || id)
                        .join(", ") ||
                        "-"}{" "}
                      + {tr.oppAmount} €<br />
                      Status: {tr.status}
                    </>
                  }
                />
              </ListItem>
              <Divider />
            </React.Fragment>
          ))}
        </List>
      )}
    </Box>
  );
}
