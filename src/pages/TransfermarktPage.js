import React, { useEffect, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Avatar,
  Grid,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from "@mui/material";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

const TransfermarktPage = () => {
  const { user } = useAuth();
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");

  useEffect(() => {
    // Fetch all players NOT in current user's team
    const fetchPlayers = async () => {
      if (!user) return;

      // Get user's team
      const teamQuery = query(
        collection(db, "teams"),
        where("managerUid", "==", user.uid)
      );
      const teamSnapshot = await getDocs(teamQuery);
      if (teamSnapshot.empty) return;
      const userTeamId = teamSnapshot.docs[0].id;

      // Get players not in user's team
      const allPlayersSnapshot = await getDocs(collection(db, "players"));

      setPlayers(
        allPlayersSnapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((player) => player.teamId !== userTeamId)
      );
    };

    fetchPlayers();
  }, [user]);

  const handleOfferClick = (player) => {
    setSelectedPlayer(player);
    setOfferAmount("");
    setOfferDialogOpen(true);
  };

  const handleOfferSubmit = () => {
    // TODO: Implementiere Angebotserstellung per Firestore/Cloud Function
    alert(
      `Angebot für ${selectedPlayer.name} über ${offerAmount} € wurde (simuliert) abgeschickt.`
    );
    setOfferDialogOpen(false);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Transfermarkt
      </Typography>
      <Grid container spacing={2}>
        {players.map((player) => (
          <Grid key={player.id} lg={3} xl={2}>
            <Paper sx={{ p: 2, display: "flex", alignItems: "center" }}>
              <Avatar
                src={player.avatarUrl || "/dummy-player.png"}
                sx={{ width: 48, height: 48, mr: 2 }}
                alt={player.name}
              />
              <Box>
                <Typography variant="subtitle1">{player.name}</Typography>
                <Typography variant="body2">
                  Position: {player.position || "-"}
                </Typography>
                <Typography variant="body2">
                  PositionGroup: {player.positionGroup || "-"}
                </Typography>
                <Button
                  sx={{ mt: 1 }}
                  variant="outlined"
                  onClick={() => handleOfferClick(player)}
                >
                  Angebot abgeben
                </Button>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Dialog open={offerDialogOpen} onClose={() => setOfferDialogOpen(false)}>
        <DialogTitle>
          Transferangebot für {selectedPlayer?.name}
        </DialogTitle>
        <DialogContent>
          <TextField
            label="Angebot (€)"
            type="number"
            value={offerAmount}
            onChange={(e) => setOfferAmount(e.target.value)}
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOfferDialogOpen(false)}>Abbrechen</Button>
          <Button onClick={handleOfferSubmit} variant="contained" disabled={!offerAmount}>
            Abschicken
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TransfermarktPage;
