import React, { useEffect, useState } from "react";
import { Grid, Paper, Typography, Avatar, Box } from "@mui/material";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

const TeamPage = () => {
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    const fetchTeamAndPlayers = async () => {
      if (!user) return;

      // Fetch Team
      const teamQuery = query(
        collection(db, "teams"),
        where("managerUid", "==", user.uid)
      );
      const teamSnapshot = await getDocs(teamQuery);
      if (teamSnapshot.empty) return;
      const teamDoc = teamSnapshot.docs[0];
      setTeam({ id: teamDoc.id, ...teamDoc.data() });

      // Fetch Players
      const playersQuery = query(
        collection(db, "players"),
        where("teamId", "==", teamDoc.id)
      );
      const playersSnapshot = await getDocs(playersQuery);
      setPlayers(
        playersSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
      );
    };

    fetchTeamAndPlayers();
  }, [user]);

  if (!team) {
    return <Typography variant="h6">Team wird geladen…</Typography>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          {team.name}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
          <Avatar
            src={team.logoUrl || "/dummy-logo.svg"}
            sx={{ width: 56, height: 56, mr: 2 }}
            alt="Team-Logo"
          />
          <Typography variant="subtitle1">
            Manager: {team.managerName || "?"}
          </Typography>
        </Box>
      </Paper>

      <Typography variant="h5" gutterBottom>
        Kader
      </Typography>

      <Grid container spacing={2}>
        {players.map((player) => (
          <Grid key={player.id} lg={3} xl={2}>
            <Paper sx={{ p: 2, display: "flex", alignItems: "center" }}>
              <Avatar
                src={player.avatarUrl || "/dummy-player.png"}
                sx={{ width: 48, height: 48, mr: 2 }}
                alt={player.name}
              />
              <Box>
                <Typography variant="subtitle1">{player.name}</Typography>
                <Typography variant="body2">
                  Position: {player.position || "-"}
                </Typography>
                <Typography variant="body2">
                  PositionGroup: {player.positionGroup || "-"}
                </Typography>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default TeamPage;
