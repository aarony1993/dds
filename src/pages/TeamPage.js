// src/pages/TeamPage.js

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Button,
} from '@mui/material';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';

const positionGroupLabels = {
  TOR: 'Torwart',
  DEF: 'Abwehr',
  MID: 'Mittelfeld',
  ATT: 'Angriff',
};

const iso3to2 = {
  DEU: 'DE',
  AUT: 'AT',
  SUI: 'CH',
  USA: 'US',
  FRA: 'FR',
  ITA: 'IT',
  ESP: 'ES',
  PRT: 'PT',
  NLD: 'NL',
  BEL: 'BE',
  GBR: 'GB',
  ENG: 'GB',
  SCO: 'GB',
  WAL: 'GB',
  IRL: 'IE',
  POL: 'PL',
  CZE: 'CZ',
  SVK: 'SK',
  SWE: 'SE',
  NOR: 'NO',
  DNK: 'DK',
  FIN: 'FI',
  BRA: 'BR',
  ARG: 'AR',
  MEX: 'MX',
  // … erweitern nach Bedarf
};

const flagEmoji = (code) => {
  if (!code) return '';
  let cc = String(code).toUpperCase().trim();
  if (cc.length === 3 && iso3to2[cc]) cc = iso3to2[cc];
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  const base = 0x1f1e6; // 🇦
  const codePoints = [...cc].map((c) => base + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...codePoints);
};

const fmtCurrency = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const fullName = (p) => `${p?.vorname ?? ''} ${p?.nachname ?? ''}`.trim();

const calcAge = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
};

