// GamePage.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import {
  doc, onSnapshot, collection, query, where, getDocs
} from 'firebase/firestore';

import {
  Box, Typography, Paper, List, ListItem, ListItemText,
  CircularProgress, Chip, Button, Tabs, Tab, Grid, Divider, Stack,
  IconButton, Tooltip, LinearProgress, Avatar, Table, TableBody,
  TableCell, TableHead, TableRow, TableContainer, Select, MenuItem,
  FormControl, InputLabel, ToggleButton, ToggleButtonGroup, Badge
} from '@mui/material';

import ReplayIcon from '@mui/icons-material/Replay';
import StopIcon from '@mui/icons-material/Stop';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import InsightsIcon from '@mui/icons-material/Insights';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';
import ListAltIcon from '@mui/icons-material/ListAlt';
import AssessmentIcon from '@mui/icons-material/Assessment';

// ----------------------------------------
// Helper: Event Icons
// ----------------------------------------
const getTickerIcon = (event) => {
  if (!event || !event.type) return "•";
  switch (event.type) {
    case 'goal': return "⚽️";
    case 'shoot':
    case 'header': return "🎯";
    case 'freekick': return "🆓";
    case 'duel':
    case 'duel_win':
    case 'duel_loss': return "🛡️";
    case 'killerPass': return "🗝️";
    case 'pass': return "➡️";
    case 'foul': return "🚫";
    case 'save': return "🧤";
    default: return "•";
  }
};

// ----------------------------------------
// Helper: Farbskala für Rating
// ----------------------------------------
const ratingColor = (note) => {
  if (note >= 8.5) return 'success';
  if (note >= 7.5) return 'primary';
  if (note >= 6.5) return 'info';
  if (note >= 5.5) return 'warning';
  if (note >= 4.5) return 'error';
  return 'default';
};

// ----------------------------------------
// Formation Render (vereinfachte Darstellung)
// ----------------------------------------
function renderFormation(players, formation, highlightIds = new Set()) {
  // formation: [{row:1..n, playerId, positionKey}]
  const rows = {};
  (formation || []).forEach(pos => {
    if (!rows[pos.row]) rows[pos.row] = [];
    const player = players.find(p => p.id === pos.playerId);
    const label = player
      ? `${player.name || player.displayName || player.shortName || player.firstName || ''} (${pos.positionKey})`
      : pos.positionKey;
    rows[pos.row].push(
      <Chip
        key={pos.playerId || pos.positionKey}
        label={label}
        size="small"
        sx={{
          m: 0.5,
          fontWeight: highlightIds.has(pos.playerId) ? 600 : 400,
          boxShadow: highlightIds.has(pos.playerId) ? 3 : 0,
          bgcolor: highlightIds.has(pos.playerId) ? 'success.light' : 'background.paper'
        }}
      />
    );
  });
  const sorted = Object.entries(rows).sort(([a],[b]) => Number(a) - Number(b));
  return (
    <Stack spacing={1} alignItems="center">
      {sorted.map(([row, chips]) => (
        <Box key={row} display="flex" justifyContent="center" flexWrap="wrap">
          {chips}
        </Box>
      ))}
    </Stack>
  );
}

// ----------------------------------------
// Player utilities
// ----------------------------------------
const getPlayerName = (p) =>
  p?.name || p?.displayName || `${p?.firstName || p?.vorname || ''} ${p?.lastName || p?.nachname || ''}`.trim() || 'Unbekannt';

const roundNote = points => (points / 100).toFixed(2);

