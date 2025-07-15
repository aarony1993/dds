import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import {
  Box,
  Typography,
  Button,
  Paper,
  MenuItem,
  Select,
  Slider,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItemButton,
  ListItemText,
  IconButton,
} from '@mui/material';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';

// Formation mit Positionstyp (nur für Filter), sonst keine "positionGroup" mehr nötig!
const FORMATIONS = {
  '4-4-2': [
    { pos: 'TW', label: 'Tor', x: 0.5, y: 0.9, type: 'TOR' },
    { pos: 'LV', label: 'LV', x: 0.18, y: 0.7, type: 'DEF' },
    { pos: 'IV1', label: 'IV', x: 0.36, y: 0.75, type: 'DEF' },
    { pos: 'IV2', label: 'IV', x: 0.64, y: 0.75, type: 'DEF' },
    { pos: 'RV', label: 'RV', x: 0.82, y: 0.7, type: 'DEF' },
    { pos: 'LM', label: 'LM', x: 0.15, y: 0.5, type: 'MID' },
    { pos: 'ZM1', label: 'ZM', x: 0.38, y: 0.5, type: 'MID' },
    { pos: 'ZM2', label: 'ZM', x: 0.62, y: 0.5, type: 'MID' },
    { pos: 'RM', label: 'RM', x: 0.85, y: 0.5, type: 'MID' },
    { pos: 'ST1', label: 'ST', x: 0.4, y: 0.25, type: 'ATT' },
    { pos: 'ST2', label: 'ST', x: 0.6, y: 0.25, type: 'ATT' },
  ],
  // Weitere Formationen wie gehabt
};

// Deutsche Positionslabels
const POSITION_LABELS = {
  TOR: "Torhüter",
  DEF: "Abwehr",
  MID: "Mittelfeld",
  ATT: "Sturm"
};

