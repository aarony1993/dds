import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import {
  Box,
  Typography,
  Autocomplete,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  List,
  ListItem,
  ListItemText,
  Grid,
  InputAdornment,
} from '@mui/material';

function TransfermarktPage() {
  const { currentUser } = useAuth();
  const [teams, setTeams] = useState([]);
  const [myTeamId, setMyTeamId] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [ownPlayers, setOwnPlayers] = useState([]);
  const [otherPlayers, setOtherPlayers] = useState([]);
  const [selectedOwnPlayers, setSelectedOwnPlayers] = useState([]);
  const [selectedOtherPlayers, setSelectedOtherPlayers] = useState([]);
  const [ownMoney, setOwnMoney] = useState('');
  const [otherMoney, setOtherMoney] = useState('');
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  // Eigene Team-ID laden
  useEffect(() => {
    if (!currentUser) return;
    getDocs(query(collection(db, "teams"), where("managerUid", "==", currentUser.uid)))
      .then(snap => {
        if (!snap.empty) setMyTeamId(snap.docs[0].id);
      });
  }, [currentUser]);

  // Lade alle Teams
  useEffect(() => {
    getDocs(collection(db, 'teams')).then(snap => {
      setTeams(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, []);

  // Lade Spielerlisten (eigene & gegnerische), wenn ein Team ausgewählt wurde
  useEffect(() => {
    if (!selectedTeam || !myTeamId) return;
    setLoadingPlayers(true);
    Promise.all([
      getDocs(query(collection(db, "players"), where("teamId", "==", selectedTeam.id))),
      getDocs(query(collection(db, "players"), where("teamId", "==", myTeamId)))
    ]).then(([otherSnap, ownSnap]) => {
      setOtherPlayers(otherSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setOwnPlayers(ownSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setSelectedOwnPlayers([]);
      setSelectedOtherPlayers([]);
      setOwnMoney('');
      setOtherMoney('');
      setLoadingPlayers(false);
    });
  }, [selectedTeam, myTeamId]);

  const handleSendOffer = () => {
    // Hier würdest du das Angebot in Firestore schreiben!
    // z.B.: await addDoc(collection(db, "transfers"), { ... });
    setOpenDialog(false);
    alert("Angebot gesendet (hier in Firestore eintragen)");
  };

  return (
    <Box sx={{ maxWidth: 680, mx: "auto", mt: 5 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 800, color: "primary.main" }}>
        Transfermarkt
      </Typography>

      <Autocomplete
        options={teams}
        getOptionLabel={option => option.name || "Unbekannter Verein"}
        sx={{ mb: 2 }}
        onChange={(_, value) => setSelectedTeam(value)}
        renderInput={params => (
          <TextField {...params} label="Verein suchen..." variant="outlined" />
        )}
        isOptionEqualToValue={(option, value) => option.id === value.id}
      />

      <Button
        variant="contained"
        color="primary"
        disabled={!selectedTeam}
        onClick={() => setOpenDialog(true)}
        sx={{ mt: 2, fontWeight: 700 }}
      >
        Angebot an {selectedTeam ? selectedTeam.name : "..." } machen
      </Button>

      {/* MODALES ANGEBOTS-FENSTER */}
      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        fullWidth
        maxWidth="md"
        PaperProps={{
          sx: {
            bgcolor: "background.paper",
            color: "text.primary",
            borderRadius: 3,
            boxShadow: "0 4px 32px #000a",
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Transferangebot an {selectedTeam?.name}
        </DialogTitle>
        <DialogContent>
          {loadingPlayers ? (
            <Typography>Lade Spieler...</Typography>
          ) : (
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" sx={{ mb: 1, color: "primary.main" }}>Deine Spieler</Typography>
                <List dense sx={{
                  maxHeight: 220,
                  overflow: "auto",
                  bgcolor: "#162138",
                  borderRadius: 2,
                  color: "text.primary"
                }}>
                  {ownPlayers.map(player => (
                    <ListItem key={player.id} dense button
                      onClick={() =>
                        setSelectedOwnPlayers(arr =>
                          arr.includes(player.id)
                            ? arr.filter(id => id !== player.id)
                            : [...arr, player.id]
                        )
                      }>
                      <Checkbox checked={selectedOwnPlayers.includes(player.id)} sx={{ color: "primary.main" }} />
                      <ListItemText primary={player.name} secondary={player.positionKey || player.position} />
                    </ListItem>
                  ))}
                  {ownPlayers.length === 0 && (
                    <ListItem>
                      <ListItemText primary="(Keine Spieler gefunden)" />
                    </ListItem>
                  )}
                </List>
                <TextField
                  label="Dein Geldbetrag"
                  value={ownMoney}
                  onChange={e => setOwnMoney(e.target.value.replace(/[^0-9]/g, ''))}
                  type="number"
                  fullWidth
                  sx={{
                    mt: 2,
                    input: { color: "text.primary", fontWeight: 700 },
                    label: { color: "primary.main" },
                    bgcolor: "#162138",
                    borderRadius: 2
                  }}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">€</InputAdornment>,
                    sx: { color: "text.primary" }
                  }}
                  InputLabelProps={{
                    style: { color: "#ffbc29" }
                  }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" sx={{ mb: 1, color: "primary.main" }}>{selectedTeam?.name} – Spieler</Typography>
                <List dense sx={{
                  maxHeight: 220,
                  overflow: "auto",
                  bgcolor: "#162138",
                  borderRadius: 2,
                  color: "text.primary"
                }}>
                  {otherPlayers.map(player => (
                    <ListItem key={player.id} dense button
                      onClick={() =>
                        setSelectedOtherPlayers(arr =>
                          arr.includes(player.id)
                            ? arr.filter(id => id !== player.id)
                            : [...arr, player.id]
                        )
                      }>
                      <Checkbox checked={selectedOtherPlayers.includes(player.id)} sx={{ color: "primary.main" }} />
                      <ListItemText primary={player.name} secondary={player.positionKey || player.position} />
                    </ListItem>
                  ))}
                  {otherPlayers.length === 0 && (
                    <ListItem>
                      <ListItemText primary="(Keine Spieler gefunden)" />
                    </ListItem>
                  )}
                </List>
                <TextField
                  label="Geldbetrag gegnerischer Verein"
                  value={otherMoney}
                  onChange={e => setOtherMoney(e.target.value.replace(/[^0-9]/g, ''))}
                  type="number"
                  fullWidth
                  sx={{
                    mt: 2,
                    input: { color: "text.primary", fontWeight: 700 },
                    label: { color: "primary.main" },
                    bgcolor: "#162138",
                    borderRadius: 2
                  }}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">€</InputAdornment>,
                    sx: { color: "text.primary" }
                  }}
                  InputLabelProps={{
                    style: { color: "#ffbc29" }
                  }}
                />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)} color="primary" variant="outlined" sx={{ fontWeight: 700 }}>
            Abbrechen
          </Button>
          <Button
            onClick={handleSendOffer}
            variant="contained"
            color="primary"
            sx={{ fontWeight: 700 }}
            disabled={loadingPlayers || (!selectedOwnPlayers.length && !ownMoney && !selectedOtherPlayers.length && !otherMoney)}
          >
            Angebot absenden
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default TransfermarktPage;
