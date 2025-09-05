import React, { useEffect, useMemo, useState } from "react";
import {
  Box, Paper, Typography, MenuItem, Select, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, List, ListItemAvatar, Avatar, ListItemText,
  Tooltip, CircularProgress, FormControl, FormLabel, RadioGroup,
  FormControlLabel, Radio, Divider, ListItemButton, Tabs, Tab, Chip, Stack, TextField, IconButton,
  Switch, Slider
} from "@mui/material";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import {
  collection, query, where, getDocs, doc, getDoc, updateDoc,
  addDoc, deleteDoc, serverTimestamp, updateDoc as updateDocAlias
} from "firebase/firestore";
import DeleteIcon from "@mui/icons-material/Delete";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import CheckIcon from "@mui/icons-material/Check";

// --- Konstanten ---
const positionGroupMapping = {
  TW: "TOR", IV: "DEF", LV: "DEF", RV: "DEF", ZDM: "MID", ZM: "MID",
  LM: "MID", RM: "MID", ZOM: "MID", HS: "ATT", ST: "ATT", MS: "ATT",
  LA: "ATT", RA: "ATT"
};

const formations = {
  "4-4-2 Flach": [
    { pos: "TW", x: 50, y: 96 },
    { pos: "LV", x: 16, y: 78 }, { pos: "IV1", x: 34, y: 83 }, { pos: "IV2", x: 66, y: 83 }, { pos: "RV", x: 84, y: 78 },
    { pos: "LM", x: 16, y: 59 }, { pos: "ZM1", x: 37, y: 62 }, { pos: "ZM2", x: 63, y: 62 }, { pos: "RM", x: 84, y: 59 },
    { pos: "ST1", x: 40, y: 35 }, { pos: "ST2", x: 60, y: 35 }
  ],
  "4-4-2 Raute": [
    { pos: "TW", x: 50, y: 96 },
    { pos: "LV", x: 16, y: 78 }, { pos: "IV1", x: 34, y: 83 }, { pos: "IV2", x: 66, y: 83 }, { pos: "RV", x: 84, y: 78 },
    { pos: "ZDM", x: 50, y: 68 }, { pos: "LM", x: 28, y: 58 }, { pos: "RM", x: 72, y: 58 }, { pos: "ZOM", x: 50, y: 50 },
    { pos: "ST1", x: 40, y: 34 }, { pos: "ST2", x: 60, y: 34 }
  ],
  "4-3-3": [
    { pos: "TW", x: 50, y: 96 },
    { pos: "LV", x: 16, y: 78 }, { pos: "IV1", x: 34, y: 83 }, { pos: "IV2", x: 66, y: 83 }, { pos: "RV", x: 84, y: 78 },
    { pos: "ZM1", x: 32, y: 66 }, { pos: "ZM2", x: 68, y: 66 }, { pos: "ZM3", x: 50, y: 54 },
    { pos: "LA", x: 18, y: 40 }, { pos: "ST", x: 50, y: 32 }, { pos: "RA", x: 82, y: 40 }
  ],
  "4-2-3-1": [
    { pos: "TW", x: 50, y: 96 },
    { pos: "LV", x: 16, y: 78 }, { pos: "IV1", x: 34, y: 83 }, { pos: "IV2", x: 66, y: 83 }, { pos: "RV", x: 84, y: 78 },
    { pos: "ZDM1", x: 38, y: 68 }, { pos: "ZDM2", x: 62, y: 68 },
    { pos: "LA", x: 20, y: 52 }, { pos: "ZOM", x: 50, y: 48 }, { pos: "RA", x: 80, y: 52 },
    { pos: "ST", x: 50, y: 34 }
  ],
  "3-5-2": [
    { pos: "TW", x: 50, y: 96 },
    { pos: "IV1", x: 28, y: 83 }, { pos: "IV2", x: 50, y: 86 }, { pos: "IV3", x: 72, y: 83 },
    { pos: "LM", x: 16, y: 62 }, { pos: "ZDM", x: 38, y: 64 }, { pos: "ZM", x: 50, y: 58 }, { pos: "ZOM", x: 62, y: 52 }, { pos: "RM", x: 84, y: 62 },
    { pos: "ST1", x: 42, y: 36 }, { pos: "ST2", x: 58, y: 36 }
  ],
  "3-4-3": [
    { pos: "TW", x: 50, y: 96 },
    { pos: "IV1", x: 30, y: 83 }, { pos: "IV2", x: 50, y: 86 }, { pos: "IV3", x: 70, y: 83 },
    { pos: "LM", x: 20, y: 60 }, { pos: "ZM1", x: 42, y: 62 }, { pos: "ZM2", x: 58, y: 62 }, { pos: "RM", x: 80, y: 60 },
    { pos: "LA", x: 28, y: 40 }, { pos: "ST", x: 50, y: 34 }, { pos: "RA", x: 72, y: 40 }
  ],
  "4-1-4-1": [
    { pos: "TW", x: 50, y: 96 },
    { pos: "LV", x: 16, y: 78 }, { pos: "IV1", x: 34, y: 83 }, { pos: "IV2", x: 66, y: 83 }, { pos: "RV", x: 84, y: 78 },
    { pos: "ZDM", x: 50, y: 70 },
    { pos: "LM", x: 20, y: 58 }, { pos: "ZM1", x: 40, y: 58 }, { pos: "ZM2", x: 60, y: 58 }, { pos: "RM", x: 80, y: 58 },
    { pos: "ST", x: 50, y: 36 }
  ],
  "5-3-2": [
    { pos: "TW", x: 50, y: 96 },
    { pos: "LV", x: 12, y: 78 }, { pos: "IV1", x: 30, y: 83 }, { pos: "IV2", x: 50, y: 86 }, { pos: "IV3", x: 70, y: 83 }, { pos: "RV", x: 88, y: 78 },
    { pos: "ZM1", x: 38, y: 64 }, { pos: "ZM2", x: 50, y: 60 }, { pos: "ZM3", x: 62, y: 64 },
    { pos: "ST1", x: 42, y: 38 }, { pos: "ST2", x: 58, y: 38 }
  ],
  "4-5-1": [
    { pos: "TW", x: 50, y: 96 },
    { pos: "LV", x: 16, y: 78 }, { pos: "IV1", x: 34, y: 83 }, { pos: "IV2", x: 66, y: 83 }, { pos: "RV", x: 84, y: 78 },
    { pos: "LM", x: 20, y: 60 }, { pos: "ZM1", x: 36, y: 62 }, { pos: "ZM2", x: 50, y: 58 }, { pos: "ZM3", x: 64, y: 62 }, { pos: "RM", x: 80, y: 60 },
    { pos: "ST", x: 50, y: 36 }
  ],
};

