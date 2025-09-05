import { ZONES, ENGINE } from './constants.js';
import { createLogEntry } from './logger.js';
import {
  positionKeyToGroup,
  getPlayerById,
  getTeamPlayers,
  ensurePlayerStats,
  weightedChoice,
  isCompetitive,
} from './utils.js';
import { pass, throughBall, cross, dribble, shoot, handleFreeKick, scrambleForRebound } from './actions.js';

// -------- Initial State --------
function lineupToPlayersLookup(lineup, players, teamId) {
  const ids = lineup.map(l => l.playerId);
  const teamPlayers = players.filter(p => p.teamId === teamId && ids.includes(p.id));
  return teamPlayers;
}

function defaultRatings(players) {
  const map = {};
  players.forEach(p => { map[p.id] = 6.0; });
  return map;
}

export function buildInitialState(homeTeam, awayTeam, players, homeLineup, awayLineup, options = {}) {
  const isFS = (options?.competitionCategory || '').toUpperCase() === 'FS';
  const state = {
    minute: 0,
    homeTeam: { id: homeTeam.id, name: homeTeam.name || 'Home' },
    awayTeam: { id: awayTeam.id, name: awayTeam.name || 'Away' },
    players: players.slice(),
    homeLineup: homeLineup.slice(0, 11),
    awayLineup: awayLineup.slice(0, 11),
    homeBench: [],
    awayBench: [],
    subsLeft: { [homeTeam.id]: 5, [awayTeam.id]: 5 },
    sentOff: {},
    injuredOff: {},
    ball: {
      inPossessionOfTeam: homeTeam.id,
      playerInPossessionId: lineupToPlayersLookup(homeLineup, players, homeTeam.id)[0]?.id || null,
      zone: ENGINE.START_ZONE,
      context: { type: 'KICKOFF' },
    },
    homeScore: 0,
    awayScore: 0,
    playerRatings: defaultRatings(players),
    playerStats: {},
    log: [createLogEntry('KICKOFF', { minute: 0 }, { teamId: homeTeam.id })],
    isCompetitive: !isFS,
    competitionCode: options?.competitionCode || null,
    postMatch: { suspensions: [], yellowIncrements: {}, injuries: [] },
  };

  // init stats for all
  players.forEach(p => ensurePlayerStats(state.playerStats, p.id));
  return state;
}

// -------- Action selection / policy --------
function chooseAction(player, state) {
  const ctx = state.ball.context || {};
  if (ctx.type === 'FREE_KICK') {
    return { kind: 'FREE_KICK' };
  }
  if (ctx.type === 'REBOUND') {
    return { kind: 'REBOUND' };
  }

  // Priorität Schuss in Angriffszone
  const isHome = player.teamId === state.homeTeam.id;
  const attZone = isHome ? ZONES.AWAY_ATT : ZONES.HOME_DEFENSE;
  const inFinalThird = state.ball.zone === attZone;
  const priorityShoot = ctx.priorityAction === 'MUST_SHOOT' || inFinalThird;

  const group = positionKeyToGroup(player.position);

  // Gewichte je Gruppe/Zonen-Kontext
  let actions = [];
  if (group === 'TOR') {
    actions = [{ a: 'PASS', w: 1 }]; // GK nur Pass
  } else if (group === 'DEF') {
    actions = [
      { a: 'PASS', w: 7 },
      { a: 'DRIBBLE', w: 2 },
      { a: 'THROUGH', w: 1 }, // selten
    ];
  } else if (group === 'MID') {
    actions = [
      { a: 'PASS', w: priorityShoot ? 4 : 6 },
      { a: 'DRIBBLE', w: 3 },
      { a: 'THROUGH', w: 3 },
      { a: 'CROSS', w: inFinalThird ? 2 : 1 },
      { a: 'SHOOT', w: priorityShoot ? 3 : 1 },
    ];
  } else { // ATT
    actions = [
      { a: 'PASS', w: priorityShoot ? 3 : 4 },
      { a: 'DRIBBLE', w: 3 },
      { a: 'THROUGH', w: 2 },
      { a: 'CROSS', w: inFinalThird ? 1 : 0 },
      { a: 'SHOOT', w: priorityShoot ? 6 : 3 },
    ];
  }

  const picked = weightedChoice(actions, x => x.w);
  return { kind: picked.a };
}

function pickActor(state) {
  const pid = state.ball.playerInPossessionId;
  if (pid) return getPlayerById(state.players, pid);
  // bei Rebound o.ä. jemanden aus Angreiferteam nehmen
  const list = getTeamPlayers(state.ball.inPossessionOfTeam, state.players);
  return list[Math.floor(Math.random()*list.length)] || null;
}

export function executeTick(prev) {
  const state = { ...prev, log: [...prev.log], ball: { ...prev.ball, context: { ...(prev.ball.context || {}) } } };
  state.minute = Math.min(ENGINE.MAX_MINUTE, state.minute + ENGINE.TICK_MINUTE_STEP);

  const actor = pickActor(state);
  if (!actor) return state;

  // Touch
  ensurePlayerStats(state.playerStats, actor.id);
  state.playerStats[actor.id].touches += 1;

  const sel = chooseAction(actor, state);

  switch (sel.kind) {
    case 'FREE_KICK':
      return handleFreeKick(actor, state);
    case 'REBOUND':
      return scrambleForRebound(state);
    case 'PASS':
      return pass(actor, state);
    case 'THROUGH':
      return throughBall(actor, state);
    case 'CROSS':
      return cross(actor, state);
    case 'DRIBBLE':
      return dribble(actor, state);
    case 'SHOOT':
      return shoot(actor, state);
    default:
      return pass(actor, state);
  }
}

function isFinished(state) {
  return state.minute >= ENGINE.MAX_MINUTE;
}

export function runSimulation(homeTeam, awayTeam, players, homeLineup, awayLineup, options = {}) {
  let state = buildInitialState(homeTeam, awayTeam, players, homeLineup, awayLineup, options);

  while (!isFinished(state)) {
    state = executeTick(state);
  }

  // Abschluss: garantierte Log-Konsistenz
  state.log = state.log.map(e => ({
    minute: Number.isFinite(e.minute) ? e.minute : state.minute,
    type: e.type,
    data: e.data || {},
  }));

  return state;
}
