// src/components/Navbar.js
import React, { useState, useEffect } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Badge,
} from "@mui/material";

function Navbar() {
  const { user } = useAuth();
  const [liveGameId, setLiveGameId] = useState(null);
  const [teamId, setTeamId] = useState(null);

  // Team des Users aus dem Auth-Objekt lesen
  useEffect(() => {
    if (!user?.teamId) {
      setTeamId(null);
      return;
    }
    setTeamId(user.teamId);
  }, [user]);

  // Live-Spiel (falls vorhanden) abonnieren
  useEffect(() => {
    if (!teamId) {
      setLiveGameId(null);
      return;
    }
    const gamesQuery = query(
      collection(db, "games"),
      where("status", "==", "live"),
      where("teamIds", "array-contains", teamId)
    );
    const unsubscribe = onSnapshot(
      gamesQuery,
      (snapshot) => {
        setLiveGameId(snapshot.empty ? null : snapshot.docs[0].id);
      },
      () => setLiveGameId(null)
    );
    return () => unsubscribe();
  }, [teamId]);

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        mb: 4,
        bgcolor: "background.paper",
        borderBottom: "2px solid",
        borderColor: "primary.main",
      }}
    >
      <Toolbar sx={{ minHeight: 60, px: { xs: 1, sm: 2 } }}>
        {/* Brand / Home */}
        <Typography
          variant="h6"
          component={RouterLink}
          to="/"
          sx={{
            flexGrow: 1,
            color: "primary.main",
            fontWeight: 800,
            fontSize: { xs: 20, sm: 24, md: 26 },
            textDecoration: "none",
            letterSpacing: 1,
            mr: 2,
            whiteSpace: "nowrap",
          }}
        >
          ⚽ DEADLINE DAY SIM
        </Typography>

        {/* Nav Links */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: { xs: 0.5, sm: 1 },
            flexWrap: "wrap",
            overflowX: "auto",
          }}
        >
          <Button color="inherit" component={RouterLink} to="/">
            Mein Kader
          </Button>
          <Button color="inherit" component={RouterLink} to="/historie">
            Historie
          </Button>
          <Button color="inherit" component={RouterLink} to="/taktik">
            Taktik
          </Button>
          <Button color="inherit" component={RouterLink} to="/pending">
            FS & Transfers annehmen
          </Button>
          <Button color="inherit" component={RouterLink} to="/transfermarkt">
            Transfermarkt
          </Button>
          <Button color="inherit" component={RouterLink} to="/challenge">
            Freundschaftsspiele
          </Button>

          {/* NEU: Wettbewerbe */}
          <Button color="inherit" component={RouterLink} to="/competitions">
            Wettbewerbe
          </Button>

          {/* NEU: Finanzen */}
          <Button color="inherit" component={RouterLink} to="/finanzen">
            Finanzen
          </Button>

          {/* NEU: Transferhistorie */}
          <Button color="inherit" component={RouterLink} to="/transferhistorie">
            Transferhistorie
          </Button>
                    <Button color="inherit" component={RouterLink} to="/players">
            Spielersuche
          </Button>
          {/* Optional: Live-Spiel Button (falls Live-Modus wieder aktiv) */}
          <Button
            component={RouterLink}
            to={liveGameId ? `/match/${liveGameId}` : "#"}
            variant="contained"
            color="primary"
            disabled={!liveGameId}
            sx={{
              ml: { xs: 0, sm: 1 },
              bgcolor: "primary.main",
              color: "background.default",
              fontWeight: 700,
              "&:hover": { bgcolor: "#ffc447" },
              whiteSpace: "nowrap",
            }}
          >
            {liveGameId && <Badge color="error" variant="dot" sx={{ mr: 1 }} />}
            Live Spiel
          </Button>

          {/* Admin-Bereich */}
          {user?.isAdmin && (
            <Box
              sx={{
                ml: 2,
                borderLeft: "1px solid",
                borderColor: "secondary.main",
                pl: 2,
                display: "flex",
                gap: 1,
                flexWrap: "wrap",
              }}
            >
              <Button color="inherit" component={RouterLink} to="/admin">
                Admin
              </Button>
              <Button color="inherit" component={RouterLink} to="/admin/seasons">
                Saisons
              </Button>
            </Box>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default Navbar;
