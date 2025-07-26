// src/pages/PlayerDetailPage.jsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Grid,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Card,
  CardContent
} from '@mui/material';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase/config';

const PlayerDetailPage = () => {
  const { playerId } = useParams();
  const [player, setPlayer] = useState(null);
  const [ratings, setRatings] = useState([]);

  useEffect(() => {
    const fetchPlayerAndRatings = async () => {
      // Spielerinfo laden
      const playerDoc = await getDoc(doc(db, 'players', playerId));
      if (playerDoc.exists()) {
        setPlayer({ id: playerDoc.id, ...playerDoc.data() });
      }

      // Bewertungen aus Spielen (Liga, Cup, INT) laden
      const gamesRef = collection(db, 'games');
      const ratingsQuery = query(
        gamesRef,
        where(`playerRatings.${playerId}`, '!=', null),
        where('competitionCategory', 'in', ['LEAGUE', 'CUP', 'INT']),
        orderBy('scheduledStartTime', 'desc'),
        limit(50)
      );
      const gameSnaps = await getDocs(ratingsQuery);
      const fetchedRatings = [];
      gameSnaps.forEach((gs) => {
        const data = gs.data();
        fetchedRatings.push({
          gameId: gs.id,
          date: data.scheduledStartTime.toDate(),
          competitionCategory: data.competitionCategory,
          competitionCode: data.competitionCode,
          rating: data.playerRatings[playerId]
        });
      });
      setRatings(fetchedRatings);
    };
    fetchPlayerAndRatings();
  }, [playerId]);

  if (!player) {
    return <Typography>Spieler wird geladen...</Typography>;
  }

  return (
    <Grid container spacing={2}>
      <Grid lg={4}>
        <Card>
          <CardContent>
            <Typography variant="h5">{player.vorname} {player.nachname}</Typography>
            <Typography>Position: {player.positionGroup}</Typography>
            <Typography>Stärke: {player.strength}</Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid lg={8}>
        <Typography variant="h6" gutterBottom>Bewertungen</Typography>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Datum</TableCell>
                <TableCell>Wettbewerb</TableCell>
                <TableCell>Note</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ratings.map((r) => (
                <TableRow key={r.gameId}>
                  <TableCell>{r.date.toLocaleDateString()}</TableCell>
                  <TableCell>{r.competitionCode}</TableCell>
                  <TableCell>{r.rating.toFixed(1)}</TableCell>
                </TableRow>
              ))}
              {ratings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} align="center">Keine Bewertungen verfügbar</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Grid>
    </Grid>
  );
};

export default PlayerDetailPage;
