import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Slider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Avatar,
} from "@mui/material";
import { collection, getDocs, query, where, updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

// Layout für Spielerplätze auf dem Feld pro Formation (rel. Werte: 0-100)
const FORMATIONS = [
  {
    name: "4-4-2 (Flach)",
    positions: [
      { label: "TW", key: "TW", positionGroup: "TOR", x: 50, y: 92 },
      { label: "LV", key: "LV", positionGroup: "DEF", x: 20, y: 75 },
      { label: "IV1", key: "IV1", positionGroup: "DEF", x: 38, y: 80 },
      { label: "IV2", key: "IV2", positionGroup: "DEF", x: 62, y: 80 },
      { label: "RV", key: "RV", positionGroup: "DEF", x: 80, y: 75 },
      { label: "LM", key: "LM", positionGroup: "MID", x: 15, y: 60 },
      { label: "ZM1", key: "ZM1", positionGroup: "MID", x: 40, y: 62 },
      { label: "ZM2", key: "ZM2", positionGroup: "MID", x: 60, y: 62 },
      { label: "RM", key: "RM", positionGroup: "MID", x: 85, y: 60 },
      { label: "ST1", key: "ST1", positionGroup: "ATT", x: 35, y: 40 },
      { label: "ST2", key: "ST2", positionGroup: "ATT", x: 65, y: 40 },
    ],
  },
  // Weitere Formationen können analog ergänzt werden.
];

const Taktikboard = () => {
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [formation, setFormation] = useState(FORMATIONS[0]);
  const [lineup, setLineup] = useState({});
  const [tactics, setTactics] = useState({ defenseLine: 50, pressing: 50 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(null);

  useEffect(() => {
    const fetchTeamAndPlayers = async () => {
      if (!user) return;

      // Team laden
      const teamQuery = query(
        collection(db, "teams"),
        where("managerUid", "==", user.uid)
      );
      const teamSnapshot = await getDocs(teamQuery);
      if (teamSnapshot.empty) return;
      const teamDoc = teamSnapshot.docs[0];
      setTeam({ id: teamDoc.id, ...teamDoc.data() });

      // Spieler laden
      const playersQuery = query(
        collection(db, "players"),
        where("teamId", "==", teamDoc.id)
      );
      const playersSnapshot = await getDocs(playersQuery);
      setPlayers(playersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));

      // Formation/Taktik/Lineup laden
      const data = teamDoc.data();
      if (data.formationName) {
        const f = FORMATIONS.find((f) => f.name === data.formationName);
        if (f) setFormation(f);
      }
      if (data.lineup) setLineup(data.lineup);
      if (data.tactics) setTactics(data.tactics);
    };

    fetchTeamAndPlayers();
    // eslint-disable-next-line
  }, [user]);

  const handleSave = async () => {
    if (!team) return;
    await updateDoc(doc(db, "teams", team.id), {
      formationName: formation.name,
      lineup,
      tactics,
    });
  };

  // Spieler-Auswahldialog
  const handleOpenDialog = (position) => {
    setSelectedPosition(position);
    setDialogOpen(true);
  };

  const handleSelectPlayer = (playerId) => {
    setLineup((prev) => ({
      ...prev,
      [selectedPosition.key]: playerId,
    }));
    setDialogOpen(false);
  };

  // Welche Spieler passen auf die Position? (Optional nach positionGroup filtern)
  const availablePlayers = players.filter(
    (p) =>
      !Object.values(lineup).includes(p.id) || lineup[selectedPosition?.key] === p.id
  );

  return (
    <Box sx={{ display: "flex", height: "calc(100vh - 64px)", px: 5, pt: 5 }}>
      {/* Sidebar */}
      <Paper sx={{ width: 340, p: 4, mr: 4, bgcolor: "#232a34", color: "white" }}>
        <Typography variant="h5" sx={{ mb: 3 }}>
          Formation
        </Typography>
        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel sx={{ color: "white" }}>Formation</InputLabel>
          <Select
            value={formation.name}
            label="Formation"
            onChange={(e) => {
              const f = FORMATIONS.find((f) => f.name === e.target.value);
              setFormation(f);
              setLineup({});
            }}
            sx={{ color: "white" }}
          >
            {FORMATIONS.map((f) => (
              <MenuItem key={f.name} value={f.name}>
                {f.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1">Abwehrhöhe: {tactics.defenseLine}</Typography>
          <Slider
            value={tactics.defenseLine}
            min={0}
            max={100}
            onChange={(_, val) =>
              setTactics((prev) => ({ ...prev, defenseLine: val }))
            }
            sx={{ color: "#ffc107" }}
          />
        </Box>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body1">Pressing: {tactics.pressing}</Typography>
          <Slider
            value={tactics.pressing}
            min={0}
            max={100}
            onChange={(_, val) =>
              setTactics((prev) => ({ ...prev, pressing: val }))
            }
            sx={{ color: "#ffc107" }}
          />
        </Box>
        <Button
          variant="contained"
          fullWidth
          sx={{
            bgcolor: "#ffc107",
            color: "#1a1a1a",
            fontWeight: "bold",
            mt: 1,
            ":hover": { bgcolor: "#ffb300" },
          }}
          onClick={handleSave}
        >
          SPEICHERN
        </Button>
      </Paper>

      {/* Spielfeld */}
      <Box
        sx={{
          flex: 1,
          position: "relative",
          bgcolor: "#1a6834",
          borderRadius: "32px",
          boxShadow: 6,
          minHeight: 720,
          overflow: "hidden",
        }}
      >
        {/* Feld-Linien (einfaches SVG) */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: "absolute", left: 0, top: 0, zIndex: 0, opacity: 0.25 }}
        >
          <rect x="3" y="3" width="94" height="94" rx="10" fill="none" stroke="white" strokeWidth="1" />
          <rect x="10" y="10" width="80" height="80" rx="2" fill="none" stroke="white" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="10" fill="none" stroke="white" strokeWidth="0.5" />
        </svg>
        {/* Spielerplätze */}
        {formation.positions.map((pos) => {
          const playerId = lineup[pos.key];
          const player = players.find((p) => p.id === playerId);

          return (
            <Box
              key={pos.key}
              sx={{
                position: "absolute",
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: "translate(-50%,-50%)",
                width: 72,
                height: 72,
                zIndex: 1,
                cursor: "pointer",
              }}
              onClick={() => handleOpenDialog(pos)}
            >
              <Paper
                elevation={player ? 6 : 1}
                sx={{
                  width: "100%",
                  height: "100%",
                  bgcolor: player ? "#fffde7" : "#e0e0e0",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 2,
                  border: player ? "2px solid #ffc107" : "1px solid #bbb",
                }}
              >
                <Typography variant="caption" color="textSecondary" sx={{ mb: 1 }}>
                  {pos.label}
                </Typography>
                <Avatar
                  src={player?.avatarUrl || undefined}
                  sx={{ width: 36, height: 36, mb: 1, bgcolor: "#bdbdbd" }}
                >
                  {!player && <span role="img" aria-label="Spieler">👤</span>}
                </Avatar>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: "bold",
                    color: "#3d3d3d",
                    fontSize: 14,
                    maxWidth: "90%",
                    textAlign: "center",
                    lineHeight: 1.1,
                  }}
                >
                  {player?.name || "-"}
                </Typography>
              </Paper>
            </Box>
          );
        })}
      </Box>

      {/* Auswahldialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          Spieler auswählen {selectedPosition ? `(${selectedPosition.label})` : ""}
        </DialogTitle>
        <DialogContent dividers>
          <List>
            {availablePlayers.map((player) => (
              <ListItem
                key={player.id}
                button
                onClick={() => handleSelectPlayer(player.id)}
                selected={lineup[selectedPosition?.key] === player.id}
                sx={{
                  mb: 1,
                  borderRadius: 2,
                  bgcolor: "#2b3646",
                  color: "white",
                  "&.Mui-selected": { bgcolor: "#ffc107", color: "#232a34" },
                }}
              >
                <Avatar
                  src={player.avatarUrl || undefined}
                  sx={{ mr: 2, bgcolor: "#bdbdbd" }}
                >
                  <span role="img" aria-label="Spieler">👤</span>
                </Avatar>
                <ListItemText
                  primary={
                    <span>
                      <b>{player.name}</b>
                    </span>
                  }
                  secondary={
                    <>
                      Position: {player.position || "-"} | Stärke: {player.strength}
                      <br />
                      Rolle: {player.positionGroup || "-"}
                    </>
                  }
                />
              </ListItem>
            ))}
            {availablePlayers.length === 0 && (
              <Typography variant="body2">Keine Spieler verfügbar.</Typography>
            )}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Abbrechen</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Taktikboard;