const TeamPage = () => {
  const { user } = useAuth();

  // Data
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // UI: selection & filters
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [q, setQ] = useState('');
  const [posFilter, setPosFilter] = useState('ALL'); // ALL | TOR | DEF | MID | ATT
  const [sortKey, setSortKey] = useState('name'); // name | value

  // Firestore live subscription
  useEffect(() => {
    if (!user?.teamId) {
      setLoading(false);
      return;
    }

    const qRef = query(collection(db, 'players'), where('teamId', '==', user.teamId));
    const unsub = onSnapshot(
      qRef,
      {
        next: (snapshot) => {
          const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          setPlayers(data);
          setLoading(false);
          setError(null);
        },
        error: (e) => {
          setError(e);
          setLoading(false);
        },
      }
    );

    return () => unsub();
  }, [user]);

  // Filter + Sort (memoized)
  const visiblePlayers = useMemo(() => {
    const text = q.trim().toLowerCase();

    let list = players;
    if (text) {
      list = list.filter((p) => fullName(p).toLowerCase().includes(text));
    }
    if (posFilter !== 'ALL') {
      list = list.filter((p) => p.positionGroup === posFilter);
    }

    return [...list].sort((a, b) => {
      if (sortKey === 'value') {
        return (b.marktwert ?? 0) - (a.marktwert ?? 0);
      }
      const aName = `${a?.nachname ?? ''} ${a?.vorname ?? ''}`.trim();
      const bName = `${b?.nachname ?? ''} ${b?.vorname ?? ''}`.trim();
      return aName.localeCompare(bName, 'de', { sensitivity: 'base' });
    });
  }, [players, q, posFilter, sortKey]);

  // Loading UI with skeletons
  if (loading) {
    return (
      <Grid container justifyContent="center" p={2}>
        <Grid item xs={12} md={10} lg={8}>
          <Typography variant="h4" gutterBottom id="team-heading">
            Mein Kader
          </Typography>
          <Paper sx={{ p: 2 }}>
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} height={54} variant="rectangular" sx={{ mb: 1 }} />
            ))}
          </Paper>
        </Grid>
      </Grid>
    );
  }

  if (error) {
    return (
      <Grid container justifyContent="center" p={2}>
        <Grid item xs={12} md={10} lg={8}>
          <Typography variant="h4" gutterBottom id="team-heading">
            Mein Kader
          </Typography>
          <Alert severity="error">
            Kader konnte nicht geladen werden: {String(error?.message || error)}
          </Alert>
        </Grid>
      </Grid>
    );
  }

  const noPlayersAtAll = players.length === 0;
  const noVisibleWithFilters = players.length > 0 && visiblePlayers.length === 0;

  return (
    <Grid container justifyContent="center" p={2}>
      <Grid item xs={12} md={10} lg={8}>
        <Typography variant="h4" gutterBottom id="team-heading">
          Mein Kader
        </Typography>

        {/* Toolbar: Suche / Filter / Sort */}
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            alignItems: 'center',
            mb: 2,
            flexWrap: 'wrap',
          }}
        >
          <TextField
            size="small"
            label="Suche"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name eingeben…"
          />

          <FormControl size="small">
            <InputLabel>Position</InputLabel>
            <Select
              label="Position"
              value={posFilter}
              onChange={(e) => setPosFilter(e.target.value)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="ALL">Alle</MenuItem>
              <MenuItem value="TOR">Torwart</MenuItem>
              <MenuItem value="DEF">Abwehr</MenuItem>
              <MenuItem value="MID">Mittelfeld</MenuItem>
              <MenuItem value="ATT">Angriff</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small">
            <InputLabel>Sortieren</InputLabel>
            <Select
              label="Sortieren"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="name">Name (A–Z)</MenuItem>
              <MenuItem value="value">Marktwert (hoch → niedrig)</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ ml: 'auto' }}>
            <Typography variant="body2" sx={{ opacity: 0.7 }}>
              Spieler: {visiblePlayers.length}
            </Typography>
          </Box>
        </Box>

        {/* Zustände ohne Daten */}
        {noPlayersAtAll && (
          <Alert severity="warning">Keine Spieler gefunden.</Alert>
        )}
        {noVisibleWithFilters && (
          <Alert severity="info">Keine Treffer für deine Suche/Filter.</Alert>
        )}

        {!noPlayersAtAll && visiblePlayers.length > 0 && (
          <TableContainer component={Paper} sx={{ maxHeight: 640 }}>
            <Table stickyHeader size="small" aria-labelledby="team-heading">
              <caption style={{ captionSide: 'top', textAlign: 'left' }}>
                Kaderübersicht
              </caption>
              <TableHead>
                <TableRow>
                  <TableCell width={64}>#</TableCell>
                  <TableCell width={76}>Avatar</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Position</TableCell>
                  <TableCell>Nation</TableCell>
                  <TableCell align="right">Marktwert</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visiblePlayers.map((player) => (
                  <TableRow
                    key={player.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setSelectedPlayer(player)}
                  >
                    <TableCell>{player.spielernummer ?? '-'}</TableCell>
                    <TableCell>
                      <Avatar
                        src={player.avatarUrl || '/dummy-player.png'}
                        alt={fullName(player)}
                        sx={{ bgcolor: player.avatarUrl ? undefined : 'primary.dark' }}
                      >
                        {(player.vorname ?? 'N')[0]}
                      </Avatar>
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight={600}>{fullName(player)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={positionGroupLabels[player.positionGroup] || player.positionGroup || '-'}
                      />
                    </TableCell>
                    <TableCell>
                      {flagEmoji(player.nationalitaet)} {player.nationalitaet || '-'}
                    </TableCell>
                    <TableCell align="right">
                      {typeof player.marktwert === 'number' ? fmtCurrency.format(player.marktwert) : '–'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Grid>

      {/* Detail-Dialog */}
      <Dialog
        open={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="player-dialog-title"
      >
        {selectedPlayer && (
          <>
            <DialogTitle id="player-dialog-title">
              {fullName(selectedPlayer)}
            </DialogTitle>
            <DialogContent sx={{ textAlign: 'center' }}>
              <Avatar
                src={selectedPlayer.avatarUrl || '/dummy-player.png'}
                alt={fullName(selectedPlayer)}
                sx={{ width: 100, height: 100, mx: 'auto', mb: 2, bgcolor: selectedPlayer.avatarUrl ? undefined : 'primary.dark' }}
              >
                {(selectedPlayer.vorname ?? 'N')[0]}
              </Avatar>

              <Stack alignItems="center" spacing={0.5}>
                <Typography>
                  {flagEmoji(selectedPlayer.nationalitaet)} {selectedPlayer.nationalitaet || '-'}
                </Typography>
                <Typography>
                  Position: {selectedPlayer.position || '-'} ({selectedPlayer.positionGroup || '-'})
                </Typography>
                <Typography>
                  Geburtsdatum:{' '}
                  {selectedPlayer.geburtsdatum
                    ? new Date(selectedPlayer.geburtsdatum).toLocaleDateString('de-DE')
                    : '-'}
                  {(() => {
                    const age = calcAge(selectedPlayer.geburtsdatum);
                    return typeof age === 'number' ? ` · ${age} Jahre` : '';
                  })()}
                </Typography>
                <Typography>
                  Marktwert:{' '}
                  {typeof selectedPlayer.marktwert === 'number'
                    ? fmtCurrency.format(selectedPlayer.marktwert)
                    : '–'}
                </Typography>
                <Typography variant="caption" sx={{ mt: 1, opacity: 0.7 }}>
                  ID: {selectedPlayer.id}
                </Typography>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedPlayer(null)}>Schließen</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Grid>
  );
};

export default TeamPage;
