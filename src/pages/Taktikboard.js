import React, { useState, useEffect, useCallback } from 'react';
import {
  Container, Typography, Grid, Button, Paper, Box, Alert, List,
  ListItemText, CircularProgress, Select, MenuItem, FormControl, InputLabel, Slider, ListItemButton
} from '@mui/material';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { formations } from '../utils/formations';

const ItemTypes = { PLAYER: 'player' };

// ListItem 'button' Prop Warnung behoben durch Nutzung von ListItemButton
const Player = ({ player }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.PLAYER,
    item: { id: player.id, name: player.name },
    collect: (monitor) => ({ isDragging: !!monitor.isDragging() }),
  }));
  return (
    <ListItemButton ref={drag} sx={{ opacity: isDragging ? 0.5 : 1, cursor: 'move', border: 1, borderColor: 'divider', mb: 1, borderRadius: 1 }}>
      <ListItemText primary={player.name} secondary={`Skill: ${player.skill} | Pos: ${player.positionGroup}`} />
    </ListItemButton>
  );
};

const PositionSlot = ({ positionKey, player, onDrop }) => {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: ItemTypes.PLAYER,
    drop: (item) => onDrop(item.id, positionKey),
    collect: (monitor) => ({ isOver: !!monitor.isOver() }),
  }));
  return (
    <Box ref={drop} sx={{ border: '2px dashed grey', borderRadius: '50%', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', backgroundColor: isOver ? 'lightgreen' : player ? 'lightblue' : 'rgba(255,255,255,0.7)', margin: 1, p: 1, transition: 'background-color 0.2s' }}>
      <Typography variant="caption" sx={{ fontWeight: 'bold' }}>{player ? player.name.split(' ').pop() : positionKey}</Typography>
    </Box>
  );
};

const Taktikboard = () => {
  const { user } = useAuth();
  const [data, setData] = useState({
    players: [],
    aufstellung: [],
    taktik: { defenseLine: 50, pressing: 50 },
    formationKey: '4-4-2',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Lade-Logik komplett neu strukturiert, um Race Conditions zu verhindern
  useEffect(() => {
    const fetchTeamData = async () => {
      if (!user?.teamId) {
        setLoading(false);
        return;
      }
      try {
        const teamRef = doc(db, "teams", user.teamId);
        const teamSnap = await getDoc(teamRef);

        if (!teamSnap.exists()) {
          setError("Dein zugewiesenes Team wurde nicht gefunden.");
          setLoading(false);
          return;
        }

        const teamData = teamSnap.data();
        
        // 1. Daten sicher aus der DB oder als Standardwert holen
        const savedKey = teamData.formationKey;
        const keyToUse = (savedKey && formations[savedKey]) ? savedKey : '4-4-2';
        const savedAufstellung = teamData.aufstellung || formations[keyToUse].positions.map(p => ({ positionKey: p.key, playerId: null }));
        const savedTaktik = teamData.tactics || { defenseLine: 50, pressing: 50 };
        
        // 2. Spielerdaten holen
        let fetchedPlayers = [];
        if (teamData.players && teamData.players.length > 0) {
          const playerQuery = query(collection(db, 'players'), where('__name__', 'in', teamData.players));
          const playerDocs = await getDocs(playerQuery);
          fetchedPlayers = playerDocs.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        // 3. Den State einmalig und komplett mit allen geladenen Daten setzen
        setData({
          players: fetchedPlayers,
          aufstellung: savedAufstellung,
          taktik: savedTaktik,
          formationKey: keyToUse,
        });

      } catch (err) {
        setError('Fehler beim Laden der Taktikdaten.');
        console.error("Originaler Fehler:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchTeamData();
  }, [user]);

  // Handler greifen jetzt auf den zentralen 'data' State zu
  const handleFormationChange = (event) => {
    const newKey = event.target.value;
    setData(prev => ({
      ...prev,
      formationKey: newKey,
      aufstellung: formations[newKey].positions.map(p => ({ positionKey: p.key, playerId: null })),
    }));
  };

  const handleTaktikChange = (name, value) => {
    setData(prev => ({
      ...prev,
      taktik: { ...prev.taktik, [name]: value },
    }));
  };

  const handleDrop = (playerId, positionKey) => {
    setData(prev => {
      const newAufstellung = [...prev.aufstellung];
      const oldSlot = newAufstellung.find(s => s.playerId === playerId);
      if (oldSlot) oldSlot.playerId = null;
      const targetSlot = newAufstellung.find(s => s.positionKey === positionKey);
      if (targetSlot) targetSlot.playerId = playerId;
      return { ...prev, aufstellung: newAufstellung };
    });
  };

  const handleSave = async () => {
    if (!user?.teamId) return;
    try {
      const teamRef = doc(db, "teams", user.teamId);
      await updateDoc(teamRef, {
        tactics: data.taktik,
        formationKey: data.formationKey,
        aufstellung: data.aufstellung,
      });
      alert('Taktik & Aufstellung gespeichert!');
    } catch (err) { setError('Fehler beim Speichern.'); }
  };
  
  const getPlayerById = useCallback((id) => data.players.find(p => p.id === id), [data.players]);
  const aufgestellteIds = data.aufstellung.map(s => s.playerId).filter(Boolean);
  const verfügbareSpieler = data.players.filter(p => !aufgestellteIds.includes(p.id));

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <DndProvider backend={HTML5Backend}>
      <Container sx={{ mt: 4 }}>
        <Typography variant="h4" gutterBottom>Taktik & Aufstellung</Typography>
        
        {/* MUI Grid-Warnungen behoben: 'item' prop ist nicht mehr nötig */}
        <Grid container spacing={4}>
          <Grid item xs={12} md={4}>
            <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" gutterBottom>1. Formation wählen</Typography>
              <FormControl fullWidth>
                <InputLabel>Formation</InputLabel>
                <Select value={data.formationKey} label="Formation" onChange={handleFormationChange}>
                  {Object.keys(formations).map(key => <MenuItem key={key} value={key}>{formations[key].name}</MenuItem>)}
                </Select>
              </FormControl>
            </Paper>
            <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" gutterBottom>2. Taktik einstellen</Typography>
              <Typography gutterBottom>Verteidigungslinie</Typography>
              <Slider value={data.taktik.defenseLine} onChange={(e, val) => handleTaktikChange('defenseLine', val)} />
              <Typography gutterBottom>Pressing-Intensität</Typography>
              <Slider value={data.taktik.pressing} onChange={(e, val) => handleTaktikChange('pressing', val)} />
            </Paper>
            <Paper elevation={3} sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>3. Spieler aufstellen</Typography>
              <List sx={{ maxHeight: 300, overflow: 'auto' }}>
                {verfügbareSpieler.map(p => <Player key={p.id} player={p} />)}
              </List>
            </Paper>
          </Grid>
          <Grid item xs={12} md={8}>
            <Paper elevation={3} sx={{ p: 2, backgroundImage: 'url(/pitch.svg)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', minHeight: 600 }}>
                {['ANG', 'MID', 'DEF', 'TOR'].map(group => (
                  <Box key={group} sx={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', width: '100%' }}>
                    {data.aufstellung
                      .filter(slot => formations[data.formationKey]?.positions.find(p => p.key === slot.positionKey)?.type === group)
                      .map(slot => <PositionSlot key={slot.positionKey} positionKey={slot.positionKey} player={getPlayerById(slot.playerId)} onDrop={handleDrop} />)}
                  </Box>
                ))}
              </Box>
            </Paper>
            <Button variant="contained" color="primary" onClick={handleSave} sx={{ mt: 2, width: '100%', py: 1.5 }}>
              Alles speichern
            </Button>
          </Grid>
        </Grid>
      </Container>
    </DndProvider>
  );
};

export default Taktikboard;