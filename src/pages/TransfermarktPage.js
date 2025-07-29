// src/pages/TransfermarktPage.js
import React, { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
  Autocomplete,
  Checkbox,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Grid
} from "@mui/material";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

export default function TransfermarktPage() {
  const { user } = useAuth();

  // Teams
  const [allTeams, setAllTeams]         = useState([]);
  const [searchValue, setSearchValue]   = useState("");
  const [selectedTeam, setSelectedTeam] = useState(null);

  // Spieler für Angebot
  const [myPlayers, setMyPlayers]       = useState([]);
  const [oppPlayers, setOppPlayers]     = useState([]);

  // Dialog-State
  const [offerOpen, setOfferOpen]       = useState(false);
  const [selMy, setSelMy]               = useState([]);
  const [selOpp, setSelOpp]             = useState([]);
  const [myAmt, setMyAmt]               = useState("");
  const [oppAmt, setOppAmt]             = useState("");

  // Snackbar
  const [snack, setSnack]               = useState({ open: false, msg: "", type: "success" });

  // 1) Lade alle Teams für Autocomplete
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "teams"));
      setAllTeams(
        snap.docs.map(d => ({
          id: d.id,
          label: d.data().name,
          nameLower: (d.data().nameLower || d.data().name).toLowerCase()
        }))
      );
    })();
  }, []);

  // 2) Öffne Dialog und lade Spieler beider Teams
  const openDialog = async () => {
    if (!user?.teamId || !selectedTeam) return;
    setSelMy([]);
    setSelOpp([]);
    setMyAmt("");
    setOppAmt("");

    // Eigene Spieler
    const mySnap = await getDocs(
      query(collection(db, "players"), where("teamId", "==", user.teamId))
    );
    setMyPlayers(mySnap.docs.map(d => ({ id: d.id, ...d.data() })));

    // Spieler des ausgewählten Vereins
    const oppSnap = await getDocs(
      query(collection(db, "players"), where("teamId", "==", selectedTeam.id))
    );
    setOppPlayers(oppSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    setOfferOpen(true);
  };

  // 3) Angebot direkt in Firestore schreiben
  const sendOffer = async () => {
    if (!user?.teamId || !selectedTeam) return;
    try {
      await addDoc(collection(db, "transfers"), {
        fromTeamId: user.teamId,
        toTeamId: selectedTeam.id,
        myPlayers: selMy,
        oppPlayers: selOpp,
        myAmount:  Number(myAmt)  || 0,
        oppAmount: Number(oppAmt) || 0,
        status: "pending",
        createdAt: serverTimestamp()
      });
      setSnack({ open: true, msg: "Angebot gesendet!", type: "success" });
      setOfferOpen(false);
    } catch (e) {
      setSnack({ open: true, msg: e.message || "Fehler beim Senden", type: "error" });
    }
  };

  // Filter für Vereins-Suche (case-insensitive)
  const filteredTeams = searchValue.trim() === ""
    ? []
    : allTeams.filter(t => t.nameLower.includes(searchValue.toLowerCase()));

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Transfermarkt
      </Typography>

      {/* Vereinssuche */}
      <Paper sx={{ p: 3, mb: 3, maxWidth: 540, mx: "auto", bgcolor: "#202c3b" }}>
        <Autocomplete
          freeSolo
          options={filteredTeams}
          getOptionLabel={o => o.label}
          value={selectedTeam}
          onChange={(_, v) => setSelectedTeam(v)}
          inputValue={searchValue}
          onInputChange={(_, v) => setSearchValue(v)}
          renderInput={params => (
            <TextField
              {...params}
              label="Verein suchen..."
              variant="outlined"
              size="medium"
              sx={{
                bgcolor: "#1a232b",
                input: { color: "#ffc447", fontWeight: 700 },
                label: { color: "#ffc447" },
                borderRadius: 2
              }}
            />
          )}
        />
        <Button
          fullWidth
          variant="contained"
          color="warning"
          disabled={!selectedTeam}
          onClick={openDialog}
          sx={{ mt: 2, fontWeight: 700 }}
        >
          Angebot an {selectedTeam?.label} machen
        </Button>
      </Paper>

      {/* Angebot-Dialog */}
      <Dialog open={offerOpen} onClose={() => setOfferOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontSize: 26 }}>
          Transferangebot an {selectedTeam?.label}
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: "#283047" }}>
          <Grid container spacing={4}>
            {/* Eigene Spieler */}
            <Grid lg={6}>
              <Typography sx={{ color: "#ffc447", fontWeight: 700 }}>Deine Spieler</Typography>
              <List sx={{ maxHeight: 240, overflowY: "auto", bgcolor: "#202c3b", p: 1 }}>
                {myPlayers.map(p => (
                  <ListItem
                    key={p.id}
                    disableGutters
                    secondaryAction={
                      <Checkbox
                        checked={selMy.includes(p.id)}
                        onChange={e => {
                          if (e.target.checked) setSelMy([...selMy, p.id]);
                          else setSelMy(selMy.filter(id => id !== p.id));
                        }}
                      />
                    }
                  >
                    <ListItemAvatar>
                      <Avatar src={p.avatarUrl || "/dummy-player.png"} />
                    </ListItemAvatar>
                    <ListItemText
                      primary={<span style={{ fontWeight: 600 }}>{p.vorname} {p.nachname}</span>}
                      secondary={p.positionGroup}
                    />
                  </ListItem>
                ))}
                {myPlayers.length === 0 && (
                  <Typography sx={{ color: "#fff", p: 2 }}>Keine Spieler gefunden.</Typography>
                )}
              </List>
              <TextField
                fullWidth
                label="Dein Geldbetrag"
                type="number"
                value={myAmt}
                onChange={e => setMyAmt(e.target.value)}
                InputProps={{ endAdornment: <span>€</span> }}
                sx={{ mt: 2 }}
              />
            </Grid>

            {/* Gegnerische Spieler */}
            <Grid lg={6}>
              <Typography sx={{ color: "#ffc447", fontWeight: 700 }}>
                {selectedTeam?.label} – Spieler
              </Typography>
              <List sx={{ maxHeight: 240, overflowY: "auto", bgcolor: "#202c3b", p: 1 }}>
                {oppPlayers.map(p => (
                  <ListItem
                    key={p.id}
                    disableGutters
                    secondaryAction={
                      <Checkbox
                        checked={selOpp.includes(p.id)}
                        onChange={e => {
                          if (e.target.checked) setSelOpp([...selOpp, p.id]);
                          else setSelOpp(selOpp.filter(id => id !== p.id));
                        }}
                      />
                    }
                  >
                    <ListItemAvatar>
                      <Avatar src={p.avatarUrl || "/dummy-player.png"} />
                    </ListItemAvatar>
                    <ListItemText
                      primary={<span style={{ fontWeight: 600 }}>{p.vorname} {p.nachname}</span>}
                      secondary={p.positionGroup}
                    />
                  </ListItem>
                ))}
                {oppPlayers.length === 0 && (
                  <Typography sx={{ color: "#fff", p: 2 }}>Keine Spieler gefunden.</Typography>
                )}
              </List>
              <TextField
                fullWidth
                label="Geldbetrag gegnerischer Verein"
                type="number"
                value={oppAmt}
                onChange={e => setOppAmt(e.target.value)}
                InputProps={{ endAdornment: <span>€</span> }}
                sx={{ mt: 2 }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ bgcolor: "#283047" }}>
          <Button onClick={() => setOfferOpen(false)} color="inherit" variant="outlined" sx={{ fontWeight: 700 }}>
            ABBRECHEN
          </Button>
          <Button onClick={sendOffer} color="warning" variant="contained" sx={{ fontWeight: 700 }}>
            ANGEBOT ABSENDEN
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack({ ...snack, open: false })}
        message={snack.msg}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        ContentProps={{
          sx: {
            bgcolor: snack.type === "success" ? "#283e1b" : "#4d2323",
            color: "#fff",
            fontWeight: 600
          }
        }}
      />
    </Box>
  );
}
