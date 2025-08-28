// src/pages/AdminSeasonPage.js
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  Chip,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Divider,
  Autocomplete,
  Alert,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@mui/material";
import { db } from "../firebase/config";
import {
  collection,
  getDocs,
  writeBatch,
  doc,
  serverTimestamp,
  addDoc,
  query,
  where,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";

// ---------- Konstanten ----------
const LEAGUES = [
  { code: "BL", label: "Bundesliga" },
  { code: "PL", label: "Premier League" },
  { code: "SA", label: "Serie A" },
  { code: "PD", label: "Primera División" },
  { code: "L1", label: "Ligue 1" },
];

const WEEKDAYS = [
  { id: 1, label: "Mo" },
  { id: 2, label: "Di" },
  { id: 3, label: "Mi" },
  { id: 4, label: "Do" },
  { id: 5, label: "Fr" },
  { id: 6, label: "Sa" },
  { id: 0, label: "So" },
];

// ---------- Helper: Datum & Fixtures ----------
function toMidnight(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseDateInput(value) {
  // value: "YYYY-MM-DD"
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (isNaN(date.getTime())) return null;
  return toMidnight(date);
}

function parseTimeToHM(value) {
  // value: "HH:MM"
  if (!value) return null;
  const [hh, mm] = value.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return { hh, mm };
}

function nextSlotsBetween(startDate, endDate, weekdayIds, timesHM) {
  // Liefert chronologische Liste an Kickoff-Zeiten (Millis) innerhalb des Fensters,
  // für die angegebenen Wochentage + Uhrzeiten.
  const slots = [];
  if (!startDate || !endDate || !weekdayIds.length || !timesHM.length) return slots;

  const start = toMidnight(startDate);
  const end = toMidnight(endDate);

  for (
    let d = new Date(start.getTime());
    d.getTime() <= end.getTime();
    d.setDate(d.getDate() + 1)
  ) {
    const weekday = d.getDay();
    if (!weekdayIds.includes(weekday)) continue;

    // Für jeden Time Slot des Tages
    for (const { hh, mm } of timesHM) {
      const k = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0);
      slots.push(k.getTime());
    }
  }
  slots.sort((a, b) => a - b);
  return slots;
}

// Circle Method (Double Round Robin), inkl. Sonderfall 2 Teams
function generateDoubleRound(teamIds) {
  const n = teamIds.length;
  if (n < 2) throw new Error("Mindestens 2 Teams sind erforderlich.");

  // Sonderfall 2 Teams → Hin- und Rückspiel
  if (n === 2) {
    return [
      [[teamIds[0], teamIds[1]]], // Spieltag 1
      [[teamIds[1], teamIds[0]]], // Spieltag 2
    ];
  }

  if (n % 2 !== 0) throw new Error("Teamanzahl muss gerade sein (z. B. 18).");

  const arr = [...teamIds];
  const rounds = n - 1;
  const half = n / 2;

  const firstRound = [];
  for (let r = 0; r < rounds; r++) {
    const pairs = [];
    for (let i = 0; i < half; i++) {
      const home = arr[i];
      const away = arr[n - 1 - i];
      // alternierende Heim/Auswärts-Verteilung
      if (r % 2 === 0) pairs.push([home, away]);
      else pairs.push([away, home]);
    }
    firstRound.push(pairs);

    // Rotation (außer erstes Team fix)
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr.splice(0, arr.length, fixed, ...rest);
  }

  // Rückrunde (Seiten tauschen)
  const secondRound = firstRound.map((md) => md.map(([h, a]) => [a, h]));
  return [...firstRound, ...secondRound]; // Array von Spieltagen, jeder ist Array von Paaren
}

function capacityNeeded(teamCount) {
  // Spieltage = (n-1) * 2 bei Double Round Robin, außer n=2 → 2 Spieltage
  if (teamCount === 2) return 2;
  return (teamCount - 1) * 2;
}

// ---------- Seite ----------
export default function AdminSeasonPage() {
  const { user } = useAuth();
  const [allTeams, setAllTeams] = useState([]);
  const [teamsById, setTeamsById] = useState({});

  // Form-State
  const [league, setLeague] = useState(LEAGUES[0]);
  const [seasonCode, setSeasonCode] = useState(""); // z. B. "BL-2025-26"
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [weekdayIds, setWeekdayIds] = useState([6, 0]); // Standard Sa/So
  const [timeStrings, setTimeStrings] = useState(["15:30"]); // mind. ein Slot
  const [startDateStr, setStartDateStr] = useState("");
  const [endDateStr, setEndDateStr] = useState("");

  // Vorschau
  const [preview, setPreview] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    (async () => {
      // Teams laden
      const snap = await getDocs(collection(db, "teams"));
      const arr = snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name || d.id,
        label: d.data().name || d.id,
      }));
      setAllTeams(arr);
      const byId = {};
      arr.forEach((t) => (byId[t.id] = t));
      setTeamsById(byId);
    })();
  }, []);

  // Kapazitätsberechnung (Info)
  const capacityInfo = useMemo(() => {
    const sd = parseDateInput(startDateStr);
    const ed = parseDateInput(endDateStr);
    const timesHM = timeStrings.map(parseTimeToHM).filter(Boolean);
    const slots = nextSlotsBetween(sd, ed, weekdayIds, timesHM);
    const need = capacityNeeded(selectedTeams.length);
    return { slots: slots.length, need, ok: slots.length >= need };
  }, [startDateStr, endDateStr, timeStrings, weekdayIds, selectedTeams.length]);

  const handleToggleWeekday = (id) => {
    setWeekdayIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const addTime = () => setTimeStrings((prev) => [...prev, "18:30"]);
  const updateTime = (i, v) =>
    setTimeStrings((prev) => prev.map((t, idx) => (idx === i ? v : t)));
  const removeTime = (i) =>
    setTimeStrings((prev) => prev.filter((_, idx) => idx !== i));

  const makePreview = () => {
    setErrorMsg("");
    setPreview(null);

    if (!seasonCode.trim()) {
      setErrorMsg("Bitte eine Saison-ID (z. B. BL-2025-26) angeben.");
      return;
    }
    if (!league?.code) {
      setErrorMsg("Bitte eine Liga wählen.");
      return;
    }
    const teamIds = selectedTeams.map((t) => t.id);
    if (teamIds.length < 2) {
      setErrorMsg("Mindestens 2 Teams auswählen.");
      return;
    }
    const sd = parseDateInput(startDateStr);
    const ed = parseDateInput(endDateStr);
    if (!sd || !ed || ed < sd) {
      setErrorMsg("Bitte gültigen Start- und Endtermin wählen.");
      return;
    }
    const timesHM = timeStrings.map(parseTimeToHM).filter(Boolean);
    if (timesHM.length === 0) {
      setErrorMsg("Bitte mindestens eine Anstoßzeit definieren.");
      return;
    }
    if (weekdayIds.length === 0) {
      setErrorMsg("Bitte mindestens einen Wochentag auswählen.");
      return;
    }

    let matchdays;
    try {
      matchdays = generateDoubleRound(teamIds); // [[ [home,away], ... ], Spieltag2, ...]
    } catch (e) {
      setErrorMsg(e.message || "Fehler beim Erzeugen des Spielplans.");
      return;
    }

    // Slots erzeugen und Kapazität prüfen
    const slots = nextSlotsBetween(sd, ed, weekdayIds, timesHM);
    const needed = matchdays.length;
    if (slots.length < needed) {
      setErrorMsg(
        `Nicht genug verfügbare Termine. Benötigt: ${needed}, vorhanden: ${slots.length}.`
      );
      return;
    }

    // Matchdays den Slots zuordnen
    const assignments = matchdays.map((pairs, idx) => {
      const kickoff = slots[idx];
      return {
        matchday: idx + 1,
        kickoff,
        games: pairs.map(([homeId, awayId]) => ({ homeId, awayId })),
      };
    });

    setPreview({
      seasonId: seasonCode.trim(),
      league,
      teamIds,
      startMillis: sd.getTime(),
      endMillis: ed.getTime(),
      assignments,
    });
  };

  const createSeason = async () => {
    if (!preview) return;
    setErrorMsg("");
    try {
      // 1) seasons-Dokument anlegen
      const { seasonId, league, teamIds, startMillis, endMillis, assignments } =
        preview;

      // Prüfen, ob seasonId schon existiert (optional, hilfreich)
      const qExist = await getDocs(
        query(collection(db, "seasons"), where("id", "==", seasonId))
      );
      if (!qExist.empty) {
        setErrorMsg(
          `Es existiert bereits eine Saison mit der ID "${seasonId}". Bitte eine andere wählen.`
        );
        return;
      }

      await addDoc(collection(db, "seasons"), {
        id: seasonId,
        leagueCode: league.code,
        leagueLabel: league.label,
        teamIds,
        rounds: assignments.length,
        startDate: new Date(startMillis),
        endDate: new Date(endMillis),
        createdAt: serverTimestamp(),
        status: "active",
      });

      // 2) Spiele erzeugen (mit seasonId & matchday)
      const batch = writeBatch(db);
      assignments.forEach((md) => {
        md.games.forEach((g) => {
          const ref = doc(collection(db, "games"));
          batch.set(ref, {
            seasonId,
            matchday: md.matchday,
            teamHomeId: g.homeId,
            teamAwayId: g.awayId,
            teamIds: [g.homeId, g.awayId],
            competitionCategory: "LEAGUE",
            competitionCode: league.code,
            type: "League",
            status: "scheduled",
            scheduledStartTime: new Date(md.kickoff),
            createdAt: serverTimestamp(),
            simulationMode: "batch",
            homeScore: 0,
            awayScore: 0,
            simulationLog: [],
          });
        });
      });

      await batch.commit();

      // Reset & Success
      setPreview(null);
      setSeasonCode("");
      setSelectedTeams([]);
      setStartDateStr("");
      setEndDateStr("");
      setErrorMsg("");
      alert("Saison wurde angelegt und Spiele wurden erzeugt!");
    } catch (e) {
      console.error(e);
      setErrorMsg(e.message || "Fehler beim Anlegen der Saison.");
    }
  };

  // Lesbare Teamnamen
  const getTeamName = (id) => teamsById[id]?.name || id;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Saison anlegen (Liga-Modus)
      </Typography>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack spacing={2}>
          {/* Liga & Saison-ID */}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Autocomplete
              options={LEAGUES}
              getOptionLabel={(o) => o.label}
              value={league}
              onChange={(_, v) => setLeague(v || LEAGUES[0])}
              renderInput={(params) => (
                <TextField {...params} label="Liga" />
              )}
              sx={{ minWidth: 260 }}
            />

            <TextField
              label="Saison-ID / Name (z. B. BL-2025-26)"
              value={seasonCode}
              onChange={(e) => setSeasonCode(e.target.value)}
              fullWidth
            />
          </Stack>

          {/* Teams */}
          <Autocomplete
            multiple
            options={allTeams}
            value={selectedTeams}
            onChange={(_, v) => setSelectedTeams(v)}
            getOptionLabel={(o) => o.name}
            renderInput={(params) => (
              <TextField {...params} label="Teams auswählen" />
            )}
          />

          <Divider />

          {/* Zeitraum */}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Start (Datum)"
              type="date"
              value={startDateStr}
              onChange={(e) => setStartDateStr(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Ende (Datum)"
              type="date"
              value={endDateStr}
              onChange={(e) => setEndDateStr(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>

          {/* Wochentage */}
          <Box>
            <Typography sx={{ mb: 1, fontWeight: 600 }}>
              Erlaubte Spieltage (Wochentage)
            </Typography>
            <FormGroup row>
              {WEEKDAYS.map((wd) => (
                <FormControlLabel
                  key={wd.id}
                  control={
                    <Checkbox
                      checked={weekdayIds.includes(wd.id)}
                      onChange={() => handleToggleWeekday(wd.id)}
                    />
                  }
                  label={wd.label}
                />
              ))}
            </FormGroup>
          </Box>

          {/* Anstoßzeiten */}
          <Box>
            <Typography sx={{ mb: 1, fontWeight: 600 }}>
              Anstoßzeiten (mehrere möglich)
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
              {timeStrings.map((t, idx) => (
                <Stack
                  key={`${t}-${idx}`}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{
                    p: 1,
                    border: "1px dashed rgba(255,255,255,0.2)",
                    borderRadius: 1,
                  }}
                >
                  <TextField
                    type="time"
                    value={t}
                    onChange={(e) => updateTime(idx, e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                  />
                  <Button size="small" onClick={() => removeTime(idx)}>
                    Entfernen
                  </Button>
                </Stack>
              ))}
              <Chip label="+ Zeit hinzufügen" onClick={addTime} />
            </Stack>
          </Box>

          {/* Kapazitätsinfo */}
          <Alert
            severity={capacityInfo.ok ? "success" : "warning"}
            sx={{ mt: 1 }}
          >
            Verfügbare Termine (Slots): <b>{capacityInfo.slots}</b> &nbsp;|&nbsp;
            Benötigte Spieltage: <b>{capacityInfo.need}</b>
            {!capacityInfo.ok && (
              <>
                {" "}
                — Bitte Zeitraum/Wochentage/Zeiten erweitern (oder weniger
                Teams).
              </>
            )}
          </Alert>

          {/* Aktionen */}
          <Stack direction="row" spacing={2}>
            <Button variant="outlined" onClick={makePreview}>
              Vorschau generieren
            </Button>
            <Button
              variant="contained"
              onClick={createSeason}
              disabled={!preview}
            >
              Saison anlegen
            </Button>
          </Stack>

          {errorMsg && <Alert severity="error">{errorMsg}</Alert>}
        </Stack>
      </Paper>

      {/* Vorschau */}
      {preview && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Vorschau: {preview.seasonId} · {preview.league.label} —{" "}
            {preview.assignments.length} Spieltage
          </Typography>
          <Typography sx={{ mb: 2 }}>
            Zeitraum: {new Date(preview.startMillis).toLocaleDateString()} –{" "}
            {new Date(preview.endMillis).toLocaleDateString()}
          </Typography>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Spieltag</TableCell>
                <TableCell>Anstoß</TableCell>
                <TableCell>Partien</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {preview.assignments.map((md) => (
                <TableRow key={md.matchday}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    {md.matchday}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    {new Date(md.kickoff).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {md.games.map((g, i) => (
                      <div key={i}>
                        {getTeamName(g.homeId)} vs {getTeamName(g.awayId)}
                      </div>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Alert severity="info" sx={{ mt: 2 }}>
            Prüfe die Vorschau oben. Wenn etwas nicht passt (falscher Tag, Uhrzeit, Teams),
            ändere die Parameter und klicke erneut auf „Vorschau generieren“, bevor du
            „Saison anlegen“ drückst.
          </Alert>
        </Paper>
      )}
    </Box>
  );
}
