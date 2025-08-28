// src/pages/FinancePage.js
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Chip,
  Stack,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  ListItemText,
  Tooltip,
} from "@mui/material";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

const fmtEUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function amountColor(direction) {
  return direction === "in" ? "#5BC57A" : "#ff6b6b";
}

export default function FinancePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState(null);
  const [transactions, setTransactions] = useState([]);

  const balance = useMemo(() => {
    if (!team) return 0;
    // Bevorzuge 'budget', fallback auf 'balance'
    const val =
      typeof team.budget === "number"
        ? team.budget
        : typeof team.balance === "number"
        ? team.balance
        : 0;
    return val;
  }, [team]);

  useEffect(() => {
    if (!user?.teamId) return;

    const load = async () => {
      setLoading(true);
      try {
        // Team laden
        const teamRef = doc(db, "teams", user.teamId);
        const teamSnap = await getDoc(teamRef);
        if (teamSnap.exists()) {
          setTeam({ id: teamSnap.id, ...teamSnap.data() });
        } else {
          setTeam(null);
        }

        // Transaktionen (neueste zuerst)
        const txRef = collection(db, "teams", user.teamId, "transactions");
        const txSnap = await getDocs(query(txRef, orderBy("createdAt", "desc")));
        const list = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setTransactions(list);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.teamId]);

  if (!user?.teamId) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Kein Team zugewiesen.</Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Lade Finanzen…</Typography>
      </Box>
    );
  }

  const teamName = team?.name || "Mein Verein";

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: "auto" }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          💰 Finanzen · {teamName}
        </Typography>
        <Chip
          label={`Kontostand: ${fmtEUR.format(balance)}`}
          sx={{
            fontWeight: 800,
            bgcolor: "#2a3342",
            color: "#ffd166",
            px: 1.5,
            py: 0.5,
          }}
        />
      </Stack>

      <Paper sx={{ p: { xs: 2, md: 3 }, bgcolor: "#1b2433" }} elevation={3}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
          Transaktionen
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.8, mb: 2 }}>
          Hier siehst du alle Geldbewegungen deines Vereins (z. B. Ablösen bei
          Transfers).
        </Typography>
        <Divider sx={{ mb: 2 }} />

        {transactions.length === 0 ? (
          <Typography sx={{ opacity: 0.8 }}>
            Noch keine Transaktionen vorhanden.
          </Typography>
        ) : (
          <List disablePadding>
            {transactions.map((tx) => {
              const created =
                tx.createdAt?.toDate?.() instanceof Date
                  ? tx.createdAt.toDate()
                  : null;

              const dateStr = created
                ? created.toLocaleDateString("de-DE")
                : "";

              // Schöne Titelzeile: Richtung + Typ + Datum
              const badges = (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    size="small"
                    label={tx.direction === "in" ? "Eingang" : "Ausgang"}
                    sx={{
                      fontWeight: 700,
                      bgcolor:
                        tx.direction === "in" ? "rgba(91,197,122,0.15)" : "rgba(255,107,107,0.15)",
                      color: amountColor(tx.direction),
                    }}
                  />
                  {tx.type && (
                    <Chip
                      size="small"
                      label={tx.type}
                      sx={{ fontWeight: 700, bgcolor: "#253149", color: "#cbd5e1" }}
                    />
                  )}
                  {dateStr && (
                    <Typography variant="body2" sx={{ opacity: 0.8 }}>
                      {dateStr}
                    </Typography>
                  )}
                </Stack>
              );

              // Lesbarer Beschreibungstext – ohne interne IDs
              const title =
                tx.description ||
                (tx.direction === "in"
                  ? `Eingang von ${tx.counterpartyTeamName || "Unbekannt"}`
                  : `Zahlung an ${tx.counterpartyTeamName || "Unbekannt"}`);

              const subtitle =
                tx.counterpartyTeamName
                  ? `Gegenpartei: ${tx.counterpartyTeamName}`
                  : undefined;

              return (
                <React.Fragment key={tx.id}>
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
                          color: amountColor(tx.direction),
                          minWidth: 140,
                          textAlign: "right",
                        }}
                      >
                        {tx.direction === "out" ? "−" : "+"}
                        {fmtEUR.format(Math.abs(Number(tx.amount || 0)))}
                      </Typography>
                    }
                  >
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: "#233048" }}>
                        <span role="img" aria-label="money">
                          💶
                        </span>
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Stack spacing={0.5}>
                          {badges}
                          <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
                        </Stack>
                      }
                      secondary={
                        subtitle ? (
                          <Typography variant="body2" sx={{ opacity: 0.8 }}>
                            {subtitle}
                          </Typography>
                        ) : null
                      }
                    />
                  </ListItem>
                  <Divider component="li" sx={{ opacity: 0.08 }} />
                </React.Fragment>
              );
            })}
          </List>
        )}
      </Paper>

      {/* Kleiner Hinweis, falls 'balance' statt 'budget' historisch genutzt wurde */}
      {typeof team?.budget !== "number" && typeof team?.balance === "number" && (
        <Tooltip title="Hinweis: Dieses Team nutzt aktuell das Feld 'balance'. Empfohlen ist 'budget'.">
          <Typography
            variant="caption"
            sx={{ display: "block", mt: 1.5, opacity: 0.7 }}
          >
            Hinweis: Kontostand basiert auf „balance“, da kein „budget“ im Teamdokument
            gefunden wurde.
          </Typography>
        </Tooltip>
      )}
    </Box>
  );
}
