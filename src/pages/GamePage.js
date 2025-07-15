import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import {
  Box, Typography, Paper, List, ListItem, ListItemText,
  CircularProgress, Chip, Button, Tabs, Tab, Grid, Divider, Stack
} from '@mui/material';

const getTickerIcon = (event) => {
  if (!event || !event.type) return null;
  switch (event.type) {
    case 'goal': return "⚽️";
    case 'tackle_win': return "🛡️";
    case 'pass_success': return "➡️";
    case 'shot': return "🎯";
    case 'save': return "🧤";
    case 'foul': return "🚫";
    default: return "•";
  }
};

function renderFormation(players, formation, color = "default") {
  // Stellt die Spieler auf das "Spielfeld", sortiert nach Formation
  // (Kannst du beliebig verbessern – erstmal einfach als Reihe für jede Formation-Position)
  const posRows = {};
  (formation || []).forEach(pos => {
    if (!posRows[pos.row]) posRows[pos.row] = [];
    const player = players.find(p => p.id === pos.playerId);
    posRows[pos.row].push(player
      ? <Chip key={pos.playerId} label={`${player.name} (${pos.positionKey})`} sx={{ m: 0.5, bgcolor: color === 'green' ? "#0f0" : undefined }} />
      : <Chip key={pos.positionKey} label={pos.positionKey} sx={{ m: 0.5 }} />);
  });
  // Zeige die Formation als Zeilen von hinten (Torwart) bis vorne (Sturm)
  return (
    <Stack spacing={1} alignItems="center">
      {Object.entries(posRows).sort(([a], [b]) => b - a).map(([row, chips]) => (
        <Box key={row}>{chips}</Box>
      ))}
    </Stack>
  );
}

