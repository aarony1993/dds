// src/pages/MatchHistoryPage.js
import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Typography, Paper, List, ListItem, ListItemButton, ListItemText, CircularProgress } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

function MatchHistoryPage() {
  const { currentUser } = useAuth();
  const [finishedGames, setFinishedGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamNames, setTeamNames] = useState({});

  useEffect(() => {
    if (!currentUser) return;
    const fetchHistory = async () => {
      setLoading(true);
      const teamsRef = collection(db, 'teams');
      const allTeamsSnap = await getDocs(teamsRef);
      const names = {};
      allTeamsSnap.forEach(doc => { names[doc.id] = doc.data().name; });
      setTeamNames(names);

      const myTeam = allTeamsSnap.docs.find(d => d.data().managerUid === currentUser.uid);
      if (!myTeam) { setLoading(false); return; }

      const gamesQuery = query(
        collection(db, "games"),
        where("status", "==", "finished"),
        where("teamIds", "array-contains", myTeam.id),
        orderBy("scheduledStartTime", "desc")
      );
      const gamesSnapshot = await getDocs(gamesQuery);
      setFinishedGames(gamesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    };
    fetchHistory();
  }, [currentUser]);

  if (loading) return <CircularProgress />;

  return (
    <Paper sx={{p: 3}}>
      <Typography variant="h4" gutterBottom>Spiel-Historie</Typography>
      <List>
        {finishedGames.map(game => (
          <ListItemButton key={game.id} component={RouterLink} to={`/match/${game.id}`}>
            <ListItemText
              primary={`${teamNames[game.teamHomeId] || 'Heim'} vs ${teamNames[game.teamAwayId] || 'Gast'}`}
              secondary={`Endstand: ${game.scoreHome} : ${game.scoreAway}`}
            />
          </ListItemButton>
        ))}
      </List>
    </Paper>
  );
}
export default MatchHistoryPage;