// ----------------------------------------
// Aggregation aus ratingEvents (Hybrid-Format):
// ratingEvents: [{ minute, actionTag, deltas: {playerId: deltaPoints} }]
// Erzeugt pro Spieler kumulative Summen und Counts für mehrere Kategorien
// ----------------------------------------
function aggregateRatingEvents(ratingEvents = []) {
  const perPlayer = {};
  ratingEvents.forEach(evt => {
    const { deltas = {}, actionTag, minute } = evt;
    Object.entries(deltas).forEach(([pid, delta]) => {
      if (!perPlayer[pid]) {
        perPlayer[pid] = {
          totalDelta: 0,
          minutes: [],
          actions: 0,
          byAction: {},
          // potential counters
          goals: 0,
          shots: 0,
          passes: 0,
          killerPass: 0,
          duels: 0,
          dribbles: 0,
          frees: 0,
          saves: 0,
          conceded: 0
        };
      }
      perPlayer[pid].totalDelta += delta;
      perPlayer[pid].actions += 1;
      perPlayer[pid].minutes.push(minute);
      perPlayer[pid].byAction[actionTag] = (perPlayer[pid].byAction[actionTag] || 0) + 1;

      // heuristische Zuordnung (du kannst im Backend actionTag granularer setzen)
      if (actionTag === 'goal') perPlayer[pid].goals += 1;
      if (actionTag === 'shoot') perPlayer[pid].shots += 1;
      if (actionTag === 'pass') perPlayer[pid].passes += 1;
      if (actionTag === 'killerPass') perPlayer[pid].killerPass += 1;
      if (actionTag === 'duel') perPlayer[pid].duels += 1;
      if (actionTag === 'dribble') perPlayer[pid].dribbles += 1;
      if (actionTag === 'freekick') perPlayer[pid].frees += 1;
      if (actionTag === 'save') perPlayer[pid].saves += 1;
      if (actionTag === 'concede') perPlayer[pid].conceded += 1;
    });
  });
  return perPlayer;
}

