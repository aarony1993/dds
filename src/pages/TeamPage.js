import React, { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { collection, query, where, getDocs } from "firebase/firestore";

// Flaggen-Mapping (gerne erweitern)
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

const positionGroupLabels = {
  "TOR": "Torwart",
  "DEF": "Abwehr",
  "MID": "Mittelfeld",
  "ATT": "Sturm"
};

// Für Sortierung
const positionGroupOrder = {
  "TOR": 1,
  "DEF": 2,
  "MID": 3,
  "ATT": 4
};

export default function TeamPage() {
  const { user } = useAuth();
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  useEffect(() => {
    const fetchPlayers = async () => {
      if (!user?.teamId) return;
      const q = query(collection(db, "players"), where("teamId", "==", user.teamId));
      const snap = await getDocs(q);
      setPlayers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchPlayers();
  }, [user]);

  // Nach PositionGroup sortieren (TW → DEF → MID → ATT)
  const sortedPlayers = [...players].sort((a, b) => {
    const orderA = positionGroupOrder[a.positionGroup] || 99;
    const orderB = positionGroupOrder[b.positionGroup] || 99;
    if (orderA !== orderB) return orderA - orderB;
    // Innerhalb der Gruppe optional nach Detail-Position oder Name sortieren
    if (a.position !== b.position) return a.position.localeCompare(b.position);
    return (a.nachname + a.vorname).localeCompare(b.nachname + b.vorname);
  });

  return (
    <Box sx={{ maxWidth: 900, mx: "auto", my: 5 }}>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 3, color: "primary.main" }}>Mein Kader</Typography>

      <Paper elevation={6} sx={{ bgcolor: "#27344b", p: 2 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: "#19202c" }}>
              <TableCell sx={{ color: "#ffc447", fontWeight: 700 }}>#</TableCell>
              <TableCell sx={{ color: "#ffc447", fontWeight: 700 }}>Avatar</TableCell>
              <TableCell sx={{ color: "#ffc447", fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ color: "#ffc447", fontWeight: 700 }}>Position</TableCell>
              <TableCell sx={{ color: "#ffc447", fontWeight: 700 }}>Nation</TableCell>
              <TableCell sx={{ color: "#ffc447", fontWeight: 700 }}>Marktwert</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedPlayers.map((p) => (
              <TableRow
                hover
                key={p.id}
                sx={{ cursor: "pointer" }}
                onClick={() => setSelectedPlayer(p)}
              >
                <TableCell sx={{ color: "#fff" }}>{p.spielernummer}</TableCell>
                <TableCell>
                  <Avatar src={p.avatarUrl} sx={{ width: 40, height: 40 }}>
                    {p.vorname?.[0]}
                  </Avatar>
                </TableCell>
                <TableCell sx={{ color: "#fff", fontWeight: 500 }}>
                  {p.vorname} {p.nachname}
                </TableCell>
                <TableCell sx={{ color: "#fff" }}>
                  {positionGroupLabels[p.positionGroup] || p.positionGroup}
                </TableCell>
                <TableCell sx={{ color: "#fff" }}>
                  {flagEmoji(p.nationalitaet)} {p.nationalitaet}
                </TableCell>
                <TableCell sx={{ color: "#fff" }}>
                  {p.marktwert?.toLocaleString("de-DE")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {sortedPlayers.length === 0 &&
          <Typography sx={{ color: "#ffc447", mt: 3, textAlign: "center" }}>
            Keine Spieler gefunden.
          </Typography>
        }
      </Paper>

      {/* Spieler-Detailmodal */}
      <Dialog open={!!selectedPlayer} onClose={() => setSelectedPlayer(null)} maxWidth="xs" fullWidth>
        {selectedPlayer && (
          <>
            <DialogTitle sx={{ bgcolor: "#202c3b", color: "#ffc447", fontWeight: 800 }}>
              {selectedPlayer.vorname} {selectedPlayer.nachname}
            </DialogTitle>
            <DialogContent sx={{ bgcolor: "#202c3b" }}>
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", my: 2 }}>
                <Avatar src={selectedPlayer.avatarUrl} sx={{ width: 100, height: 100, mb: 2 }} />
                <Typography sx={{ fontWeight: 700, fontSize: 20, color: "#ffc447" }}>
                  {flagEmoji(selectedPlayer.nationalitaet)} {selectedPlayer.nationalitaet}
                </Typography>
                <Typography sx={{ color: "#fff", mb: 1 }}>
                  {positionGroupLabels[selectedPlayer.positionGroup] || selectedPlayer.positionGroup}
                </Typography>
                <Typography sx={{ color: "#fff" }}>
                  Geburtsdatum: {selectedPlayer.geburtsdatum}
                </Typography>
                <Typography sx={{ color: "#fff" }}>
                  Marktwert: {selectedPlayer.marktwert?.toLocaleString("de-DE")} €
                </Typography>
                {/* Stärke kann hier noch sichtbar bleiben, ggf. auskommentieren */}
                {/* <Typography sx={{ color: "#fff" }}>
                  Stärke: {selectedPlayer.staerke}
                </Typography> */}
                <Typography sx={{ color: "#fff" }}>
                  Spieler-ID: {selectedPlayer.id}
                </Typography>
              </Box>
            </DialogContent>
            <DialogActions sx={{ bgcolor: "#202c3b" }}>
              <Button onClick={() => setSelectedPlayer(null)} color="warning" variant="contained">
                Schließen
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
