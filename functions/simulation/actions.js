// functions/simulation/actions.js
import {
  getPositionalBonus,
  calculateSuccess,
  getOpponent,
  getTeamPlayer,
  applyRatingDelta,
  getPlayerById,
  sanitizePos,
  positionKeyToGroup,
} from './utils.js';
import { createLogEntry } from './logger.js';
import { RATING_DELTAS, DISCIPLINE, INJURIES } from './constants.js';

import {
  findBestPassRecipient as aiFindBestPassRecipient,
  applyTouchState as aiApplyTouchState,
  computeZoneAfterPass,
} from './ai/findBestPassRecipient.js';

/* ---------------------------------------------------
   Interne Normalisierungen / Helfer
--------------------------------------------------- */

const CROSS_FAIL_DISTR = {
  DEF_INTERCEPT: 0.55,        // Abwehr fängt ab
  GK_CLAIM: 0.25,             // Keeper pflückt/klärt
  OVERHIT_GOAL_KICK: 0.20,    // ins Aus -> Abstoß
};

function normalizeGroupLabel(raw) {
  const v = String(raw || '').trim().toUpperCase();
  if (['DEF', 'ABW', 'D', 'ABWEHR', 'VERTEIDIGER'].includes(v)) return 'DEF';
  if (['MID', 'MIT', 'M', 'MF', 'MITTELFELD'].includes(v)) return 'MID';
  if (['ATT', 'ANG', 'A', 'ST', 'ANGRIFF', 'STURM'].includes(v)) return 'ATT';
  if (['TOR', 'GK', 'TW', 'GOALKEEPER', 'TORWART'].includes(v)) return 'TOR';
  return v || '';
}

function groupOf(p) {
  const pg = normalizeGroupLabel(p?.positionGroup);
  if (pg === 'DEF' || pg === 'MID' || pg === 'ATT' || pg === 'TOR') return pg;
  const pos = sanitizePos(p?.position);
  const mapped = positionKeyToGroup(pos);
  return normalizeGroupLabel(mapped);
}
function isGK(p) { return groupOf(p) === 'TOR'; }

function onPitchIds(state) {
  return new Set([
    ...state.homeLineup.map(l => l.playerId),
    ...state.awayLineup.map(l => l.playerId),
  ]);
}

