import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { formations } from '../constants/formations';
import { 
  Box, Typography, Paper, Tabs, Tab, Grid, Chip, 
  CircularProgress, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Tooltip,
  List, ListItem, ListItemText
} from '@mui/material';

// --- HILFSKOMPONENTEN ---

const ratingColor = (note) => {
    if (note >= 7.5) return 'success';
    if (note >= 6.5) return 'primary';
    if (note < 5.5) return 'error';
    return 'default';
};

const PitchDisplay = ({ team, players, ratings, formationKey, isHomeTeam, lineup }) => {
  const formationCoords = formations[formationKey] || [];
  const getPlayerById = (id) => players.find(p => p.id === id);

  return (
    <Box>
      <Typography variant="h6" align="center" gutterBottom>{team?.name} ({formationKey})</Typography>
      <Box sx={{
          position: 'relative', width: '100%', paddingTop: '130%', 
          bgcolor: '#1E8449', borderRadius: 2, border: '2px solid rgba(255, 255, 255, 0.2)',
      }}>
        <Box sx={{ position: 'absolute', top: '50%', left: 0, width: '100%', height: '2px', bgcolor: 'rgba(255, 255, 255, 0.3)' }} />
        <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '25%', paddingTop: '25%', border: '2px solid rgba(255, 255, 255, 0.3)', borderRadius: '50%' }} />

        {formationCoords.map(pos => {
          const lineupInfo = lineup.find(p => p.positionKey === pos.pos);
          const player = lineupInfo ? getPlayerById(lineupInfo.playerId) : null;
          const note = player ? (ratings?.[player.id] || 6.0) : 6.0;
          const top = isHomeTeam ? `${pos.y}%` : `${100 - pos.y}%`;

          return (
            <Tooltip key={pos.pos} title={player ? `${player.nachname} (${note.toFixed(2)})` : pos.pos}>
              <Box sx={{
                position: 'absolute', top, left: `${pos.x}%`, transform: 'translate(-50%, -50%)', textAlign: 'center'
              }}>
                <Chip
                  label={player ? player.nachname.substring(0, 5) + '.' : pos.pos}
                  color={ratingColor(note)}
                  size="small"
                  sx={{ color: '#fff', fontWeight: 'bold', boxShadow: 3, minWidth: '50px', opacity: player ? 1 : 0.6 }}
                />
              </Box>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
};

const StatsTable = ({ players, stats, team, ratings }) => {
  const teamPlayers = players.filter(p => p.teamId === team?.id);

  const sortedPlayers = [...teamPlayers].sort((a, b) => {
    const posOrder = ['TOR', 'DEF', 'MID', 'ATT'];
    return posOrder.indexOf(a.positionGroup) - posOrder.indexOf(b.positionGroup);
  });

  return (
    <TableContainer component={Paper} elevation={2}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>{team?.name || 'Spieler'}</TableCell>
            <TableCell align="center" sx={{ fontWeight: 'bold' }}>⭐ Note</TableCell>
            <TableCell align="center" sx={{ fontWeight: 'bold' }}>⚽ Tore</TableCell>
            <TableCell align="center" sx={{ fontWeight: 'bold' }}>👟 Vorl.</TableCell>
            <TableCell align="center" sx={{ fontWeight: 'bold' }}>🎯 Schüsse</TableCell>
            <TableCell align="center" sx={{ fontWeight: 'bold' }}>➡️ Pässe</TableCell>
            <TableCell align="center" sx={{ fontWeight: 'bold' }}>✈️ Flanken</TableCell>
            <TableCell align="center" sx={{ fontWeight: 'bold' }}>✨ Steilpässe</TableCell>
            <TableCell align="center" sx={{ fontWeight: 'bold' }}>🏃‍♂️ Dribblings</TableCell>
            <TableCell align="center" sx={{ fontWeight: 'bold' }}>🛡️ Zweik.</TableCell>
            <TableCell align="center" sx={{ fontWeight: 'bold' }}>✋ Intercept.</TableCell>
            <TableCell align="center" sx={{ fontWeight: 'bold' }}>🧤 Paraden</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedPlayers.map(player => {
            const playerStats = stats?.[player.id];
            const playerRating = ratings?.[player.id];
            if (!playerStats || playerRating === undefined) return null;
            return (
              <TableRow key={player.id} hover>
                <TableCell component="th" scope="row">{player.nachname}</TableCell>
                <TableCell align="center">
                    <Chip label={playerRating.toFixed(2)} color={ratingColor(playerRating)} size="small" sx={{fontWeight: 'bold'}} />
                </TableCell>
                <TableCell align="center">{playerStats.goals > 0 ? playerStats.goals : '-'}</TableCell>
                <TableCell align="center">{playerStats.assists > 0 ? playerStats.assists : '-'}</TableCell>
                <TableCell align="center">{`${playerStats.shotsOnTarget}/${playerStats.shots}`}</TableCell>
                <TableCell align="center">{`${playerStats.passesCompleted}/${playerStats.passes}`}</TableCell>
                <TableCell align="center">{`${playerStats.crossesCompleted}/${playerStats.crosses}`}</TableCell>
                <TableCell align="center">{`${playerStats.throughBallsCompleted}/${playerStats.throughBalls}`}</TableCell>
                <TableCell align="center">{`${playerStats.dribblesSucceeded}/${playerStats.dribbles}`}</TableCell>
                <TableCell align="center">{`${playerStats.tacklesSucceeded}/${playerStats.tackles}`}</TableCell>
                <TableCell align="center">{playerStats.interceptions > 0 ? playerStats.interceptions : '-'}</TableCell>
                <TableCell align="center">{playerStats.saves > 0 ? playerStats.saves : '-'}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

// --- HAUPTKOMPONENTE ---

function MatchResultPage() {
  const { gameId } = useParams();
  const [tabIndex, setTabIndex] = useState(0);
  const [game, setGame] = useState(null);
  const [homeTeam, setHomeTeam] = useState(null);
  const [awayTeam, setAwayTeam] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId) {
      setLoading(false);
      return;
    }
    const fetchData = async () => {
      setLoading(true);
      try {
        const gameRef = doc(db, 'games', gameId);
        const gameSnap = await getDoc(gameRef);
        if (gameSnap.exists()) {
          const gameData = gameSnap.data();
          setGame(gameData);
          
          const [homeTeamDoc, awayTeamDoc] = await Promise.all([
            getDoc(doc(db, 'teams', gameData.teamHomeId)),
            getDoc(doc(db, 'teams', gameData.teamAwayId))
          ]);
          setHomeTeam({ id: homeTeamDoc.id, ...homeTeamDoc.data() });
          setAwayTeam({ id: awayTeamDoc.id, ...awayTeamDoc.data() });

          if (gameData.playerRatings) {
            const playerIds = Object.keys(gameData.playerRatings);
            if (playerIds.length > 0) {
              const playerPromises = playerIds.map(id => getDoc(doc(db, 'players', id)));
              const playerDocs = await Promise.all(playerPromises);
              const players = playerDocs.filter(snap => snap.exists()).map(snap => ({ id: snap.id, ...snap.data() }));
              setAllPlayers(players);
            }
          }
        } else {
          console.error("Spiel nicht gefunden");
          setGame(null);
        }
      } catch (error) {
        console.error("Fehler beim Laden der Spieldaten:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [gameId]);

  if (loading) return <CircularProgress sx={{ display: 'block', margin: 'auto', mt: 4 }} />;
  if (!game) return <Typography sx={{ textAlign: 'center', mt: 4 }}>Spiel nicht gefunden.</Typography>;

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <Paper elevation={3} sx={{ p: 3, mb: 3, textAlign: 'center' }}>
        <Typography variant="h5">{homeTeam?.name || 'Heim'} vs {awayTeam?.name || 'Gast'}</Typography>
        <Typography variant="h2">{game.homeScore} : {game.awayScore}</Typography>
      </Paper>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabIndex} onChange={(e, newValue) => setTabIndex(newValue)} centered>
          <Tab label="Aufstellung & Noten" />
          <Tab label="Ticker" />
          <Tab label="Statistiken" />
        </Tabs>
      </Box>

      {tabIndex === 0 && (
        <Grid container spacing={3} sx={{ mt: 2 }}>
          <Grid item xs={12} md={6}>
            <PitchDisplay team={homeTeam} players={allPlayers} ratings={game.playerRatings} formationKey={game.homeFormationKey} isHomeTeam={true} lineup={game.lineupHome || []} />
          </Grid>
          <Grid item xs={12} md={6}>
            <PitchDisplay team={awayTeam} players={allPlayers} ratings={game.playerRatings} formationKey={game.awayFormationKey} isHomeTeam={false} lineup={game.lineupAway || []} />
          </Grid>
        </Grid>
      )}

      {tabIndex === 1 && (
        <Paper elevation={2} sx={{ mt: 2, p: 2, maxHeight: '60vh', overflowY: 'auto' }}>
            <List>
              {[...(game.simulationLog || [])].map((logEntry, index) => (
                  <ListItem key={index} dense>
                    <ListItemText 
                      primary={
                        <Typography component="span" variant="body2" sx={{ color: logEntry.color || 'text.primary', fontWeight: logEntry.type === 'GOAL' ? 'bold' : 'normal' }}>
                          {logEntry.emoji || ''} {logEntry.text}
                        </Typography>
                      } 
                    />
                  </ListItem>
              ))}
            </List>
        </Paper>
      )}

      {tabIndex === 2 && (
        <Grid container spacing={2} sx={{ mt: 2 }}>
          <Grid item xs={12}>
            <StatsTable players={allPlayers} stats={game.playerStats} team={homeTeam} ratings={game.playerRatings} />
          </Grid>
          <Grid item xs={12} sx={{mt: 2}}>
            <StatsTable players={allPlayers} stats={game.playerStats} team={awayTeam} ratings={game.playerRatings} />
          </Grid>
        </Grid>
      )}
    </Box>
  );
}

export default MatchResultPage;