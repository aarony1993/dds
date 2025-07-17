import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, query, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { Box, Typography, Button, Select, MenuItem, FormControl, InputLabel, Paper } from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';

function ChallengePage() {
  const { user } = useAuth(); // <-- useAuth liefert user, nicht currentUser
  const [myTeam, setMyTeam] = useState(null);
  const [otherTeams, setOtherTeams] = useState([]);
  const [selectedOpponentId, setSelectedOpponentId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    if (!user) return;
    const fetchTeams = async () => {
      const teamsRef = collection(db, 'teams');
      const q = query(teamsRef);
      const snapshot = await getDocs(q);
      const allTeams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const myTeamData = allTeams.find(t => t.managerUid === user.uid);
      const opponents = allTeams.filter(t => t.managerUid !== user.uid);

      setMyTeam(myTeamData);
      setOtherTeams(opponents);
    };

    fetchTeams();
  }, [user]);

  const handleChallenge = async () => {
    if (!selectedOpponentId || !selectedDate || !myTeam) {
      toast.error("Bitte Gegner und Datum auswählen.");
      return;
    }

    // Wenn du Dayjs o.Ä. als DateTimePicker Adapter hast:
    const dateToWrite = selectedDate instanceof Date ? selectedDate : selectedDate.toDate();

    try {
      await addDoc(collection(db, "game_invites"), {
        proposingTeamId: myTeam.id,
        proposingManagerUid: user.uid,
        receivingTeamId: selectedOpponentId,
        proposedDate: dateToWrite,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      toast.success("Herausforderung wurde verschickt!");
      setSelectedOpponentId('');
      setSelectedDate(new Date());
    } catch (error) {
      toast.error("Fehler beim Senden der Herausforderung.");
      console.error(error);
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>Gegner herausfordern</Typography>

      <FormControl fullWidth sx={{ mt: 2 }}>
        <InputLabel id="opponent-select-label">Gegner auswählen</InputLabel>
        <Select
          labelId="opponent-select-label"
          value={selectedOpponentId}
          label="Gegner auswählen"
          onChange={(e) => setSelectedOpponentId(e.target.value)}
        >
          {otherTeams.map(team => (
            <MenuItem key={team.id} value={team.id}>{team.name}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <Box sx={{ my: 3 }}>
        <DateTimePicker
          label="Wunschtermin für das Spiel"
          value={selectedDate}
          onChange={(newDate) => setSelectedDate(newDate)}
        />
      </Box>

      <Button 
        variant="contained" 
        onClick={handleChallenge} 
        disabled={!selectedOpponentId || !selectedDate}
      >
        Herausforderung senden
      </Button>
    </Paper>
  );
}

export default ChallengePage;
