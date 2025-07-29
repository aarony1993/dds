import React, { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  MenuItem,
  Select,
  Slider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  ListItemText,
  Tooltip
} from "@mui/material";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc
} from "firebase/firestore";

// --- Mapping Feldposition => Positionsgruppe
const positionGroupMapping = {
  TW: "TOR",
  IV: "DEF",
  LV: "DEF",
  RV: "DEF",
  ZDM: "MID",
  ZM: "MID",
  LM: "MID",
  RM: "MID",
  ZOM: "MID",
  HS: "ATT",
  ST: "ATT",
  MS: "ATT",
  LA: "ATT",
  RA: "ATT"
};

// --- Formationen: Feldpositionen mit exakten Koordinaten (% des Spielfelds)
const formations = {
  "4-4-2 Flach": [
    { pos: "TW", x: 50, y: 96 },
    { pos: "LV", x: 16, y: 78 },
    { pos: "IV1", x: 34, y: 83 },
    { pos: "IV2", x: 66, y: 83 },
    { pos: "RV", x: 84, y: 78 },
    { pos: "LM", x: 16, y: 59 },
    { pos: "ZM1", x: 37, y: 62 },
    { pos: "ZM2", x: 63, y: 62 },
    { pos: "RM", x: 84, y: 59 },
    { pos: "ST1", x: 40, y: 35 },
    { pos: "ST2", x: 60, y: 35 }
  ],
  "4-4-2 Raute": [
    { pos: "TW", x: 50, y: 96 },
    { pos: "LV", x: 16, y: 78 },
    { pos: "IV1", x: 34, y: 83 },
    { pos: "IV2", x: 66, y: 83 },
    { pos: "RV", x: 84, y: 78 },
    { pos: "ZDM", x: 50, y: 73 },
    { pos: "LM", x: 28, y: 60 },
    { pos: "RM", x: 72, y: 60 },
    { pos: "ZOM", x: 50, y: 51 },
    { pos: "ST1", x: 40, y: 35 },
    { pos: "ST2", x: 60, y: 35 }
  ],
  "4-3-3": [
    { pos: "TW", x: 50, y: 96 },
    { pos: "LV", x: 16, y: 78 },
    { pos: "IV1", x: 34, y: 83 },
    { pos: "IV2", x: 66, y: 83 },
    { pos: "RV", x: 84, y: 78 },
    { pos: "ZM1", x: 32, y: 66 },
    { pos: "ZM2", x: 68, y: 66 },
    { pos: "ZM3", x: 50, y: 54 },
    { pos: "LA", x: 15, y: 35 },
    { pos: "ST", x: 50, y: 30 },
    { pos: "RA", x: 85, y: 35 }
  ],
  "5-4-1": [
    { pos: "TW", x: 50, y: 96 },
    { pos: "LV", x: 10, y: 80 },
    { pos: "IV1", x: 26, y: 85 },
    { pos: "IV2", x: 50, y: 86 },
    { pos: "IV3", x: 74, y: 85 },
    { pos: "RV", x: 90, y: 80 },
    { pos: "LM", x: 16, y: 59 },
    { pos: "ZM1", x: 37, y: 62 },
    { pos: "ZM2", x: 63, y: 62 },
    { pos: "RM", x: 84, y: 59 },
    { pos: "ST", x: 50, y: 35 }
  ]
};

// --- Slider für Taktik-Level ---
const tacticSliderMarks = [
  { value: 0, label: "Defensiv" },
  { value: 1, label: "Ausbalanciert" },
  { value: 2, label: "Offensiv" }
];

