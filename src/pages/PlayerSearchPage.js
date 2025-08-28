// src/pages/PlayerSearchPage.js
import React, { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import { Link as RouterLink } from "react-router-dom";

import { db } from "../firebase/config";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

// Hilfs-Konstanten
const POSITION_GROUPS = [
  { value: "", label: "Alle Positionen" },
  { value: "TOR", label: "Tor" },
  { value: "DEF", label: "Abwehr" },
  { value: "MID", label: "Mittelfeld" },
  { value: "ATT", label: "Angriff" },
];

// bis zu 10 IDs pro "in"-Query zulässig → chunking
function chunk(arr, size = 10) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function PlayerSearchPage() {
  // Teams/Ligen
  const [teams, setTeams] = useState([]); // {id, name, leagueId?, leagueName?}
  const [leagues, setLeagues] = useState([]); // abgeleitet aus Teams
  const [loadingMeta, setLoadingMeta] = useState(true);

  // Filter
  const [league, setLeague] = useState(""); // leagueId oder leagueName (je nachdem, was im Team-Dokument vorhanden ist)
  const [teamId, setTeamId] = useState("");
  const [posGroup, setPosGroup] = useState("");
  const [nameQuery, setNameQuery] = useState("");

  // Resultate
  const [players, setPlayers] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  // Teams nach Liga gefiltert (für das Team-Dropdown)
  const teamsForSelectedLeague = useMemo(() => {
    if (!league) return teams;
    return teams.filter((t) =>
      (t.leagueId && t.leagueId === league) ||
      (t.leagueName && t.leagueName === league)
    );
  }, [league, teams]);

  // Ligen-Options aus Teams ableiten (Namen/IDs robust sammeln)
  useEffect(() => {
    (async () => {
      setLoadingMeta(true);
      try {
        const snap = await getDocs(collection(db, "teams"));
        const t = snap.docs.map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            name: data.name || d.id,
            leagueId: data.leagueId || null,
            leagueName: data.leagueName || null,
          };
        });
        setTeams(t);

        // ligenschlüssel konstruieren
        const m = new Map();
        for (const tt of t) {
          const key = tt.leagueId || tt.leagueName;
          if (!key) continue;
          const display = tt.leagueName || tt.leagueId;
          if (!m.has(key)) m.set(key, display);
        }
        const leagueOptions = Array.from(m.entries()).map(([id, label]) => ({
          id,
          label,
        }));
        // sortiere alfabetisch
        leagueOptions.sort((a, b) => a.label.localeCompare(b.label));
        setLeagues(leagueOptions);
      } finally {
        setLoadingMeta(false);
      }
    })();
  }, []);

  // Suche ausführen
  const runSearch = async () => {
    setLoadingPlayers(true);
    setPlayers([]);
    try {
      let result = [];

      // Query-Strategie:
      // - wenn Team gewählt → einfache where("teamId","==",teamId)
      // - sonst wenn Liga gewählt → Teams der Liga sammeln, dann in-Chunks abfragen
      // - sonst (keine Liga/Team) → alle Spieler laden (kann viel sein; ok für Emulator/kleine Demo), dann clientseitig filtern
      if (teamId) {
        const q1 = query(collection(db, "players"), where("teamId", "==", teamId));
        const snap = await getDocs(q1);
        result = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } else if (league) {
        const teamIds = teamsForSelectedLeague.map((t) => t.id);
        if (teamIds.length === 0) {
          result = [];
        } else {
          const chunks = chunk(teamIds, 10);
          const partials = await Promise.all(
            chunks.map(async (ids) => {
              const q2 = query(collection(db, "players"), where("teamId", "in", ids));
              const s = await getDocs(q2);
              return s.docs.map((d) => ({ id: d.id, ...d.data() }));
            })
          );
          result = partials.flat();
        }
      } else {
        // Fallback: alles laden (für kleine Datenmengen ok)
        const snap = await getDocs(collection(db, "players"));
        result = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }

      // Clientseitige Filter für Position + Name
      if (posGroup) {
        result = result.filter((p) => (p.positionGroup || "") === posGroup);
      }
      if (nameQuery.trim()) {
        const nq = nameQuery.trim().toLowerCase();
        result = result.filter((p) => {
          const full = `${p.vorname || ""} ${p.nachname || ""}`.toLowerCase();
          return (
            full.includes(nq) ||
            (p.nachname || "").toLowerCase().includes(nq) ||
            (p.vorname || "").toLowerCase().includes(nq)
          );
        });
      }

      // mit Teamnamen anreichern (Anzeige)
      const teamMap = new Map(teams.map((t) => [t.id, t.name]));
      result = result.map((p) => ({
        ...p,
        _teamName: teamMap.get(p.teamId) || p.teamId || "—",
      }));

      // sortiere standardmäßig nach Nachname
      result.sort((a, b) => (a.nachname || "").localeCompare(b.nachname || ""));
      setPlayers(result);
    } finally {
      setLoadingPlayers(false);
    }
  };

  // Sofort-Suche, wenn Team/Liga/Position sich ändern (Name per Button/Enter)
  useEffect(() => {
    // Auto-Search bei Filterwechsel außer nameQuery
    runSearch(); // eslint-disable-next-line
  }, [league, teamId, posGroup]);

  const resetFilters = () => {
    setLeague("");
    setTeamId("");
    setPosGroup("");
    setNameQuery("");
  };

  const leagueLabelFor = (t) => t.leagueName || t.leagueId || "—";

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 800 }}>
        Spielersuche
      </Typography>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              label="Name suchen…"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: nameQuery ? (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setNameQuery("")}
                      edge="end"
                    >
                      <ClearIcon />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
          </Grid>

          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              select
              label="Liga"
              value={league}
              onChange={(e) => {
                setLeague(e.target.value);
                setTeamId("");
              }}
            >
              <MenuItem value="">Alle Ligen</MenuItem>
              {leagues.map((l) => (
                <MenuItem key={l.id} value={l.id}>
                  {l.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              select
              label="Team"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            >
              <MenuItem value="">Alle Teams</MenuItem>
              {teamsForSelectedLeague.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name}
                </MenuItem>
              ))}
              {/* Wenn keine Liga gewählt, zeige alle */}
              {!league &&
                teams.map((t) => (
                  <MenuItem key={`all-${t.id}`} value={t.id}>
                    {t.name} {t.leagueName ? `· ${t.leagueName}` : ""}
                  </MenuItem>
                ))}
            </TextField>
          </Grid>

          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              select
              label="Position"
              value={posGroup}
              onChange={(e) => setPosGroup(e.target.value)}
            >
              {POSITION_GROUPS.map((p) => (
                <MenuItem key={p.value || "all"} value={p.value}>
                  {p.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12} md={9}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                variant="contained"
                onClick={runSearch}
                startIcon={<SearchIcon />}
                sx={{ fontWeight: 700 }}
              >
                Suchen
              </Button>
              <Button variant="outlined" onClick={resetFilters}>
                Zurücksetzen
              </Button>

              <Stack direction="row" spacing={1} sx={{ ml: "auto" }}>
                <Chip
                  size="small"
                  label={`Teams: ${teams.length || 0}`}
                  variant="outlined"
                />
                <Chip
                  size="small"
                  label={`Ligen: ${leagues.length || 0}`}
                  variant="outlined"
                />
              </Stack>
            </Stack>
          </Grid>
        </Grid>

        {(loadingMeta || loadingPlayers) && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress />
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: 0 }}>
        {/* Kopf */}
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Ergebnisse ({players.length})
          </Typography>
        </Box>
        <Divider />

        {players.length === 0 ? (
          <Box sx={{ p: 3 }}>
            <Typography sx={{ opacity: 0.75 }}>
              Keine Spieler gefunden. Passen die Filtereinstellungen?
            </Typography>
          </Box>
        ) : (
          <Box>
            {players.map((p) => (
              <React.Fragment key={p.id}>
                <Grid
                  container
                  spacing={2}
                  alignItems="center"
                  sx={{
                    p: 2,
                    "&:hover": { backgroundColor: "rgba(255,255,255,0.03)" },
                  }}
                  component={RouterLink}
                  to={`/player/${p.id}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <Grid item xs={12} sm={6} md={5}>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Avatar src={p.avatarUrl || ""}>
                        {p.nachname?.[0] || p.vorname?.[0] || "?"}
                      </Avatar>
                      <Box>
                        <Typography sx={{ fontWeight: 700 }}>
                          {(p.vorname || "") + " " + (p.nachname || "")}
                        </Typography>
                        <Typography variant="body2" sx={{ opacity: 0.8 }}>
                          {p.position || p.positionGroup || "—"}
                        </Typography>
                      </Box>
                    </Stack>
                  </Grid>

                  <Grid item xs={6} sm={3} md={3}>
                    <Typography sx={{ fontWeight: 600 }}>
                      {p._teamName || p.teamId || "—"}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.7 }}>
                      {(() => {
                        const t = teams.find((t) => t.id === p.teamId);
                        return t ? (t.leagueName || t.leagueId || "—") : "—";
                      })()}
                    </Typography>
                  </Grid>

                  <Grid item xs={6} sm={3} md={4}>
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      {/* Platz für kleine Badges/Werte, z. B. Alter/OVR, wenn vorhanden */}
                      {p.age != null && (
                        <Chip size="small" label={`Alter ${p.age}`} />
                      )}
                      {p.ovr != null && (
                        <Chip size="small" color="primary" label={`OVR ${p.ovr}`} />
                      )}
                      <Chip size="small" variant="outlined" label="Details" />
                    </Stack>
                  </Grid>
                </Grid>
                <Divider />
              </React.Fragment>
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
