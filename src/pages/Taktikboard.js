import React, { useState, useEffect } from "react";
import {
  Box, Paper, Typography, MenuItem, Select, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, List, ListItem, ListItemAvatar, Avatar,
  ListItemText, Tooltip, CircularProgress, FormControl, FormLabel, RadioGroup,
  FormControlLabel, Radio, Divider
} from "@mui/material";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import {
  collection, query, where, getDocs, doc, getDoc, updateDoc
} from "firebase/firestore";

// --- Konstanten ---
const positionGroupMapping = {
  TW: "TOR", IV: "DEF", LV: "DEF", RV: "DEF", ZDM: "MID", ZM: "MID",
  LM: "MID", RM: "MID", ZOM: "MID", HS: "ATT", ST: "ATT", MS: "ATT",
  LA: "ATT", RA: "ATT"
};

const formations = {
  "4-4-2 Flach": [ { pos: "TW", x: 50, y: 96 }, { pos: "LV", x: 16, y: 78 }, { pos: "IV1", x: 34, y: 83 }, { pos: "IV2", x: 66, y: 83 }, { pos: "RV", x: 84, y: 78 }, { pos: "LM", x: 16, y: 59 }, { pos: "ZM1", x: 37, y: 62 }, { pos: "ZM2", x: 63, y: 62 }, { pos: "RM", x: 84, y: 59 }, { pos: "ST1", x: 40, y: 35 }, { pos: "ST2", x: 60, y: 35 } ],
  "4-4-2 Raute": [ { pos: "TW", x: 50, y: 96 }, { pos: "LV", x: 16, y: 78 }, { pos: "IV1", x: 34, y: 83 }, { pos: "IV2", x: 66, y: 83 }, { pos: "RV", x: 84, y: 78 }, { pos: "ZDM", x: 50, y: 73 }, { pos: "LM", x: 28, y: 60 }, { pos: "RM", x: 72, y: 60 }, { pos: "ZOM", x: 50, y: 51 }, { pos: "ST1", x: 40, y: 35 }, { pos: "ST2", x: 60, y: 35 } ],
  "4-3-3": [ { pos: "TW", x: 50, y: 96 }, { pos: "LV", x: 16, y: 78 }, { pos: "IV1", x: 34, y: 83 }, { pos: "IV2", x: 66, y: 83 }, { pos: "RV", x: 84, y: 78 }, { pos: "ZM1", x: 32, y: 66 }, { pos: "ZM2", x: 68, y: 66 }, { pos: "ZM3", x: 50, y: 54 }, { pos: "LA", x: 15, y: 35 }, { pos: "ST", x: 50, y: 30 }, { pos: "RA", x: 85, y: 35 } ],
  "5-4-1": [ { pos: "TW", x: 50, y: 96 }, { pos: "LV", x: 10, y: 80 }, { pos: "IV1", x: 26, y: 85 }, { pos: "IV2", x: 50, y: 86 }, { pos: "IV3", x: 74, y: 85 }, { pos: "RV", x: 90, y: 80 }, { pos: "LM", x: 16, y: 59 }, { pos: "ZM1", x: 37, y: 62 }, { pos: "ZM2", x: 63, y: 62 }, { pos: "RM", x: 84, y: 59 }, { pos: "ST", x: 50, y: 35 } ]
};


