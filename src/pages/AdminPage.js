import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Tabs, Tab, Typography, TextField, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, List, ListItem, ListItemText, Alert
} from '@mui/material';
import { db, functions } from '../firebase/config';
import { collection, getDocs, doc, updateDoc, query, where, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';

// Flaggen-Helper (Mapping von Landesnamen auf Emojis)
const flagEmoji = (country) => {
  const flags = {
    "Deutschland": "🇩🇪",
    "Italien": "🇮🇹",
    "Frankreich": "🇫🇷",
    "England": "🇬🇧",
    "Spanien": "🇪🇸",
    "Portugal": "🇵🇹",
  };
  return flags[country] || "🏳️";
};

function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const AdminPage = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState(0);

  // --- Spieler State ---
  const [players, setPlayers] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [searchPlayer, setSearchPlayer] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  // --- Teams State ---
  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [searchTeam, setSearchTeam] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);

  // --- Transfers State ---
  const [pendingTransfers, setPendingTransfers] = useState([]);

  // --------- Spieler ---------
  const fetchPlayers = async () => {
    setLoadingPlayers(true);
    const querySnapshot = await getDocs(collection(db, "players"));
    setPlayers(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    setLoadingPlayers(false);
  };

  useEffect(() => {
    if (tab === 0) fetchPlayers();
  }, [tab]);

  const handlePlayerModalChange = (field, value) => {
    setSelectedPlayer((p) => ({ ...p, [field]: value }));
  };

  const handlePlayerModalSave = async () => {
    if (!selectedPlayer) return;
    const { id, ...rest } = selectedPlayer;
    try {
      await updateDoc(doc(db, 'players', id), rest);
      toast.success("Spieler gespeichert!");
      setSelectedPlayer(null);
      fetchPlayers();
    } catch (e) {
      toast.error("Fehler beim Speichern.");
    }
  };

  const filteredPlayers = players.filter(
    (p) =>
      p.vorname?.toLowerCase().includes(searchPlayer.toLowerCase()) ||
      p.nachname?.toLowerCase().includes(searchPlayer.toLowerCase()) ||
      p.teamId?.toLowerCase().includes(searchPlayer.toLowerCase()) ||
      p.nationalitaet?.toLowerCase().includes(searchPlayer.toLowerCase())
  );

  // --------- Teams ---------
  const fetchTeams = async () => {
    setLoadingTeams(true);
    const querySnapshot = await getDocs(collection(db, "teams"));
    setTeams(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    setLoadingTeams(false);
  };

  useEffect(() => {
    if (tab === 2) fetchTeams();
  }, [tab]);

  const handleTeamModalChange = (field, value) => {
    setSelectedTeam((t) => ({ ...t, [field]: value }));
  };

  const handleTeamModalSave = async () => {
    if (!selectedTeam) return;
    const { id, ...rest } = selectedTeam;
    try {
      await updateDoc(doc(db, 'teams', id), rest);
      toast.success("Team gespeichert!");
      setSelectedTeam(null);
      fetchTeams();
    } catch (e) {
      toast.error("Fehler beim Speichern.");
    }
  };

  const filteredTeams = teams.filter(
    (t) =>
      t.name?.toLowerCase().includes(searchTeam.toLowerCase()) ||
      t.liga?.toLowerCase().includes(searchTeam.toLowerCase()) ||
      t.land?.toLowerCase().includes(searchTeam.toLowerCase())
  );

  // --------- Transfers ---------
  useEffect(() => {
    if (tab !== 1) return;
    const q = query(collection(db, "transfers"), where("status", "==", "pending_admin_approval"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingTransfers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [tab]);

  const handleApprove = async (transfer) => {
    const executeTransfer = httpsCallable(functions, 'executeTransfer');
    try {
      await executeTransfer({ transferId: transfer.id });
      toast.success('Transfer erfolgreich durchgeführt!');
    } catch (error) {
      toast.error('Fehler bei der Durchführung des Transfers.');
    }
  };

  const handleReject = async (transferId) => {
    const transferRef = doc(db, 'transfers', transferId);
    await updateDoc(transferRef, { status: 'rejected_by_admin' });
    toast.error('Transfer vom Admin abgelehnt.');
  };

  // ---- Auth Check ----
  if (!user?.isAdmin) {
    return <Typography sx={{ mt: 5, textAlign: 'center' }} color="error">Zugriff verweigert. Nur für Admins!</Typography>;
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', mt: 5 }}>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Typography variant="h4" sx={{ mb: 2 }}>Admin-Dashboard</Typography>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} indicatorColor="primary" textColor="primary">
          <Tab label="Spieler bearbeiten" />
          <Tab label="Transfers genehmigen" />
          <Tab label="Teams bearbeiten" />
        </Tabs>

        {/* Tab 1: Spieler bearbeiten */}
        <TabPanel value={tab} index={0}>
          <Typography variant="h6" gutterBottom>Spieler suchen und bearbeiten</Typography>
          <TextField
            label="Spieler suchen (Name, Team, Nation)"
            variant="outlined"
            size="small"
            fullWidth
            sx={{ mb: 2 }}
            value={searchPlayer}
            onChange={e => setSearchPlayer(e.target.value)}
          />
          {loadingPlayers ? (
            <Typography>Lade Spieler ...</Typography>
          ) : (
            <List sx={{ bgcolor: '#1a232b', borderRadius: 2, maxHeight: 400, overflow: 'auto' }}>
              {filteredPlayers.slice(0, 20).map(player => (
                <ListItem
                  key={player.id}
                  secondaryAction={
                    <Button variant="outlined" size="small" onClick={() => setSelectedPlayer(player)}>
                      Bearbeiten
                    </Button>
                  }
                  sx={{ borderBottom: '1px solid #283346' }}
                >
                  <ListItemText
                    primary={
                      <>
                        <span style={{ fontWeight: 600 }}>{player.vorname} {player.nachname}</span>
                        {' '}– {player.position} – {player.teamId} {' '}
                        <span style={{ fontSize: 20 }}>{flagEmoji(player.nationalitaet)}</span>
                      </>
                    }
                    secondary={`Stärke: ${player.staerke} • Geb.: ${player.geburtsdatum} • ${player.nationalitaet}`}
                  />
                </ListItem>
              ))}
              {filteredPlayers.length === 0 && (
                <Typography sx={{ p: 2 }}>Keine Spieler gefunden.</Typography>
              )}
            </List>
          )}

          {/* MODAL für Spieler */}
          <Dialog open={!!selectedPlayer} onClose={() => setSelectedPlayer(null)} maxWidth="sm" fullWidth>
            <DialogTitle>Spieler bearbeiten</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField label="Vorname" value={selectedPlayer?.vorname || ""} onChange={e => handlePlayerModalChange('vorname', e.target.value)} />
              <TextField label="Nachname" value={selectedPlayer?.nachname || ""} onChange={e => handlePlayerModalChange('nachname', e.target.value)} />
              <TextField label="Nationalität" value={selectedPlayer?.nationalitaet || ""} onChange={e => handlePlayerModalChange('nationalitaet', e.target.value)} select>
                {["Deutschland","Italien","Frankreich","England","Spanien","Portugal"].map((nation) => (
                  <MenuItem key={nation} value={nation}>{flagEmoji(nation)} {nation}</MenuItem>
                ))}
              </TextField>
              <TextField label="Geburtsdatum" value={selectedPlayer?.geburtsdatum || ""} onChange={e => handlePlayerModalChange('geburtsdatum', e.target.value)} type="date" InputLabelProps={{ shrink: true }} />
              <TextField label="Position" value={selectedPlayer?.position || ""} onChange={e => handlePlayerModalChange('position', e.target.value)} />
              <TextField label="Team ID" value={selectedPlayer?.teamId || ""} onChange={e => handlePlayerModalChange('teamId', e.target.value)} />
              <TextField label="Stärke" type="number" value={selectedPlayer?.staerke || ""} onChange={e => handlePlayerModalChange('staerke', parseInt(e.target.value) || 0)} />
              <TextField label="Marktwert" type="number" value={selectedPlayer?.marktwert || ""} onChange={e => handlePlayerModalChange('marktwert', parseInt(e.target.value) || 0)} />
              <TextField label="Avatar URL" value={selectedPlayer?.avatarUrl || ""} onChange={e => handlePlayerModalChange('avatarUrl', e.target.value)} />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedPlayer(null)} color="secondary">Abbrechen</Button>
              <Button onClick={handlePlayerModalSave} variant="contained" color="primary">Speichern</Button>
            </DialogActions>
          </Dialog>
        </TabPanel>

        {/* Tab 2: Transfers genehmigen */}
        <TabPanel value={tab} index={1}>
          <Typography variant="h6" gutterBottom>Transfers mit Admin-Freigabe</Typography>
          {pendingTransfers.length === 0 ? (
            <Alert severity="info">Keine Transfers zur Freigabe vorhanden.</Alert>
          ) : (
            pendingTransfers.map(t => (
              <Box key={t.id} sx={{ border: '1px solid #ccc', borderRadius: 2, mb: 2, p: 2 }}>
                <Typography><b>Transfer ID:</b> {t.id}</Typography>
                <Typography><b>Von Team:</b> {t.proposingTeamId}</Typography>
                <Typography><b>An Team:</b> {t.receivingTeamId}</Typography>
                <Button variant="contained" color="success" sx={{ mr: 2, mt: 1 }} onClick={() => handleApprove(t)}>Genehmigen</Button>
                <Button variant="outlined" color="error" sx={{ mt: 1 }} onClick={() => handleReject(t.id)}>Ablehnen</Button>
              </Box>
            ))
          )}
        </TabPanel>

        {/* Tab 3: Teams bearbeiten */}
        <TabPanel value={tab} index={2}>
          <Typography variant="h6" gutterBottom>Teams suchen und bearbeiten</Typography>
          <TextField
            label="Teams suchen (Name, Liga, Land)"
            variant="outlined"
            size="small"
            fullWidth
            sx={{ mb: 2 }}
            value={searchTeam}
            onChange={e => setSearchTeam(e.target.value)}
          />
          {loadingTeams ? (
            <Typography>Lade Teams ...</Typography>
          ) : (
            <List sx={{ bgcolor: '#1a232b', borderRadius: 2, maxHeight: 400, overflow: 'auto' }}>
              {filteredTeams.slice(0, 20).map(team => (
                <ListItem
                  key={team.id}
                  secondaryAction={
                    <Button variant="outlined" size="small" onClick={() => setSelectedTeam(team)}>
                      Bearbeiten
                    </Button>
                  }
                  sx={{ borderBottom: '1px solid #283346' }}
                >
                  <ListItemText
                    primary={
                      <>
                        <span style={{ fontWeight: 600 }}>{team.name}</span>
                        {' '}– {team.liga} – {team.land} {' '}
                        <span style={{ fontSize: 20 }}>{flagEmoji(team.land)}</span>
                      </>
                    }
                    secondary={`Manager: ${team.managerUid || "Kein Manager"}`}
                  />
                </ListItem>
              ))}
              {filteredTeams.length === 0 && (
                <Typography sx={{ p: 2 }}>Keine Teams gefunden.</Typography>
              )}
            </List>
          )}

          {/* MODAL für Team */}
          <Dialog open={!!selectedTeam} onClose={() => setSelectedTeam(null)} maxWidth="sm" fullWidth>
            <DialogTitle>Team bearbeiten</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField label="Name" value={selectedTeam?.name || ""} onChange={e => handleTeamModalChange('name', e.target.value)} />
              <TextField label="Land" value={selectedTeam?.land || ""} onChange={e => handleTeamModalChange('land', e.target.value)} select>
                {["Deutschland","Italien","Frankreich","England","Spanien","Portugal"].map((nation) => (
                  <MenuItem key={nation} value={nation}>{flagEmoji(nation)} {nation}</MenuItem>
                ))}
              </TextField>
              <TextField label="Liga" value={selectedTeam?.liga || ""} onChange={e => handleTeamModalChange('liga', e.target.value)} />
              <TextField label="Logo URL" value={selectedTeam?.logoUrl || ""} onChange={e => handleTeamModalChange('logoUrl', e.target.value)} />
              <TextField label="Budget" type="number" value={selectedTeam?.budget || ""} onChange={e => handleTeamModalChange('budget', parseInt(e.target.value) || 0)} />
              <TextField label="Manager UID" value={selectedTeam?.managerUid || ""} onChange={e => handleTeamModalChange('managerUid', e.target.value)} />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedTeam(null)} color="secondary">Abbrechen</Button>
              <Button onClick={handleTeamModalSave} variant="contained" color="primary">Speichern</Button>
            </DialogActions>
          </Dialog>
        </TabPanel>
      </Paper>
    </Box>
  );
};

export default AdminPage;