// --- Helpers ---
const basePos = (posKey) => posKey.replace(/[0-9]/g, "");
const canPlayPosition = (player, posKey) => {
  if (!player) return false;
  const base = basePos(posKey);
  const group = positionGroupMapping[base];
  return player.position === base || player.positionGroup === group;
};

function roleOptionsForBase(base) {
  const group = positionGroupMapping[base] || base;
  switch (group) {
    case "TOR":
      return [
        { v: "auto", l: "Auto" },
        { v: "sweeper-keeper", l: "Mitspielender TW" },
        { v: "shot-stopper", l: "Linien-TW" },
      ];
    case "DEF":
      return [
        { v: "auto", l: "Auto" },
        { v: "ball-playing", l: "Aufbau-/Spielmacher (hinten)" },
        { v: "stopper", l: "Abräumer/Stopper" },
        { v: "fullback-overlap", l: "Außen: Überlaufend" },
        { v: "inverted-fullback", l: "Außen: Invers" },
      ];
    case "MID":
      return [
        { v: "auto", l: "Auto" },
        { v: "deep-lying", l: "Tiefer Spielmacher" },
        { v: "ball-winning", l: "Zweikämpfer" },
        { v: "box-to-box", l: "Box-to-Box" },
        { v: "enganche", l: "Zehner" },
      ];
    case "ATT":
      return [
        { v: "auto", l: "Auto" },
        { v: "target", l: "Zielspieler" },
        { v: "poacher", l: "Knipser" },
        { v: "false9", l: "Falsche Neun" },
        { v: "inside-forward", l: "Invertierter Flügel" },
        { v: "touchline-winger", l: "Linienkleber" },
      ];
    default:
      return [{ v: "auto", l: "Auto" }];
  }
}