export default function Taktikboard() {
  const { user } = useAuth();
  const [formationKey, setFormationKey] = useState("4-4-2 Flach");
  const [formation, setFormation] = useState(formations[formationKey]);
  const [players, setPlayers] = useState([]);
  const [fieldPlayers, setFieldPlayers] = useState({});
  const [selectingPos, setSelectingPos] = useState(null);
  const [loading, setLoading] = useState(true);

  const [defensiveLine, setDefensiveLine] = useState('normal');
  const [passStyle, setPassStyle] = useState('gemischt');

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.teamId) { setLoading(false); return; }
      setLoading(true);

      try {
        const teamRef = doc(db, 'teams', user.teamId);
        const teamSnap = await getDoc(teamRef);
        const teamData = teamSnap.exists() ? teamSnap.data() : {};

        const playerSnap = await getDocs(query(collection(db, "players"), where("teamId", "==", user.teamId)));
        setPlayers(playerSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        if (teamData.formationKey && formations[teamData.formationKey]) {
          setFormationKey(teamData.formationKey);
        }
        if (teamData.defaultFormation) {
          const fp = {};
          teamData.defaultFormation.forEach(f => { if (f.positionKey) fp[f.positionKey] = f.playerId; });
          setFieldPlayers(fp);
        }
        setDefensiveLine(teamData.tacticDefensiveLine || 'normal');
        setPassStyle(teamData.tacticPassStyle || 'gemischt');

      } catch (error) {
        console.error("Fehler beim Laden der Taktikdaten:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  useEffect(() => {
    setFormation(formations[formationKey]);
    setFieldPlayers({});
  }, [formationKey]);

  const handleSelectPlayer = (posKey, playerId) => {
    setFieldPlayers(prev => ({ ...prev, [posKey]: playerId }));
    setSelectingPos(null);
  };

  const getEligiblePlayers = (posKey) => {
    if (!posKey) return [];
    const group = positionGroupMapping[posKey.replace(/[0-9]/g, "")];
    const usedIds = Object.values(fieldPlayers);
    return players.filter(p => (p.positionGroup === group || p.position === posKey.replace(/[0-9]/g, "")) && !usedIds.includes(p.id));
  };

  const getPlayerForPos = (posKey) => players.find(p => p.id === fieldPlayers[posKey]);

  const handleSave = async () => {
    if (!user?.teamId) return alert("Fehler: Keine Team-ID gefunden.");
    
    const formationData = formation.map(posDetails => ({
      positionKey: posDetails.pos,
      position: posDetails.pos.replace(/[0-9]/g, ""),
      playerId: fieldPlayers[posDetails.pos] || null,
    })).filter(p => p.playerId);

    if (formationData.length < 11) return alert("Bitte stelle 11 Spieler auf.");

    try {
      await updateDoc(doc(db, 'teams', user.teamId), {
        defaultFormation: formationData,
        formationKey: formationKey,
        tacticDefensiveLine: defensiveLine,
        tacticPassStyle: passStyle,
      });
      alert("Aufstellung & Taktik gespeichert!");
    } catch (error) {
      console.error("Fehler beim Speichern der Taktik:", error);
      alert("Ein Fehler ist aufgetreten.");
    }
  };
  
  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4, mt: 5, p: 2 }}>
      <Paper elevation={6} sx={{ p: 4, width: { xs: '90%', md: 350 }, bgcolor: "#212933", color: "#fff", borderRadius: 4 }}>
        <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>Taktik</Typography>
        
        <Divider sx={{ bgcolor: '#444', my: 2 }} />

        <Typography variant="h6" sx={{ mb: 1, color: "#ffc447" }}>Formation</Typography>
        <Select fullWidth value={formationKey} onChange={e => setFormationKey(e.target.value)}
          sx={{ mb: 3, color: "#fff", bgcolor: "#1a232b", '.MuiOutlinedInput-notchedOutline': { borderColor: '#444' }, '.MuiSvgIcon-root': { color: '#fff' } }}>
          {Object.keys(formations).map(fk => (<MenuItem key={fk} value={fk}>{fk}</MenuItem>))}
        </Select>

        <Divider sx={{ bgcolor: '#444', my: 2 }} />

        <Typography variant="h6" sx={{ mb: 2, color: "#ffc447" }}>Team-Anweisungen</Typography>
        <Box>
            <FormControl component="fieldset">
                <FormLabel component="legend" sx={{ color: "#fff", fontSize: '0.9rem' }}>Abwehrlinie</FormLabel>
                <RadioGroup row value={defensiveLine} onChange={(e) => setDefensiveLine(e.target.value)}>
                    <FormControlLabel value="tief" control={<Radio size="small" sx={{color: '#888', '&.Mui-checked': {color: '#ffc447'}}}/>} label="Tief" />
                    <FormControlLabel value="normal" control={<Radio size="small" sx={{color: '#888', '&.Mui-checked': {color: '#ffc447'}}}/>} label="Normal" />
                    <FormControlLabel value="hoch" control={<Radio size="small" sx={{color: '#888', '&.Mui-checked': {color: '#ffc447'}}}/>} label="Hoch" />
                </RadioGroup>
            </FormControl>
        </Box>
        <Box sx={{ mt: 2 }}>
            <FormControl component="fieldset">
                <FormLabel component="legend" sx={{ color: "#fff", fontSize: '0.9rem' }}>Pass-Stil</FormLabel>
                <RadioGroup row value={passStyle} onChange={(e) => setPassStyle(e.target.value)}>
                    <FormControlLabel value="sicher" control={<Radio size="small" sx={{color: '#888', '&.Mui-checked': {color: '#ffc447'}}}/>} label="Sicher" />
                    <FormControlLabel value="gemischt" control={<Radio size="small" sx={{color: '#888', '&.Mui-checked': {color: '#ffc447'}}}/>} label="Gemischt" />
                    <FormControlLabel value="riskant" control={<Radio size="small" sx={{color: '#888', '&.Mui-checked': {color: '#ffc447'}}}/>} label="Riskant" />
                </RadioGroup>
            </FormControl>
        </Box>

        <Button fullWidth variant="contained" color="warning" sx={{ fontWeight: 700, py: 1.5, fontSize: 18, mt: 4 }} onClick={handleSave}>
          SPEICHERN
        </Button>
      </Paper>

      <Box
        sx={{
          position: "relative",
          width: { xs: '90vw', sm: 500, md: 600 },
          height: { xs: '120vw', sm: 667, md: 800 },
          bgcolor: "#116820",
          borderRadius: { xs: 4, md: 6 },
          overflow: "hidden",
          boxShadow: "0 0 32px #111d",
          border: "4px solid #a4ffa433"
        }}
      >
        <Box sx={{ position: "absolute", top: '50%', left: '5%', width: '90%', height: '4px', bgcolor: '#a4ffa433' }} />
        <Box sx={{ position: "absolute", top: 'calc(50% - 15%)', left: 'calc(50% - 15%)', width: '30%', paddingTop: '30%', border: '4px solid #a4ffa433', borderRadius: "50%" }} />
        
        {formation.map((f) => {
          const pObj = getPlayerForPos(f.pos);
          return (
            <Tooltip
              key={f.pos}
              title={pObj ? `${pObj.vorname} ${pObj.nachname} (${pObj.positionGroup})` : `Position: ${f.pos}`}
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
                  border: pObj ? "3px solid #ffc447" : "2px dashed #b7c0cd",
                  fontWeight: 700,
                  fontSize: 18,
                  cursor: "pointer",
                  boxShadow: pObj ? "0 0 12px #ffc44788" : "none",
                  transition: "all 0.13s",
                  zIndex: 3,
                  "&:hover": { transform: 'scale(1.1)', zIndex: 4, borderColor: '#fff' }
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: 1 }}>{f.pos}</Typography>
                {pObj ? (
                  <>
                    <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%', textAlign: 'center', px: '2px' }}>{pObj.nachname}</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.7 }}>STR: {pObj.strength}</Typography>
                  </>
                ) : (
                  <Typography variant="h4" sx={{ opacity: 0.3, fontWeight: 900 }}>+</Typography>
                )}
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      <Dialog open={!!selectingPos} onClose={() => setSelectingPos(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ bgcolor: "#27344b", color: "#ffc447" }}>Spieler auswählen ({selectingPos})</DialogTitle>
        <DialogContent sx={{ bgcolor: "#202c3b" }}>
          <List>
            {selectingPos && getEligiblePlayers(selectingPos).length === 0 && (
              <Typography sx={{ color: "#fff", p: 2 }}>Keine passenden Spieler für diese Position verfügbar.</Typography>
            )}
            {selectingPos && getEligiblePlayers(selectingPos).map((p) => (
              <ListItem button key={p.id} onClick={() => handleSelectPlayer(selectingPos, p.id)}>
                <ListItemAvatar><Avatar src={p.avatarUrl || ""} sx={{ bgcolor: "#3c4e5e" }}>{p.nachname?.[0]}</Avatar></ListItemAvatar>
                <ListItemText
                  primary={<span style={{ fontWeight: 600, color: "#ffc447" }}>{p.vorname} {p.nachname}</span>}
                  secondary={<span style={{ color: "#fff" }}>{p.positionGroup} - Stärke: {p.strength}</span>}
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions sx={{ bgcolor: "#27344b" }}>
          <Button onClick={() => setSelectingPos(null)} color="warning" variant="text">ABBRECHEN</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}