export default function Taktikboard() {
  const { user } = useAuth();
  const [formationKey, setFormationKey] = useState("4-4-2 Flach");
  const [formation, setFormation] = useState(formations[formationKey]);
  const [tacticLevel, setTacticLevel] = useState(1);
  const [players, setPlayers] = useState([]);
  const [fieldPlayers, setFieldPlayers] = useState({});
  const [selectingPos, setSelectingPos] = useState(null);
  const [loading, setLoading] = useState(true);

  // Daten laden: Team, Spieler, Formation, Taktik
  useEffect(() => {
    const fetchData = async () => {
      if (!user?.teamId) return;
      setLoading(true);
      const teamRef = doc(db, 'teams', user.teamId);
      const teamSnap = await getDoc(teamRef);
      const teamData = teamSnap.exists() ? teamSnap.data() : null;

      const playerSnap = await getDocs(
        query(collection(db, "players"), where("teamId", "==", user.teamId))
      );
      setPlayers(playerSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      if (teamData?.formation) {
        const fp = {};
        teamData.formation.forEach(f => {
          if (f.positionKey) fp[f.positionKey] = f.playerId;
        });
        setFieldPlayers(fp);
      }

      if (typeof teamData?.tacticLevel === 'number') {
        setTacticLevel(teamData.tacticLevel);
      }

      setLoading(false);
    };
    fetchData();
  }, [user]);

  // Formation wechseln
  useEffect(() => {
    setFormation(formations[formationKey]);
    setFieldPlayers({});
  }, [formationKey]);

  const handleSelectPlayer = (posKey, playerId) => {
    setFieldPlayers(prev => ({ ...prev, [posKey]: playerId }));
    setSelectingPos(null);
  };

  const getEligiblePlayers = (posKey) => {
    const group = positionGroupMapping[posKey.replace(/[0-9]/g, "")];
    const usedIds = Object.values(fieldPlayers);
    return players.filter(p => p.positionGroup === group && !usedIds.includes(p.id));
  };

  const getPlayerForPos = (posKey) => players.find(p => p.id === fieldPlayers[posKey]);

  const handleSave = async () => {
    if (!user?.teamId) return;
    const formationData = Object.entries(fieldPlayers).map(([positionKey, playerId]) => ({ positionKey, playerId }));
    await updateDoc(doc(db, 'teams', user.teamId), {
      formation: formationData,
      tacticLevel
    });
    alert("Aufstellung & Taktik gespeichert!");
  };

  if (loading) return <Typography>Lade...</Typography>;

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minHeight: '80vh', gap: 4, mt: 5 }}>
      {/* Taktik-Panel */}
      <Paper elevation={6} sx={{ p: 4, minWidth: 350, bgcolor: "#212933", color: "#fff", borderRadius: 4 }}>
        <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>Formation</Typography>
        <Typography variant="body2" sx={{ color: "#ffc447", mb: 1 }}>Formation wählen</Typography>
        <Select
          fullWidth
          value={formationKey}
          onChange={e => setFormationKey(e.target.value)}
          sx={{ mb: 3, color: "#fff", bgcolor: "#1a232b" }}
        >
          {Object.keys(formations).map(fk => (
            <MenuItem key={fk} value={fk}>{fk}</MenuItem>
          ))}
        </Select>
        <Typography variant="body2" sx={{ color: "#ffc447", mb: 1 }}>Taktikrichtung</Typography>
        <Slider
          value={tacticLevel}
          min={0}
          max={2}
          marks={tacticSliderMarks}
          step={1}
          sx={{ mb: 4, color: "#ffc447" }}
          onChange={(_, val) => setTacticLevel(val)}
        />
        <Button
          fullWidth
          variant="contained"
          color="warning"
          sx={{ fontWeight: 700, py: 1.5, fontSize: 18, mt: 2 }}
          onClick={handleSave}
        >
          SPEICHERN
        </Button>
      </Paper>
      {/* Spielfeld */}
      <Box
        sx={{
          position: "relative",
          width: 600,
          height: 800,
          bgcolor: "#116820",
          borderRadius: 6,
          overflow: "hidden",
          boxShadow: "0 0 32px #111d"
        }}
      >
        {/* Bounding Box */}
        <Box
          sx={{
            position: "absolute",
            left: "5%",
            top: "4%",
            width: "90%",
            height: "92%",
            border: "4px solid #a4ffa4",
            borderRadius: "32px"
          }}
        />
        {/* Center Circle */}
        <Box
          sx={{
            position: "absolute",
            top: "37%",
            left: "35%",
            width: "30%",
            height: "11%",
            border: "4px solid #a4ffa4",
            borderRadius: "50%"
          }}
        />

        {/* Spieler auf dem Spielfeld */}
        {formation.map((f) => {
          const pObj = getPlayerForPos(f.pos);
          return (
            <Tooltip
              key={f.pos}
              title={
                pObj
                  ? `${pObj.vorname} ${pObj.nachname} (${pObj.positionGroup})`
                  : `Position: ${f.pos}`
              }
            >
              <Box
                onClick={() => setSelectingPos(f.pos)}
                sx={{
                  position: "absolute",
                  left: `calc(${f.x}% - 36px)`,
                  top: `calc(${f.y}% - 36px)`,
                  width: 72,
                  height: 72,
                  bgcolor: pObj ? "#32436e" : "#eee",
                  color: pObj ? "#fff" : "#465674",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 2.5,
                  border: pObj ? "3px solid #ffc447" : "2px solid #b7c0cd",
                  fontWeight: 700,
                  fontSize: 18,
                  cursor: "pointer",
                  boxShadow: pObj ? "0 0 12px #ffc44788" : "none",
                  transition: "all 0.13s",
                  zIndex: 3,
                  "&:hover": { bgcolor: "#4854ab", color: "#ffc447" }
                }}
              >
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 800,
                    letterSpacing: 1,
                    marginBottom: 2
                  }}
                >
                  {f.pos}
                </span>
                {pObj ? (
                  <>
                    <span
                      style={{
                        fontSize: 17,
                        fontWeight: 700,
                        lineHeight: 1
                      }}
                    >
                      {pObj.vorname}
                    </span>
                    <span style={{ fontSize: 13, opacity: 0.7 }}>
                      {pObj.nachname}
                    </span>
                  </>
                ) : (
                  <span
                    style={{
                      fontSize: 36,
                      opacity: 0.3,
                      fontWeight: 900
                    }}
                  >
                    +
                  </span>
                )}
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      {/* Spieler-Auswahl-Dialog */}
      <Dialog
        open={!!selectingPos}
        onClose={() => setSelectingPos(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle
          sx={{ bgcolor: "#27344b", color: "#ffc447", fontWeight: 800 }}
        >
          Spieler auswählen ({selectingPos})
        </DialogTitle>
        <DialogContent sx={{ bgcolor: "#202c3b", minHeight: 340 }}>
          <List>
            {selectingPos &&
              getEligiblePlayers(selectingPos.replace(/[0-9]/g, "")).length ===
                0 && (
                <Typography sx={{ color: "#fff" }}>
                  Keine passenden Spieler verfügbar.
                </Typography>
              )}
            {selectingPos &&
              getEligiblePlayers(selectingPos.replace(/[0-9]/g, "")).map(
                (p) => (
                  <ListItem
                    button
                    key={p.id}
                    onClick={() => handleSelectPlayer(selectingPos, p.id)}
                  >
                    <ListItemAvatar>
                      <Avatar
                        src={p.avatarUrl || "/dummy-player.png"}
                        sx={{ bgcolor: "#3c4e5e" }}
                      >
                        {p.vorname?.[0] || "?"}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <span style={{ fontWeight: 600, color: "#ffc447" }}>
                          {p.vorname} {p.nachname}
                        </span>
                      }
                      secondary={
                        <span style={{ color: "#fff" }}>
                          {p.positionGroup}
                        </span>
                      }
                    />
                  </ListItem>
                )
              )}
          </List>
        </DialogContent>
        <DialogActions sx={{ bgcolor: "#27344b" }}>
          <Button
            onClick={() => setSelectingPos(null)}
            color="warning"
            variant="text"
            sx={{ fontWeight: 700 }}
          >
            ABBRECHEN
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