function chooseInterceptionOpponent(passer, state) {
  const oppTeamId = (passer.teamId === state.homeTeam.id) ? state.awayTeam.id : state.homeTeam.id;
  const on = onPitchIds(state);
  const opp = state.players.filter(p => p.teamId === oppTeamId && on.has(p.id) && !state.sentOff[p.id] && !state.injuredOff[p.id]);
  const fieldOpp = opp.filter(p => groupOf(p) !== 'TOR');
  const pool = fieldOpp.length ? fieldOpp : opp;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickOpponentForDuel(player, state) {
  const oppTeamId = (player.teamId === state.homeTeam.id) ? state.awayTeam.id : state.homeTeam.id;
  const on = onPitchIds(state);
  const opp = state.players.filter(p => p.teamId === oppTeamId && on.has(p.id) && !state.sentOff[p.id] && !state.injuredOff[p.id]);
  const def = opp.filter(p => groupOf(p) === 'DEF');
  const mid = opp.filter(p => groupOf(p) === 'MID');
  const att = opp.filter(p => groupOf(p) === 'ATT');
  const gk  = opp.filter(p => groupOf(p) === 'TOR');

  const zone = state.ball.zone;
  const isHome = player.teamId === state.homeTeam.id;
  const inAttThird = (isHome && zone === 'AWAY_ATTACK') || (!isHome && zone === 'HOME_DEFENSE');
  const inMid = (zone === 'HOME_MIDFIELD' || zone === 'AWAY_MIDFIELD');

  function pick(pools, weights) {
    const total = weights.reduce((s,w)=>s+w,0) || 1;
    let r = Math.random() * total;
    for (let i=0;i<pools.length;i++){
      r -= weights[i];
      if (r<=0 && pools[i].length) return pools[i][Math.floor(Math.random()*pools[i].length)];
    }
    const flat = [].concat(...pools.filter(a=>a.length));
    return flat[Math.floor(Math.random()*flat.length)] || opp[0];
  }

  if (inAttThird) return pick([def, mid, att, gk], [0.60, 0.30, 0.08, 0.02]);
  if (inMid)      return pick([def, mid, att, gk], [0.25, 0.60, 0.15, 0.00]);
                   return pick([def, mid, att, gk], [0.10, 0.45, 0.45, 0.00]);
}

/* ---------------------------------------------------
   Clone-Helper & Regelflags
--------------------------------------------------- */

function cloneState(state) {
  return {
    ...state,
    log: [...state.log],
    playerRatings: { ...state.playerRatings },
    playerStats: JSON.parse(JSON.stringify(state.playerStats)),
    ball: { ...state.ball, context: { ...(state.ball.context || {}) } },
    homeLineup: JSON.parse(JSON.stringify(state.homeLineup)),
    awayLineup: JSON.parse(JSON.stringify(state.awayLineup)),
    homeBench: [...(state.homeBench || [])],
    awayBench: [...(state.awayBench || [])],
    subsLeft: { ...(state.subsLeft || {}) },
    sentOff: { ...(state.sentOff || {}) },
    injuredOff: { ...(state.injuredOff || {}) },
    postMatch: JSON.parse(JSON.stringify(state.postMatch || { suspensions: [], yellowIncrements: {}, injuries: [] })),
    meta: state.meta ? { ...state.meta } : { consecutiveTouches: {}, lastPassFrom: null, lastReceiver: null },
  };
}

function isCompetitive(state) { return !!(state?.isCompetitive); }

/* ---------------------------------------------------
   Karten & Verletzungen
--------------------------------------------------- */

function maybeBookCard(fouler, state) {
  if (!isCompetitive(state) && !DISCIPLINE.ENABLE_IN_FRIENDLIES) return state;

  const newState = cloneState(state);
  const ps = newState.playerStats[fouler.id];

  const alreadyYellow = (ps.yellowCards || ps.cardsYellow || 0) > 0;
  const giveStraightRed = Math.random() < (DISCIPLINE.STRAIGHT_RED_PROB || 0);
  if (giveStraightRed) {
    ps.cardsRed = (ps.cardsRed || 0) + 1;
    ps.redCard = (ps.redCard || 0) + 1;
    newState.sentOff[fouler.id] = true;
    newState.postMatch.suspensions.push({ playerId: fouler.id, matches: DISCIPLINE.SUSPENSION_MATCHES_RED || 2, reason: 'RED' });
    newState.log.push(createLogEntry('RED_CARD', newState, { player: fouler }));
    return newState;
  }

  const giveYellow = Math.random() < (DISCIPLINE.YELLOW_PROB || 0.2);
  if (giveYellow) {
    ps.cardsYellow = (ps.cardsYellow || 0) + 1;
    ps.yellowCards = (ps.yellowCards || 0) + 1;
    newState.postMatch.yellowIncrements[fouler.id] = (newState.postMatch.yellowIncrements[fouler.id] || 0) + 1;
    newState.log.push(createLogEntry('YELLOW_CARD', newState, { player: fouler }));

    if (alreadyYellow && DISCIPLINE.SECOND_YELLOW_RED) {
      ps.cardsRed = (ps.cardsRed || 0) + 1;
      ps.redCard = (ps.redCard || 0) + 1;
      newState.sentOff[fouler.id] = true;
      newState.log.push(createLogEntry('SECOND_YELLOW_RED', newState, { player: fouler }));
      newState.postMatch.suspensions.push({ playerId: fouler.id, matches: DISCIPLINE.SUSPENSION_MATCHES_SECOND_YELLOW || 1, reason: 'SECOND_YELLOW' });
    }
  }

  return newState;
}

function sampleInjuryMatches() {
  const buckets = INJURIES.DURATION_BUCKETS || [1,2,3];
  const weights = INJURIES.DURATION_WEIGHTS || buckets.map(()=>1/buckets.length);
  const total = weights.reduce((s,w)=>s+w,0);
  let r = Math.random()*total;
  for (let i=0;i<buckets.length;i++){
    r -= weights[i];
    if (r<=0) return buckets[i];
  }
  return buckets[buckets.length-1];
}

function substituteForInjury(player, state) {
  const newState = cloneState(state);
  const teamId = player.teamId;
  const isHome = teamId === newState.homeTeam.id;

  const bench = isHome ? newState.homeBench : newState.awayBench;
  const lineup = isHome ? newState.homeLineup : newState.awayLineup;
  const subsLeft = newState.subsLeft[teamId] ?? 0;

  const posKey = sanitizePos(player.position);
  const group = positionKeyToGroup(posKey);

  if (INJURIES.GK_IMMUNE && group === 'TOR') {
    return newState;
  }

  newState.injuredOff[player.id] = true;

  if (subsLeft <= 0 || !bench || bench.length === 0) {
    newState.log.push(createLogEntry('INJURY_NO_SUB', newState, { player }));
    return newState;
  }

  let idx = bench.findIndex(p => sanitizePos(p.position) === posKey);
  if (idx < 0) idx = bench.findIndex(p => positionKeyToGroup(sanitizePos(p.position)) === group);
  if (idx < 0) idx = 0;

  const sub = bench.splice(idx, 1)[0];
  newState.subsLeft[teamId] = Math.max(0, subsLeft - 1);

  const slot = lineup.find(l => l.playerId === player.id);
  if (slot) slot.playerId = sub.id;

  newState.log.push(createLogEntry('SUBSTITUTION_INJURY', newState, { playerOut: player, playerIn: sub }));

  if (newState.ball.playerInPossessionId === player.id) {
    newState.ball.playerInPossessionId = sub.id;
  }

  return newState;
}

function maybeInjuryOnEvent(victim, state, kind) {
  if (!isCompetitive(state) && !INJURIES.ENABLE_IN_FRIENDLIES) return state;

  const group = positionKeyToGroup(sanitizePos(victim.position));
  if (INJURIES.GK_IMMUNE && group === 'TOR') return state;

  let p = 0;
  if (kind === 'FOUL') p = INJURIES.FROM_FOUL_PROB || 0.1;
  else if (kind === 'DUEL_LOSS') p = INJURIES.FROM_DUEL_LOSS_PROB || 0.04;

  if (Math.random() < p) {
    const matches = sampleInjuryMatches();
    const after = substituteForInjury(victim, state);
    after.postMatch.injuries.push({ playerId: victim.id, matches });
    after.log.push(createLogEntry('INJURY', after, { player: victim, matchesOut: matches }));
    return after;
  }
  return state;
}

/* ---------------------------------------------------
   Fallback: Ballverlust
--------------------------------------------------- */

export function turnover(player, state) {
  const newState = cloneState(state);
  const opponent = chooseInterceptionOpponent(player, newState);
  newState.log.push(createLogEntry('TURNOVER', newState, { player, opponent }));
  newState.ball.inPossessionOfTeam = opponent.teamId;
  newState.ball.playerInPossessionId = opponent.id;
  newState.meta.consecutiveTouches[player.id] = 0;
  return newState;
}

/* ---------------------------------------------------
   Aktionen
--------------------------------------------------- */

export function pass(player, state) {
  const newState = cloneState(state);
  const { log, playerRatings, playerStats } = newState;

  newState.meta = newState.meta || { consecutiveTouches: {}, lastPassFrom: null, lastReceiver: null };

  const newContext = {
    type: 'OPEN_PLAY',
    lastAction: 'PASS',
    lastActionPlayerId: player.id,
    potentialAssistBy: null,
  };

  if (playerStats[player.id]) playerStats[player.id].passes = (playerStats[player.id].passes || 0) + 1;

  // --- GK: nur sichere Kurzpässe (100%) auf DEF (Fallback MID), Zone -> DEFENSIVDRITTEL
  if (isGK(player)) {
    const on = onPitchIds(newState);
    const sameTeamOn = newState.players.filter(p =>
      p.teamId === player.teamId && on.has(p.id) && !newState.sentOff[p.id] && !newState.injuredOff[p.id] && p.id !== player.id
    );
    const defs = sameTeamOn.filter(p => groupOf(p) === 'DEF');
    const mids = sameTeamOn.filter(p => groupOf(p) === 'MID');
    const recipient = defs.length ? defs[Math.floor(Math.random()*defs.length)]
                                  : (mids[0] || sameTeamOn[0]);

    if (recipient) {
      if (playerStats[player.id]) playerStats[player.id].passesCompleted = (playerStats[player.id].passesCompleted || 0) + 1;
      applyRatingDelta(playerRatings, player.id, RATING_DELTAS.PASS_SUCCESS);
      log.push(createLogEntry('PASS_SUCCESS', newState, { player, recipient }));

      newState.ball.playerInPossessionId = recipient.id;
      const isHome = player.teamId === newState.homeTeam.id;
      newState.ball.zone = isHome ? 'HOME_DEFENSE' : 'AWAY_DEFENSE';
      newState.ball.context = newContext;
      aiApplyTouchState(newState.meta, player.id, recipient.id);
      return newState;
    }
    // Sollte praktisch nie passieren; ansonsten weiter im normalen Pfad.
  }

  // --- normaler Pass (max. eine Zone vor, Empfängerwahl via AI-Helfer) ---
  const opponentForCheck = getOpponent(player, newState);
  const bonus = getPositionalBonus('PASS', player.position);
  const passSkill = player.strength + bonus;
  const defenseSkill = opponentForCheck.strength + getPositionalBonus('TACKLE', opponentForCheck.position);

  const base = 0.85;
  if (calculateSuccess(passSkill, defenseSkill, base)) {
    const on = onPitchIds(newState);
    const teammates = newState.players
      .filter(p => p.teamId === player.teamId && on.has(p.id) && !newState.sentOff[p.id] && !newState.injuredOff[p.id])
      .filter(p => p.id !== player.id); // kein Selbstpass
    const opponents = newState.players
      .filter(p => p.teamId !== player.teamId && on.has(p.id) && !newState.sentOff[p.id] && !newState.injuredOff[p.id]);

    const recipient =
      aiFindBestPassRecipient({ passer: player, teammates, opponents, gameMeta: newState.meta, tactic: {}, state: newState }) ||
      teammates[0];

    if (recipient) {
      if (playerStats[player.id]) playerStats[player.id].passesCompleted = (playerStats[player.id].passesCompleted || 0) + 1;
      applyRatingDelta(playerRatings, player.id, RATING_DELTAS.PASS_SUCCESS);
      log.push(createLogEntry('PASS_SUCCESS', newState, { player, recipient }));

      newState.ball.playerInPossessionId = recipient.id;
      const recGroup = groupOf(recipient);
      const nextZone = computeZoneAfterPass(newState, player, recGroup);
      if (nextZone) newState.ball.zone = nextZone;
      newState.ball.context = newContext;
      aiApplyTouchState(newState.meta, player.id, recipient.id);
      return newState;
    }
  }

  // Fehlpass → Interception
  const opponent = chooseInterceptionOpponent(player, newState);
  if (playerStats[opponent.id]) playerStats[opponent.id].interceptions = (playerStats[opponent.id].interceptions || 0) + 1;
  applyRatingDelta(playerRatings, player.id, RATING_DELTAS.PASS_FAIL);
  applyRatingDelta(playerRatings, opponent.id, RATING_DELTAS.TACKLE_WIN);
  log.push(createLogEntry('PASS_FAIL', newState, { player, opponent }));

  newState.ball.inPossessionOfTeam = opponent.teamId;
  newState.ball.playerInPossessionId = opponent.id;
  newState.ball.context = newContext;
  newState.meta.consecutiveTouches[player.id] = 0;
  return newState;
}

export function dribble(player, state) {
  const newState = cloneState(state);
  const { log, playerRatings, playerStats, homeTeam } = newState;
  const opponent = pickOpponentForDuel(player, newState);

  if (playerStats[player.id]) playerStats[player.id].dribbles = (playerStats[player.id].dribbles || 0) + 1;
  if (playerStats[opponent.id]) playerStats[opponent.id].tackles = (playerStats[opponent.id].tackles || 0) + 1;

  const bonus = getPositionalBonus('DRIBBLE', player.position);
  const dribbleSkill = player.strength + bonus;
  const tackleSkill = opponent.strength + getPositionalBonus('TACKLE', opponent.position);

  if (calculateSuccess(dribbleSkill, tackleSkill, 0.7)) {
    if (playerStats[player.id]) playerStats[player.id].dribblesSucceeded = (playerStats[player.id].dribblesSucceeded || 0) + 1;
    applyRatingDelta(playerRatings, player.id, RATING_DELTAS.DRIBBLE_SUCCESS);
    log.push(createLogEntry('DRIBBLE_SUCCESS', newState, { player, opponent }));

    const isHomeTeam = player.teamId === homeTeam.id;
    const orderHome = ['HOME_DEFENSE', 'HOME_MIDFIELD', 'AWAY_MIDFIELD', 'AWAY_ATTACK'];
    const orderAway = ['AWAY_ATTACK', 'AWAY_MIDFIELD', 'HOME_MIDFIELD', 'HOME_DEFENSE'];
    const order = isHomeTeam ? orderHome : orderAway;
    const idx = Math.max(0, order.indexOf(newState.ball.zone));
    const newZone = order[Math.min(idx + 1, order.length - 1)];

    const ctx = {
      type: 'OPEN_PLAY',
      lastAction: 'DRIBBLE_SUCCESS',
      lastActionPlayerId: player.id,
      potentialAssistBy: null,
      justBeatenPlayerId: opponent.id,
    };

    const isAttackingZone =
      (isHomeTeam && newZone === 'AWAY_ATTACK') || (!isHomeTeam && newZone === 'HOME_DEFENSE');
    if (isAttackingZone) ctx.priorityAction = 'MUST_SHOOT';

    newState.ball.zone = newZone;
    newState.ball.context = ctx;
    return newState;
  }

  // evtl. Foul (20%), sonst sauberer Tacklesieg
  if (Math.random() < 0.2) {
    return foul(opponent, player, newState);
  }

  if (playerStats[opponent.id]) playerStats[opponent.id].tacklesSucceeded = (playerStats[opponent.id].tacklesSucceeded || 0) + 1;
  applyRatingDelta(playerRatings, opponent.id, RATING_DELTAS.TACKLE_WIN);
  applyRatingDelta(playerRatings, player.id, RATING_DELTAS.DRIBBLE_FAIL);
  log.push(createLogEntry('TACKLE_WIN', newState, { player, opponent }));

  // Verletzungschance (verlorener Zweikampf)
  const after = maybeInjuryOnEvent(player, newState, 'DUEL_LOSS');

  after.ball.inPossessionOfTeam = opponent.teamId;
  after.ball.playerInPossessionId = opponent.id;
  after.ball.context = {
    type: 'OPEN_PLAY',
    lastAction: 'TACKLE_WIN',
    lastActionPlayerId: opponent.id,
    potentialAssistBy: null,
  };
  after.meta.consecutiveTouches[player.id] = 0;
  return after;
}

export function shoot(player, state) {
  const newState = cloneState(state);
  const { log, playerRatings, playerStats, homeTeam, awayTeam, players } = newState;

  if (playerStats[player.id]) playerStats[player.id].shots = (playerStats[player.id].shots || 0) + 1;

  const bonus = getPositionalBonus('SHOOT', player.position);
  const shootSkill = player.strength + bonus;

  const opponentTeamId = player.teamId === homeTeam.id ? awayTeam.id : homeTeam.id;
  const goalkeeper =
    players.find(p => p.teamId === opponentTeamId && positionKeyToGroup(sanitizePos(p.position)) === 'TOR') ||
    players.find(p => p.teamId === opponentTeamId);

  const onTargetChance = Math.max(0.2, Math.min(0.9, 0.7 + (player.strength - 75) / 100));

  if (Math.random() > onTargetChance) {
    applyRatingDelta(playerRatings, player.id, RATING_DELTAS.SHOT_OFF_TARGET);
    log.push(createLogEntry('SHOT_OFF_TARGET', newState, { player, opponent: goalkeeper }));

    const defenseZone = homeTeam.id === opponentTeamId ? 'HOME_DEFENSE' : 'AWAY_DEFENSE';
    const ctx = { type: 'OPEN_PLAY', lastAction: 'SHOT_OFF_TARGET', lastActionPlayerId: player.id };
    newState.ball.inPossessionOfTeam = opponentTeamId;
    newState.ball.playerInPossessionId = goalkeeper?.id || null;
    newState.ball.zone = defenseZone;
    newState.ball.context = ctx;
    newState.meta.consecutiveTouches[player.id] = 0;
    return newState;
  }

  if (playerStats[player.id]) playerStats[player.id].shotsOnTarget = (playerStats[player.id].shotsOnTarget || 0) + 1;

  if (!goalkeeper) {
    if (playerStats[player.id]) playerStats[player.id].goals = (playerStats[player.id].goals || 0) + 1;
    applyRatingDelta(playerRatings, player.id, RATING_DELTAS.SHOOT_EMPTY_NET);

    const newHomeScore = player.teamId === homeTeam.id ? newState.homeScore + 1 : newState.homeScore;
    const newAwayScore = player.teamId === awayTeam.id ? newState.awayScore + 1 : newState.awayScore;

    log.push(createLogEntry('SHOOT_EMPTY_NET', { ...newState, homeScore: newHomeScore, awayScore: newAwayScore }, { player }));

    const kickoffPlayer =
      players.find(p => p.teamId === opponentTeamId && p.positionGroup === 'ATT') ||
      players.find(p => p.teamId === opponentTeamId);

    newState.homeScore = newHomeScore;
    newState.awayScore = newAwayScore;
    newState.ball = {
      inPossessionOfTeam: opponentTeamId,
      playerInPossessionId: kickoffPlayer?.id || null,
      zone: 'HOME_MIDFIELD',
      context: { type: 'KICKOFF' },
    };
    newState.log.push(createLogEntry('KICKOFF', newState, { player: kickoffPlayer }));
    return newState;
  }

  const goalkeeperSkill = goalkeeper.strength + getPositionalBonus('SAVE', sanitizePos(goalkeeper.position) || 'TW');

  // Tor?
  if (calculateSuccess(shootSkill, goalkeeperSkill, 0.45)) {
    if (playerStats[player.id]) playerStats[player.id].goals = (playerStats[player.id].goals || 0) + 1;
    applyRatingDelta(playerRatings, player.id, RATING_DELTAS.GOAL);

    const assisterId = newState.ball.context?.potentialAssistBy;
    if (assisterId && playerStats[assisterId]) {
      playerStats[assisterId].assists = (playerStats[assisterId].assists || 0) + 1;
      applyRatingDelta(playerRatings, assisterId, RATING_DELTAS.ASSIST);
      log.push(createLogEntry('ASSIST', newState, { player: getPlayerById(newState.players, assisterId) }));
    }

    const newHomeScore = player.teamId === homeTeam.id ? newState.homeScore + 1 : newState.homeScore;
    const newAwayScore = player.teamId === awayTeam.id ? newState.awayScore + 1 : newState.awayScore;

    log.push(createLogEntry('GOAL', { ...newState, homeScore: newHomeScore, awayScore: newAwayScore }, { player, opponent: goalkeeper }));

    const kickoffPlayer =
      newState.players.find(p => p.teamId === opponentTeamId && p.positionGroup === 'ATT') ||
      newState.players.find(p => p.teamId === opponentTeamId);

    newState.homeScore = newHomeScore;
    newState.awayScore = newAwayScore;
    newState.ball = {
      inPossessionOfTeam: opponentTeamId,
      playerInPossessionId: kickoffPlayer?.id || null,
      zone: 'HOME_MIDFIELD',
      context: { type: 'KICKOFF' },
    };
    newState.log.push(createLogEntry('KICKOFF', newState, { player: kickoffPlayer }));
    return newState;
  }

  // gehalten
  if (playerStats[goalkeeper.id]) playerStats[goalkeeper.id].saves = (playerStats[goalkeeper.id].saves || 0) + 1;
  applyRatingDelta(playerRatings, player.id, RATING_DELTAS.SHOOT_SAVE_PLAYER);
  applyRatingDelta(playerRatings, goalkeeper.id, RATING_DELTAS.SHOOT_SAVE_GK);

  if (Math.random() < 0.25) {
    log.push(createLogEntry('SHOOT_SAVE', newState, { player, opponent: goalkeeper }));
    log.push(createLogEntry('REBOUND_SCRAMBLE', newState));
    newState.ball.inPossessionOfTeam = player.teamId;
    newState.ball.playerInPossessionId = null;
    newState.ball.context = { type: 'REBOUND' };
    return newState;
  }

  log.push(createLogEntry('SHOOT_SAVE', newState, { player, opponent: goalkeeper }));
  const defenseZone = homeTeam.id === opponentTeamId ? 'HOME_DEFENSE' : 'AWAY_DEFENSE';
  const ctx = { type: 'OPEN_PLAY', lastAction: 'SAVE', lastActionPlayerId: goalkeeper.id, potentialAssistBy: null };
  newState.ball.inPossessionOfTeam = goalkeeper.teamId;
  newState.ball.playerInPossessionId = goalkeeper.id;
  newState.ball.zone = defenseZone;
  newState.ball.context = ctx;
  newState.meta.consecutiveTouches[player.id] = 0;
  return newState;
}

export function cross(player, state) {
  const newState = cloneState(state);
  const { log, playerRatings, playerStats, players, homeTeam } = newState;
  const newContext = { type: 'OPEN_PLAY', lastAction: 'CROSS', lastActionPlayerId: player.id, potentialAssistBy: null };

  if (playerStats[player.id]) playerStats[player.id].crosses = (playerStats[player.id].crosses || 0) + 1;

  const bonus = getPositionalBonus('CROSS', player.position);
  const crossSkill = player.strength + bonus;
  const opponent = pickOpponentForDuel(player, newState);
  const defenseSkill = opponent.strength + getPositionalBonus('TACKLE', opponent.position);

  if (calculateSuccess(crossSkill, defenseSkill, 0.7)) {
    if (playerStats[player.id]) playerStats[player.id].crossesCompleted = (playerStats[player.id].crossesCompleted || 0) + 1;
    applyRatingDelta(playerRatings, player.id, RATING_DELTAS.CROSS_SUCCESS);

    const target =
      players.find(p => p.teamId === player.teamId && ['ST','MS','HS'].includes(sanitizePos(p.position))) ||
      players.find(p => p.teamId === player.teamId);

    if (target) {
      log.push(createLogEntry('CROSS_SUCCESS', newState, { player, recipient: target }));
      newContext.potentialAssistBy = player.id;
      newContext.priorityAction = 'MUST_SHOOT';
      newState.ball.playerInPossessionId = target.id;
      newState.ball.context = newContext;
      return newState;
    }
  }

  // Realistischere Verteilung für fehlgeschlagene Flanke
  const r = Math.random();
  if (r < CROSS_FAIL_DISTR.DEF_INTERCEPT) {
    // Abwehr klärt → Gegner in Ballbesitz
    const opp = chooseInterceptionOpponent(player, newState);
    applyRatingDelta(playerRatings, player.id, RATING_DELTAS.CROSS_FAIL);
    log.push(createLogEntry('CROSS_FAIL_BLOCKED', newState, { player, opponent: opp }));

    newState.ball.inPossessionOfTeam = opp.teamId;
    newState.ball.playerInPossessionId = opp.id;
    newState.ball.context = newContext;
    return newState;
  } else if (r < CROSS_FAIL_DISTR.DEF_INTERCEPT + CROSS_FAIL_DISTR.GK_CLAIM) {
    // Keeper pflückt
    const oppTeamId = player.teamId === homeTeam.id ? newState.awayTeam.id : newState.homeTeam.id;
    const gk =
      players.find(p => p.teamId === oppTeamId && positionKeyToGroup(sanitizePos(p.position)) === 'TOR') ||
      players.find(p => p.teamId === oppTeamId);

    applyRatingDelta(playerRatings, player.id, RATING_DELTAS.CROSS_FAIL);
    log.push(createLogEntry('CROSS_FAIL_GK_CLAIM', newState, { player, opponent: gk }));

    const defenseZone = homeTeam.id === oppTeamId ? 'HOME_DEFENSE' : 'AWAY_DEFENSE';
    newState.ball.inPossessionOfTeam = oppTeamId;
    newState.ball.playerInPossessionId = gk?.id || null;
    newState.ball.zone = defenseZone;
    newState.ball.context = newContext;
    return newState;
  } else {
    // Überhitzt/ins Aus → Abstoß
    applyRatingDelta(playerRatings, player.id, RATING_DELTAS.CROSS_FAIL);
    log.push(createLogEntry('CROSS_FAIL_OVERHIT', newState, { player }));

    const oppTeamId = player.teamId === homeTeam.id ? newState.awayTeam.id : newState.homeTeam.id;
    const gk =
      players.find(p => p.teamId === oppTeamId && positionKeyToGroup(sanitizePos(p.position)) === 'TOR') ||
      players.find(p => p.teamId === oppTeamId);

    const defenseZone = homeTeam.id === oppTeamId ? 'HOME_DEFENSE' : 'AWAY_DEFENSE';
    newState.ball.inPossessionOfTeam = oppTeamId;
    newState.ball.playerInPossessionId = gk?.id || null;
    newState.ball.zone = defenseZone;
    newState.ball.context = { type: 'OPEN_PLAY', lastAction: 'GOAL_KICK', lastActionPlayerId: gk?.id || null };
    return newState;
  }
}

export function throughBall(player, state) {
  const newState = cloneState(state);
  const { log, playerRatings, playerStats } = newState;
  const newContext = { type: 'OPEN_PLAY', lastAction: 'THROUGH_BALL', lastActionPlayerId: player.id, potentialAssistBy: null };

  if (playerStats[player.id]) playerStats[player.id].throughBalls = (playerStats[player.id].throughBalls || 0) + 1;

  const bonus = getPositionalBonus('THROUGH_BALL', player.position);
  const passSkill = player.strength + bonus;
  const opponent = pickOpponentForDuel(player, newState);
  const defenseSkill = opponent.strength + getPositionalBonus('TACKLE', opponent.position);

  const base = 0.5;
  if (calculateSuccess(passSkill, defenseSkill, base)) {
    if (playerStats[player.id]) playerStats[player.id].throughBallsCompleted = (playerStats[player.id].throughBallsCompleted || 0) + 1;
    applyRatingDelta(playerRatings, player.id, RATING_DELTAS.THROUGH_BALL_SUCCESS);

    const on = onPitchIds(newState);
    const teammates = newState.players.filter(p => p.teamId === player.teamId && on.has(p.id) && !newState.sentOff[p.id] && !newState.injuredOff[p.id]).filter(p => p.id !== player.id);
    const opponents = newState.players.filter(p => p.teamId !== player.teamId && on.has(p.id) && !newState.sentOff[p.id] && !newState.injuredOff[p.id]);

    // Empfängerwahl (innerhalb der Zonenregel über AI-Helfer)
    const recipient = aiFindBestPassRecipient({ passer: player, teammates, opponents, gameMeta: newState.meta, tactic: {}, state: newState });
    if (recipient) {
      log.push(createLogEntry('THROUGH_BALL_SUCCESS', newState, { player, recipient }));
      newContext.potentialAssistBy = player.id;
      newContext.priorityAction = 'MUST_SHOOT';
      newState.ball.playerInPossessionId = recipient.id;
      // Zone maximal eine weiter – über computeZoneAfterPass
      const recGroup = groupOf(recipient);
      const nextZone = computeZoneAfterPass(newState, player, recGroup);
      if (nextZone) newState.ball.zone = nextZone;
      newState.ball.context = newContext;
      return newState;
    }
  }

  applyRatingDelta(playerRatings, player.id, RATING_DELTAS.THROUGH_BALL_FAIL);
  log.push(createLogEntry('THROUGH_BALL_FAIL', newState, { player, opponent }));

  const intercept = chooseInterceptionOpponent(player, newState);
  newState.ball.inPossessionOfTeam = intercept.teamId;
  newState.ball.playerInPossessionId = intercept.id;
  newState.ball.context = newContext;
  newState.meta.consecutiveTouches[player.id] = 0;
  return newState;
}

export function foul(fouler, fouledPlayer, state) {
  const newState = cloneState(state);
  const { log, playerRatings, playerStats } = newState;

  if (playerStats[fouler.id]) playerStats[fouler.id].foulsCommitted = (playerStats[fouler.id].foulsCommitted || 0) + 1;

  applyRatingDelta(playerRatings, fouler.id, RATING_DELTAS.FOUL_COMMITTED);
  applyRatingDelta(playerRatings, fouledPlayer.id, RATING_DELTAS.FOUL_DRAWN);

  log.push(createLogEntry('FOUL', newState, { player: fouler, opponent: fouledPlayer }));

  // Karten (nur Pflichtspiele)
  let bookedState = maybeBookCard(fouler, newState);

  // Verletzungschance für den Gefoulten (Auto-Wechsel)
  bookedState = maybeInjuryOnEvent(fouledPlayer, bookedState, 'FOUL');

  // Freistoß für den Gefoulten
  bookedState.ball.inPossessionOfTeam = fouledPlayer.teamId;
  bookedState.ball.playerInPossessionId = fouledPlayer.id;
  bookedState.ball.context = {
    type: 'FREE_KICK',
    foulLocation: bookedState.ball.zone,
    lastAction: 'FOUL',
    lastActionPlayerId: fouler.id,
    potentialAssistBy: null,
  };

  return bookedState;
}

export function handleFreeKick(player, state) {
  const newState = cloneState(state);
  const { log } = newState;

  const foulZone = newState.ball.context.foulLocation;
  const isHomeTeam = player.teamId === newState.homeTeam.id;
  const isAttackingZone =
    (isHomeTeam && foulZone === 'AWAY_ATTACK') || (!isHomeTeam && foulZone === 'HOME_DEFENSE');

  if (isAttackingZone) {
    log.push(createLogEntry('FREE_KICK_SHOOT', newState, { player }));
    return shoot(player, newState);
  }

  log.push(createLogEntry('FREE_KICK_PASS', newState, { player }));
  return pass(player, newState);
}

export function scrambleForRebound(state) {
  const newState = cloneState(state);
  const { log, playerRatings, players, homeTeam } = newState;

  const attackingTeamId = newState.ball.inPossessionOfTeam;
  const defendingTeamId = attackingTeamId === homeTeam.id ? newState.awayTeam.id : homeTeam.id;

  const attacker =
    players.find(p => p.teamId === attackingTeamId && p.positionGroup === 'ATT') ||
    getTeamPlayer(attackingTeamId, players, null, newState);

  const defender =
    players.find(p => p.teamId === defendingTeamId && p.positionGroup === 'DEF') ||
    getTeamPlayer(defendingTeamId, players, null, newState);

  if (!attacker || !defender) {
    log.push(createLogEntry('REBOUND_LOSE', newState, { opponent: { nachname: 'Abwehr' } }));
    const randomDefender =
      getTeamPlayer(defendingTeamId, players, null, newState) ||
      players.find(p => p.teamId === defendingTeamId);
    newState.ball.inPossessionOfTeam = defendingTeamId;
    newState.ball.playerInPossessionId = randomDefender?.id || null;
    newState.ball.context = { type: 'OPEN_PLAY' };
    return newState;
  }

  if (calculateSuccess(attacker.strength, defender.strength, 0.5)) {
    applyRatingDelta(playerRatings, attacker.id, RATING_DELTAS.REBOUND_WIN);
    log.push(createLogEntry('REBOUND_WIN', newState, { player: attacker }));
    return shoot(attacker, newState);
  }

  applyRatingDelta(playerRatings, defender.id, RATING_DELTAS.REBOUND_LOSE_DEF);
  log.push(createLogEntry('REBOUND_LOSE', newState, { opponent: defender }));

  newState.ball.inPossessionOfTeam = defendingTeamId;
  newState.ball.playerInPossessionId = defender.id;
  newState.ball.context = { type: 'OPEN_PLAY' };
  return newState;
}