function GamePage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState(null);
  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Replay
  const [replay, setReplay] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);

  // Tab
  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (!gameId) return;
    setLoading(true);
    const unsub = onSnapshot(doc(db, 'games', gameId), async (docSnap) => {
      if (docSnap.exists()) {
        const gameData = { id: docSnap.id, ...docSnap.data() };
        setGame(gameData);

        // Spieler holen
        if (gameData.teamHomeId && homePlayers.length === 0) {
          const q = query(collection(db, "players"), where("teamId", "==", gameData.teamHomeId));
          const snap = await getDocs(q);
          setHomePlayers(snap.docs.map(d => ({id: d.id, ...d.data()})));
        }
        if (gameData.teamAwayId && awayPlayers.length === 0) {
          const q = query(collection(db, "players"), where("teamId", "==", gameData.teamAwayId));
          const snap = await getDocs(q);
          setAwayPlayers(snap.docs.map(d => ({id: d.id, ...d.data()})));
        }
      } else {
        setGame(null);
      }
      setLoading(false);
    });
    return () => unsub();
    // eslint-disable-next-line
  }, [gameId]);

  // Replay-Logik
  useEffect(() => {
    if (!replay || !game || !game.liveTickerEvents) return;
    if (replayIndex >= game.liveTickerEvents.length) return;
    const timer = setTimeout(() => {
      setReplayIndex((prev) => prev + 1);
    }, 1100);
    return () => clearTimeout(timer);
  }, [replay, replayIndex, game]);

  const handleReplay = () => { setReplay(true); setReplayIndex(0); };
  const handleStopReplay = () => { setReplay(false); setReplayIndex(0); };

  if (loading || !game) return <CircularProgress />;

  // Teams und Formation
  const homeTeamName = game.teamHomeName || 'Heim';
  const awayTeamName = game.teamAwayName || 'Gast';
  const homeFormation = game.formation || game.teamHomeFormation || [];
  const awayFormation = game.formation || game.teamAwayFormation || [];
  const homeOnPitch = (game.formation || []).map(pos =>
    homePlayers.find(p => p.id === pos.playerId)).filter(Boolean);
  const awayOnPitch = (game.formation || []).map(pos =>
    awayPlayers.find(p => p.id === pos.playerId)).filter(Boolean);

  return (
    <Box sx={{ p: 2, width: "100%", minHeight: "100vh" }}>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">
          {homeTeamName} {game.scoreHome} : {game.scoreAway} {awayTeamName}
        </Typography>
        <Button onClick={() => navigate(-1)} variant="outlined">Zurück</Button>
      </Box>
      <Tabs value={tab} onChange={(_, t) => setTab(t)} sx={{ mb: 2 }}>
        <Tab label="Aufstellung & Noten" />
        <Tab label="Ticker & Replay" />
      </Tabs>

      {tab === 0 && (
        <Grid container spacing={2} alignItems="flex-start" justifyContent="center">
          {/* Linke Spalte: Heimspieler (nur Aufgestellte) */}
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6">{homeTeamName} (Startelf)</Typography>
              <List dense>
                {homeOnPitch.map(player => (
                  <ListItem key={player.id}>
                    <ListItemText
                      primary={player.name}
                      secondary={player.positionKey || player.position}
                    />
                    <Chip
                      label={game.playerRatings?.[player.id]?.rating?.toFixed(1) ?? '6.0'}
                      color="primary"
                      size="small"
                      sx={{ ml: 1 }}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>
          {/* Mittlere Spalte: Spielfeld */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, bgcolor: "#176217", minHeight: 320 }}>
              <Typography sx={{ color: "#fff", mb: 1 }} align="center" variant="h6">Spielfeld</Typography>
              <Grid container>
                <Grid item xs={6}>
                  <Box>
                    <Typography sx={{ color: "#fff" }} align="center">Heim</Typography>
                    {renderFormation(homePlayers, game.formation, "green")}
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box>
                    <Typography sx={{ color: "#fff" }} align="center">Gast</Typography>
                    {renderFormation(awayPlayers, game.formation, "green")}
                  </Box>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
          {/* Rechte Spalte: Auswärtsspieler (nur Aufgestellte) */}
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6">{awayTeamName} (Startelf)</Typography>
              <List dense>
                {awayOnPitch.map(player => (
                  <ListItem key={player.id}>
                    <ListItemText
                      primary={player.name}
                      secondary={player.positionKey || player.position}
                    />
                    <Chip
                      label={game.playerRatings?.[player.id]?.rating?.toFixed(1) ?? '6.0'}
                      color="secondary"
                      size="small"
                      sx={{ ml: 1 }}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>
        </Grid>
      )}

      {tab === 1 && (
        <Paper elevation={1} sx={{ p: 2, mt: 2 }}>
          <Box sx={{ mb: 2 }}>
            {game.status === "finished" && !replay && (
              <Button onClick={handleReplay} variant="contained">Replay als Live-Ticker abspielen</Button>
            )}
            {replay && (
              <Button onClick={handleStopReplay} variant="outlined" color="error">Replay stoppen</Button>
            )}
          </Box>
          <Typography variant="h5" sx={{ mb: 2 }}>
            {game.status === "finished" ? "Spiel-Recap" : "Live-Ticker"}
          </Typography>
          <List>
            {(replay
              ? (game.liveTickerEvents || []).slice(0, replayIndex)
              : (game.liveTickerEvents || [])
            ).map((event, idx) => (
              <React.Fragment key={idx}>
                <ListItem>
                  <ListItemText primary={
                    <span>
                      <b>{event.text}</b>
                      <span style={{ marginLeft: 8 }}>{getTickerIcon(event)}</span>
                    </span>
                  } />
                </ListItem>
                {(idx < (replay ? replayIndex : (game.liveTickerEvents || []).length) - 1) && <Divider />}
              </React.Fragment>
            ))}
          </List>
          {replay && replayIndex >= (game.liveTickerEvents || []).length && (
            <Typography sx={{ mt: 2 }} color="success.main">
              Replay beendet!
            </Typography>
          )}
        </Paper>
      )}
    </Box>
  );
}

export default GamePage;
