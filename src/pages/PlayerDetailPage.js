import React, { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useParams, Link as RouterLink } from "react-router-dom";
import { db } from "../firebase/config";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
} from "firebase/firestore";

function fmtPct(n) {
  if (!isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export default function PlayerDetailPage() {
  const { playerId } = useParams();
  const [loading, setLoading] = useState(true);

  const [player, setPlayer] = useState(null);
  const [team, setTeam] = useState(null);

  const [games, setGames] = useState([]);             // alle Spiele des Teams
  const [playerGames, setPlayerGames] = useState([]); // nur Spiele, in denen der Spieler Stats hat

  useEffect(() => {
    (async () => {
      if (!playerId) return;
      setLoading(true);
      try {
        // 1) Spieler laden
        const pSnap = await getDoc(doc(db, "players", playerId));
        if (!pSnap.exists()) {
          setPlayer(null);
          setLoading(false);
          return;
        }
        const p = { id: pSnap.id, ...pSnap.data() };
        setPlayer(p);

        // 2) Team laden (aktuelles Team)
        if (p.teamId) {
          const tSnap = await getDoc(doc(db, "teams", p.teamId));
          setTeam(tSnap.exists() ? { id: tSnap.id, ...tSnap.data() } : null);
        } else {
          setTeam(null);
        }

        // 3) Spiele des (aktuellen) Teams ziehen und nachher client-seitig filtern
        // Hinweis: So bekommen wir auch vergangene Spiele des Teams.
        if (p.teamId) {
          const qGames = query(
            collection(db, "games"),
            where("teamIds", "array-contains", p.teamId)
          );
          const gSnap = await getDocs(qGames);
          const gs = gSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

          // sortiere chronologisch (kickoff oder createdAt)
          gs.sort((a, b) => {
            const ka =
              (a.kickoff?.seconds || 0) * 1000 ||
              (typeof a.kickoff === "number" ? a.kickoff : 0) ||
              (a.createdAt?.seconds || 0) * 1000;
            const kb =
              (b.kickoff?.seconds || 0) * 1000 ||
              (typeof b.kickoff === "number" ? b.kickoff : 0) ||
              (b.createdAt?.seconds || 0) * 1000;
            return kb - ka; // neueste zuerst
          });

          setGames(gs);

          // 4) Nur Spiele mit Stats/Teilnahme des Spielers
          const withStats = gs.filter((g) => (g.playerStats || {})[playerId]);
          setPlayerGames(withStats);
        } else {
          setGames([]);
          setPlayerGames([]);
        }
      } catch (e) {
        console.error("PlayerDetail load error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [playerId]);

  const agg = useMemo(() => {
    const sum = {
      apps: 0,
      goals: 0,
      assists: 0,
      ratingSum: 0,
      ratingCount: 0,
      minutes: 0,
      shots: 0,
      shotsOn: 0,
      dribbles: 0,
      dribblesSucceeded: 0,
      tackles: 0,
      tacklesSucceeded: 0,
      passes: 0,
      passesCompleted: 0,
      cardsYellow: 0,
      cardsRed: 0,
    };

    for (const g of playerGames) {
      const ps = (g.playerStats || {})[playerId];
      if (!ps) continue;
      sum.apps += 1;
      sum.goals += ps.goals || 0;
      sum.assists += ps.assists || 0;

      if (typeof ps.rating === "number") {
        sum.ratingSum += ps.rating;
        sum.ratingCount += 1;
      }

      sum.minutes += ps.minutes || 0;
      sum.shots += ps.shots || 0;
      sum.shotsOn += ps.shotsOn || 0;

      sum.dribbles += ps.dribbles || 0;
      sum.dribblesSucceeded += ps.dribblesSucceeded || 0;

      sum.tackles += ps.tackles || 0;
      sum.tacklesSucceeded += ps.tacklesSucceeded || 0;

      sum.passes += ps.passes || 0;
      sum.passesCompleted += ps.passesCompleted || 0;

      sum.cardsYellow += ps.cardsYellow || 0;
      sum.cardsRed += ps.cardsRed || 0;
    }

    const ratingAvg =
      sum.ratingCount > 0 ? (sum.ratingSum / sum.ratingCount) : null;

    const shotAcc =
      sum.shots > 0 ? sum.shotsOn / sum.shots : null;

    const dribbleRate =
      sum.dribbles > 0 ? sum.dribblesSucceeded / sum.dribbles : null;

    const tackleRate =
      sum.tackles > 0 ? sum.tacklesSucceeded / sum.tackles : null;

    const passAcc =
      sum.passes > 0 ? sum.passesCompleted / sum.passes : null;

    return { sum, ratingAvg, shotAcc, dribbleRate, tackleRate, passAcc };
  }, [playerGames, playerId]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!player) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5">Spieler nicht gefunden.</Typography>
      </Box>
    );
  }

  const fullName =
    [player.vorname, player.nachname].filter(Boolean).join(" ") || playerId;

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar
            src={player.avatarUrl || ""}
            sx={{ width: 72, height: 72, fontWeight: 800 }}
          >
            {player.nachname?.[0] || fullName?.[0] || "?"}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              {fullName}
            </Typography>
            <Typography sx={{ opacity: 0.8 }}>
              {player.position || player.positionGroup || "—"} ·{" "}
              {team?.name || player.teamId || "vereinslos"}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Chip
              label={`Apps ${agg.sum.apps}`}
              color="default"
              size="small"
            />
            <Chip
              label={`Tore ${agg.sum.goals}`}
              color="primary"
              size="small"
            />
            <Chip
              label={`Vorlagen ${agg.sum.assists}`}
              color="secondary"
              size="small"
            />
            <Chip
              label={`Ø-Note ${
                agg.ratingAvg != null ? agg.ratingAvg.toFixed(2) : "—"
              }`}
              size="small"
            />
          </Stack>
        </Stack>
      </Paper>

      {/* Kacheln: Kern-Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: "100%" }}>
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>
              Offensiv
            </Typography>
            <Stack direction="row" spacing={3} flexWrap="wrap">
              <Stat label="Tore" value={agg.sum.goals} />
              <Stat label="Vorlagen" value={agg.sum.assists} />
              <Stat
                label="Schussgenauigkeit"
                value={agg.shotAcc == null ? "—" : fmtPct(agg.shotAcc)}
                sub={`${agg.sum.shotsOn}/${agg.sum.shots} aufs Tor`}
              />
              <Stat
                label="Passquote"
                value={agg.passAcc == null ? "—" : fmtPct(agg.passAcc)}
                sub={`${agg.sum.passesCompleted}/${agg.sum.passes} angekommen`}
              />
              <Stat
                label="Dribbling-Quote"
                value={agg.dribbleRate == null ? "—" : fmtPct(agg.dribbleRate)}
                sub={`${agg.sum.dribblesSucceeded}/${agg.sum.dribbles} erfolgreich`}
              />
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: "100%" }}>
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>
              Defensiv & Disziplin
            </Typography>
            <Stack direction="row" spacing={3} flexWrap="wrap">
              <Stat
                label="Zweikampf-Quote"
                value={agg.tackleRate == null ? "—" : fmtPct(agg.tackleRate)}
                sub={`${agg.sum.tacklesSucceeded}/${agg.sum.tackles} gewonnen`}
              />
              <Stat label="Gelbe Karten" value={agg.sum.cardsYellow} />
              <Stat label="Rote Karten" value={agg.sum.cardsRed} />
              <Stat
                label="Ø-Note"
                value={agg.ratingAvg != null ? agg.ratingAvg.toFixed(2) : "—"}
              />
              <Stat
                label="Minuten"
                value={agg.sum.minutes || "—"}
              />
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* Letzte Spiele */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>
          Letzte Spiele
        </Typography>

        <TableContainer component={Paper} elevation={0}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Datum</TableCell>
                <TableCell>Match</TableCell>
                <TableCell align="right">Ergebnis</TableCell>
                <TableCell align="right">Note</TableCell>
                <TableCell align="right">Tore</TableCell>
                <TableCell align="right">Assists</TableCell>
                <TableCell align="right">Dribbl. (Erf.)</TableCell>
                <TableCell align="right">Zweik. (Gew.)</TableCell>
                <TableCell align="right">Pässe (ank.)</TableCell>
                <TableCell align="right">Min.</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {playerGames.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10}>
                    <Typography sx={{ opacity: 0.8 }}>
                      Keine Spiele mit erfassten Statistiken.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}

              {playerGames.slice(0, 30).map((g) => {
                const ps = (g.playerStats || {})[playerId] || {};
                const date =
                  g.kickoff?.seconds
                    ? new Date(g.kickoff.seconds * 1000)
                    : (typeof g.kickoff === "number" ? new Date(g.kickoff) : null);
                const dateStr = date && !isNaN(date.getTime()) ? date.toLocaleString() : "—";

                const h = g.teamHomeId;
                const a = g.teamAwayId;

                const score =
                  g.status === "finished"
                    ? `${g.homeScore ?? 0}:${g.awayScore ?? 0}`
                    : g.status === "live"
                    ? "LIVE"
                    : "—";

                return (
                  <TableRow
                    key={g.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    component={RouterLink}
                    to={`/match/${g.id}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <TableCell>{dateStr}</TableCell>
                    <TableCell>
                      {(team && team.id === h) ? (team.name || h) : h} – {(team && team.id === a) ? (team.name || a) : a}
                    </TableCell>
                    <TableCell align="right">{score}</TableCell>
                    <TableCell align="right">
                      {typeof ps.rating === "number" ? ps.rating.toFixed(2) : "—"}
                    </TableCell>
                    <TableCell align="right">{ps.goals || 0}</TableCell>
                    <TableCell align="right">{ps.assists || 0}</TableCell>
                    <TableCell align="right">
                      {(ps.dribbles || 0)} ({ps.dribblesSucceeded || 0})
                    </TableCell>
                    <TableCell align="right">
                      {(ps.tackles || 0)} ({ps.tacklesSucceeded || 0})
                    </TableCell>
                    <TableCell align="right">
                      {(ps.passes || 0)} ({ps.passesCompleted || 0})
                    </TableCell>
                    <TableCell align="right">{ps.minutes || 0}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}

function Stat({ label, value, sub }) {
  return (
    <Box sx={{ minWidth: 140 }}>
      <Typography sx={{ fontSize: 12, opacity: 0.8 }}>{label}</Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 800 }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: 12, opacity: 0.6 }}>{sub}</Typography>}
    </Box>
  );
}
