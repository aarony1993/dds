// src/pages/MatchHistoryPage.js
import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, orderBy, getDocs, doc, getDoc, limit } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Typography, Paper, List, ListItemButton, ListItemAvatar, ListItemText, Avatar, CircularProgress, Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

function MatchHistoryPage() {
  const { user } = useAuth(); // Neu: 'user' statt 'currentUser'
  const [myTeam, setMyTeam] = useState(null);
  const [games, setGames] = useState([]);
  const [teamInfos, setTeamInfos] = useState({});
  const [loading, setLoading] = useState(true);

  // 1. Hole das Team des aktuellen Users
  useEffect(() => {
    if (!user) return;
    const fetchTeam = async () => {
      const teamsQuery = query(collection(db, "teams"), where("managerUid", "==", user.uid));
      const snapshot = await getDocs(teamsQuery);
      if (!snapshot.empty) {
        setMyTeam({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      } else {
        setMyTeam(null);
      }
    };
    fetchTeam();
  }, [user]);

  // 2. Hole die letzten Spiele für dieses Team
  useEffect(() => {
    if (!myTeam) { setGames([]); setLoading(false); return; }
    setLoading(true);

    const fetchGames = async () => {
      const gamesQuery = query(
        collection(db, "games"),
        where("status", "==", "finished"),
        where("teamIds", "array-contains", myTeam.id),
        orderBy("scheduledStartTime", "desc"),
        limit(20)
      );
      const snapshot = await getDocs(gamesQuery);
      const fetchedGames = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setGames(fetchedGames);

      // Hole die Home/Away Teamnamen/Logos effizient:
      const teamIds = [
        ...new Set(fetchedGames.flatMap(g => [g.teamHomeId, g.teamAwayId]).filter(Boolean))
      ];
      const infos = {};
      await Promise.all(teamIds.map(async (tid) => {
        const tDoc = await getDoc(doc(db, "teams", tid));
        if (tDoc.exists()) infos[tid] = tDoc.data();
      }));
      setTeamInfos(infos);

      setLoading(false);
    };
    fetchGames();
  }, [myTeam]);

  if (!user) return null;
  if (loading) return <Box sx={{ textAlign: "center", mt: 6 }}><CircularProgress /></Box>;

  if (!myTeam)
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5">Kein Team gefunden.</Typography>
        <Typography>Du bist aktuell keinem Team zugeordnet.</Typography>
      </Paper>
    );

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>Letzte Spiele von {myTeam.name}</Typography>
      <List>
        {games.length === 0 && (
          <Typography variant="body1">Keine gespielten Partien gefunden.</Typography>
        )}
        {games.map(game => (
          <ListItemButton key={game.id} component={RouterLink} to={`/match/${game.id}`}>
            <ListItemAvatar>
              <Avatar src={teamInfos[game.teamHomeId]?.logoUrl}>
                {teamInfos[game.teamHomeId]?.name?.[0] || "H"}
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <strong>
                    {teamInfos[game.teamHomeId]?.name || "Heimteam"}
                  </strong>
                  <span style={{ color: "#888" }}>vs</span>
                  <strong>
                    {teamInfos[game.teamAwayId]?.name || "Gast"}
                  </strong>
                </Box>
              }
              secondary={
                <>
                  <span>Endstand: {game.scoreHome} : {game.scoreAway}</span>
                  {game.scheduledStartTime?.toDate &&
                    <span style={{ marginLeft: 12, color: "#aaa" }}>
                      ({game.scheduledStartTime.toDate().toLocaleDateString("de-DE")})
                    </span>
                  }
                </>
              }
            />
            <ListItemAvatar>
              <Avatar src={teamInfos[game.teamAwayId]?.logoUrl}>
                {teamInfos[game.teamAwayId]?.name?.[0] || "A"}
              </Avatar>
            </ListItemAvatar>
          </ListItemButton>
        ))}
      </List>
    </Paper>
  );
}

export default MatchHistoryPage;
