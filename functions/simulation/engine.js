// functions/simulation/engine.js
// Läuft in Node ESM (Firebase Functions v2). Kein top-level await nötig.

import {
  pass,
  dribble,
  shoot,
  cross,
  throughBall,
  foul,
  handleFreeKick,
  scrambleForRebound,
  turnover,
} from './actions.js';

import {
  sanitizePos,
  positionKeyToGroup,
  getTeamPlayer,
  getPlayerById,
} from './utils.js';

import { createLogEntry } from './logger.js';

// -----------------------------------------------------------------------------
// Simulations-Parameter (konservativ gewählt; an dein Projekt anpassbar)
// -----------------------------------------------------------------------------
const MAX_MINUTE = 96;         // harte Obergrenze
const BASE_TICKS = 220;        // Zielanzahl "Aktionen" (nicht identisch mit Minuten)
const OVERTIME_TICKS = 20;     // etwas Nachspielzeit/Spätphase
const GK_IDENTITY = (p) => positionKeyToGroup(sanitizePos(p.position)) === 'TOR';

// Aktionengewichte je Zone (vereinfachte Heuristik; "MUST_SHOOT" im Context hat Vorrang)
const ACTION_WEIGHTS = {
  HOME_DEFENSE: { PASS: 0.70, DRIBBLE: 0.18, LONG: 0.12 },
  HOME_MIDFIELD: { PASS: 0.55, DRIBBLE: 0.30, THROUGH: 0.15 },
  AWAY_MIDFIELD: { PASS: 0.55, DRIBBLE: 0.30, THROUGH: 0.15 },
  AWAY_ATTACK: { PASS: 0.35, DRIBBLE: 0.35, CROSS: 0.15, SHOOT: 0.15 },
};

// -----------------------------------------------------------------------------
// Robustheit: beliebige Eingabe in Array verwandeln
// -----------------------------------------------------------------------------
function normalizeToArray(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  if (typeof v === 'object') return Object.values(v);
  return [];
}

// Zufallsauswahl nach Gewicht
function weightedPick(entries) {
  // entries: Array<[key, weight]>
  const total = entries.reduce((s, [, w]) => s + (w > 0 ? w : 0), 0);
  if (total <= 0) return entries[0]?.[0];
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    if (w <= 0) continue;
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1]?.[0];
}

// Startspieler für Kickoff: nimmt Stürmer, sonst beliebig
function selectKickoffPlayer(teamId, playersArr) {
  const att =
    playersArr.find((p) => p.teamId === teamId && p.positionGroup === 'ATT') ||
    playersArr.find((p) => p.teamId === teamId);
  return att;
}

// Ableitung "isCompetitive" (Pflichtspiel vs. FS) – wird von actions.js abgefragt
function deriveIsCompetitive(gameLike) {
  const code = (gameLike?.competitionCategory || gameLike?.type || '').toUpperCase();
  // alles außer Freundschaftsspiel (FS/FRIENDLY) als Pflichtspiel behandeln
  return !(code === 'FS' || code === 'FRIENDLY');
}

// Team-Taktiken (werden im State gehalten; in Aktionen/Utils nutzbar)
function extractTeamTactics(teamDoc) {
  return {
    defensiveLine: teamDoc?.tacticDefensiveLine || 'normal', // 'tief' | 'normal' | 'hoch'
    passStyle: teamDoc?.tacticPassStyle || 'gemischt',       // 'sicher' | 'gemischt' | 'riskant'
  };
}

// Set aus auf dem Feld befindlichen Spielern (Startelf)
function startersFromLineup(lineupArr) {
  const set = new Set();
  (lineupArr || []).forEach((it) => {
    if (it?.playerId) set.add(it.playerId);
  });
  return set;
}

// Ersatzbank = Teamspieler – Startelf
function benchForTeam(teamId, playersArr, startersSet) {
  return playersArr
    .filter((p) => p.teamId === teamId && !startersSet.has(p.id))
    .map((p) => ({ ...p }));
}

// Basis-PlayerStats initialisieren
function blankStatsForPlayer(p) {
  return {
    minutes: 0,
    rating: 6.0,
    // Offensiv
    shots: 0,
    shotsOnTarget: 0,
    goals: 0,
    assists: 0,
    passes: 0,
    passesCompleted: 0,
    crosses: 0,
    crossesCompleted: 0,
    throughBalls: 0,
    throughBallsCompleted: 0,
    dribbles: 0,
    dribblesSucceeded: 0,
    // Defensiv
    tackles: 0,
    tacklesSucceeded: 0,
    interceptions: 0,
    saves: 0,
    // Disziplin
    foulsCommitted: 0,
    cardsYellow: 0,
    yellowCards: 0, // Alias in manchen Logs
    cardsRed: 0,
    redCard: 0,     // Alias in manchen Logs
  };
}

