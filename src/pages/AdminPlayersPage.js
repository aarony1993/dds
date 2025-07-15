import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow, 
  Paper, 
  TextField, 
  Button,
  Box,
  Typography
} from '@mui/material';

function AdminPlayersPage() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPlayers = async () => {
    setLoading(true);
    const querySnapshot = await getDocs(collection(db, "players"));
    const allPlayers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setPlayers(allPlayers);
    setLoading(false);
  };

  useEffect(() => {
    fetchPlayers();
  }, []);

  const handleStrengthChange = (playerId, newStrength) => {
    setPlayers(currentPlayers => 
      currentPlayers.map(p => 
        p.id === playerId ? { ...p, strength: parseInt(newStrength) || 0 } : p
      )
    );
  };

  const handleSavePlayer = async (playerId, newStrength) => {
    const playerRef = doc(db, 'players', playerId);
    try {
      await updateDoc(playerRef, {
        strength: newStrength
      });
      toast.success('Stärke erfolgreich aktualisiert!');
    } catch (error) {
      toast.error('Fehler beim Speichern.');
      console.error(error);
    }
  };

  if (loading) {
    return <Typography>Lade alle Spieler...</Typography>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Admin: Spieler verwalten
      </Typography>
      <TableContainer component={Paper}>
        <Table sx={{ minWidth: 650 }} aria-label="simple table">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Team ID</TableCell>
              <TableCell>Stärke</TableCell>
              <TableCell align="right">Aktion</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {players.map((player) => (
              <TableRow
                key={player.id}
                sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
              >
                <TableCell component="th" scope="row">
                  {player.name}
                </TableCell>
                <TableCell>{player.teamId}</TableCell>
                <TableCell>
                  <TextField 
                    type="number"
                    variant="standard"
                    value={player.strength}
                    onChange={(e) => handleStrengthChange(player.id, e.target.value)}
                    sx={{ width: '80px' }}
                  />
                </TableCell>
                <TableCell align="right">
                  <Button 
                    variant="contained" 
                    size="small"
                    onClick={() => handleSavePlayer(player.id, player.strength)}
                  >
                    Speichern
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export default AdminPlayersPage;