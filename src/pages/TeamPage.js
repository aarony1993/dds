// src/pages/TeamPage.js

import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import {
  Avatar,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Button,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';

const positionGroupLabels = {
  TOR: 'Torwart',
  DEF: 'Abwehr',
  MID: 'Mittelfeld',
  ATT: 'Angriff',
};

const flagEmoji = (countryCode) => {
  if (!countryCode) return '';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt());
  return String.fromCodePoint(...codePoints);
};

const TeamPage = () => {
  const { user } = useAuth();
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.teamId) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'players'), where('teamId', '==', user.teamId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setPlayers(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const sortedPlayers = [...players].sort((a, b) => {
    const aName = (a.nachname ?? '') + (a.vorname ?? '');
    const bName = (b.nachname ?? '') + (b.vorname ?? '');
    return aName.localeCompare(bName, 'de');
  });

  return (
    <Grid container spacing={2} lg={12} justifyContent="center" p={2}>
      <Grid lg={8}>
        <Typography variant="h4" gutterBottom>
          Mein Kader
        </Typography>

        {loading ? (
          <CircularProgress />
        ) : sortedPlayers.length === 0 ? (
          <Typography variant="body1" color="warning.main">
            Keine Spieler gefunden.
          </Typography>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>Avatar</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Position</TableCell>
                  <TableCell>Nation</TableCell>
                  <TableCell>Marktwert</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedPlayers.map((player) => (
                  <TableRow
                    key={player.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setSelectedPlayer(player)}
                  >
                    <TableCell>{player.spielernummer ?? '-'}</TableCell>
                    <TableCell>
                      <Avatar
                        src={player.avatarUrl || '/dummy-player.png'}
                        alt={`${player.vorname} ${player.nachname}`}
                      >
                        {(player.vorname ?? 'N')[0]}
                      </Avatar>
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight="bold" color="white">
                        {(player.vorname ?? '') + ' ' + (player.nachname ?? '')}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {positionGroupLabels[player.positionGroup] || player.positionGroup || '-'}
                    </TableCell>
                    <TableCell>
                      {flagEmoji(player.nationalitaet)} {player.nationalitaet}
                    </TableCell>
                    <TableCell>
                      {player.marktwert?.toLocaleString('de-DE')} €
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Grid>

      <Dialog open={!!selectedPlayer} onClose={() => setSelectedPlayer(null)} fullWidth maxWidth="sm">
        {selectedPlayer && (
          <>
            <DialogTitle>
              {selectedPlayer.vorname} {selectedPlayer.nachname}
            </DialogTitle>
            <DialogContent sx={{ textAlign: 'center' }}>
              <Avatar
                src={selectedPlayer.avatarUrl || '/dummy-player.png'}
                sx={{ width: 100, height: 100, mx: 'auto', mb: 2 }}
              >
                {(selectedPlayer.vorname ?? 'N')[0]}
              </Avatar>
              <Typography>
                {flagEmoji(selectedPlayer.nationalitaet)} {selectedPlayer.nationalitaet}
              </Typography>
              <Typography>
                Position: {selectedPlayer.position} ({selectedPlayer.positionGroup})
              </Typography>
              <Typography>Geburtsdatum: {selectedPlayer.geburtsdatum}</Typography>
              <Typography>
                Marktwert: {selectedPlayer.marktwert?.toLocaleString('de-DE')} €
              </Typography>
              <Typography variant="caption" display="block" mt={2}>
                ID: {selectedPlayer.id}
              </Typography>
              <Button onClick={() => setSelectedPlayer(null)} sx={{ mt: 2 }}>
                Schließen
              </Button>
            </DialogContent>
          </>
        )}
      </Dialog>
    </Grid>
  );
};

export default TeamPage;