// Context neu auf "offenes Spiel"
function openPlayContext() {
  return { type: 'OPEN_PLAY', lastAction: null, lastActionPlayerId: null, potentialAssistBy: null };
}

// -----------------------------------------------------------------------------
// State-Aufbau
// -----------------------------------------------------------------------------
function buildInitialState(homeTeam, awayTeam, players, homeLineup, awayLineup, gameLike = {}) {
  const playersArr = normalizeToArray(players).map((p) => ({
    ...p,
    positionGroup: p.positionGroup || positionKeyToGroup(sanitizePos(p.position)),
  }));

  // Startelf-IDs
  const startersHome = startersFromLineup(homeLineup);
  const startersAway = startersFromLineup(awayLineup);

  // Ersatzbänke
  const homeBench = benchForTeam(homeTeam.id, playersArr, startersHome);
  const awayBench = benchForTeam(awayTeam.id, playersArr, startersAway);

  // PlayerStats/Ratings initialisieren nur für geladene Spieler
  const playerStats = {};
  const playerRatings = {};
  playersArr.forEach((p) => {
    playerStats[p.id] = blankStatsForPlayer(p);
    playerRatings[p.id] = 6.0;
  });

  // Individuelle Anweisungen aus Lineups (werden am Spieler-Objekt gespiegelt)
  const instructionByPlayerId = {};
  [...(homeLineup || []), ...(awayLineup || [])].forEach((slot) => {
    if (slot?.playerId && slot?.instructions) {
      instructionByPlayerId[slot.playerId] = slot.instructions;
    }
  });
  playersArr.forEach((p) => {
    if (instructionByPlayerId[p.id]) {
      p.instructions = { ...(p.instructions || {}), ...instructionByPlayerId[p.id] };
    }
  });

  // Taktik am Team
  const homeTactics = extractTeamTactics(homeTeam);
  const awayTactics = extractTeamTactics(awayTeam);

  // Kickoff: Home bekommt den Anstoß (kannst du randomisieren, wenn du willst)
  const kickoffTeamId = homeTeam.id;
  const kickoffPlayer =
    selectKickoffPlayer(kickoffTeamId, playersArr) ||
    playersArr.find((p) => p.teamId === kickoffTeamId);

  // Grund-Log
  const log = [];
  if (kickoffPlayer) {
    log.push(createLogEntry('KICKOFF', {}, { player: kickoffPlayer }));
  }

  // Engine-State
  const state = {
    minute: 1,
    tick: 0,
    maxTicks: BASE_TICKS + Math.floor(Math.random() * OVERTIME_TICKS),

    // Teams & Kader
    homeTeam: { ...homeTeam, tactics: homeTactics },
    awayTeam: { ...awayTeam, tactics: awayTactics },
    players: playersArr,

    // Startelf-Struktur wie in deiner DB (wird für Positionen genutzt)
    homeLineup: JSON.parse(JSON.stringify(homeLineup || [])),
    awayLineup: JSON.parse(JSON.stringify(awayLineup || [])),
    homeBench,
    awayBench,

    // Spielrelevante Sammlungen
    playerStats,
    playerRatings,
    log,

    // Disziplin/Verfügbarkeit
    sentOff: {},       // playerId -> true
    injuredOff: {},    // playerId -> true
    subsLeft: { [homeTeam.id]: 5, [awayTeam.id]: 5 },

    // Ergebnis
    homeScore: 0,
    awayScore: 0,

    // Ball/Zonen
    ball: {
      inPossessionOfTeam: kickoffTeamId,
      playerInPossessionId: kickoffPlayer?.id || null,
      zone: 'HOME_MIDFIELD', // neutral Startzone
      context: { type: 'KICKOFF' },
    },

    // Meta
    isCompetitive: deriveIsCompetitive(gameLike),

    // Post-Match (wird von actions.js befüllt)
    postMatch: { suspensions: [], yellowIncrements: {}, injuries: [] },
  };

  return state;
}

// -----------------------------------------------------------------------------
// Hilfsfunktionen: Feldspieler/GK-Verfügbarkeit im Spiel
// -----------------------------------------------------------------------------
function isAvailableOnPitch(state, playerId) {
  return !(state.sentOff[playerId] || state.injuredOff[playerId]);
}

function currentPossessor(state) {
  const pid = state.ball.playerInPossessionId;
  if (!pid) return null;
  const p = getPlayerById(state.players, pid);
  if (!p) return null;
  if (!isAvailableOnPitch(state, pid)) return null;
  return p;
}

