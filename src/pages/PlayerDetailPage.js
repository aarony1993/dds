// src/pages/PlayerDetailPage.js
import React, { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Box,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from "@mui/material";
import { useParams, Link as RouterLink, useSearchParams } from "react-router-dom";
import { db } from "../firebase/config";
import {
  doc,
  getDoc,
  collection,
  query as fsQuery,
  where,
  getDocs,
} from "firebase/firestore";

/* ------------------------- helpers: formats & fallbacks ------------------------ */
function fmtPct(n) {
  if (!isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
function tsToMs(ts) {
  if (!ts) return null;
  if (typeof ts === "number") return ts;
  if (ts.seconds) return ts.seconds * 1000;
  if (ts._seconds) return ts._seconds * 1000;
  return null;
}
function extractDateMs(g) {
  return (
    tsToMs(g.kickoff) ??
    tsToMs(g.scheduledStartTime) ??
    tsToMs(g.finishedAt) ??
    tsToMs(g.createdAt) ??
    null
  );
}
function formatDate(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("de-DE");
}
function getScore(g) {
  const h =
    (g.score && (g.score.home ?? g.score.h)) ??
    g.homeScore ??
    g.goalsHome ??
    null;
  const a =
    (g.score && (g.score.away ?? g.score.a)) ??
    g.awayScore ??
    g.goalsAway ??
    null;
  if (typeof h === "number" && typeof a === "number") return `${h}:${a}`;
  return g.status === "live" ? "LIVE" : "—";
}
function getCompetitionLabel(g) {
  if (g?.competition?.name) return g.competition.name;
  if (g?.competitionName) return g.competitionName;
  if (g?.type === "friendly" || g?.isFriendly) return "Freundschaftsspiel";
  if (g?.leagueCode) return g.leagueCode;
  if (g?.seasonId) return "Ligaspiel";
  return "Unbekannt";
}
function resolvePlayerName(p) {
  return (
    p?.displayName ||
    p?.name ||
    p?.fullName ||
    ([p?.vorname, p?.nachname].filter(Boolean).join(" ")) ||
    (p?.firstName && p?.lastName && `${p.firstName} ${p.lastName}`) ||
    (p?.givenName && p?.surname && `${p.givenName} ${p.surname}`) ||
    "Unbekannter Spieler"
  );
}
// numeric helpers / aliasing
function n(v, def = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : def;
}
function pick(obj, keys, def = 0) {
  for (const k of keys) {
    if (obj && obj[k] != null) return n(obj[k], def);
  }
  return def;
}

/* -------------------- player general-info helpers -------------------- */
function getBirthDateMs(p) {
  const v =
    p?.birthDate ??
    p?.birthdate ??
    p?.dateOfBirth ??
    p?.dob ??
    p?.geburtsdatum;
  if (!v) return null;
  const msFromTs = tsToMs(v);
  if (msFromTs) return msFromTs;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v === "number") return v;
  return null;
}
function calcAge(ms) {
  if (!ms) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}
function fmtBirthDate(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-DE");
}
function toFlagEmoji(cc) {
  if (!cc || typeof cc !== "string" || cc.length < 2) return "";
  const code = cc.trim().toUpperCase();
  const points = [...code.slice(0, 2)].map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...points);
}
function getNationalityLabel(p) {
  const code =
    p?.nationalityCode ||
    p?.countryCode ||
    p?.nationCode ||
    p?.fifaCode ||
    null;
  const name =
    p?.nationality ||
    p?.country ||
    p?.countryName ||
    p?.nation ||
    p?.land ||
    null;
  if (code && name) return `${toFlagEmoji(code)} ${name}`;
  if (name) return name;
  if (code) return `${toFlagEmoji(code)} ${code.toUpperCase()}`;
  return "—";
}
function fmtCurrencyCompactEUR(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)} Mrd €`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)} Mio €`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(0)} Tsd €`;
  return `${value.toLocaleString("de-DE")} €`;
}
function getMarketValueLabel(p) {
  const v =
    p?.marketValue ??
    p?.market_value ??
    p?.marktwert ??
    p?.value ??
    null;
  if (typeof v === "number") return fmtCurrencyCompactEUR(v) || "—";
  if (typeof v === "string" && v.trim()) return v.trim();
  return "—";
}

/* -------------------- season helpers (key + label) -------------------- */
function getSeasonKeyLabel(g) {
  const id = g?.seasonId || g?.season?.id || g?.competition?.seasonId || null;
  const name = g?.seasonName || g?.season?.name || g?.competition?.seasonName || null;

  if (id && name) return { key: id, label: name };
  if (id && !name) return { key: id, label: id };
  if (!id && name) return { key: name, label: name };

  // Fallback: europäische Saison aus Datum ableiten, z. B. 2025/26
  const ms = extractDateMs(g);
  if (!ms) return { key: "Unbekannt", label: "Unbekannt" };
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return { key: "Unbekannt", label: "Unbekannt" };
  const y = d.getFullYear();
  const m = d.getMonth(); // 0..11
  const startYear = m >= 6 ? y : y - 1; // Start ~ Juli
  const label = `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
  return { key: label, label };
}