// ----------------------------------------
// Hauptkomponente
// ----------------------------------------
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

  // Tabs
  const [tab, setTab] = useState(0);

  // Detail-Auswahl
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  // Filter für Ticker (optional)
  const [tickerFilter, setTickerFilter] = useState('all');

  useEffect(() => {
    if (!gameId) return;
    setLoading(true);

    const unsub = onSnapshot(doc(db, 'games', gameId), async (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() };
        setGame(data);

        // Spieler nur einmal laden
        if (data.teamHomeId && homePlayers.length === 0) {
          const qh = query(collection(db, "players"), where("teamId", "==", data.teamHomeId));
            const snap = await getDocs(qh);
          setHomePlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
        if (data.teamAwayId && awayPlayers.length === 0) {
          const qa = query(collection(db, "players"), where("teamId", "==", data.teamAwayId));
          const snap = await getDocs(qa);
          setAwayPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } else {
        setGame(null);
      }
      setLoading(false);
    });

    return () => unsub();
    // eslint-disable-next-line
  }, [gameId]);

  // Replay Logik
  useEffect(() => {
    if (!replay || !game || !game.liveTickerEvents) return;
    if (replayIndex >= game.liveTickerEvents.length) return;
    const t = setTimeout(() => setReplayIndex(i => i + 1), 1100);
    return () => clearTimeout(t);
  }, [replay, replayIndex, game]);

  const handleReplay = () => { setReplay(true); setReplayIndex(0); };
  const handleStopReplay = () => { setReplay(false); setReplayIndex(0); };

  const homeTeamName = game?.teamHomeName || 'Heim';
  const awayTeamName = game?.teamAwayName || 'Gast';
  const homeFormation = game?.teamHomeFormation || game?.formation || [];
  const awayFormation = game?.teamAwayFormation || game?.formationAway || [];

  const playerRatingsRaw = game?.playerRatings || {};
  // Falls sich das Format ändert (z.B. {playerId:{points:...}}):
  const getPoints = useCallback((pid) => {
    const val = playerRatingsRaw[pid];
    if (val == null) return 600;
    if (typeof val === 'number') return val;
    if (typeof val === 'object' && typeof val.points === 'number') return val.points;
    return 600;
  }, [playerRatingsRaw]);

  // On-Pitch Spieler
  const homeOnPitch = useMemo(
    () => homeFormation.map(pos => homePlayers.find(p => p.id === pos.playerId)).filter(Boolean),
    [homeFormation, homePlayers]
  );
  const awayOnPitch = useMemo(
    () => awayFormation.map(pos => awayPlayers.find(p => p.id === pos.playerId)).filter(Boolean),
    [awayFormation, awayPlayers]
  );

  // Spieler zusammen
  const allOnPitch = useMemo(() => [...homeOnPitch, ...awayOnPitch], [homeOnPitch, awayOnPitch]);

  // Ratings Tabelle
  const ratingTable = useMemo(() => {
    return allOnPitch
      .map(p => ({
        player: p,
        points: getPoints(p.id),
        note: Number((getPoints(p.id) / 100).toFixed(2))
      }))
      .sort((a, b) => b.note - a.note);
  }, [allOnPitch, getPoints]);

  // Aggregation Rating Events (falls vorhanden)
  const ratingEvents = game?.ratingEvents || []; // array aus Backend
  const aggregated = useMemo(() => aggregateRatingEvents(ratingEvents), [ratingEvents]);

  // Detaildaten für einen Spieler
  const selectedPlayer = useMemo(
    () => allOnPitch.find(p => p.id === selectedPlayerId) || null,
    [allOnPitch, selectedPlayerId]
  );
  const selectedAggregates = selectedPlayer ? aggregated[selectedPlayer.id] : null;

  // Gefilterter Ticker
  const tickerEvents = game?.liveTickerEvents || [];
  const filteredTickerEvents = useMemo(() => {
    if (tickerFilter === 'all') return tickerEvents;
    return tickerEvents.filter(e => e.type === tickerFilter);
  }, [tickerFilter, tickerEvents]);

  if (loading) return <CircularProgress sx={{ mt: 4 }} />;
  if (!game) return <Typography sx={{ mt: 4 }}>Spiel nicht gefunden.</Typography>;

  // Fortschritt / Spielminute
  const currentMinute = Math.min(90, Math.round(game.minute || 0));

  // Score
  const scoreLine = `${homeTeamName} ${game.scoreHome} : ${game.scoreAway} ${awayTeamName}`;

  return (
    <Box sx={{ p: 2, width: '100%', minHeight: '100vh' }}>
      {/* Header */}
      <Box sx={{
        mb: 2, display: 'flex', flexWrap: 'wrap',
        justifyContent: 'space-between', alignItems: 'center', gap: 2
      }}>
        <Box>
          <Typography variant="h4" component="div">{scoreLine}</Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Status: {game.status} • Minute: {currentMinute}'
          </Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          {game.status === 'finished' && !replay && (
            <Tooltip title="Replay abspielen">
              <IconButton color="primary" onClick={handleReplay}><ReplayIcon /></IconButton>
            </Tooltip>
          )}
          {replay && (
            <Tooltip title="Replay stoppen">
              <IconButton color="error" onClick={handleStopReplay}><StopIcon /></IconButton>
            </Tooltip>
          )}
          <Button variant="outlined" onClick={() => navigate(-1)}>Zurück</Button>
        </Box>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }} variant="scrollable" allowScrollButtonsMobile>
        <Tab icon={<SportsSoccerIcon />} label="Aufstellung & Noten" />
        <Tab icon={<ListAltIcon />} label="Ticker & Replay" />
        <Tab icon={<LeaderboardIcon />} label="Spieler-Details" />
        <Tab icon={<AssessmentIcon />} label="Statistik / Übersicht" />
      </Tabs>

      {/* TAB 0: Aufstellung & Noten */}
      {tab === 0 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>{homeTeamName} (Startelf)</Typography>
              <List dense>
                {homeOnPitch.map(p => {
                  const pts = getPoints(p.id);
                  const note = pts / 100;
                  return (
                    <ListItem key={p.id} disableGutters secondaryAction={
                      <Chip
                        label={note.toFixed(2)}
                        color={ratingColor(note)}
                        size="small"
                        onClick={() => { setSelectedPlayerId(p.id); setTab(2); }}
                      />
                    }>
                      <ListItemText
                        primary={getPlayerName(p)}
                        secondary={p.positionKey || p.position}
                      />
                    </ListItem>
                  );
                })}
              </List>
            </Paper>
          </Grid>

            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2, bgcolor: "#0B4F0B", minHeight: 400, color: '#fff' }}>
                <Typography variant="h6" align="center" gutterBottom>Spielfeld</Typography>
                <Grid container>
                  <Grid item xs={6}>
                    <Typography align="center" variant="subtitle2" sx={{ mb: 1 }}>{homeTeamName}</Typography>
                    {renderFormation(homePlayers, homeFormation, new Set([selectedPlayerId]))}
                  </Grid>
                  <Grid item xs={6}>
                    <Typography align="center" variant="subtitle2" sx={{ mb: 1 }}>{awayTeamName}</Typography>
                    {renderFormation(awayPlayers, awayFormation, new Set([selectedPlayerId]))}
                  </Grid>
                </Grid>
                <Box sx={{ mt: 2 }}>
                  <LinearProgress
                    variant="determinate"
                    value={(currentMinute / 90) * 100}
                    sx={{ height: 8, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.2)' }}
                  />
                  <Typography align="center" variant="caption" sx={{ mt: 1, display: 'block' }}>
                    {currentMinute}' / 90'
                  </Typography>
                </Box>
              </Paper>
            </Grid>

          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>{awayTeamName} (Startelf)</Typography>
              <List dense>
                {awayOnPitch.map(p => {
                  const pts = getPoints(p.id);
                  const note = pts / 100;
                  return (
                    <ListItem key={p.id} disableGutters secondaryAction={
                      <Chip
                        label={note.toFixed(2)}
                        color={ratingColor(note)}
                        size="small"
                        onClick={() => { setSelectedPlayerId(p.id); setTab(2); }}
                      />
                    }>
                      <ListItemText
                        primary={getPlayerName(p)}
                        secondary={p.positionKey || p.position}
                      />
                    </ListItem>
                  );
                })}
              </List>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1" gutterBottom>Rating Ranking</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Spieler</TableCell>
                    <TableCell>Team</TableCell>
                    <TableCell>Position</TableCell>
                    <TableCell align="right">Note</TableCell>
                    <TableCell align="right">Δ Gesamt</TableCell>
                    <TableCell align="right">Aktionen (gezählt)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ratingTable.map((r, idx) => {
                    const aggr = aggregated[r.player.id];
                    const deltaTotal = aggr ? (aggr.totalDelta / 100).toFixed(2) : ( (r.points - 600)/100).toFixed(2);
                    return (
                      <TableRow
                        key={r.player.id}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => { setSelectedPlayerId(r.player.id); setTab(2); }}
                      >
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell>{getPlayerName(r.player)}</TableCell>
                        <TableCell>{r.player.teamShort || (homeOnPitch.includes(r.player)?homeTeamName:awayTeamName)}</TableCell>
                        <TableCell>{r.player.positionKey || r.player.position}</TableCell>
                        <TableCell align="right">
                          <Chip
                            label={r.note.toFixed(2)}
                            size="small"
                            color={ratingColor(r.note)}
                          />
                        </TableCell>
                        <TableCell align="right">{deltaTotal}</TableCell>
                        <TableCell align="right">{aggr?.actions || '-'}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Paper>
          </Grid>

        </Grid>
      )}

      {/* TAB 1: Live-Ticker & Replay */}
      {tab === 1 && (
        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
            {game.status === "finished" && !replay && (
              <Button startIcon={<ReplayIcon />} onClick={handleReplay} variant="contained">
                Replay abspielen
              </Button>
            )}
            {replay && (
              <Button startIcon={<StopIcon />} onClick={handleStopReplay} variant="outlined" color="error">
                Replay stoppen
              </Button>
            )}
            <FormControl size="small">
              <InputLabel>Filter</InputLabel>
              <Select
                label="Filter"
                value={tickerFilter}
                onChange={(e)=>setTickerFilter(e.target.value)}
                sx={{ minWidth: 140 }}
              >
                <MenuItem value="all">Alle</MenuItem>
                <MenuItem value="goal">Tore</MenuItem>
                <MenuItem value="pass">Pässe</MenuItem>
                <MenuItem value="shoot">Schüsse</MenuItem>
                <MenuItem value="duel">Zweikämpfe</MenuItem>
                <MenuItem value="freekick">Freistöße</MenuItem>
                <MenuItem value="killerPass">Killerpässe</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {game.status === "finished" ? "Spiel-Recap" : "Live-Ticker"}
          </Typography>
          <List>
            {(replay ? filteredTickerEvents.slice(0, replayIndex) : filteredTickerEvents)
              .map((event, idx) => (
                <React.Fragment key={idx}>
                  <ListItem alignItems="flex-start">
                    <ListItemText
                      primary={
                        <span>
                          {event.text}
                          <span style={{ marginLeft: 8 }}>{getTickerIcon(event)}</span>
                        </span>
                      }
                      secondary={
                        event.type === 'goal'
                          ? `Spielstand: ${game.scoreHome}:${game.scoreAway}`
                          : null
                      }
                    />
                  </ListItem>
                  {idx < (replay ? replayIndex : filteredTickerEvents.length) - 1 && <Divider />}
                </React.Fragment>
            ))}
          </List>
          {replay && replayIndex >= filteredTickerEvents.length && (
            <Typography sx={{ mt: 2 }} color="success.main">
              Replay beendet!
            </Typography>
          )}
        </Paper>
      )}

      {/* TAB 2: Spieler-Details */}
      {tab === 2 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 1 }}>
              <Typography variant="subtitle1" sx={{ p:1 }}>Spieler auswählen</Typography>
              <List dense>
                {ratingTable.map(r => {
                  const note = r.note;
                  return (
                    <ListItem
                      key={r.player.id}
                      button
                      selected={selectedPlayerId === r.player.id}
                      onClick={() => setSelectedPlayerId(r.player.id)}
                      sx={{ borderRadius: 1 }}
                    >
                      <ListItemText
                        primary={getPlayerName(r.player)}
                        secondary={r.player.positionKey || r.player.position}
                      />
                      <Chip
                        label={note.toFixed(2)}
                        size="small"
                        color={ratingColor(note)}
                      />
                    </ListItem>
                  );
                })}
              </List>
            </Paper>
          </Grid>
          <Grid item xs={12} md={9}>
            <Paper sx={{ p: 2, minHeight: 400 }}>
              {selectedPlayer ? (
                <>
                  <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
                    <Avatar sx={{ width: 56, height: 56 }}>
                      {getPlayerName(selectedPlayer).slice(0,2).toUpperCase()}
                    </Avatar>
                    <Box>
                      <Typography variant="h5">{getPlayerName(selectedPlayer)}</Typography>
                      <Typography variant="subtitle2" color="text.secondary">
                        {selectedPlayer.positionKey || selectedPlayer.position} • Aktuelle Note:{" "}
                        <b>{(getPoints(selectedPlayer.id)/100).toFixed(2)}</b>
                      </Typography>
                    </Box>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Typography variant="subtitle1">Aggregierte Werte</Typography>
                      {selectedAggregates ? (
                        <Table size="small" sx={{ mt: 1 }}>
                          <TableBody>
                            <TableRow><TableCell>Gesamt Δ</TableCell><TableCell>{(selectedAggregates.totalDelta/100).toFixed(2)}</TableCell></TableRow>
                            <TableRow><TableCell>Anzahl Aktionen (Events)</TableCell><TableCell>{selectedAggregates.actions}</TableCell></TableRow>
                            <TableRow><TableCell>Tore (aus ratingEvents)</TableCell><TableCell>{selectedAggregates.goals}</TableCell></TableRow>
                            <TableRow><TableCell>Schüsse (markiert)</TableCell><TableCell>{selectedAggregates.shots}</TableCell></TableRow>
                            <TableRow><TableCell>Killerpässe</TableCell><TableCell>{selectedAggregates.killerPass}</TableCell></TableRow>
                            <TableRow><TableCell>Dribblings (erfasst)</TableCell><TableCell>{selectedAggregates.dribbles}</TableCell></TableRow>
                            <TableRow><TableCell>Zweikämpfe (erfasst)</TableCell><TableCell>{selectedAggregates.duels}</TableCell></TableRow>
                            <TableRow><TableCell>Fouls / Freistöße</TableCell><TableCell>{selectedAggregates.frees}</TableCell></TableRow>
                            <TableRow><TableCell>Paraden (Keeper)</TableCell><TableCell>{selectedAggregates.saves}</TableCell></TableRow>
                            <TableRow><TableCell>Gegentore (Keeper)</TableCell><TableCell>{selectedAggregates.conceded}</TableCell></TableRow>
                          </TableBody>
                        </Table>
                      ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ mt:1 }}>
                          Keine detaillierten Rating-Events vorhanden.
                        </Typography>
                      )}
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Typography variant="subtitle1">Delta nach Aktionstyp</Typography>
                      {selectedAggregates ? (
                        <List dense sx={{ maxHeight: 250, overflow: 'auto' }}>
                          {Object.entries(selectedAggregates.byAction || {}).sort((a,b)=>b[1]-a[1]).map(([tag,count]) => (
                            <ListItem key={tag} disableGutters>
                              <ListItemText
                                primary={`${tag}`}
                                secondary={`Anzahl: ${count}`}
                              />
                            </ListItem>
                          ))}
                        </List>
                      ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ mt:1 }}>
                          Keine Event-Verteilung vorhanden.
                        </Typography>
                      )}
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="subtitle1" sx={{ mt:1 }}>Ticker-Events dieses Spielers</Typography>
                      <List dense sx={{ maxHeight: 200, overflow: 'auto' }}>
                        { (game.liveTickerEvents||[])
                          .filter(ev =>
                            ev.playerWithBall === selectedPlayer.id ||
                            ev.scorer === selectedPlayer.id ||
                            ev.against === selectedPlayer.id
                          )
                          .map((ev,i)=>(
                            <ListItem key={i} disableGutters>
                              <ListItemText
                                primary={ev.text}
                                secondary={`${ev.minute}' • Typ: ${ev.type}`}
                              />
                            </ListItem>
                          ))
                        }
                      </List>
                    </Grid>
                  </Grid>
                </>
              ) : (
                <Typography>Bitte einen Spieler links auswählen.</Typography>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* TAB 3: Gesamtstatistik / Übersicht */}
      {tab === 3 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Spielstatistik (abgeleitet)</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb:2 }}>
            Diese Übersicht entsteht aus den vorliegenden Rating-Events. Wenn du granularere Kennzahlen brauchst,
            erweitere im Backend den <code>actionTag</code> oder speichere zusätzliche Roh-Events (z.B. pass_success, pass_fail).
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Spieler</TableCell>
                <TableCell>Team</TableCell>
                <TableCell align="right">Note</TableCell>
                <TableCell align="right">Δ</TableCell>
                <TableCell align="right">Events</TableCell>
                <TableCell align="right">Tore</TableCell>
                <TableCell align="right">Schüsse</TableCell>
                <TableCell align="right">Killerpässe</TableCell>
                <TableCell align="right">Dribblings</TableCell>
                <TableCell align="right">Zweikämpfe</TableCell>
                <TableCell align="right">Paraden</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ratingTable.map(r => {
                const aggr = aggregated[r.player.id];
                const delta = aggr
                  ? (aggr.totalDelta/100).toFixed(2)
                  : ((r.points - 600)/100).toFixed(2);
                return (
                  <TableRow
                    key={r.player.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => { setSelectedPlayerId(r.player.id); setTab(2); }}
                  >
                    <TableCell>{getPlayerName(r.player)}</TableCell>
                    <TableCell>{homeOnPitch.includes(r.player)?homeTeamName:awayTeamName}</TableCell>
                    <TableCell align="right">
                      <Chip label={r.note.toFixed(2)} size="small" color={ratingColor(r.note)} />
                    </TableCell>
                    <TableCell align="right">{delta}</TableCell>
                    <TableCell align="right">{aggr?.actions || '-'}</TableCell>
                    <TableCell align="right">{aggr?.goals || 0}</TableCell>
                    <TableCell align="right">{aggr?.shots || 0}</TableCell>
                    <TableCell align="right">{aggr?.killerPass || 0}</TableCell>
                    <TableCell align="right">{aggr?.dribbles || 0}</TableCell>
                    <TableCell align="right">{aggr?.duels || 0}</TableCell>
                    <TableCell align="right">{aggr?.saves || 0}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}

export default GamePage;
