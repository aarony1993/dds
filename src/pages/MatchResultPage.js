// src/pages/MatchResultPage.js
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebase/config';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Box, Typography, Paper, Tabs, Tab, Grid, List, ListItem, ListItemText, Chip, CircularProgress, Divider } from '@mui/material';

// Hilfskomponente für die Spielerliste eines Teams
const TeamLineup = ({ title, players, ratings }) => (
  <Paper elevation={2} sx={{ p: 2 }}>
    <Typography variant="h6" align="center" gutterBottom>{title}</Typography>
    <List dense>
      {players.map(player => (
        <ListItem key={player.id}>
          <ListItemText primary={player.name} secondary={player.position} />
          <Chip label={(ratings?.[player.id]?.rating || 6.0).toFixed(1)} color="primary" />
        </ListItem>
      ))}
    </List>
  </Paper>
);

function MatchResultPage() {
  const { gameId } = useParams();
  const [tabIndex, setTabIndex] = useState(0);
  const [game, setGame] = useState(null);
  const [homeTeam, setHomeTeam] = useState(null);
  const [awayTeam, setAwayTeam] = useState(null);
  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId) return;
    const fetchData = async () => {
      setLoading(true);
      const gameRef = doc(db, 'games', gameId);
      const gameSnap = await getDoc(gameRef);

      if (gameSnap.exists()) {
        const gameData = gameSnap.data();
        setGame(gameData);

        // Lade Team- und Spielerdaten
        const [homeTeamDoc, awayTeamDoc] = await Promise.all([
          getDoc(doc(db, 'teams', gameData.teamHomeId)),
          getDoc(doc(db, 'teams', gameData.teamAwayId))
        ]);
        setHomeTeam(homeTeamDoc.data());
        setAwayTeam(awayTeamDoc.data());

        const [homePlayersSnap, awayPlayersSnap] = await Promise.all([
          getDocs(query(collection(db, "players"), where("teamId", "==", gameData.teamHomeId))),
          getDocs(query(collection(db, "players"), where("teamId", "==", gameData.teamAwayId)))
        ]);
        
        // Finde nur die Spieler, die auch in der Formation waren
        const homeLineupIds = gameData.playerRatings ? Object.keys(gameData.playerRatings).filter(id => homePlayersSnap.docs.some(d => d.id === id)) : [];
        const awayLineupIds = gameData.playerRatings ? Object.keys(gameData.playerRatings).filter(id => awayPlayersSnap.docs.some(d => d.id === id)) : [];

        setHomePlayers(homePlayersSnap.docs.filter(d => homeLineupIds.includes(d.id)).map(d => ({id: d.id, ...d.data()})));
        setAwayPlayers(awayPlayersSnap.docs.filter(d => awayLineupIds.includes(d.id)).map(d => ({id: d.id, ...d.data()})));

      } else {
        console.log("Spiel nicht gefunden");
      }
      setLoading(false);
    };
    fetchData();
  }, [gameId]);

  if (loading) return <CircularProgress />;
  if (!game) return <Typography>Spiel nicht gefunden.</Typography>;

  return (
    <Box>
      <Paper elevation={3} sx={{ p: 3, mb: 3, textAlign: 'center' }}>
        <Typography variant="h5">{homeTeam?.name || 'Heim'} vs {awayTeam?.name || 'Gast'}</Typography>
        <Typography variant="h2">{game.scoreHome} : {game.scoreAway}</Typography>
      </Paper>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabIndex} onChange={(e, newValue) => setTabIndex(newValue)} centered>
          <Tab label="Aufstellung & Noten" />
          <Tab label="Ticker & Replay" />
        </Tabs>
      </Box>

      {/* Tab-Inhalt für Aufstellung & Noten */}
      {tabIndex === 0 && (
        <Grid container spacing={2} sx={{ mt: 2 }}>
          <Grid item xs={6}>
            <TeamLineup title={homeTeam?.name} players={homePlayers} ratings={game.playerRatings} />
          </Grid>
          <Grid item xs={6}>
            <TeamLineup title={awayTeam?.name} players={awayPlayers} ratings={game.playerRatings} />
          </Grid>
        </Grid>
      )}

      {/* Tab-Inhalt für Ticker */}
      {tabIndex === 1 && (
        <Paper elevation={2} sx={{ mt: 2, p: 2, height: '60vh', overflowY: 'auto' }}>
           <List>
              {[...(game.liveTickerEvents || [])].map((event, index) => (
                  <ListItem key={index}><ListItemText primary={event.text} /></ListItem>
              ))}
            </List>
        </Paper>
      )}
    </Box>
  );
}

export default MatchResultPage;