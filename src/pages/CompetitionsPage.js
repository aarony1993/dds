import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  Chip,
  Stack,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Divider,
} from "@mui/material";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { Link as RouterLink } from "react-router-dom";

const LeagueTabs = {
  TABLE: 0,
  MATCHES: 1,
  SCORERS: 2,
  ASSISTS: 3,
  DRIBBLES: 4,
  TACKLES: 5,
};

export default function CompetitionsPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(LeagueTabs.TABLE);

  const [myTeam, setMyTeam] = useState(null);
  const [myLeagueCode, setMyLeagueCode] = useState(null);

  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState("");
  const [seasonMeta, setSeasonMeta] = useState(null);

  const [standings, setStandings] = useState([]);
  const [games, setGames] = useState([]);

  const [teamsById, setTeamsById] = useState({});
  const [playersById, setPlayersById] = useState({});

  // Initial: Team + zugehörige Seasons laden
  useEffect(() => {
    (async () => {
      if (!user?.teamId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const teamSnap = await getDoc(doc(db, "teams", user.teamId));
        if (!teamSnap.exists()) throw new Error("Team nicht gefunden");
        const team = { id: teamSnap.id, ...teamSnap.data() };
        setMyTeam(team);
        const leagueCode = team.leagueCode || team.league || null;
        setMyLeagueCode(leagueCode);

        let seasonsList = [];
        if (leagueCode) {
          const qSeasons = query(
            collection(db, "seasons"),
            where("leagueCode", "==", leagueCode)
          );
          const seSnap = await getDocs(qSeasons);
          seasonsList = seSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

          // aktive zuerst, dann nach Start (Timestamp oder createdAt) absteigend
          seasonsList.sort((a, b) => {
            const aActive = a.status === "active" ? 1 : 0;
            const bActive = b.status === "active" ? 1 : 0;
            if (aActive !== bActive) return bActive - aActive;

            const aStart = a.startDate?.seconds
              ? a.startDate.seconds * 1000
              : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
            const bStart = b.startDate?.seconds
              ? b.startDate.seconds * 1000
              : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
            return bStart - aStart;
          });
        }
        setSeasons(seasonsList);

        const initialSeasonId =
          team.currentSeasonId ||
          seasonsList.find((s) => s.status === "active")?.id ||
          seasonsList[0]?.id ||
          "";
        setSeasonId(initialSeasonId);
      } catch (e) {
        console.error("Competitions init error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, db]);

  // Namen cachen (Teams & Spieler aus playerStats)
  const loadNameCaches = async (seasonGames) => {
    const teamIds = new Set();
    seasonGames.forEach((g) => {
      teamIds.add(g.teamHomeId);
      teamIds.add(g.teamAwayId);
    });
    if (myTeam?.id) teamIds.add(myTeam.id);

    const teamsMap = {};
    await Promise.all(
      Array.from(teamIds).map(async (tid) => {
        const tSnap = await getDoc(doc(db, "teams", tid));
        if (tSnap.exists()) {
          const d = tSnap.data();
          teamsMap[tid] = { id: tid, name: d.name || tid };
        } else {
          teamsMap[tid] = { id: tid, name: tid };
        }
      })
    );
    setTeamsById(teamsMap);

    const playerIds = new Set();
    seasonGames.forEach((g) => {
      const ps = g.playerStats || {};
      Object.keys(ps).forEach((pid) => playerIds.add(pid));
    });

    const playersMap = {};
    await Promise.all(
      Array.from(playerIds).map(async (pid) => {
        const pSnap = await getDoc(doc(db, "players", pid));
        if (pSnap.exists()) {
          const pd = pSnap.data();
          playersMap[pid] = {
            id: pid,
            vorname: pd.vorname || "",
            nachname: pd.nachname || "",
            name: `${pd.vorname || ""} ${pd.nachname || ""}`.trim() || pid,
            teamId: pd.teamId || null,
          };
        } else {
          playersMap[pid] = { id: pid, name: pid, vorname: "", nachname: "" };
        }
      })
    );
    setPlayersById(playersMap);
  };

  // Saisonwechsel -> Meta, Tabelle, Spiele
  useEffect(() => {
    (async () => {
      if (!seasonId) return;
      setLoading(true);
      try {
        const sSnap = await getDoc(doc(db, "seasons", seasonId));
        setSeasonMeta(sSnap.exists() ? { id: sSnap.id, ...sSnap.data() } : null);

        const stSnap = await getDocs(
          collection(db, "seasons", seasonId, "leagueStandings")
        );
        let st = stSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        st.sort((a, b) => {
          if ((b.pts || 0) !== (a.pts || 0)) return (b.pts || 0) - (a.pts || 0);
          if ((b.gd || 0) !== (a.gd || 0)) return (b.gd || 0) - (a.gd || 0);
          return (b.gf || 0) - (a.gf || 0);
        });
        setStandings(st);

        const gSnap = await getDocs(
          query(collection(db, "games"), where("seasonId", "==", seasonId))
        );
        const gs = gSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const mdA = a.matchday || 0;
            const mdB = b.matchday || 0;
            if (mdA !== mdB) return mdA - mdB;
            const ka =
              (a.kickoff?.seconds || 0) * 1000 ||
              (typeof a.kickoff === "number" ? a.kickoff : 0);
            const kb =
              (b.kickoff?.seconds || 0) * 1000 ||
              (typeof b.kickoff === "number" ? b.kickoff : 0);
            return ka - kb;
          });
        setGames(gs);

        await loadNameCaches(gs);
      } catch (e) {
        console.error("load season data err:", e);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  // Rankings aus playerStats aggregieren
  const rankings = useMemo(() => {
    const agg = {};
    for (const g of games) {
      const ps = g.playerStats || {};
      for (const pid of Object.keys(ps)) {
        const s = ps[pid] || {};
        if (!agg[pid]) {
          agg[pid] = {
            goals: 0,
            assists: 0,
            dribblesSucceeded: 0,
            dribbles: 0,
            tacklesSucceeded: 0,
            tackles: 0,
          };
        }
        agg[pid].goals += s.goals || 0;
        agg[pid].assists += s.assists || 0;
        agg[pid].dribblesSucceeded += s.dribblesSucceeded || 0;
        agg[pid].dribbles += s.dribbles || 0;
        agg[pid].tacklesSucceeded += s.tacklesSucceeded || 0;
        agg[pid].tackles += s.tackles || 0;
      }
    }

    const toSorted = (key, ratio = false, ratioNumKey = "", minAttempts = 0) => {
      const arr = Object.keys(agg).map((pid) => {
        const base = agg[pid];
        const player = playersById[pid] || { name: pid, teamId: null };
        let value = base[key] || 0;
        if (ratio && ratioNumKey) {
          const denom = base[ratioNumKey] || 0;
          value = denom > 0 ? base[key] / denom : 0;
        }
        return {
          playerId: pid,
          playerName: player.name,
          teamId: player.teamId,
          value,
          raw: base,
        };
      });

      const filtered = ratio
        ? arr.filter((x) => (x.raw[ratioNumKey] || 0) >= minAttempts)
        : arr;

      filtered.sort((a, b) => b.value - a.value);
      return filtered;
    };

    return {
      scorers: toSorted("goals"),
      assisters: toSorted("assists"),
      dribblers: toSorted("dribblesSucceeded", true, "dribbles", 10),
      tacklers: toSorted("tacklesSucceeded", true, "tackles", 10),
    };
  }, [games, playersById]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Wettbewerbe
        </Typography>

        <FormControl size="small" sx={{ minWidth: 260 }}>
          <InputLabel id="season-select-label">Saison</InputLabel>
          <Select
            labelId="season-select-label"
            label="Saison"
            value={seasonId || ""}
            onChange={(e) => setSeasonId(e.target.value)}
          >
            {seasons.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name || `${s.leagueCode || "Liga"} ${s.year || ""}`} ({s.status || "?"})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {seasonMeta && (
        <Typography sx={{ mb: 2, opacity: 0.8 }}>
          {seasonMeta.name || seasonMeta.id} · {seasonMeta.leagueCode} · Status:{" "}
          <Chip size="small" label={seasonMeta.status || "unbekannt"} />
        </Typography>
      )}

      <Paper sx={{ p: 2 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ ".MuiTab-root": { textTransform: "none" } }}
        >
          <Tab label="Tabelle" />
          <Tab label="Spiele" />
          <Tab label="Torjäger" />
          <Tab label="Vorlagen" />
          <Tab label="Dribbler" />
          <Tab label="Zweikämpfe" />
        </Tabs>

        {/* Tabelle */}
        {tab === LeagueTabs.TABLE && (
          <Box sx={{ mt: 2 }}>
            <TableContainer component={Paper} elevation={0}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Team</TableCell>
                    <TableCell align="right">Sp</TableCell>
                    <TableCell align="right">S</TableCell>
                    <TableCell align="right">U</TableCell>
                    <TableCell align="right">N</TableCell>
                    <TableCell align="right">Tore</TableCell>
                    <TableCell align="right">Diff</TableCell>
                    <TableCell align="right">Pkt</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {standings.map((row, idx) => (
                    <TableRow key={row.teamId || idx} hover>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell>{teamsById[row.teamId]?.name || row.teamId}</TableCell>
                      <TableCell align="right">{row.gp ?? "-"}</TableCell>
                      <TableCell align="right">{row.w ?? "-"}</TableCell>
                      <TableCell align="right">{row.d ?? "-"}</TableCell>
                      <TableCell align="right">{row.l ?? "-"}</TableCell>
                      <TableCell align="right">
                        {(row.gf ?? 0) + ":" + (row.ga ?? 0)}
                      </TableCell>
                      <TableCell align="right">
                        {row.gd ?? (row.gf || 0) - (row.ga || 0)}
                      </TableCell>
                      <TableCell align="right">
                        <Chip size="small" label={row.pts ?? 0} color="primary" />
                      </TableCell>
                    </TableRow>
                  ))}
                  {standings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9}>
                        <Typography sx={{ opacity: 0.8 }}>
                          Noch keine Tabelle vorhanden.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Spiele */}
        {tab === LeagueTabs.MATCHES && (
          <Box sx={{ mt: 2 }}>
            {games.length === 0 ? (
              <Typography sx={{ opacity: 0.8 }}>Keine Spiele gefunden.</Typography>
            ) : (
              <List>
                {games.map((g) => {
                  const h = teamsById[g.teamHomeId]?.name || g.teamHomeId;
                  const a = teamsById[g.teamAwayId]?.name || g.teamAwayId;
                  const md = g.matchday ? `MD ${g.matchday} · ` : "";
                  const ko = g.kickoff?.seconds
                    ? new Date(g.kickoff.seconds * 1000)
                    : new Date(g.kickoff || 0);
                  const koStr = isNaN(ko?.getTime?.()) ? "" : ko.toLocaleString();
                  const score =
                    g.status === "finished"
                      ? `${g.homeScore ?? 0} : ${g.awayScore ?? 0}`
                      : g.status === "live"
                      ? "LIVE"
                      : "—";
                  return (
                    <React.Fragment key={g.id}>
                      <ListItem
                        disablePadding
                        secondaryAction={
                          <Chip
                            size="small"
                            label={g.status || "scheduled"}
                            color={
                              g.status === "finished"
                                ? "success"
                                : g.status === "live"
                                ? "warning"
                                : "default"
                            }
                          />
                        }
                      >
                        <ListItemButton
                          component={RouterLink}
                          to={`/match/${g.id}`}
                          aria-label="Spiel-Details"
                        >
                          <ListItemText
                            primary={`${h} ${score} ${a}`}
                            secondary={`${md}${koStr}`}
                          />
                        </ListItemButton>
                      </ListItem>
                      <Divider component="li" />
                    </React.Fragment>
                  );
                })}
              </List>
            )}
          </Box>
        )}

        {/* Rankings */}
        {tab !== LeagueTabs.TABLE && tab !== LeagueTabs.MATCHES && (
          <Box sx={{ mt: 2 }}>
            <TableContainer component={Paper} elevation={0}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Spieler</TableCell>
                    <TableCell>Team</TableCell>
                    <TableCell align="right">
                      {tab === LeagueTabs.SCORERS && "Tore"}
                      {tab === LeagueTabs.ASSISTS && "Vorlagen"}
                      {tab === LeagueTabs.DRIBBLES && "Erfolgsquote Dribblings"}
                      {tab === LeagueTabs.TACKLES && "Erfolgsquote Zweikämpfe"}
                    </TableCell>
                    {(tab === LeagueTabs.DRIBBLES || tab === LeagueTabs.TACKLES) && (
                      <TableCell align="right">Versuche</TableCell>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(tab === LeagueTabs.SCORERS
                    ? rankings.scorers
                    : tab === LeagueTabs.ASSISTS
                    ? rankings.assisters
                    : tab === LeagueTabs.DRIBBLES
                    ? rankings.dribblers
                    : rankings.tacklers
                  )
                    .slice(0, 100)
                    .map((r, idx) => {
                      const teamName = teamsById[r.teamId]?.name || r.teamId || "—";
                      let valueLabel = r.value;
                      if (tab === LeagueTabs.DRIBBLES || tab === LeagueTabs.TACKLES) {
                        valueLabel = `${(r.value * 100).toFixed(1)}%`;
                      }
                      const attempts =
                        tab === LeagueTabs.DRIBBLES ? r.raw.dribbles :
                        tab === LeagueTabs.TACKLES ? r.raw.tackles : null;

                      return (
                        <TableRow key={r.playerId || idx} hover>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell>
                            <RouterLink
                              to={r.playerId ? `/player/${r.playerId}` : "#"}
                              style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}
                            >
                              {r.playerName}
                            </RouterLink>
                          </TableCell>
                          <TableCell>{teamName}</TableCell>
                          <TableCell align="right">{valueLabel}</TableCell>
                          {(tab === LeagueTabs.DRIBBLES || tab === LeagueTabs.TACKLES) && (
                            <TableCell align="right">{attempts ?? 0}</TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