/* ------------------------------ sorting utils -------------------------------- */
function descendingComparator(a, b, orderBy) {
  const va = a[orderBy];
  const vb = b[orderBy];
  if (vb < va) return -1;
  if (vb > va) return 1;
  return 0;
}
function getComparator(order, orderBy) {
  return order === "desc"
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}
function stableSort(array, comparator) {
  const stabilized = array.map((el, idx) => [el, idx]);
  stabilized.sort((a, b) => {
    const diff = comparator(a[0], b[0]);
    if (diff !== 0) return diff;
    return a[1] - b[1];
  });
  return stabilized.map((el) => el[0]);
}

/* ---------------------------------- page ---------------------------------- */
export default function PlayerDetailPage() {
  const { playerId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-persisted state
  const [competitionFilter, setCompetitionFilter] = useState(
    () => searchParams.get("comp") || "ALL"
  );
  const [seasonFilter, setSeasonFilter] = useState(
    () => searchParams.get("season") || "ALL"
  );
  const [orderBy, setOrderBy] = useState(
    () => searchParams.get("sort") || "dateMs"
  );
  const [order, setOrder] = useState(
    () => (searchParams.get("dir") === "asc" ? "asc" : "desc")
  );

  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState(null);
  const [team, setTeam] = useState(null);
  const [games, setGames] = useState([]);         // alle Team-Spiele
  const [playerGames, setPlayerGames] = useState([]); // nur Spiele mit Stats/Rating für Spieler
  const [teamNames, setTeamNames] = useState({});
  const [error, setError] = useState(null);

  // persist query params
  useEffect(() => {
    setSearchParams(
      { comp: competitionFilter, season: seasonFilter, sort: orderBy, dir: order },
      { replace: true }
    );
  }, [competitionFilter, seasonFilter, orderBy, order, setSearchParams]);

  // load data
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!playerId) return;
      setLoading(true);
      setError(null);
      try {
        // 1) Spieler
        const pSnap = await getDoc(doc(db, "players", playerId));
        if (!pSnap.exists()) throw new Error("Spieler nicht gefunden.");
        const p = { id: pSnap.id, ...pSnap.data() };
        if (!alive) return;
        setPlayer(p);

        // 2) Team
        let t = null;
        if (p.teamId) {
          const tSnap = await getDoc(doc(db, "teams", p.teamId));
          t = tSnap.exists() ? { id: tSnap.id, ...tSnap.data() } : null;
        }
        if (!alive) return;
        setTeam(t);

        // 3) Team-Spiele lesen (array-contains teamId)
        let gs = [];
        if (t?.id) {
          const q = fsQuery(
            collection(db, "games"),
            where("teamIds", "array-contains", t.id)
          );
          const gSnap = await getDocs(q);
          gs = gSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
        // sortiere absteigend nach Datum
        gs.sort((a, b) => (extractDateMs(b) ?? 0) - (extractDateMs(a) ?? 0));
        if (!alive) return;
        setGames(gs);

        // 4) nur Spiele mit Stats oder Rating für den Spieler
        const withStats = gs.filter((g) => {
          const hasPs = !!(g.playerStats || {})[playerId];
          const hasRating = typeof (g.playerRatings || {})[playerId] === "number";
          return hasPs || hasRating;
        });
        if (!alive) return;
        setPlayerGames(withStats);

        // 5) Teamnamen-Map für beide Seiten
        const ids = new Set();
        withStats.forEach((g) => {
          if (g.teamHomeId) ids.add(g.teamHomeId);
          if (g.teamAwayId) ids.add(g.teamAwayId);
        });
        const snaps = await Promise.all(
          Array.from(ids).map((id) => getDoc(doc(db, "teams", id)))
        );
        const nameMap = {};
        snaps.forEach((s) => {
          if (s.exists()) nameMap[s.id] = s.data().name || s.id;
        });
        if (!alive) return;
        setTeamNames(nameMap);
      } catch (e) {
        console.error("PlayerDetail load error:", e);
        if (alive) setError(e.message || "Fehler beim Laden.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [playerId]);

  // Zeilen (nur Spieler-Spiele) – enthalten auch Felder für die Aggregation oben
  const rows = useMemo(() => {
    return playerGames.map((g) => {
      const ps = (g.playerStats || {})[playerId] || {};
      const rating = typeof (g.playerRatings || {})[playerId] === "number"
        ? g.playerRatings[playerId]
        : null;

      const dateMs = extractDateMs(g);
      const dateStr = formatDate(dateMs);
      const comp = getCompetitionLabel(g);

      const homeId = g.teamHomeId || g.homeTeamId;
      const awayId = g.teamAwayId || g.awayTeamId;
      const homeName = teamNames[homeId] || homeId || "?";
      const awayName = teamNames[awayId] || awayId || "?";

      const score = getScore(g);

      // Saison-Info
      const seasonInfo = getSeasonKeyLabel(g);

      // Schüsse
      const shots = pick(ps, ["shots", "totalShots", "shotAttempts"], 0);
      const shotsOn = pick(ps, ["shotsOnTarget", "onTarget", "sot"], 0);

      // Interceptions
      const interceptions = pick(ps, ["interceptions", "ints"], 0);

      // Dribbling
      const dribAtt = pick(ps, ["dribbles", "dribblesAttempted", "dribbleAttempts"], 0);
      const dribWon = pick(ps, ["dribblesSucceeded", "dribblesCompleted", "dribblesWon"], 0);

      // Pässe (gesamt)
      const passAtt = pick(ps, ["passes", "passesAttempted", "passesTotal", "passAttempts"], 0);
      const passCmp = pick(ps, ["passesCompleted", "passCompleted", "passesAccurate"], 0);

      // Flanken
      const crossAtt = pick(ps, [
        "crossesAttempted",
        "crossAttempts",
        "crosses",
        "flanken",
        "crossTotal",
      ], 0);
      const crossCmp = pick(ps, [
        "crossesCompleted",
        "crossCompleted",
        "accurateCrosses",
        "flankenAngekommen",
        "crossesAccurate",
      ], 0);

      // Tödliche Pässe
      const killerPasses = pick(ps, [
        "killerPasses",
        "deadlyPasses",
        "throughBalls",
        "throughBall",
        "keyPasses",
        "keypasses",
        "toedlichePaesse",
      ], 0);

      return {
        id: g.id,
        dateMs,
        dateStr,
        competition: comp,
        seasonKey: seasonInfo.key,
        seasonLabel: seasonInfo.label,

        matchLabel: `${homeName} – ${awayName}`,
        result: score,
        rating,

        goals: n(ps.goals, 0),
        assists: n(ps.assists, 0),

        shots,
        shotsOn,

        interceptions,

        dribAtt,
        dribWon,

        passAtt,
        passCmp,

        crossAtt,
        crossCmp,

        killerPasses,
      };
    });
  }, [playerGames, playerId, teamNames]);

  // Wettbewerbs- & Saison-Optionen
  const competitions = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => set.add(r.competition));
    return ["ALL", ...Array.from(set)];
  }, [rows]);

  const seasonOptions = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      if (!map.has(r.seasonKey)) map.set(r.seasonKey, r.seasonLabel);
    });
    const arr = Array.from(map, ([key, label]) => ({ key, label }));
    return [{ key: "ALL", label: "Alle Saisons" }, ...arr];
  }, [rows]);

  // Filter anwenden (Wettbewerb + Saison)
  const filteredRows = useMemo(() => {
    let out = rows;
    if (competitionFilter !== "ALL") out = out.filter((r) => r.competition === competitionFilter);
    if (seasonFilter !== "ALL") out = out.filter((r) => r.seasonKey === seasonFilter);
    return out;
  }, [rows, competitionFilter, seasonFilter]);

  // Aggregation oben (über gefilterte Zeilen)
  const agg = useMemo(() => {
    const sum = {
      apps: filteredRows.length,
      goals: 0,
      assists: 0,
      ratingSum: 0,
      ratingCount: 0,

      shots: 0,
      shotsOn: 0,

      interceptions: 0,

      dribAtt: 0,
      dribWon: 0,

      passAtt: 0,
      passCmp: 0,

      crossAtt: 0,
      crossCmp: 0,

      killerPasses: 0,
    };

    for (const r of filteredRows) {
      sum.goals += r.goals;
      sum.assists += r.assists;
      if (typeof r.rating === "number") {
        sum.ratingSum += r.rating;
        sum.ratingCount += 1;
      }

      sum.shots += r.shots;
      sum.shotsOn += r.shotsOn;

      sum.interceptions += r.interceptions;

      sum.dribAtt += r.dribAtt;
      sum.dribWon += r.dribWon;

      sum.passAtt += r.passAtt;
      sum.passCmp += r.passCmp;

      sum.crossAtt += r.crossAtt;
      sum.crossCmp += r.crossCmp;

      sum.killerPasses += r.killerPasses;
    }

    const ratingAvg = sum.ratingCount > 0 ? sum.ratingSum / sum.ratingCount : null;
    const shotAcc = sum.shots > 0 ? sum.shotsOn / sum.shots : null;
    const dribbleRate = sum.dribAtt > 0 ? sum.dribWon / sum.dribAtt : null;
    const passAcc = sum.passAtt > 0 ? sum.passCmp / sum.passAtt : null;
    const crossAcc = sum.crossAtt > 0 ? sum.crossCmp / sum.crossAtt : null;

    return { sum, ratingAvg, shotAcc, dribbleRate, passAcc, crossAcc };
  }, [filteredRows]);

  // Sortierung
  const sortedRows = useMemo(
    () => stableSort(filteredRows, getComparator(order, orderBy)),
    [filteredRows, order, orderBy]
  );

  // Tabellenkopf (reduziert)
  const headCells = [
    { id: "dateMs", label: "Datum", numeric: false },
    { id: "matchLabel", label: "Match", numeric: false },
    { id: "result", label: "Ergebnis", numeric: false },
    { id: "rating", label: "Note", numeric: true },
    { id: "goals", label: "Tore", numeric: true },
    { id: "assists", label: "Assists", numeric: true },
    { id: "killerPasses", label: "Tödliche P.", numeric: true },
    { id: "interceptions", label: "Interceptions", numeric: true },
  ];
  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };

  /* ---------------------------- Early returns ---------------------------- */
  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">{error}</Typography>
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

  const fullName = resolvePlayerName(player);

  // General infos
  const birthMs = getBirthDateMs(player);
  const age = calcAge(birthMs);
  const birthStr = fmtBirthDate(birthMs);
  const nationality = getNationalityLabel(player);
  const marketValue = getMarketValueLabel(player);

  /* -------------------------------- Render ------------------------------- */
  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <Avatar
            src={player.avatarUrl || ""}
            sx={{ width: 72, height: 72, fontWeight: 800 }}
          >
            {fullName?.[0] || "?"}
          </Avatar>

          <Box sx={{ flex: 1, minWidth: 280 }}>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              {fullName}
            </Typography>
            <Typography sx={{ opacity: 0.8 }}>
              {player.position || player.positionGroup || "—"} ·{" "}
              {team?.name || player.teamId || "vereinslos"}
            </Typography>

            {/* General info chips */}
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
              <Chip size="small" variant="outlined" label={`Marktwert: ${marketValue}`} />
              <Chip size="small" variant="outlined" label={`Alter: ${age ?? "—"}`} />
              <Chip size="small" variant="outlined" label={`Geburtsdatum: ${birthStr}`} />
              <Chip size="small" variant="outlined" label={`Nationalität: ${nationality}`} />
            </Stack>
          </Box>

          {/* Summary chips */}
          <Stack direction="row" spacing={1} sx={{ mr: 2 }}>
            <Chip label={`Apps ${agg.sum.apps}`} size="small" />
            <Chip label={`Tore ${agg.sum.goals}`} color="primary" size="small" />
            <Chip label={`Vorlagen ${agg.sum.assists}`} color="secondary" size="small" />
            <Chip
              label={`Ø-Note ${agg.ratingAvg != null ? agg.ratingAvg.toFixed(2) : "—"}`}
              size="small"
            />
          </Stack>

          {/* Filter-Leiste */}
          <Stack direction="row" spacing={2} sx={{ minWidth: 420 }}>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="competition-filter-label">Wettbewerb</InputLabel>
              <Select
                labelId="competition-filter-label"
                label="Wettbewerb"
                value={competitionFilter}
                onChange={(e) => setCompetitionFilter(e.target.value)}
              >
                {competitions.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c === "ALL" ? "Alle Wettbewerbe" : c}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="season-filter-label">Saison</InputLabel>
              <Select
                labelId="season-filter-label"
                label="Saison"
                value={seasonFilter}
                onChange={(e) => setSeasonFilter(e.target.value)}
              >
                {seasonOptions.map((s) => (
                  <MenuItem key={s.key} value={s.key}>
                    {s.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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
                sub={`${agg.sum.passCmp}/${agg.sum.passAtt} angekommen`}
              />
              <Stat
                label="Dribbling-Quote"
                value={agg.dribbleRate == null ? "—" : fmtPct(agg.dribbleRate)}
                sub={`${agg.sum.dribWon}/${agg.sum.dribAtt} erfolgreich`}
              />
              <Stat
                label="Flanken-Quote"
                value={agg.crossAcc == null ? "—" : fmtPct(agg.crossAcc)}
                sub={`${agg.sum.crossCmp}/${agg.sum.crossAtt} angekommen`}
              />
              <Stat label="Tödliche Pässe" value={agg.sum.killerPasses} />
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: "100%" }}>
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>
              Defensiv & Disziplin
            </Typography>
            <Stack direction="row" spacing={3} flexWrap="wrap">
              <Stat label="Interceptions" value={agg.sum.interceptions} />
              <Stat
                label="Ø-Note"
                value={agg.ratingAvg != null ? agg.ratingAvg.toFixed(2) : "—"}
              />
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* Letzte Spiele (schlank) */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>
          Letzte Spiele
        </Typography>

        <TableContainer component={Paper} elevation={0}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {headCells.map((hc) => (
                  <TableCell
                    key={hc.id}
                    align={hc.numeric ? "right" : "left"}
                    sortDirection={orderBy === hc.id ? order : false}
                  >
                    <TableSortLabel
                      active={orderBy === hc.id}
                      direction={orderBy === hc.id ? order : "asc"}
                      onClick={() => handleRequestSort(hc.id)}
                    >
                      {hc.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={headCells.length}>
                    <Typography sx={{ opacity: 0.8 }}>
                      Keine Spiele mit erfassten Statistiken.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}

              {sortedRows.slice(0, 30).map((r) => (
                <TableRow
                  key={r.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  component={RouterLink}
                  to={`/match/${r.id}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <TableCell>{r.dateStr}</TableCell>
                  <TableCell>{r.matchLabel}</TableCell>
                  <TableCell>{r.result}</TableCell>
                  <TableCell align="right">
                    {typeof r.rating === "number" ? r.rating.toFixed(2) : "—"}
                  </TableCell>
                  <TableCell align="right">{r.goals}</TableCell>
                  <TableCell align="right">{r.assists}</TableCell>
                  <TableCell align="right">{r.killerPasses}</TableCell>
                  <TableCell align="right">{r.interceptions}</TableCell>
                </TableRow>
              ))}
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
