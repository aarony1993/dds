import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase/config';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Link as RouterLink } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import PendingActions from '../components/PendingActions';

import { 
  Box, Typography, Button, Card, CardContent, Grid, CircularProgress,
  ToggleButtonGroup, ToggleButton, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Paper
} from '@mui/material';

function TeamPage() {
  const { currentUser } = useAuth();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [scheduledGame, setScheduledGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('cards');

  useEffect(() => {
    if (!currentUser) { setLoading(false); return; }

    const fetchTeamAndPlayers = async () => {
      setLoading(true);
      try {
        const teamsRef = collection(db, 'teams');
        const teamQuery = query(teamsRef, where('managerUid', '==', currentUser.uid), limit(1));
        const teamSnapshot = await getDocs(teamQuery);
        if (teamSnapshot.empty) { setLoading(false); return; }

        const foundTeam = { id: teamSnapshot.docs[0].id, ...teamSnapshot.docs[0].data() };
        setTeam(foundTeam);

        const playersRef = collection(db, 'players');
        const playersQuery = query(playersRef, where('teamId', '==', foundTeam.id));
        const playersSnapshot = await getDocs(playersQuery);
        setPlayers(playersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        
        const gamesRef = collection(db, 'games');
        const gameQuery = query(
          gamesRef, 
          where("teamIds", "array-contains", foundTeam.id),
          where('status', '==', 'scheduled'), 
          limit(1)
        );
        const gameSnapshot = await getDocs(gameQuery);
        if (!gameSnapshot.empty) {
          setScheduledGame({ id: gameSnapshot.docs[0].id, ...gameSnapshot.docs[0].data() });
        }
      } catch (error) { console.error("Fehler beim Laden von Team & Spielern: ", error); } 
      finally { setLoading(false); }
    };
    fetchTeamAndPlayers();
  }, [currentUser]);

  const handleLogout = () => signOut(auth);
  const handleViewChange = (event, newViewMode) => { if (newViewMode !== null) setViewMode(newViewMode); };

  if (loading) { return <CircularProgress />; }

  if (!team) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h5">Willkommen!</Typography>
        <Typography sx={{ my: 2 }}>Für deinen Account wurde noch kein Team zugewiesen.</Typography>
        <Button variant="outlined" onClick={handleLogout}>Logout</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1">
          Kader von {team.name}
        </Typography>
        <ToggleButtonGroup value={viewMode} exclusive onChange={handleViewChange}>
          <ToggleButton value="cards" aria-label="Kartenansicht">Karten</ToggleButton>
          <ToggleButton value="list" aria-label="Listenansicht">Liste</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ my: 2 }}>
        <Button variant="outlined" onClick={handleLogout}>Logout</Button>
        {scheduledGame && (<Button component={RouterLink} to={`/game/${scheduledGame.id}`} variant="contained" sx={{ ml: 2 }}>Zum nächsten Spiel</Button>)}
      </Box>

      <PendingActions myTeam={team} />
      
      {viewMode === 'cards' ? (
        <Grid container spacing={2}>
          {players.map(player => (
            <Grid item key={player.id} xs={12} sm={6} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="h5" component="div">{player.name}</Typography>
                  <Typography sx={{ mb: 1.5 }} color="text.secondary">Position: {player.position}</Typography>
                  <Typography variant="body2"><strong>Stärke: {player.strength}</strong></Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Position</TableCell>
                <TableCell align="right">Stärke</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {players.map((player) => (
                <TableRow key={player.id} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                  <TableCell component="th" scope="row">{player.name}</TableCell>
                  <TableCell>{player.position}</TableCell>
                  <TableCell align="right">{player.strength}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

export default TeamPage;