function switchPossessionToTeamAnchor(state, teamId) {
  // Wenn kein konkreter Spieler greifbar ist (z. B. nach Lose/Turnover),
  // nimm einen passenden "Anker" (IV/DM in Abwehrzone, ZM im Mittelfeld, ST/HS/MS im Angriff).
  let anchor =
    state.players.find((p) => p.teamId === teamId && p.positionGroup === 'MID') ||
    state.players.find((p) => p.teamId === teamId && p.positionGroup === 'DEF') ||
    state.players.find((p) => p.teamId === teamId);
  if (anchor) {
    state.ball.inPossessionOfTeam = teamId;
    state.ball.playerInPossessionId = anchor.id;
  } else {
    // Fallback (extrem unwahrscheinlich)
    state.ball.inPossessionOfTeam = teamId;
    state.ball.playerInPossessionId = null;
  }
  state.ball.context = openPlayContext();
}

// -----------------------------------------------------------------------------
// Aktionswahl (ohne MUST_SHOOT / Standardsituationen)
// -----------------------------------------------------------------------------
function pickActionForState(state, player) {
  // Freistoß?
  if (state.ball.context?.type === 'FREE_KICK') {
    return 'FREE_KICK';
  }
  // Rebound-Getümmel
  if (state.ball.context?.type === 'REBOUND') {
    return 'REBOUND';
  }
  // Vorgabe aus Context (z. B. DRIBBLE_SUCCESS -> MUST_SHOOT in Attack)
  if (state.ball.context?.priorityAction === 'MUST_SHOOT') {
    return 'SHOOT';
  }

  const zone = state.ball.zone || 'HOME_MIDFIELD';
  const w = ACTION_WEIGHTS[zone] || ACTION_WEIGHTS.HOME_MIDFIELD;

  // Torhüter: sichere, kurze Pässe bevorzugen
  if (GK_IDENTITY(player)) {
    return 'PASS';
  }

  // einfache gewichtete Wahl
  const entries = Object.entries(w);
  const key = weightedPick(entries);
  switch (key) {
    case 'PASS': return 'PASS';
    case 'DRIBBLE': return 'DRIBBLE';
    case 'THROUGH': return 'THROUGH_BALL';
    case 'CROSS': return 'CROSS';
    case 'LONG': return 'PASS'; // Langpass als PASS (die Richtungs-/Zonenlogik steckt in findBestPassRecipient/utils)
    case 'SHOOT': return 'SHOOT';
    default: return 'PASS';
  }
}

// -----------------------------------------------------------------------------
// Ein Simulations-Tick
// -----------------------------------------------------------------------------
function executeTick(state) {
  // Tick/Minute fortschreiben
  state.tick += 1;
  if (state.tick % 2 === 0 && state.minute < MAX_MINUTE) {
    state.minute += 1;
  }

  const player = currentPossessor(state);
  if (!player) {
    // Niemand in Ballbesitz -> Ball an Team-Anker
    switchPossessionToTeamAnchor(state, state.ball.inPossessionOfTeam);
    return state;
  }

  // Spieler-Minuten mitzählen (grob pro Tick; optional: nur jede x Ticks)
  state.playerStats[player.id].minutes = Math.min(
    MAX_MINUTE,
    (state.playerStats[player.id].minutes || 0) + 1
  );

  const action = pickActionForState(state, player);

  // Aktion ausführen
  switch (action) {
    case 'FREE_KICK': {
      return handleFreeKick(player, state);
    }
    case 'REBOUND': {
      return scrambleForRebound(state);
    }
    case 'PASS': {
      return pass(player, state);
    }
    case 'DRIBBLE': {
      return dribble(player, state);
    }
    case 'THROUGH_BALL': {
      return throughBall(player, state);
    }
    case 'CROSS': {
      return cross(player, state);
    }
    case 'SHOOT': {
      return shoot(player, state);
    }
    default: {
      // Fallback
      return turnover(player, state);
    }
  }
}

// -----------------------------------------------------------------------------
// Endbedingungen & Ergebnis
// -----------------------------------------------------------------------------
function isFinished(state) {
  if (state.tick >= state.maxTicks) return true;
  if (state.minute >= MAX_MINUTE) return true;
  return false;
}

// Public API
export function runSimulation(homeTeam, awayTeam, playersInput, homeLineup, awayLineup, gameLike = {}) {
  const state = buildInitialState(homeTeam, awayTeam, playersInput, homeLineup, awayLineup, gameLike);

  // Sanity: Log einen Start-Event mit Teams
  state.log.push(createLogEntry('MATCH_START', state, { homeTeam, awayTeam }));

  // Hauptschleife
  while (!isFinished(state)) {
    executeTick(state);
  }

  // Abschluss
  state.log.push(createLogEntry('MATCH_END', state, { homeScore: state.homeScore, awayScore: state.awayScore }));

  // Rückgabe in der Form, die index.js erwartet
  return {
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    log: state.log,
    playerRatings: state.playerRatings,
    playerStats: state.playerStats,

    // Für Debug/Review nützlich:
    homeTeam: state.homeTeam,
    awayTeam: state.awayTeam,
    players: state.players,
    homeLineup: state.homeLineup,
    awayLineup: state.awayLineup,
    postMatch: state.postMatch,
  };
}

export default runSimulation;
