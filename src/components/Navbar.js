import React, { useState, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { AppBar, Toolbar, Typography, Button, Box, Badge } from '@mui/material';

function Navbar() {
  const { user } = useAuth();
  const [liveGameId, setLiveGameId] = useState(null);
  const [teamId, setTeamId] = useState(null);

  useEffect(() => {
    if (!user) return;
    if (user.teamId) {
      setTeamId(user.teamId);
    }
  }, [user]);

  useEffect(() => {
    if (!teamId) return;
    const gamesQuery = query(
      collection(db, "games"),
      where("status", "==", "live"),
      where("teamIds", "array-contains", teamId)
    );
    const unsubscribe = onSnapshot(gamesQuery, (snapshot) => {
      if (!snapshot.empty) {
        setLiveGameId(snapshot.docs[0].id);
      } else {
        setLiveGameId(null);
      }
    });
    return () => unsubscribe();
  }, [teamId]);

  return (
    <AppBar position="static" elevation={0} sx={{ mb: 4, bgcolor: "background.paper", borderBottom: "2px solid", borderColor: "primary.main" }}>
      <Toolbar sx={{ minHeight: 60, px: 2 }}>
        <Typography variant="h6" component={RouterLink} to="/" sx={{ flexGrow: 1, color: "primary.main", fontWeight: 800, fontSize: 26, textDecoration: "none", letterSpacing: 1, mr: 2 }}>
          ⚽ DEADLINE DAY SIM
        </Typography>
        <Button color="inherit" component={RouterLink} to="/">Mein Kader</Button>
        <Button color="inherit" component={RouterLink} to="/historie">Historie</Button>
        <Button color="inherit" component={RouterLink} to="/taktik">Taktik</Button>
        <Button color="inherit" component={RouterLink} to="/transfermarkt">Transfermarkt</Button>
        <Button color="inherit" component={RouterLink} to="/challenge">Freundschaftsspiele</Button>
        <Button
          component={RouterLink}
          to={liveGameId ? `/game/${liveGameId}` : '#'}
          variant="contained"
          color="primary"
          disabled={!liveGameId}
          sx={{ ml: 2, bgcolor: "primary.main", color: "background.default", fontWeight: 700, '&:hover': { bgcolor: "#ffc447" } }}
        >
          {liveGameId && <Badge color="error" variant="dot" sx={{ mr: 1 }} />}
          Live Spiel
        </Button>
        {user?.isAdmin && (
          <Box sx={{ ml: 2, borderLeft: '1px solid #465674', pl: 2 }}>
            <Button color="inherit" component={RouterLink} to="/admin">
              Admin
            </Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
}

export default Navbar;
