// src/pages/ChallengePage.js
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  Alert,
} from "@mui/material";
import ReplayIcon from "@mui/icons-material/Replay";
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";

/* ----------------- Utilities ----------------- */
function addMinutes(date, mins) {
  return new Date(date.getTime() + mins * 60000);
}
function toLocalDateTimeInputValue(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
function toMillisFromLocalInput(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.getTime();
}
function fmtDate(dOrTs) {
  const d =
    typeof dOrTs?.toDate === "function"
      ? dOrTs.toDate()
      : dOrTs instanceof Date
      ? dOrTs
      : new Date(typeof dOrTs?.seconds === "number" ? dOrTs.seconds * 1000 : dOrTs);
  if (isNaN(d)) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/* ----------------- Page ----------------- */
export default function ChallengePage() {
  const { user } = useAuth();

  // Tabs
  const [tab, setTab] = useState(0);

  // Mein Team
  const [myTeamId, setMyTeamId] = useState(user?.teamId || null);

  // Teams (Dropdown) + Map(id -> name) für Anzeigen
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teams, setTeams] = useState([]);
  const [teamNameMap, setTeamNameMap] = useState({});

  // Pool-Liste
  const [loadingPool, setLoadingPool] = useState(true);
  const [poolRows, setPoolRows] = useState([]);

  // Pool erstellen
  const defaultKickoff = useMemo(() => addMinutes(new Date(), 2), []);
  const [kickoffLocal, setKickoffLocal] = useState(toLocalDateTimeInputValue(defaultKickoff));
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Direkte Herausforderung
  const [opponentId, setOpponentId] = useState("");
  const [dirKickoffLocal, setDirKickoffLocal] = useState(toLocalDateTimeInputValue(defaultKickoff));
  const [dirNote, setDirNote] = useState("");
  const [creatingDirect, setCreatingDirect] = useState(false);

  // Snackbar
  const [toast, setToast] = useState({ open: false, message: "", severity: "info" });
  const openToast = (message, severity = "info") => setToast({ open: true, message, severity });
  const closeToast = () => setToast((t) => ({ ...t, open: false }));

  /* ---------- Mein Team ggf. aus users/{uid} holen ---------- */
  useEffect(() => {
    let active = true;
    (async () => {
      if (user?.teamId) {
        setMyTeamId(user.teamId);
        return;
      }
      if (!user?.uid) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const t = snap.exists() ? snap.data()?.teamId : null;
        if (active) setMyTeamId(t || null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.uid, user?.teamId]);

  /* ---------- Teams laden: für Dropdown & Name-Map ---------- */
  useEffect(() => {
    const loadTeams = async () => {
      setTeamsLoading(true);
      try {
        const snap = await getDocs(collection(db, "teams"));
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Dropdown ohne eigenes Team
        const filtered = myTeamId ? all.filter((t) => t.id !== myTeamId) : all;
        filtered.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setTeams(filtered);

        // Map für Namen
        const map = {};
        all.forEach((t) => {
          map[t.id] = t.name || t.shortName || t.code || t.id;
        });
        setTeamNameMap(map);
      } catch (e) {
        console.error("Teams laden fehlgeschlagen:", e);
      } finally {
        setTeamsLoading(false);
      }
    };
    loadTeams();
  }, [myTeamId]);

  /* ---------- Pool-Entries live lesen ---------- */
  useEffect(() => {
    const qPool = query(
      collection(db, "fs_pool"),
      where("status", "==", "open"),
      orderBy("kickoff", "asc")
    );
    const unsub = onSnapshot(
      qPool,
      (snap) => {
        setPoolRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoadingPool(false);
      },
      (err) => {
        console.error("FS-Pool laden fehlgeschlagen:", err);
        setLoadingPool(false);
      }
    );
    return () => unsub();
  }, []);

  /* ---------- Pool-FS erstellen ---------- */
  const createFsPool = async () => {
    if (!myTeamId) {
      openToast("Kein Team zugewiesen.", "error");
      return;
    }
    const kickoffMillis = toMillisFromLocalInput(kickoffLocal);
    if (!kickoffMillis) {
      openToast("Bitte ein gültiges Anstoßdatum/-zeit wählen.", "warning");
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, "fs_pool"), {
        creatorUid: user?.uid || null,
        creatorTeamId: myTeamId,
        kickoff: Timestamp.fromMillis(Number(kickoffMillis)),
        note: note.trim(),
        status: "open",
        createdAt: serverTimestamp(),
      });
      setNote("");
      openToast("FS in den Pool gestellt.", "success");
    } catch (e) {
      console.error(e);
      openToast(e?.message || "Erstellen fehlgeschlagen", "error");
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Pool-FS annehmen (Tx: prüfen & Game anlegen & Pool löschen) ---------- */
  const acceptFs = async (poolId) => {
    if (!poolId) return;
    if (!myTeamId) {
      openToast("Kein Team zugewiesen.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const resGameId = await runTransaction(db, async (tx) => {
        const poolRef = doc(db, "fs_pool", poolId);
        const poolSnap = await tx.get(poolRef);
        if (!poolSnap.exists()) throw new Error("FS existiert nicht mehr.");
        const p = poolSnap.data();
        if (p.status !== "open") throw new Error("FS ist nicht mehr offen.");
        if (p.creatorTeamId === myTeamId) throw new Error("Eigenes FS kann nicht angenommen werden.");

        const gameRef = doc(collection(db, "games"));
        tx.set(gameRef, {
          createdAt: serverTimestamp(),
          status: "scheduled",
          type: "FS",
          simulationMode: "batch",
          teamHomeId: p.creatorTeamId,
          teamAwayId: myTeamId,
          teamIds: [p.creatorTeamId, myTeamId],
          scheduledStartTime: p.kickoff || serverTimestamp(),
          note: p.note || "",
        });

        tx.delete(poolRef);
        return gameRef.id;
      });

      openToast("FS angenommen. Spiel erstellt.", "success");
      return resGameId;
    } catch (e) {
      console.error(e);
      openToast(e?.message || "Annehmen fehlgeschlagen", "error");
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Eigenes Pool-FS löschen (solange open) ---------- */
  const deleteOwnPool = async (poolId) => {
    if (!poolId || !myTeamId) return;
    setSubmitting(true);
    try {
      await runTransaction(db, async (tx) => {
        const poolRef = doc(db, "fs_pool", poolId);
        const poolSnap = await tx.get(poolRef);
        if (!poolSnap.exists()) throw new Error("Eintrag existiert nicht mehr.");
        const p = poolSnap.data();
        if (p.status !== "open") throw new Error("Eintrag ist nicht mehr offen.");
        if (p.creatorTeamId !== myTeamId) throw new Error("Nur eigene Pool-Einträge können gelöscht werden.");
        tx.delete(poolRef);
      });
      openToast("Pool-Eintrag gelöscht.", "success");
    } catch (e) {
      console.error(e);
      openToast(e?.message || "Löschen fehlgeschlagen", "error");
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Direktes Spiel anlegen ---------- */
  const createDirectChallenge = async () => {
    if (!myTeamId) {
      openToast("Kein Team zugewiesen.", "error");
      return;
    }
    if (!opponentId) {
      openToast("Bitte ein Gegner-Team auswählen.", "warning");
      return;
    }
    if (opponentId === myTeamId) {
      openToast("Eigenes Team kann nicht herausgefordert werden.", "warning");
      return;
    }
    const kickoffMillis = toMillisFromLocalInput(dirKickoffLocal);
    if (!kickoffMillis) {
      openToast("Bitte ein gültiges Anstoßdatum/-zeit wählen.", "warning");
      return;
    }

    setCreatingDirect(true);
    try {
      await addDoc(collection(db, "games"), {
        createdAt: serverTimestamp(),
        status: "scheduled",
        type: "FS",
        simulationMode: "batch",
        teamHomeId: myTeamId,
        teamAwayId: opponentId,
        teamIds: [myTeamId, opponentId],
        scheduledStartTime: Timestamp.fromMillis(kickoffMillis),
        note: dirNote.trim() || "",
      });
      setDirNote("");
      openToast("Herausforderung erstellt (scheduled).", "success");
    } catch (e) {
      console.error(e);
      openToast(e?.message || "Herausforderung fehlgeschlagen", "error");
    } finally {
      setCreatingDirect(false);
    }
  };

  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ py: 3 }}>
        <Paper elevation={2} sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Freundschaftsspiele</Typography>
          <Typography>Bitte zuerst anmelden.</Typography>
        </Paper>
      </Container>
    );
  }

  const refreshBtn = (
    <IconButton aria-label="Neu laden" onClick={() => window.location.reload()}>
      <ReplayIcon />
    </IconButton>
  );

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <SportsSoccerIcon />
          <Typography variant="h6">Freundschaftsspiele</Typography>
        </Stack>
        {refreshBtn}
      </Stack>

      <Paper elevation={2} sx={{ p: 1 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          aria-label="FS Tabs"
          sx={{ ".MuiTab-root": { textTransform: "none" } }}
          variant="fullWidth"
        >
          <Tab label="FS-Pool" />
          <Tab label="Gezielt herausfordern" />
        </Tabs>

        {/* TAB 0: FS-Pool */}
        {tab === 0 && (
          <Box sx={{ p: 2 }}>
            {/* Erstellen */}
            <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>FS in den Pool stellen</Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Anstoß"
                  type="datetime-local"
                  value={kickoffLocal}
                  onChange={(e) => setKickoffLocal(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
                <TextField
                  label="Notiz (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  fullWidth
                />
                <Button
                  variant="contained"
                  onClick={createFsPool}
                  disabled={submitting}
                  sx={{ minWidth: 180 }}
                >
                  In Pool stellen
                </Button>
              </Stack>
              <Typography variant="body2" sx={{ mt: 1.5 }} color="text.secondary">
                Standard-Anstoß ist automatisch <strong>+2 Minuten</strong> ab jetzt. Jedes Team kann dein FS annehmen.
              </Typography>
            </Paper>

            {/* Liste */}
            <Paper elevation={1} sx={{ p: 1 }}>
              {loadingPool ? (
                <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
                  <CircularProgress />
                </Box>
              ) : poolRows.length === 0 ? (
                <Box sx={{ py: 4, px: 2 }}>
                  <Typography variant="h6" gutterBottom>Keine offenen FS gefunden</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Erstelle oben ein neues FS, damit andere es annehmen können.
                  </Typography>
                </Box>
              ) : (
                <List disablePadding>
                  {poolRows.map((r, idx) => {
                    const kickoff = r.kickoff || r.kickoffMillis || r.kickoffAt;
                    const creatorName =
                      teamNameMap[r.creatorTeamId] || r.creatorTeamId || "Unbekannt";
                    const isOwn = myTeamId && r.creatorTeamId === myTeamId;
                    const info = [creatorName, r.note ? `Notiz: ${r.note}` : ""]
                      .filter(Boolean)
                      .join(" · ");

                    return (
                      <React.Fragment key={r.id}>
                        {idx !== 0 && (
                          <Box
                            component="hr"
                            sx={{ border: 0, borderTop: "1px solid #eee", m: 0 }}
                          />
                        )}
                        <ListItem
                          secondaryAction={
                            isOwn ? (
                              <IconButton
                                edge="end"
                                aria-label="löschen"
                                onClick={() => deleteOwnPool(r.id)}
                                disabled={submitting}
                                title="Eigenen Pool-Eintrag löschen"
                              >
                                <DeleteOutlineIcon />
                              </IconButton>
                            ) : (
                              <Button
                                size="small"
                                variant="contained"
                                disabled={submitting}
                                onClick={() => acceptFs(r.id)}
                              >
                                Annehmen
                              </Button>
                            )
                          }
                        >
                          <ListItemText
                            primaryTypographyProps={{ component: "div" }}
                            secondaryTypographyProps={{ component: "div" }}
                            primary={
                              <Stack
                                direction={{ xs: "column", sm: "row" }}
                                spacing={{ xs: 0.5, sm: 1.5 }}
                                alignItems={{ xs: "flex-start", sm: "center" }}
                                justifyContent="space-between"
                              >
                                <Box sx={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 1 }}>
                                  <Chip size="small" label="FS" />
                                  <span>Kickoff: {fmtDate(kickoff)}</span>
                                </Box>
                              </Stack>
                            }
                            secondary={
                              <Box sx={{ mt: 0.5 }}>
                                <Typography component="span" variant="body2" color="text.secondary">
                                  {info || "—"}
                                </Typography>
                              </Box>
                            }
                          />
                        </ListItem>
                      </React.Fragment>
                    );
                  })}
                </List>
              )}
            </Paper>
          </Box>
        )}

        {/* TAB 1: Direkt herausfordern */}
        {tab === 1 && (
          <Box sx={{ p: 2 }}>
            <Paper elevation={3} sx={{ p: 2 }}>
              <Typography sx={{ fontWeight: 700, mb: 2 }}>
                Team gezielt herausfordern (direkt ansetzen)
              </Typography>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
                <TextField
                  select
                  label={teamsLoading ? "Teams werden geladen…" : "Gegner-Team"}
                  value={opponentId}
                  onChange={(e) => setOpponentId(e.target.value)}
                  fullWidth
                  disabled={teamsLoading}
                >
                  {teams.map((t) => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.name || teamNameMap[t.id] || t.id}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  label="Anstoß"
                  type="datetime-local"
                  value={dirKickoffLocal}
                  onChange={(e) => setDirKickoffLocal(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Stack>

              <TextField
                label="Notiz (optional)"
                value={dirNote}
                onChange={(e) => setDirNote(e.target.value)}
                fullWidth
                sx={{ mb: 2 }}
              />

              <Stack direction="row" spacing={2}>
                <Button
                  variant="contained"
                  onClick={createDirectChallenge}
                  disabled={creatingDirect}
                >
                  Herausforderung erstellen
                </Button>
                <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>
                  Das Spiel wird unmittelbar als <strong>scheduled</strong> angelegt (Batch-Modus).
                </Typography>
              </Stack>
            </Paper>
          </Box>
        )}
      </Paper>

      {/* Snackbar */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={closeToast}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={closeToast} severity={toast.severity} variant="filled" sx={{ width: "100%" }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}