// --- Hauptkomponente ---
export default function Taktikboard() {
  const { user } = useAuth();

  // UI State
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectingPos, setSelectingPos] = useState(null);

  // Daten
  const [players, setPlayers] = useState([]);
  const [formationKey, setFormationKey] = useState("4-4-2 Flach");
  const [fieldPlayers, setFieldPlayers] = useState({}); // { posKey: { playerId, instructions } }

  // Team-Anweisungen (neu erweitert)
  const [defensiveLine, setDefensiveLine] = useState("normal"); // tief | normal | hoch
  const [passStyle, setPassStyle] = useState("gemischt");       // sicher | gemischt | riskant
  const [pressing, setPressing] = useState("mittel");           // tief | mittel | hoch
  const [tempo, setTempo] = useState(50);                       // 0-100 Slider
  const [width, setWidth] = useState("normal");                 // eng | normal | breit
  const [counterPress, setCounterPress] = useState(true);       // boolean
  const [timeWaste, setTimeWaste] = useState("aus");            // aus | leicht | stark

  // Save-Status
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [lastSaved, setLastSaved] = useState(null);

  // Vorlagen
  const [templates, setTemplates] = useState([]); // {id, name, formationKey, fieldPlayers, defensiveLine, passStyle, pressing, tempo, width, counterPress, timeWaste, createdAt}
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [renameId, setRenameId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const formation = formations[formationKey] || [];
  const getPlayerById = (id) => players.find((p) => p.id === id);
  const getPlayerForPos = (posKey) => getPlayerById(fieldPlayers[posKey]?.playerId);

  const onPitchPlayers = useMemo(() => {
    return formation
      .map((f) => {
        const fp = fieldPlayers[f.pos];
        if (!fp?.playerId) return null;
        const pl = getPlayerById(fp.playerId);
        if (!pl) return null;
        return { ...pl, positionKey: f.pos, instructions: fp.instructions || {} };
      })
      .filter(Boolean);
  }, [formation, fieldPlayers, players]);

  // --- Initial Load ---
  useEffect(() => {
    const fetchData = async () => {
      if (!user?.teamId) { setLoading(false); return; }
      setLoading(true);
      try {
        const teamRef = doc(db, "teams", user.teamId);
        const teamSnap = await getDoc(teamRef);
        const playerSnap = await getDocs(
          query(collection(db, "players"), where("teamId", "==", user.teamId))
        );
        setPlayers(playerSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

        if (teamSnap.exists()) {
          const t = teamSnap.data();
          if (t.formationKey && formations[t.formationKey]) setFormationKey(t.formationKey);
          if (Array.isArray(t.defaultFormation)) {
            const fp = {};
            t.defaultFormation.forEach((f) => {
              if (f?.positionKey && f?.playerId) {
                fp[f.positionKey] = {
                  playerId: f.playerId,
                  instructions: f.instructions || {},
                };
              }
            });
            setFieldPlayers(fp);
          }
          // alte Felder
          setDefensiveLine(t.tacticDefensiveLine || "normal");
          setPassStyle(t.tacticPassStyle || "gemischt");
          // neue Felder (mit Defaults)
          setPressing(t.tacticPressing || "mittel");
          setTempo(typeof t.tacticTempo === "number" ? t.tacticTempo : 50);
          setWidth(t.tacticWidth || "normal");
          setCounterPress(typeof t.tacticCounterPress === "boolean" ? t.tacticCounterPress : true);
          setTimeWaste(t.tacticTimeWaste || "aus");
        }

        await loadTemplates(); // Vorlagen laden
      } catch (e) {
        console.error("Fehler beim Laden:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadTemplates = async () => {
    if (!user?.teamId) return;
    try {
      const colRef = collection(db, "teams", user.teamId, "tacticTemplates");
      const snap = await getDocs(colRef);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setTemplates(list);
    } catch (e) {
      console.error("Vorlagen laden fehlgeschlagen:", e);
    }
  };

  // --- Autosave (debounced) ---
  useEffect(() => {
    if (!user?.teamId || loading) return;
    setSaveState("saving");
    const tid = setTimeout(async () => {
      try {
        const formationData = formation
          .map((pos) => {
            const fp = fieldPlayers[pos.pos];
            if (!fp?.playerId) return null;
            return {
              positionKey: pos.pos,
              position: basePos(pos.pos),
              playerId: fp.playerId,
              instructions: fp.instructions || {},
            };
          })
          .filter(Boolean);

        await updateDoc(doc(db, "teams", user.teamId), {
          defaultFormation: formationData,
          formationKey,
          // alt
          tacticDefensiveLine: defensiveLine,
          tacticPassStyle: passStyle,
          // neu
          tacticPressing: pressing,
          tacticTempo: tempo,
          tacticWidth: width,
          tacticCounterPress: counterPress,
          tacticTimeWaste: timeWaste,
        });
        setSaveState("saved");
        setLastSaved(new Date());
      } catch (e) {
        console.error("Autosave Fehler:", e);
        setSaveState("error");
      }
    }, 600);
    return () => clearTimeout(tid);
  }, [
    user?.teamId, loading, fieldPlayers, formationKey,
    defensiveLine, passStyle, pressing, tempo, width, counterPress, timeWaste, formation
  ]);

  // --- Handlers ---
  const handleFormationChange = (e) => {
    setFormationKey(e.target.value);
    setFieldPlayers({}); // bewusst leeren bei Formation-Wechsel
  };

  const handleSelectPlayer = (posKey, playerId) => {
    setFieldPlayers((prev) => ({
      ...prev,
      [posKey]: { playerId, instructions: prev[posKey]?.instructions || {} },
    }));
    setSelectingPos(null);
  };

  const handleRemovePlayer = (posKey) => {
    setFieldPlayers((prev) => {
      const next = { ...prev };
      delete next[posKey];
      return next;
    });
  };

  const handleInstructionChange = (playerId, key, value) => {
    const posKey = Object.keys(fieldPlayers).find(
      (k) => fieldPlayers[k]?.playerId === playerId
    );
    if (!posKey) return;
    setFieldPlayers((prev) => ({
      ...prev,
      [posKey]: {
        ...prev[posKey],
        instructions: { ...(prev[posKey]?.instructions || {}), [key]: value },
      },
    }));
  };

  const handleDropOnPos = (fromPos, toPos) => {
    if (!fromPos || !toPos || fromPos === toPos) return;
    setFieldPlayers((prev) => {
      const fromData = prev[fromPos];
      const toData = prev[toPos];
      if (!fromData?.playerId) return prev;
      const fromPlayer = getPlayerById(fromData.playerId);
      const toPlayer = toData?.playerId ? getPlayerById(toData.playerId) : null;
      if (!canPlayPosition(fromPlayer, toPos)) return prev;

      const next = { ...prev };
      if (!toPlayer) {
        next[toPos] = { ...fromData };
        delete next[fromPos];
        return next;
      }
      if (!canPlayPosition(toPlayer, fromPos)) return prev;
      next[toPos] = { ...fromData };
      next[fromPos] = { ...toData };
      return next;
    });
  };

  const getEligiblePlayers = (posKey) => {
    if (!posKey) return [];
    const base = basePos(posKey);
    const group = positionGroupMapping[base];
    const usedIds = Object.values(fieldPlayers).map((p) => p.playerId);
    return players.filter(
      (p) =>
        (p.positionGroup === group || p.position === base) &&
        !usedIds.includes(p.id)
    );
  };

  // --- Templates CRUD ---
  const openSaveTemplate = () => {
    setTemplateName("");
    setSaveTemplateOpen(true);
  };

  const saveTemplate = async () => {
    if (!user?.teamId) return;
    const trimmed = templateName.trim();
    if (!trimmed) return;
    const payload = {
      name: trimmed,
      formationKey,
      fieldPlayers,
      defensiveLine,
      passStyle,
      // neu
      pressing,
      tempo,
      width,
      counterPress,
      timeWaste,
      createdAt: serverTimestamp(),
    };
    try {
      await addDoc(collection(db, "teams", user.teamId, "tacticTemplates"), payload);
      setSaveTemplateOpen(false);
      setTemplateName("");
      await loadTemplates();
    } catch (e) {
      console.error("Vorlage speichern fehlgeschlagen:", e);
    }
  };

  const applyTemplate = (tpl) => {
    if (!tpl) return;
    setFormationKey(tpl.formationKey);
    setFieldPlayers(tpl.fieldPlayers || {});
    setDefensiveLine(tpl.defensiveLine || "normal");
    setPassStyle(tpl.passStyle || "gemischt");
    // neu
    setPressing(tpl.pressing || "mittel");
    setTempo(typeof tpl.tempo === "number" ? tpl.tempo : 50);
    setWidth(tpl.width || "normal");
    setCounterPress(typeof tpl.counterPress === "boolean" ? tpl.counterPress : true);
    setTimeWaste(tpl.timeWaste || "aus");
  };

  const deleteTemplate = async (id) => {
    if (!user?.teamId || !id) return;
    try {
      await deleteDoc(doc(db, "teams", user.teamId, "tacticTemplates", id));
      await loadTemplates();
    } catch (e) {
      console.error("Vorlage löschen fehlgeschlagen:", e);
    }
  };

  const startRename = (tpl) => {
    setRenameId(tpl.id);
    setRenameValue(tpl.name || "");
  };

  const commitRename = async () => {
    if (!user?.teamId || !renameId) return;
    try {
      await updateDocAlias(
        doc(db, "teams", user.teamId, "tacticTemplates", renameId),
        { name: renameValue.trim() || "Unbenannt" }
      );
      setRenameId(null);
      setRenameValue("");
      await loadTemplates();
    } catch (e) {
      console.error("Vorlage umbenennen fehlgeschlagen:", e);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ width: "100%" }}>
      {/* Header mit Tabs + Save-Status */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, pt: 2 }}
      >
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          aria-label="Taktik Tabs"
          sx={{ ".MuiTab-root": { textTransform: "none" } }}
        >
          <Tab label="Formation & Taktik" />
          <Tab label="Spieleranweisungen" />
          <Tab label="Vorlagen" />
        </Tabs>

        <Stack direction="row" spacing={1} alignItems="center">
          {saveState === "saving" && <Chip label="Speichern…" size="small" />}
          {saveState === "saved" && (
            <Chip
              color="success"
              label={
                lastSaved
                  ? `Gespeichert · ${lastSaved.toLocaleTimeString()}`
                  : "Gespeichert"
              }
              size="small"
            />
          )}
          {saveState === "error" && (
            <Chip color="error" label="Speichern fehlgeschlagen" size="small" />
          )}
        </Stack>
      </Stack>

      {/* TAB 0: Formation & Taktik */}
      {tab === 0 && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 4,
            mt: 4,
            p: 2,
          }}
        >
          <Paper
            elevation={6}
            sx={{
              p: 4,
              width: { xs: "90%", md: 360 },
              bgcolor: "#212933",
              color: "#fff",
              borderRadius: 4,
            }}
          >
            <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>
              Taktik
            </Typography>
            <Divider sx={{ bgcolor: "#444", my: 2 }} />

            <Typography variant="h6" sx={{ mb: 1, color: "#ffc447" }}>
              Formation
            </Typography>
            <Select
              fullWidth
              value={formationKey}
              onChange={handleFormationChange}
              sx={{ mb: 3, color: "#fff", bgcolor: "#1a232b" }}
            >
              {Object.keys(formations).map((fk) => (
                <MenuItem key={fk} value={fk}>
                  {fk}
                </MenuItem>
              ))}
            </Select>

            <Divider sx={{ bgcolor: "#444", my: 2 }} />

            <Typography variant="h6" sx={{ mb: 2, color: "#ffc447" }}>
              Team-Anweisungen
            </Typography>

            <FormControl component="fieldset" sx={{ mb: 1.5 }}>
              <FormLabel component="legend" sx={{ color: "#fff", fontSize: "0.9rem" }}>
                Abwehrlinie
              </FormLabel>
              <RadioGroup
                row
                value={defensiveLine}
                onChange={(e) => setDefensiveLine(e.target.value)}
              >
                <FormControlLabel
                  value="tief"
                  control={<Radio size="small" sx={{ color: "#888", "&.Mui-checked": { color: "#ffc447" } }} />}
                  label="Tief"
                />
                <FormControlLabel
                  value="normal"
                  control={<Radio size="small" sx={{ color: "#888", "&.Mui-checked": { color: "#ffc447" } }} />}
                  label="Normal"
                />
                <FormControlLabel
                  value="hoch"
                  control={<Radio size="small" sx={{ color: "#888", "&.Mui-checked": { color: "#ffc447" } }} />}
                  label="Hoch"
                />
              </RadioGroup>
            </FormControl>

            <FormControl component="fieldset" sx={{ mb: 1.5 }}>
              <FormLabel component="legend" sx={{ color: "#fff", fontSize: "0.9rem" }}>
                Pass-Stil
              </FormLabel>
              <RadioGroup row value={passStyle} onChange={(e) => setPassStyle(e.target.value)}>
                <FormControlLabel
                  value="sicher"
                  control={<Radio size="small" sx={{ color: "#888", "&.Mui-checked": { color: "#ffc447" } }} />}
                  label="Sicher"
                />
                <FormControlLabel
                  value="gemischt"
                  control={<Radio size="small" sx={{ color: "#888", "&.Mui-checked": { color: "#ffc447" } }} />}
                  label="Gemischt"
                />
                <FormControlLabel
                  value="riskant"
                  control={<Radio size="small" sx={{ color: "#888", "&.Mui-checked": { color: "#ffc447" } }} />}
                  label="Riskant"
                />
              </RadioGroup>
            </FormControl>

            {/* Neu: Pressing */}
            <FormControl component="fieldset" sx={{ mb: 1.5 }}>
              <FormLabel component="legend" sx={{ color: "#fff", fontSize: "0.9rem" }}>
                Pressing
              </FormLabel>
              <RadioGroup row value={pressing} onChange={(e) => setPressing(e.target.value)}>
                <FormControlLabel value="tief" label="Tief" control={<Radio size="small" sx={{ color: "#888", "&.Mui-checked": { color: "#ffc447" } }} />} />
                <FormControlLabel value="mittel" label="Mittel" control={<Radio size="small" sx={{ color: "#888", "&.Mui-checked": { color: "#ffc447" } }} />} />
                <FormControlLabel value="hoch" label="Hoch" control={<Radio size="small" sx={{ color: "#888", "&.Mui-checked": { color: "#ffc447" } }} />} />
              </RadioGroup>
            </FormControl>

            {/* Neu: Tempo (Slider 0–100) */}
            <Box sx={{ mb: 2 }}>
              <FormLabel component="legend" sx={{ color: "#fff", fontSize: "0.9rem" }}>
                Tempo ({tempo})
              </FormLabel>
              <Slider
                value={tempo}
                min={0}
                max={100}
                step={5}
                onChange={(_, v) => setTempo(Array.isArray(v) ? v[0] : v)}
              />
            </Box>

            {/* Neu: Breite */}
            <FormControl component="fieldset" sx={{ mb: 1.5 }}>
              <FormLabel component="legend" sx={{ color: "#fff", fontSize: "0.9rem" }}>
                Spielbreite
              </FormLabel>
              <RadioGroup row value={width} onChange={(e) => setWidth(e.target.value)}>
                <FormControlLabel value="eng" label="Eng" control={<Radio size="small" sx={{ color: "#888", "&.Mui-checked": { color: "#ffc447" } }} />} />
                <FormControlLabel value="normal" label="Normal" control={<Radio size="small" sx={{ color: "#888", "&.Mui-checked": { color: "#ffc447" } }} />} />
                <FormControlLabel value="breit" label="Breit" control={<Radio size="small" sx={{ color: "#888", "&.Mui-checked": { color: "#ffc447" } }} />} />
              </RadioGroup>
            </FormControl>

            {/* Neu: Gegenpressing */}
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
              <FormLabel component="legend" sx={{ color: "#fff", fontSize: "0.9rem" }}>
                Gegenpressing
              </FormLabel>
              <Switch
                checked={counterPress}
                onChange={(e) => setCounterPress(e.target.checked)}
              />
            </Stack>

            {/* Neu: Zeitspiel */}
            <FormControl component="fieldset">
              <FormLabel component="legend" sx={{ color: "#fff", fontSize: "0.9rem" }}>
                Zeitspiel
              </FormLabel>
              <RadioGroup row value={timeWaste} onChange={(e) => setTimeWaste(e.target.value)}>
                <FormControlLabel value="aus" label="Aus" control={<Radio size="small" sx={{ color: "#888", "&.Mui-checked": { color: "#ffc447" } }} />} />
                <FormControlLabel value="leicht" label="Leicht" control={<Radio size="small" sx={{ color: "#888", "&.Mui-checked": { color: "#ffc447" } }} />} />
                <FormControlLabel value="stark" label="Stark" control={<Radio size="small" sx={{ color: "#888", "&.Mui-checked": { color: "#ffc447" } }} />} />
              </RadioGroup>
            </FormControl>

            <Divider sx={{ bgcolor: "#444", my: 3 }} />
            <Button variant="outlined" color="warning" onClick={openSaveTemplate}>
              Aktuelle Aufstellung als Vorlage speichern
            </Button>
          </Paper>

          {/* Spielfeld (verschönert) */}
          <Box
            sx={{
              position: "relative",
              width: { xs: "90vw", sm: 520, md: 640 },
              height: { xs: "120vw", sm: 700, md: 860 },
              borderRadius: { xs: 4, md: 6 },
              overflow: "hidden",
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
              background: `
                linear-gradient(180deg, rgba(0,0,0,0.06), rgba(0,0,0,0.06)),
                repeating-linear-gradient(
                  90deg,
                  #1b6b3a 0px,
                  #1b6b3a 40px,
                  #207a43 40px,
                  #207a43 80px
                )
              `,
            }}
          >
            {/* Außenlinie */}
            <Box sx={{ position: "absolute", inset: 8, border: "4px solid #dfffe0aa", borderRadius: 2 }} />

            {/* Mittellinie + Mittelkreis */}
            <Box sx={{ position: "absolute", left: 12, right: 12, top: "50%", height: 2, bgcolor: "#dfffe0aa" }} />
            <Box sx={{
              position: "absolute", top: "calc(50% - 12%)", left: "calc(50% - 12%)",
              width: "24%", paddingTop: "24%", borderRadius: "50%", border: "3px solid #dfffe0aa"
            }} />

            {/* Strafraum unten */}
            <Box sx={{ position: "absolute", left: "22%", right: "22%", bottom: 8, height: "18%", border: "3px solid #dfffe0aa", borderBottom: "none" }} />
            {/* Fünfer unten */}
            <Box sx={{ position: "absolute", left: "38%", right: "38%", bottom: 8, height: "8%", border: "3px solid #dfffe0aa", borderBottom: "none" }} />
            {/* Elfmeterpunkt unten */}
            <Box sx={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: "16%", width: 6, height: 6, bgcolor: "#dfffe0aa", borderRadius: "50%" }} />
            {/* Tor unten */}
            <Box sx={{ position: "absolute", left: "48%", right: "48%", bottom: 2, height: 6, bgcolor: "#dfffe0aa", borderRadius: 1 }} />

            {/* Strafraum oben */}
            <Box sx={{ position: "absolute", left: "22%", right: "22%", top: 8, height: "18%", border: "3px solid #dfffe0aa", borderTop: "none" }} />
            {/* Fünfer oben */}
            <Box sx={{ position: "absolute", left: "38%", right: "38%", top: 8, height: "8%", border: "3px solid #dfffe0aa", borderTop: "none" }} />
            {/* Elfmeterpunkt oben */}
            <Box sx={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: "16%", width: 6, height: 6, bgcolor: "#dfffe0aa", borderRadius: "50%" }} />
            {/* Tor oben */}
            <Box sx={{ position: "absolute", left: "48%", right: "48%", top: 2, height: 6, bgcolor: "#dfffe0aa", borderRadius: 1 }} />

            {/* Positions-Kacheln */}
            {formations[formationKey].map((f) => {
              const pObj = getPlayerForPos(f.pos);
              const isFilled = Boolean(pObj);
              const draggable = isFilled;

              return (
                <Tooltip
                  key={f.pos}
                  title={
                    pObj ? `${pObj.vorname} ${pObj.nachname}` : `Position auswählen: ${f.pos}`
                  }
                >
                  <Box
                    onClick={() => { if (!pObj) setSelectingPos(f.pos); }}
                    draggable={draggable}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/posKey", f.pos);
                      e.currentTarget.style.opacity = "0.6";
                    }}
                    onDragEnd={(e) => { e.currentTarget.style.opacity = "1"; }}
                    onDragOver={(e) => {
                      const fromPos = e.dataTransfer.getData("text/posKey");
                      if (!fromPos || fromPos === f.pos) return;
                      const fromPlayerId = fieldPlayers[fromPos]?.playerId;
                      const fromPlayer = getPlayerById(fromPlayerId);
                      if (canPlayPosition(fromPlayer, f.pos)) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      const fromPos = e.dataTransfer.getData("text/posKey");
                      handleDropOnPos(fromPos, f.pos);
                    }}
                    sx={{
                      position: "absolute",
                      left: `calc(${f.x}% - 36px)`,
                      top: `calc(${f.y}% - 36px)`,
                      width: 72,
                      height: 72,
                      background: isFilled
                        ? "linear-gradient(180deg,#384a7a,#2c3a64)"
                        : "rgba(255,255,255,0.9)",
                      color: isFilled ? "#fff" : "#465674",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 3,
                      border: isFilled ? "3px solid #ffc447" : "2px dashed #b7c0cd",
                      cursor: "pointer",
                      zIndex: 3,
                      boxShadow: isFilled ? "0 6px 14px rgba(0,0,0,0.25)" : "none",
                      "&:hover": { transform: "scale(1.08)", zIndex: 4, borderColor: "#fff" },
                      transition: "transform 120ms ease",
                    }}
                  >
                    {/* Entfernen */}
                    {isFilled && (
                      <Button
                        onClick={(e) => { e.stopPropagation(); handleRemovePlayer(f.pos); }}
                        size="small"
                        variant="contained"
                        color="error"
                        sx={{
                          minWidth: 0,
                          position: "absolute",
                          top: -10,
                          right: -10,
                          borderRadius: "999px",
                          width: 24,
                          height: 24,
                          p: 0,
                          fontSize: 12,
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </Button>
                    )}

                    <Typography variant="caption" sx={{ fontWeight: 800 }}>
                      {f.pos}
                    </Typography>

                    {pObj ? (
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          lineHeight: 1.05,
                          width: "100%",
                          textAlign: "center",
                          px: "2px",
                          mt: 0.5
                        }}
                      >
                        {pObj.nachname}
                      </Typography>
                    ) : (
                      <Typography variant="h4" sx={{ opacity: 0.25, mt: -0.5 }}>
                        +
                      </Typography>
                    )}
                  </Box>
                </Tooltip>
              );
            })}
          </Box>

          {/* Auswahl-Dialog */}
          <Dialog
            open={!!selectingPos}
            onClose={() => setSelectingPos(null)}
            maxWidth="xs"
            fullWidth
          >
            <DialogTitle sx={{ bgcolor: "#27344b", color: "#ffc447" }}>
              {`Spieler auswählen ${selectingPos ? `(${selectingPos})` : ""}`}
            </DialogTitle>
            <DialogContent sx={{ bgcolor: "#202c3b" }}>
              <List>
                {selectingPos &&
                  getEligiblePlayers(selectingPos).map((p) => (
                    <ListItemButton
                      key={p.id}
                      onClick={() => handleSelectPlayer(selectingPos, p.id)}
                    >
                      <ListItemAvatar>
                        <Avatar src={p.avatarUrl || ""}>
                          {p.nachname?.[0]}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={`${p.vorname} ${p.nachname}`}
                        secondary={`${p.positionGroup}`}
                        primaryTypographyProps={{ color: "#ffc447" }}
                        secondaryTypographyProps={{ color: "#fff" }}
                      />
                    </ListItemButton>
                  ))}
              </List>
            </DialogContent>
            <DialogActions sx={{ bgcolor: "#27344b" }}>
              <Button onClick={() => setSelectingPos(null)} color="warning">
                ABBRECHEN
              </Button>
            </DialogActions>
          </Dialog>

          {/* Vorlage speichern Dialog */}
          <Dialog open={saveTemplateOpen} onClose={() => setSaveTemplateOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle>Vorlage speichern</DialogTitle>
            <DialogContent>
              <TextField
                autoFocus
                fullWidth
                label="Vorlagenname"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="z. B. Pressing hoch – 4-2-3-1"
              />
              <Typography variant="body2" sx={{ mt: 1.5, opacity: 0.8 }}>
                Es werden Formation, Aufstellung (inkl. Anweisungen) sowie Team-Anweisungen gespeichert.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSaveTemplateOpen(false)}>Abbrechen</Button>
              <Button variant="contained" onClick={saveTemplate} disabled={!templateName.trim()}>
                Speichern
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}

      {/* TAB 1: Spieleranweisungen */}
      {tab === 1 && (
        <Box sx={{ p: 3, maxWidth: 960, mx: "auto" }}>
          <Typography variant="h4" sx={{ mb: 2 }}>
            Individuelle Spieleranweisungen
          </Typography>

          {onPitchPlayers.length === 0 ? (
            <Typography sx={{ opacity: 0.8 }}>
              Noch keine Spieler auf dem Feld. Wechsle zum Tab „Formation & Taktik“, um Spieler zu platzieren.
            </Typography>
          ) : (
            <Paper elevation={3}>
              <List>
                {onPitchPlayers.map((player, index) => {
                  const base = basePos(player.positionKey);
                  const roleOpts = roleOptionsForBase(base);
                  return (
                    <Box key={player.id} sx={{ px: 2, py: 1.5 }}>
                      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
                        <Avatar src={player.avatarUrl || ""}>{player.nachname?.[0]}</Avatar>
                        <Box sx={{ flex: 1 }}>
                          <Typography sx={{ fontWeight: 700 }}>
                            {player.vorname} {player.nachname}
                          </Typography>
                          <Typography variant="body2" sx={{ opacity: 0.8 }}>
                            Position: {player.positionKey}
                          </Typography>
                        </Box>
                        <Button variant="outlined" color="error" onClick={() => handleRemovePlayer(player.positionKey)}>
                          Vom Feld nehmen
                        </Button>
                      </Stack>

                      <Stack direction="row" spacing={3} sx={{ flexWrap: "wrap" }}>
                        {/* Schusshäufigkeit (bestehend) */}
                        <FormControl component="fieldset" size="small">
                          <FormLabel component="legend">Schusshäufigkeit</FormLabel>
                          <RadioGroup
                            row
                            value={player.instructions?.shootTendency || "normal"}
                            onChange={(e) =>
                              handleInstructionChange(player.id, "shootTendency", e.target.value)
                            }
                          >
                            <FormControlLabel value="niedrig" control={<Radio size="small" />} label="Niedrig" />
                            <FormControlLabel value="normal" control={<Radio size="small" />} label="Normal" />
                            <FormControlLabel value="hoch" control={<Radio size="small" />} label="Hoch" />
                          </RadioGroup>
                        </FormControl>

                        {/* Pass-Risiko (bestehend) */}
                        <FormControl component="fieldset" size="small">
                          <FormLabel component="legend">Pass-Risiko</FormLabel>
                          <RadioGroup
                            row
                            value={player.instructions?.passRisk || "normal"}
                            onChange={(e) =>
                              handleInstructionChange(player.id, "passRisk", e.target.value)
                            }
                          >
                            <FormControlLabel value="sicher" control={<Radio size="small" />} label="Sicher" />
                            <FormControlLabel value="normal" control={<Radio size="small" />} label="Normal" />
                            <FormControlLabel value="riskant" control={<Radio size="small" />} label="Riskant" />
                          </RadioGroup>
                        </FormControl>

                        {/* Neu: Dribbling-Tendenz */}
                        <FormControl component="fieldset" size="small">
                          <FormLabel component="legend">Dribbling-Tendenz</FormLabel>
                          <RadioGroup
                            row
                            value={player.instructions?.dribbleTendency || "normal"}
                            onChange={(e) =>
                              handleInstructionChange(player.id, "dribbleTendency", e.target.value)
                            }
                          >
                            <FormControlLabel value="niedrig" control={<Radio size="small" />} label="Niedrig" />
                            <FormControlLabel value="normal" control={<Radio size="small" />} label="Normal" />
                            <FormControlLabel value="hoch" control={<Radio size="small" />} label="Hoch" />
                          </RadioGroup>
                        </FormControl>

                        {/* Neu: Rolle (positionsabhängig) */}
                        <FormControl size="small" sx={{ minWidth: 220 }}>
                          <FormLabel component="legend">Rolle</FormLabel>
                          <Select
                            value={player.instructions?.role || "auto"}
                            onChange={(e) => handleInstructionChange(player.id, "role", e.target.value)}
                          >
                            {roleOpts.map((r) => (
                              <MenuItem key={r.v} value={r.v}>{r.l}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Stack>

                      {index < onPitchPlayers.length - 1 && (
                        <Divider sx={{ mt: 2 }} />
                      )}
                    </Box>
                  );
                })}
              </List>
            </Paper>
          )}
        </Box>
      )}

      {/* TAB 2: Vorlagen */}
      {tab === 2 && (
        <Box sx={{ p: 3, maxWidth: 960, mx: "auto" }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h4">Vorlagen</Typography>
            <Button variant="contained" onClick={openSaveTemplate}>
              Aktuelle Aufstellung als Vorlage speichern
            </Button>
          </Stack>

          {templates.length === 0 ? (
            <Typography sx={{ opacity: 0.8 }}>
              Keine Vorlagen vorhanden. Lege mit „Aktuelle Aufstellung als Vorlage speichern“ eine neue an.
            </Typography>
          ) : (
            <Paper elevation={2}>
              <List>
                {templates.map((tpl) => (
                  <Box key={tpl.id} sx={{ px: 2, py: 1.25 }}>
                    <Stack direction="row" alignItems="center" spacing={2}>
                      <Box sx={{ flex: 1 }}>
                        {renameId === tpl.id ? (
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <TextField
                              size="small"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              sx={{ maxWidth: 360 }}
                            />
                            <IconButton onClick={commitRename} color="success">
                              <CheckIcon />
                            </IconButton>
                          </Stack>
                        ) : (
                          <>
                            <Typography sx={{ fontWeight: 700 }}>{tpl.name}</Typography>
                            <Typography variant="body2" sx={{ opacity: 0.7 }}>
                              {tpl.formationKey} · Abwehrlinie: {tpl.defensiveLine || "normal"} · Pass-Stil: {tpl.passStyle || "gemischt"} ·
                              Pressing: {tpl.pressing || "mittel"} · Tempo: {typeof tpl.tempo === "number" ? tpl.tempo : 50} · Breite: {tpl.width || "normal"} ·
                              Gegenpressing: {typeof tpl.counterPress === "boolean" ? (tpl.counterPress ? "an" : "aus") : "an"} · Zeitspiel: {tpl.timeWaste || "aus"}
                            </Typography>
                          </>
                        )}
                      </Box>

                      {renameId !== tpl.id && (
                        <>
                          <Button variant="outlined" onClick={() => applyTemplate(tpl)}>
                            Anwenden
                          </Button>
                          <IconButton onClick={() => startRename(tpl)} title="Umbenennen">
                            <DriveFileRenameOutlineIcon />
                          </IconButton>
                          <IconButton onClick={() => deleteTemplate(tpl.id)} color="error" title="Löschen">
                            <DeleteIcon />
                          </IconButton>
                        </>
                      )}
                    </Stack>
                    <Divider sx={{ mt: 1.25 }} />
                  </Box>
                ))}
              </List>
            </Paper>
          )}
        </Box>
      )}
    </Box>
  );
}
