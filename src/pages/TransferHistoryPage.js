// src/pages/TransferHistoryPage.js
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  ListItemText,
  Chip,
  Stack,
  Divider,
  CircularProgress,
} from "@mui/material";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

const fmtEUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function amountColor(v) {
  return v >= 0 ? "#5BC57A" : "#ff6b6b";
}

export default function TransferHistoryPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [teamsById, setTeamsById] = useState({});
  const [playersById, setPlayersById] = useState({});

  const myTeamId = user?.teamId || null;

  // Team laden (für Name)
  useEffect(() => {
    if (!myTeamId) return;
    (async () => {
      const snap = await getDoc(doc(db, "teams", myTeamId));
      if (snap.exists()) setTeam({ id: snap.id, ...snap.data() });
    })();
  }, [myTeamId]);

  // Transfers laden (sowohl von als auch zu meinem Team)
  useEffect(() => {
    if (!myTeamId) return;
    (async () => {
      setLoading(true);
      try {
        const qFrom = query(
          collection(db, "transfers"),
          where("fromTeamId", "==", myTeamId)
        );
        const qTo = query(
          collection(db, "transfers"),
          where("toTeamId", "==", myTeamId)
        );

        const [fromSnap, toSnap] = await Promise.all([getDocs(qFrom), getDocs(qTo)]);
        const items = [
          ...fromSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          ...toSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        ];

        // Sortierung: createdAt (neueste zuerst), Fallback nach id
        items.sort((a, b) => {
          const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          if (tb !== ta) return tb - ta;
          return (b.id || "").localeCompare(a.id || "");
        });

        setTransfers(items);

        // Daten anreichern: Teams + Spieler auflösen
        const teamIds = new Set();
        const playerIds = new Set();
        items.forEach((t) => {
          if (t.fromTeamId) teamIds.add(t.fromTeamId);
          if (t.toTeamId) teamIds.add(t.toTeamId);
          (t.myPlayers || []).forEach((pid) => playerIds.add(pid));
          (t.oppPlayers || []).forEach((pid) => playerIds.add(pid));
        });

        // Teams laden (ALLE in einem Rutsch – Teams sind überschaubar)
        const teamsSnap = await getDocs(collection(db, "teams"));
        const tMap = {};
        teamsSnap.docs.forEach((d) => (tMap[d.id] = { id: d.id, ...d.data() }));
        setTeamsById(tMap);

        // Spieler laden (einfach nacheinander – überschaubare Mengen)
        const pMap = {};
        await Promise.all(
          Array.from(playerIds).map(async (pid) => {
            const s = await getDoc(doc(db, "players", String(pid)));
            if (s.exists()) {
              const pd = s.data();
              pMap[s.id] = {
                id: s.id,
                name: `${pd.vorname || ""} ${pd.nachname || ""}`.trim() || s.id,
              };
            } else {
              pMap[pid] = { id: pid, name: pid };
            }
          })
        );
        setPlayersById(pMap);
      } finally {
        setLoading(false);
      }
    })();
  }, [myTeamId]);

  const rows = useMemo(() => {
    return transfers.map((tr) => {
      const mineIsSender = tr.fromTeamId === myTeamId;
      const opponentId = mineIsSender ? tr.toTeamId : tr.fromTeamId;
      const opponentName =
        teamsById[opponentId]?.name || teamsById[opponentId]?.shortName || opponentId;

      const myOut = Number(mineIsSender ? tr.myAmount : tr.oppAmount) || 0;
      const myIn = Number(mineIsSender ? tr.oppAmount : tr.myAmount) || 0;
      const net = myIn - myOut; // aus Sicht meines Teams
      const direction = net >= 0 ? "Eingang" : "Ausgang";

      const given = (mineIsSender ? tr.myPlayers : tr.oppPlayers) || [];
      const received = (mineIsSender ? tr.oppPlayers : tr.myPlayers) || [];
      const givenNames = given.map((id) => playersById[id]?.name || id).join(", ") || "—";
      const receivedNames =
        received.map((id) => playersById[id]?.name || id).join(", ") || "—";

      const created =
        tr.createdAt?.toDate?.() instanceof Date ? tr.createdAt.toDate() : null;
      const dateStr = created ? created.toLocaleDateString("de-DE") : "";

      return {
        id: tr.id,
        status: tr.status || "—",
        opponentName,
        net,
        direction,
        dateStr,
        givenNames,
        receivedNames,
      };
    });
  }, [transfers, myTeamId, teamsById, playersById]);

  if (!myTeamId) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Kein Team zugewiesen.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: "auto" }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          🔄 Transferhistorie · {team?.name || "Mein Verein"}
        </Typography>
      </Stack>

      <Paper sx={{ p: { xs: 2, md: 3 }, bgcolor: "#1b2433" }} elevation={3}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
          Alle abgeschlossenen & ausstehenden Transfers
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.8, mb: 2 }}>
          Darstellung aus Sicht deines Vereins. Der Betrag ist jeweils der Netto-Effekt
          (Einnahmen minus Ausgaben).
        </Typography>
        <Divider sx={{ mb: 2 }} />

        {loading ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress />
          </Stack>
        ) : rows.length === 0 ? (
          <Typography sx={{ opacity: 0.8 }}>
            Noch keine Transfers gefunden.
          </Typography>
        ) : (
          <List disablePadding>
            {rows.map((r) => (
              <React.Fragment key={r.id}>
                <ListItem
                  sx={{
                    px: { xs: 1, md: 1.5 },
                    py: 1.25,
                    borderRadius: 2,
                    "&:hover": { bgcolor: "rgba(255,255,255,0.02)" },
                  }}
                  secondaryAction={
                    <Typography
                      sx={{
                        fontWeight: 900,
                        color: amountColor(r.net),
                        minWidth: 160,
                        textAlign: "right",
                      }}
                    >
                      {r.net >= 0 ? "+" : "−"}
                      {fmtEUR.format(Math.abs(r.net))}
                    </Typography>
                  }
                >
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: "#233048" }}>
                      <span role="img" aria-label="transfer">
                        🔄
                      </span>
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Stack spacing={0.5}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Chip
                            size="small"
                            label={r.direction}
                            sx={{
                              fontWeight: 700,
                              bgcolor:
                                r.net >= 0
                                  ? "rgba(91,197,122,0.15)"
                                  : "rgba(255,107,107,0.15)",
                              color: amountColor(r.net),
                            }}
                          />
                          <Chip
                            size="small"
                            label={r.status}
                            sx={{ fontWeight: 700, bgcolor: "#253149", color: "#cbd5e1" }}
                          />
                          {r.dateStr && (
                            <Typography variant="body2" sx={{ opacity: 0.8 }}>
                              {r.dateStr}
                            </Typography>
                          )}
                        </Stack>
                        <Typography sx={{ fontWeight: 700 }}>
                          Gegenpartei: {r.opponentName}
                        </Typography>
                      </Stack>
                    }
                    secondary={
                      <Typography variant="body2" sx={{ opacity: 0.9 }}>
                        <strong>Abgegeben:</strong> {r.givenNames}
                        <br />
                        <strong>Erhalten:</strong> {r.receivedNames}
                      </Typography>
                    }
                  />
                </ListItem>
                <Divider component="li" sx={{ opacity: 0.08 }} />
              </React.Fragment>
            ))}
          </List>
        )}
      </Paper>
    </Box>
  );
}
