// src/pages/AdminPage.js
import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Tabs, Tab, Typography, TextField, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, MenuItem,
  List, ListItem, ListItemAvatar, Avatar, ListItemText, Alert, Divider
} from '@mui/material';
import {
  collection, getDocs, doc, updateDoc, query, where, onSnapshot
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';

// --- Flaggen-Helper (Mapping von Landesnamen auf Emojis)
const flagEmoji = country => {
  const flags = {
    Deutschland: '🇩🇪',
    Italien: '🇮🇹',
    Frankreich: '🇫🇷',
    England: '🇬🇧',
    Spanien: '🇪🇸',
    Portugal: '🇵🇹',
  };
  return flags[country] || '🏳️';
};

function TabPanel({ children, value, index, ...other }) {
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState(0);

  // --- Spieler & Teams Mappings ---
  const [playersById, setPlayersById] = useState({});
  const [teamsById, setTeamsById] = useState({});

  // --- Spieler bearbeiten ---
  const [players, setPlayers] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [searchPlayer, setSearchPlayer] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  // --- Transfers genehmigen ---
  const [pendingTransfers, setPendingTransfers] = useState([]);

  // --- Teams bearbeiten ---
  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [searchTeam, setSearchTeam] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);

  // 1) Lade alle Spieler & Teams einmalig
  useEffect(() => {
    const loadAll = async () => {
      // Spieler
      const pSnap = await getDocs(collection(db, 'players'));
      const pMap = {};
      pSnap.docs.forEach(d => {
        const pd = d.data();
        pMap[d.id] = {
          id: d.id,
          vorname: pd.vorname,
          nachname: pd.nachname,
          name: `${pd.vorname} ${pd.nachname}`,
        };
      });
      setPlayersById(pMap);

      // Teams
      const tSnap = await getDocs(collection(db, 'teams'));
      const tMap = {};
      tSnap.docs.forEach(d => {
        const td = d.data();
        tMap[d.id] = { id: d.id, name: td.name, land: td.land };
      });
      setTeamsById(tMap);
    };
    loadAll();
  }, []);

  // 2) Spieler laden, wenn Tab 0 aktiv
  useEffect(() => {
    if (tab !== 0) return;
    const fetchPlayers = async () => {
      setLoadingPlayers(true);
      const snap = await getDocs(collection(db, 'players'));
      setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingPlayers(false);
    };
    fetchPlayers();
  }, [tab]);

  // 3) Teams laden, wenn Tab 2 aktiv
  useEffect(() => {
    if (tab !== 2) return;
    const fetchTeams = async () => {
      setLoadingTeams(true);
      const snap = await getDocs(collection(db, 'teams'));
      setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingTeams(false);
    };
    fetchTeams();
  }, [tab]);

  // 4) Pending-Transfers laden, wenn Tab 1 aktiv
  useEffect(() => {
    if (tab !== 1) return;
    const q = query(
      collection(db, 'transfers'),
      where('status', '==', 'acceptedByUser')
    );
    const unsub = onSnapshot(q, snap => {
      setPendingTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [tab]);

  // --- Filtered Lists ---
  const filteredPlayers = players.filter(p =>
    `${p.vorname} ${p.nachname}`.toLowerCase().includes(searchPlayer.toLowerCase())
    || (p.position || '').toLowerCase().includes(searchPlayer.toLowerCase())
    || (p.nationalitaet || '').toLowerCase().includes(searchPlayer.toLowerCase())
  );

  const filteredTeams = teams.filter(t =>
    t.name.toLowerCase().includes(searchTeam.toLowerCase())
    || (t.liga || '').toLowerCase().includes(searchTeam.toLowerCase())
    || (t.land || '').toLowerCase().includes(searchTeam.toLowerCase())
  );

  // --- Handlers Spieler-Modal ---
  const handlePlayerChange = (field, value) =>
    setSelectedPlayer(p => ({ ...p, [field]: value }));

  const handlePlayerSave = async () => {
    if (!selectedPlayer) return;
    const { id, ...rest } = selectedPlayer;
    try {
      await updateDoc(doc(db, 'players', id), rest);
      toast.success('Spieler gespeichert!');
      setSelectedPlayer(null);
      // reload
      const snap = await getDocs(collection(db, 'players'));
      setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {
      toast.error('Fehler beim Speichern.');
    }
  };

  // --- Handlers Team-Modal ---
  const handleTeamChange = (field, value) =>
    setSelectedTeam(t => ({ ...t, [field]: value }));

  const handleTeamSave = async () => {
    if (!selectedTeam) return;
    const { id, ...rest } = selectedTeam;
    try {
      await updateDoc(doc(db, 'teams', id), rest);
      toast.success('Team gespeichert!');
      setSelectedTeam(null);
      // reload
      const snap = await getDocs(collection(db, 'teams'));
      setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {
      toast.error('Fehler beim Speichern.');
    }
  };

  // --- Handlers Transfers ---
  const handleApprove = async transfer => {
    const execFn = httpsCallable(functions, 'executeTransfer');
    try {
      await execFn({ transferId: transfer.id });
      toast.success('Transfer ausgeführt!');
    } catch {
      toast.error('Fehler bei Ausführung.');
    }
  };
  const handleReject = async id => {
    try {
      await updateDoc(doc(db, 'transfers', id), { status: 'rejectedByAdmin' });
      toast.info('Transfer abgelehnt.');
    } catch {
      toast.error('Fehler beim Ablehnen.');
    }
  };

  // --- Auth-Check ---
  if (!user?.isAdmin) {
    return (
      <Typography sx={{ mt: 5, textAlign: 'center' }} color="error">
        Zugriff verweigert. Nur für Admins!
      </Typography>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', mt: 5 }}>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Typography variant="h4" sx={{ mb: 2 }}>
          Admin-Dashboard
        </Typography>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          indicatorColor="primary"
          textColor="primary"
        >
          <Tab label="Spieler bearbeiten" />
          <Tab label="Transfers genehmigen" />
          <Tab label="Teams bearbeiten" />
        </Tabs>

        {/* Tab 0: Spieler */}
        <TabPanel value={tab} index={0}>
          <TextField
            label="Spieler suchen"
            variant="outlined"
            size="small"
            fullWidth
            sx={{ mb: 2 }}
            value={searchPlayer}
            onChange={e => setSearchPlayer(e.target.value)}
          />
          {loadingPlayers ? (
            <Typography>Lade Spieler…</Typography>
          ) : (
            <List sx={{ maxHeight: 400, overflow: 'auto' }}>
              {filteredPlayers.map(p => (
                <React.Fragment key={p.id}>
                  <ListItem
                    secondaryAction={
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => setSelectedPlayer(p)}
                      >
                        Bearbeiten
                      </Button>
                    }
                  >
                    <ListItemText
                      primary={`${p.vorname} ${p.nachname} – ${p.position}`}
                      secondary={`${flagEmoji(p.nationalitaet)} ${p.nationalitaet}`}
                    />
                  </ListItem>
                  <Divider />
                </React.Fragment>
              ))}
              {filteredPlayers.length === 0 && (
                <Typography sx={{ p: 2 }}>Keine Spieler gefunden.</Typography>
              )}
            </List>
          )}
          <Dialog
            open={!!selectedPlayer}
            onClose={() => setSelectedPlayer(null)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle>Spieler bearbeiten</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                label="Vorname"
                value={selectedPlayer?.vorname || ''}
                onChange={e => handlePlayerChange('vorname', e.target.value)}
              />
              <TextField
                label="Nachname"
                value={selectedPlayer?.nachname || ''}
                onChange={e => handlePlayerChange('nachname', e.target.value)}
              />
              <TextField
                label="Nationalität"
                select
                value={selectedPlayer?.nationalitaet || ''}
                onChange={e => handlePlayerChange('nationalitaet', e.target.value)}
              >
                {Object.keys({ Deutschland:0, Italien:0, Frankreich:0, England:0, Spanien:0, Portugal:0 }).map(c => (
                  <MenuItem key={c} value={c}>{flagEmoji(c)} {c}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="Position"
                value={selectedPlayer?.position || ''}
                onChange={e => handlePlayerChange('position', e.target.value)}
              />
              <TextField
                label="Stärke"
                type="number"
                value={selectedPlayer?.staerke || ''}
                onChange={e => handlePlayerChange('staerke', parseInt(e.target.value, 10) || 0)}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedPlayer(null)}>Abbrechen</Button>
              <Button onClick={handlePlayerSave} variant="contained">Speichern</Button>
            </DialogActions>
          </Dialog>
        </TabPanel>

        {/* Tab 1: Transfers */}
        <TabPanel value={tab} index={1}>
          {pendingTransfers.length === 0 ? (
            <Alert severity="info">Keine Transfers zur Freigabe.</Alert>
          ) : (
            pendingTransfers.map(t => (
              <Box key={t.id} sx={{ border: '1px solid #ccc', p: 2, borderRadius: 2, mb: 2 }}>
                <Typography><b>Von:</b> {teamsById[t.fromTeamId]?.name || t.fromTeamId}</Typography>
                <Typography><b>An:</b> {teamsById[t.toTeamId]?.name || t.toTeamId}</Typography>
                <Typography>
                  <b>Deine Spieler:</b>{' '}
                  {t.myPlayers.map(id => playersById[id]?.name || id).join(', ') || '-'} + {t.myAmount}€
                </Typography>
                <Typography>
                  <b>Gegner-Spieler:</b>{' '}
                  {t.oppPlayers.map(id => playersById[id]?.name || id).join(', ') || '-'} + {t.oppAmount}€
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <Button
                    variant="contained"
                    color="success"
                    sx={{ mr: 1 }}
                    onClick={() => handleApprove(t)}
                  >
                    Genehmigen
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => handleReject(t.id)}
                  >
                    Ablehnen
                  </Button>
                </Box>
              </Box>
            ))
          )}
        </TabPanel>

        {/* Tab 2: Teams */}
        <TabPanel value={tab} index={2}>
          <TextField
            label="Team suchen"
            variant="outlined"
            size="small"
            fullWidth
            sx={{ mb: 2 }}
            value={searchTeam}
            onChange={e => setSearchTeam(e.target.value)}
          />
          {loadingTeams ? (
            <Typography>Lade Teams…</Typography>
          ) : (
            <List sx={{ maxHeight: 400, overflow: 'auto' }}>
              {filteredTeams.map(t => (
                <React.Fragment key={t.id}>
                  <ListItem
                    secondaryAction={
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => setSelectedTeam(t)}
                      >
                        Bearbeiten
                      </Button>
                    }
                  >
                    <ListItemAvatar>
                      <Avatar>{flagEmoji(t.land)}</Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={`${t.name} – ${t.liga}`}
                      secondary={t.land}
                    />
                  </ListItem>
                  <Divider />
                </React.Fragment>
              ))}
              {filteredTeams.length === 0 && (
                <Typography sx={{ p: 2 }}>Keine Teams gefunden.</Typography>
              )}
            </List>
          )}
          <Dialog
            open={!!selectedTeam}
            onClose={() => setSelectedTeam(null)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle>Team bearbeiten</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                label="Name"
                value={selectedTeam?.name || ''}
                onChange={e => handleTeamChange('name', e.target.value)}
              />
              <TextField
                label="Land"
                select
                value={selectedTeam?.land || ''}
                onChange={e => handleTeamChange('land', e.target.value)}
              >
                {Object.keys({ Deutschland:0, Italien:0, Frankreich:0, England:0, Spanien:0, Portugal:0 }).map(c => (
                  <MenuItem key={c} value={c}>{flagEmoji(c)} {c}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="Liga"
                value={selectedTeam?.liga || ''}
                onChange={e => handleTeamChange('liga', e.target.value)}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedTeam(null)}>Abbrechen</Button>
              <Button onClick={handleTeamSave} variant="contained">Speichern</Button>
            </DialogActions>
          </Dialog>
        </TabPanel>
      </Paper>
    </Box>
  );
}
