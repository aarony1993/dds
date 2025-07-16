import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Avatar,
  Chip,
  Alert,
  CircularProgress // Für eine schöne Ladeanzeige
} from '@mui/material';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'; // <-- WICHTIG: Alle nötigen Imports sind hier
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';

// Helper-Funktion für Farb-Chips basierend auf der Position
const getPositionChipColor = (positionGroup) => {
  switch (positionGroup) {
    case 'TOR': return 'warning';
    case 'DEF': return 'info';
    case 'MID': return 'success';
    case 'ANG': return 'error';
    default: return 'default';
  }
};

// Hauptkomponente für die Team-Seite
const TeamPage = () => {
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTeamData = async () => {
      // Stelle sicher, dass der user und seine teamId geladen sind
      if (!user?.teamId) {
        // Dieser Fall wird durch das Routing in App.js eigentlich verhindert,
        // ist aber eine gute zusätzliche Sicherung.
        setError("Benutzer- und Teamdaten werden noch geladen...");
        setLoading(false);
        return;
      }
      
      try {
        const teamRef = doc(db, "teams", user.teamId);
        const teamSnap = await getDoc(teamRef);

        if (teamSnap.exists()) {
          const teamData = teamSnap.data();
          setTeam(teamData);

          // --- KORREKTUR: Spielerdaten sicher laden ---
          // Prüfe, ob das 'players'-Array im Team-Dokument existiert und nicht leer ist
          if (teamData.players && teamData.players.length > 0) {
            // Baue eine Abfrage, um alle Spieler zu holen, deren ID im Array ist
            const playerQuery = query(collection(db, 'players'), where('__name__', 'in', teamData.players));
            const playerDocs = await getDocs(playerQuery);
            const playersData = playerDocs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPlayers(playersData);
          } else {
            // Fallback, falls das Team (noch) keine Spieler hat
            setPlayers([]);
          }
        } else {
          setError('Dein zugewiesenes Team wurde in der Datenbank nicht gefunden.');
        }
      } catch (err) {
        console.error("Originaler Fehler beim Laden der Teamdaten:", err);
        setError('Ein technischer Fehler ist beim Laden der Teamdaten aufgetreten.');
      } finally {
        setLoading(false);
      }
    };

    fetchTeamData();
  }, [user]); // Effekt wird ausgeführt, wenn sich das user-Objekt ändert

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
  if (!team) return <Typography sx={{textAlign: 'center', mt: 4}}>Kein Team gefunden.</Typography>;

  return (
    <Container sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 4 }}>
        <Avatar src={team.logoUrl} sx={{ width: 60, height: 60, mr: 2, bgcolor: 'background.paper' }} />
        <Typography variant="h4" component="h1">{team.name} - Kaderübersicht</Typography>
      </Box>

      <Paper elevation={3} sx={{ overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead sx={{ backgroundColor: 'primary.main' }}>
              <TableRow>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Spieler</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Position</TableCell>
                <TableCell align="center" sx={{ color: 'white', fontWeight: 'bold' }}>Alter</TableCell>
                <TableCell align="center" sx={{ color: 'white', fontWeight: 'bold' }}>Skill</TableCell>
                <TableCell align="center" sx={{ color: 'white', fontWeight: 'bold' }}>Nationalität</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {players.length > 0 ? (
                players.sort((a, b) => b.skill - a.skill).map((player) => (
                  <TableRow key={player.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                    <TableCell component="th" scope="row">
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Avatar sx={{ width: 40, height: 40, mr: 2, bgcolor: 'secondary.light' }}>
                          {player.name.charAt(0)}
                        </Avatar>
                        {player.name}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={player.positionGroup} color={getPositionChipColor(player.positionGroup)} size="small" />
                    </TableCell>
                    <TableCell align="center">{player.age}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>{player.skill}</TableCell>
                    <TableCell align="center">
                      <Avatar 
                        src={`https://flagcdn.com/w40/${player.nationality}.png`} 
                        sx={{ width: 28, height: 20, margin: 'auto' }}
                        variant="square"
                      />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                    <TableCell colSpan={5} align="center">
                        Dein Kader ist leer. Besuche den Transfermarkt!
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Container>
  );
};

export default TeamPage;