function Taktikboard() {
  const { currentUser } = useAuth();
  const [players, setPlayers] = useState([]);
  const [formation, setFormation] = useState('4-4-2');
  const [lineup, setLineup] = useState({});
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogPosition, setDialogPosition] = useState(null);
  const [pressing, setPressing] = useState(50);
  const [defenseLine, setDefenseLine] = useState(50);
  const [teamId, setTeamId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    getDocs(query(collection(db, 'teams'), where('managerUid', '==', currentUser.uid)))
      .then(snap => {
        if (!snap.empty) setTeamId(snap.docs[0].id);
      });
  }, [currentUser]);

  useEffect(() => {
    if (!teamId) return;
    getDocs(query(collection(db, 'players'), where('teamId', '==', teamId)))
      .then(snap => setPlayers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
  }, [teamId]);

  const currentFormation = FORMATIONS[formation] || [];

  function handleFieldClick(pos) {
    setDialogPosition(pos);
    setOpenDialog(true);
  }

  function handleSelectPlayerForPosition(player) {
    setLineup(prev => ({
      ...prev,
      [dialogPosition]: player.id,
    }));
    setOpenDialog(false);
    setDialogPosition(null);
  }

  function handleRemovePlayerFromPosition(pos) {
    setLineup(prev => {
      const updated = { ...prev };
      delete updated[pos];
      return updated;
    });
  }

  // Nur passende Spieler für diesen Feld-Slot (anhand .type <-> player.position)
  const dialogPlayers = dialogPosition
    ? players.filter(
        p =>
          (!Object.values(lineup).includes(p.id) || lineup[dialogPosition] === p.id) &&
          (currentFormation.find(f => f.pos === dialogPosition)?.type === p.position)
      )
    : [];

  // Speichern in Firestore
  const handleSave = async () => {
    if (!teamId) return;
    setSaving(true);
    const formationArr = currentFormation.map(field => ({
      positionKey: field.pos,
      playerId: lineup[field.pos] || null,
    }));
    await updateDoc(doc(db, 'teams', teamId), {
      formation: formationArr,
      tactics: { defenseLine, pressing },
    });
    setSaving(false);
    alert("Taktik & Aufstellung gespeichert!");
  };

  return (
    <Box sx={{ maxWidth: 1300, mx: "auto", mt: 4, p: 2 }}>
      <Typography variant="h3" sx={{ fontWeight: 900, color: "primary.main", mb: 3, textAlign: "center" }}>
        Taktik & Aufstellung
      </Typography>
      <Grid container spacing={4} justifyContent="center" alignItems="flex-start">
        {/* Linke Seite: Taktikpanel */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 4, bgcolor: "background.paper", borderRadius: 4, boxShadow: 5 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>
              Formation
            </Typography>
            <Select
              value={formation}
              onChange={e => setFormation(e.target.value)}
              sx={{ width: 240, bgcolor: "#192a3a", color: "text.primary", borderRadius: 2, fontWeight: 700, mb: 3 }}
            >
              <MenuItem value="4-4-2">4-4-2 (Flach)</MenuItem>
              {/* Weitere Formationen ergänzen */}
            </Select>
            <Typography sx={{ fontWeight: 700, mt: 2 }}>Abwehrhöhe: {defenseLine}</Typography>
            <Slider
              value={defenseLine}
              onChange={(_, v) => setDefenseLine(v)}
              min={1} max={100}
              sx={{
                color: "primary.main",
                mb: 3
              }}
            />
            <Typography sx={{ fontWeight: 700 }}>Pressing: {pressing}</Typography>
            <Slider
              value={pressing}
              onChange={(_, v) => setPressing(v)}
              min={1} max={100}
              sx={{
                color: "primary.main",
                mb: 3
              }}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleSave}
              sx={{ fontWeight: 900, mt: 1, fontSize: 18 }}
              disabled={saving}
              fullWidth
            >
              SPEICHERN
            </Button>
          </Paper>
        </Grid>

        {/* Rechte Seite: Spielfeld */}
        <Grid item xs={12} md={7}>
          <Box
            sx={{
              width: 520,
              height: 520,
              bgcolor: "#34923c",
              borderRadius: 6,
              m: "0 auto",
              position: "relative",
              boxShadow: "0 4px 36px #0009",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            {currentFormation.map(field => {
              const assignedPlayer = players.find(p => p.id === lineup[field.pos]);
              return (
                <Box
                  key={field.pos}
                  sx={{
                    position: "absolute",
                    left: `calc(${field.x * 100}% - 56px)`,
                    top: `calc(${field.y * 100}% - 30px)`,
                    width: 112,
                    height: 58,
                    bgcolor: assignedPlayer ? "#fff3" : "#fff1",
                    border: "2px dashed #ffbc29",
                    color: assignedPlayer ? "text.primary" : "#fff",
                    fontWeight: 700,
                    fontSize: 15,
                    borderRadius: 4,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: assignedPlayer ? "0 0 12px #ffbc2990" : "none",
                    cursor: "pointer",
                    transition: "0.13s",
                    "&:hover": {
                      bgcolor: "#ffbc2940",
                      borderColor: "#ffbc29",
                      color: "#fff",
                    },
                  }}
                  onClick={() => handleFieldClick(field.pos)}
                >
                  <span style={{ color: "#ffbc29", fontWeight: 800 }}>{field.label}</span>
                  {assignedPlayer ? (
                    <>
                      <span style={{ fontWeight: 800 }}>{assignedPlayer.name}</span>
                      <span style={{ fontSize: 13, color: "#ffbc29" }}>{POSITION_LABELS[assignedPlayer.position] || assignedPlayer.position}</span>
                      <IconButton
                        size="small"
                        color="error"
                        sx={{ mt: -1, ml: "auto", p: 0.2 }}
                        onClick={e => { e.stopPropagation(); handleRemovePlayerFromPosition(field.pos); }}
                      >
                        ✖
                      </IconButton>
                    </>
                  ) : (
                    <SportsSoccerIcon sx={{ fontSize: 24, color: "#fff" }} />
                  )}
                </Box>
              );
            })}
          </Box>
        </Grid>
      </Grid>

      {/* Dialog: Position wählen */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)}>
        <DialogTitle sx={{ color: "primary.main", fontWeight: 800, fontSize: 22 }}>
          Spieler auswählen ({dialogPosition})
        </DialogTitle>
        <DialogContent>
          <List>
            {dialogPlayers.length === 0
              ? <ListItemText primary="Keine Spieler verfügbar." />
              : dialogPlayers.map(player => (
                <ListItemButton
                  key={player.id}
                  onClick={() => handleSelectPlayerForPosition(player)}
                  sx={{ mb: 1, borderRadius: 2, bgcolor: "#192a3a", color: "#fff" }}
                >
                  <ListItemText
                    primary={<span style={{ fontWeight: 800 }}>{player.name}</span>}
                    secondary={`Position: ${POSITION_LABELS[player.position] || player.position} | Stärke: ${player.strength ?? '—'}`}
                  />
                </ListItemButton>
              ))}
          </List>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

export default Taktikboard;
