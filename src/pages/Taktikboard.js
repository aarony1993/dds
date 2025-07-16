import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Grid,
  Paper,
  Avatar,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import { collection, getDocs, query, where, updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

const FORMATIONS = [
  {
    name: "4-4-2",
    positions: [
      { label: "TW", position: "TW", positionGroup: "GK" },
      { label: "LV", position: "LV", positionGroup: "DEF" },
      { label: "IV", position: "IV1", positionGroup: "DEF" },
      { label: "IV", position: "IV2", positionGroup: "DEF" },
      { label: "RV", position: "RV", positionGroup: "DEF" },
      { label: "LM", position: "LM", positionGroup: "MID" },
      { label: "ZM", position: "ZM1", positionGroup: "MID" },
      { label: "ZM", position: "ZM2", positionGroup: "MID" },
      { label: "RM", position: "RM", positionGroup: "MID" },
      { label: "ST", position: "ST1", positionGroup: "ATT" },
      { label: "ST", position: "ST2", positionGroup: "ATT" },
    ],
  },
  // Weitere Formationen können hier ergänzt werden.
];

const Taktikboard = () => {
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [formation, setFormation] = useState(FORMATIONS[0]);
  const [lineup, setLineup] = useState({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");

  useEffect(() => {
    const fetchTeamAndPlayers = async () => {
      if (!user) return;

      // Fetch Team
      const teamQuery = query(
        collection(db, "teams"),
        where("managerUid", "==", user.uid)
      );
      const teamSnapshot = await getDocs(teamQuery);
      if (teamSnapshot.empty) return;
      const teamDoc = teamSnapshot.docs[0];
      setTeam({ id: teamDoc.id, ...teamDoc.data() });

      // Fetch Players
      const playersQuery = query(
        collection(db, "players"),
        where("teamId", "==", teamDoc.id)
      );
      const playersSnapshot = await getDocs(playersQuery);
      setPlayers(
        playersSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
      );

      // Fetch Lineup/Formation
      if (teamDoc.data().formation) {
        setLineup(teamDoc.data().formation);
      }
    };

    fetchTeamAndPlayers();
  }, [user]);

  const handlePositionClick = (position) => {
    setSelectedPosition(position);
    setSelectedPlayerId(lineup[position.position] || "");
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedPosition(null);
    setSelectedPlayerId("");
  };

  const handlePlayerSelect = (e) => {
    setSelectedPlayerId(e.target.value);
  };

  const handleSavePlayer = () => {
    const updatedLineup = {
      ...lineup,
      [selectedPosition.position]: selectedPlayerId,
    };
    setLineup(updatedLineup);
    handleDialogClose();
  };

  const handleSaveFormation = async () => {
    if (!team) return;
    await updateDoc(doc(db, "teams", team.id), {
      formation: lineup,
    });
  };

  const availablePlayers = players;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Taktikboard
      </Typography>
      <FormControl sx={{ mb: 2, minWidth: 180 }}>
        <InputLabel id="formation-label">Formation</InputLabel>
        <Select
          labelId="formation-label"
          value={formation.name}
          label="Formation"
          onChange={(e) => {
            const next = FORMATIONS.find((f) => f.name === e.target.value);
            setFormation(next);
            setLineup({});
          }}
        >
          {FORMATIONS.map((f) => (
            <MenuItem key={f.name} value={f.name}>
              {f.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Grid container spacing={2}>
        {formation.positions.map((pos, idx) => {
          const playerId = lineup[pos.position];
          const player = players.find((pl) => pl.id === playerId);
          return (
            <Grid key={pos.position} lg={2} xl={2}>
              <Paper
                sx={{
                  p: 2,
                  minHeight: 120,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  bgcolor: "#f7f7f7",
                }}
                onClick={() => handlePositionClick(pos)}
              >
                <Typography variant="caption" color="textSecondary">
                  {pos.label}
                </Typography>
                {player ? (
                  <>
                    <Avatar
                      src={player.avatarUrl || "/dummy-player.png"}
                      sx={{ width: 48, height: 48, mb: 1 }}
                      alt={player.name}
                    />
                    <Typography variant="subtitle2">{player.name}</Typography>
                  </>
                ) : (
                  <Avatar sx={{ width: 48, height: 48, mb: 1, bgcolor: "#e0e0e0" }} />
                )}
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      <Button
        variant="contained"
        sx={{ mt: 3 }}
        onClick={handleSaveFormation}
        disabled={!team}
      >
        Aufstellung speichern
      </Button>

      <Dialog open={dialogOpen} onClose={handleDialogClose}>
        <DialogTitle>
          Spieler für {selectedPosition?.label} auswählen
        </DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel id="player-select-label">Spieler</InputLabel>
            <Select
              labelId="player-select-label"
              value={selectedPlayerId}
              label="Spieler"
              onChange={handlePlayerSelect}
            >
              {availablePlayers.map((pl) => (
                <MenuItem key={pl.id} value={pl.id}>
                  {pl.name} ({pl.position || "-"})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose}>Abbrechen</Button>
          <Button
            onClick={handleSavePlayer}
            variant="contained"
            disabled={!selectedPlayerId}
          >
            Übernehmen
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Taktikboard;
