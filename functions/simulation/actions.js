import {
  getPositionalBonus,
  calculateSuccess,
  getOpponent,
  getTeamPlayer,
  getPlayerById,
  sanitizePos,
  positionKeyToGroup,
  ensurePlayerStats,
  oneStepForwardZone,
  twoStepsForwardZone,
  isCompetitive,
} from './utils.js';
import { createLogEntry } from './logger.js';
import { RATING_DELTAS, DISCIPLINE, INJURIES, ZONES } from './constants.js';
import { findBestPassRecipient, computeZoneAfterPass } from './ai/findBestPassRecipient.js';

// ----- Clone-Helper -----
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
  };
}

// ----- Karten/Verletzungen -----
function maybeBookCard(fouler, state) {
  if (!isCompetitive(state) && !DISCIPLINE.ENABLE_IN_FRIENDLIES) return state;

  const newState = cloneState(state);
  const ps = ensurePlayerStats(newState.playerStats, fouler.id);

  const alreadyYellow = (ps.yellowCards || ps.cardsYellow || 0) > 0;
  const giveStraightRed = Math.random() < (DISCIPLINE.STRAIGHT_RED_PROB || 0);
  if (giveStraightRed) {
    ps.cardsRed = (ps.cardsRed || 0) + 1;
    ps.redCard = (ps.redCard || 0) + 1;
    newState.sentOff[fouler.id] = true;
    newState.postMatch.suspensions.push({ playerId: fouler.id, matches: DISCIPLINE.SUSPENSION_MATCHES_RED || 2, reason: 'RED' });
    newState.log.push(createLogEntry('RED_CARD', newState, { playerId: fouler.id }));
    return newState;
  }

  const giveYellow = Math.random() < (DISCIPLINE.YELLOW_PROB || 0.2);
  if (giveYellow) {
    ps.cardsYellow = (ps.cardsYellow || 0) + 1;
    ps.yellowCards = (ps.yellowCards || 0) + 1;
    newState.postMatch.yellowIncrements[fouler.id] = (newState.postMatch.yellowIncrements[fouler.id] || 0) + 1;
    newState.log.push(createLogEntry('YELLOW_CARD', newState, { playerId: fouler.id }));

    if (alreadyYellow && DISCIPLINE.SECOND_YELLOW_RED) {
      ps.cardsRed = (ps.cardsRed || 0) + 1;
      ps.redCard = (ps.redCard || 0) + 1;
      newState.sentOff[fouler.id] = true;
      newState.log.push(createLogEntry('SECOND_YELLOW_RED', newState, { playerId: fouler.id }));
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
    newState.log.push(createLogEntry('INJURY_NO_SUB', newState, { playerId: player.id }));
    return newState;
  }

  let idx = bench.findIndex(p => sanitizePos(p.position) === posKey);
  if (idx < 0) idx = bench.findIndex(p => positionKeyToGroup(sanitizePos(p.position)) === group);
  if (idx < 0) idx = 0;

  const sub = bench.splice(idx, 1)[0];
  newState.subsLeft[teamId] = Math.max(0, subsLeft - 1);

  const slot = lineup.find(l => l.playerId === player.id);
  if (slot) slot.playerId = sub.id;

  newState.log.push(createLogEntry('SUBSTITUTION_INJURY', newState, { outId: player.id, inId: sub.id }));

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
    after.log.push(createLogEntry('INJURY', after, { playerId: victim.id, matchesOut: matches }));
    return after;
  }
  return state;
}

// Fallback: Ballverlust
export function turnover(player, state) {
  const newState = cloneState(state);
  const opponent = getOpponent(player, newState);
  newState.log.push(createLogEntry('TURNOVER', newState, { playerId: player.id, opponentId: opponent?.id || null }));
  if (opponent) {
    newState.ball.inPossessionOfTeam = opponent.teamId;
    newState.ball.playerInPossessionId = opponent.id;
  }
  return newState;
}

// ---------------------------------------------------
// Aktionen
// ---------------------------------------------------

export function pass(player, state) {
  const newState = cloneState(state);
  const { log, playerRatings, playerStats } = newState;
  ensurePlayerStats(playerStats, player.id);

  const actorGroup = positionKeyToGroup(player.position);
  playerStats[player.id].passes += 1;

  // GK-Sicherpass (100% zur DEF)
  if (actorGroup === 'TOR') {
    const recipient = newState.players.find(p => p.teamId === player.teamId && positionKeyToGroup(p.position) === 'DEF') ||
                      getTeamPlayer(player.teamId, newState.players, player.id);
    if (recipient) {
      playerStats[player.id].passesCompleted += 1;
      newState.ball.playerInPossessionId = recipient.id;
      log.push(createLogEntry('PASS_GK_SAFE', newState, { fromId: player.id, toId: recipient.id }));
      return newState;
    }
  }

  const bonus = getPositionalBonus('PASS', player.position);
  const passSkill = (player.strength || 50) + bonus;
  const opponent = getOpponent(player, newState);
  const defenseSkill = (opponent?.strength || 50) + getPositionalBonus('TACKLE', opponent?.position);

  if (calculateSuccess(passSkill, defenseSkill, 0.82)) {
    const recipient = findBestPassRecipient(player, newState, 'NORMAL') || getTeamPlayer(player.teamId, newState.players, player.id);
    if (recipient) {
      playerStats[player.id].passesCompleted += 1;
      newState.ball.playerInPossessionId = recipient.id;
      newState.ball.zone = computeZoneAfterPass(player, newState, 'NORMAL'); // max 1 Zone vor
      log.push(createLogEntry('PASS_SUCCESS', newState, { fromId: player.id, toId: recipient.id }));
      return newState;
    }
  }

  // Fehlpass / Interception
  if (opponent) {
    ensurePlayerStats(playerStats, opponent.id);
    playerStats[opponent.id].interceptions += 1;
    log.push(createLogEntry('PASS_FAIL', newState, { fromId: player.id, opponentId: opponent.id }));
    newState.ball.inPossessionOfTeam = opponent.teamId;
    newState.ball.playerInPossessionId = opponent.id;
  } else {
    log.push(createLogEntry('PASS_FAIL', newState, { fromId: player.id, opponentId: null }));
  }
  return newState;
}

export function throughBall(player, state) {
  const newState = cloneState(state);
  const { log, playerStats } = newState;
  ensurePlayerStats(playerStats, player.id);
  playerStats[player.id].throughBalls += 1;

  // nur aus MID/ATT sinnvoll
  const group = positionKeyToGroup(player.position);
  if (group === 'DEF' || group === 'TOR') {
    // Erzwinge NORMALEN Pass statt unlogischer Steckpässe
    return pass(player, newState);
  }

  const bonus = getPositionalBonus('THROUGH_BALL', player.position);
  const passSkill = (player.strength || 50) + bonus;
  const opponent = getOpponent(player, newState);
  const defenseSkill = (opponent?.strength || 50) + getPositionalBonus('TACKLE', opponent?.position);

  if (calculateSuccess(passSkill, defenseSkill, 0.50)) {
    const recipient = findBestPassRecipient(player, newState, 'THROUGH');
    if (recipient) {
      playerStats[player.id].throughBallsCompleted += 1;
      newState.ball.playerInPossessionId = recipient.id;
      newState.ball.zone = computeZoneAfterPass(player, newState, 'THROUGH'); // bis 2 Zonen vor
      newState.ball.context = { type: 'OPEN_PLAY', lastAction: 'THROUGH_BALL', potentialAssistBy: player.id, priorityAction: 'MUST_SHOOT' };
      log.push(createLogEntry('THROUGH_BALL_SUCCESS', newState, { fromId: player.id, toId: recipient.id }));
      return newState;
    }
  }

  log.push(createLogEntry('THROUGH_BALL_FAIL', newState, { fromId: player.id, opponentId: opponent?.id || null }));
  // Ballverlust
  if (opponent) {
    newState.ball.inPossessionOfTeam = opponent.teamId;
    newState.ball.playerInPossessionId = opponent.id;
  }
  return newState;
}

export function cross(player, state) {
  const newState = cloneState(state);
  const { log, playerStats, players } = newState;
  ensurePlayerStats(playerStats, player.id);
  playerStats[player.id].crosses += 1;

  // nur Außen dürfen flanken, sonst normaler Pass
  const b = sanitizePos(player.position);
  const canCross = ['LA','RA','LM','RM','LV','RV'].includes(b);
  if (!canCross) return pass(player, newState);

  const bonus = getPositionalBonus('CROSS', player.position);
  const crossSkill = (player.strength || 50) + bonus;
  const opponent = getOpponent(player, newState);
  const defenseSkill = (opponent?.strength || 50) + getPositionalBonus('TACKLE', opponent?.position);

  if (calculateSuccess(crossSkill, defenseSkill, 0.60)) {
    playerStats[player.id].crossesCompleted += 1;
    // Ziel: Stürmer/HS/LA/RA bevorzugen
    const target =
      players.find(p => p.teamId === player.teamId && ['ST','MS','HS','LA','RA'].includes(sanitizePos(p.position))) ||
      players.find(p => p.teamId === player.teamId);
    if (target) {
      newState.ball.playerInPossessionId = target.id;
      newState.ball.context = { type: 'OPEN_PLAY', lastAction: 'CROSS', potentialAssistBy: player.id, priorityAction: 'MUST_SHOOT' };
      log.push(createLogEntry('CROSS_SUCCESS', newState, { fromId: player.id, toId: target.id }));
      return newState;
    }
  }

  // Fehlschlag-Distribution: geblockt / abgefangen / ins Aus / Keeper pflückt
  const r = Math.random();
  if (r < 0.35 && opponent) {
    // Block
    log.push(createLogEntry('CROSS_BLOCKED', newState, { byId: opponent.id }));
    newState.ball.inPossessionOfTeam = opponent.teamId;
    newState.ball.playerInPossessionId = opponent.id;
  } else if (r < 0.65 && opponent) {
    // Abgefangen
    log.push(createLogEntry('CROSS_INTERCEPTED', newState, { byId: opponent.id }));
    newState.ball.inPossessionOfTeam = opponent.teamId;
    newState.ball.playerInPossessionId = opponent.id;
  } else if (r < 0.85) {
    // Aus -> Abstoß (Keeper hat Ball)
    const oppTeamId = player.teamId === newState.homeTeam.id ? newState.awayTeam.id : newState.homeTeam.id;
    const gk = newState.players.find(p => p.teamId === oppTeamId && positionKeyToGroup(p.position) === 'TOR')
      || newState.players.find(p => p.teamId === oppTeamId);
    log.push(createLogEntry('CROSS_OUT', newState, { toGKId: gk?.id || null }));
    if (gk) {
      newState.ball.inPossessionOfTeam = oppTeamId;
      newState.ball.playerInPossessionId = gk.id;
      newState.ball.zone = (newState.homeTeam.id === oppTeamId) ? ZONES.HOME_DEFENSE : ZONES.AWAY_DEFENSE;
    }
  } else {
    // Keeper pflückt
    const oppTeamId = player.teamId === newState.homeTeam.id ? newState.awayTeam.id : newState.homeTeam.id;
    const gk = newState.players.find(p => p.teamId === oppTeamId && positionKeyToGroup(p.position) === 'TOR')
      || newState.players.find(p => p.teamId === oppTeamId);
    log.push(createLogEntry('CROSS_CLAIMED_BY_GK', newState, { gkId: gk?.id || null }));
    if (gk) {
      newState.ball.inPossessionOfTeam = oppTeamId;
      newState.ball.playerInPossessionId = gk.id;
      newState.ball.zone = (newState.homeTeam.id === oppTeamId) ? ZONES.HOME_DEFENSE : ZONES.AWAY_DEFENSE;
    }
  }
  return newState;
}

export function dribble(player, state) {
  const newState = cloneState(state);
  const { log, playerStats } = newState;
  ensurePlayerStats(playerStats, player.id);
  const opponent = getOpponent(player, newState);
  if (opponent) ensurePlayerStats(playerStats, opponent.id);

  playerStats[player.id].dribbles += 1;
  if (opponent) playerStats[opponent.id].tackles += 1;

  const bonus = getPositionalBonus('DRIBBLE', player.position);
  const dribbleSkill = (player.strength || 50) + bonus;
  const tackleSkill = (opponent?.strength || 50) + getPositionalBonus('TACKLE', opponent?.position);

  if (calculateSuccess(dribbleSkill, tackleSkill, 0.68)) {
    playerStats[player.id].dribblesSucceeded += 1;
    log.push(createLogEntry('DRIBBLE_SUCCESS', newState, { playerId: player.id, beatenId: opponent?.id || null }));

    // eine Zone vor
    const nextZone = oneStepForwardZone(newState.ball.zone, player.teamId, newState);
    newState.ball.zone = nextZone;
    newState.ball.context = { type: 'OPEN_PLAY', lastAction: 'DRIBBLE_SUCCESS', lastActionPlayerId: player.id, potentialAssistBy: null };

    // im letzten Drittel: Schuss forcieren
    const isHome = player.teamId === newState.homeTeam.id;
    const attackingZone = isHome ? ZONES.AWAY_ATT : ZONES.HOME_DEFENSE;
    if (newState.ball.zone === attackingZone) {
      newState.ball.context.priorityAction = 'MUST_SHOOT';
    }
    return newState;
  }

  // 20% Foul
  if (Math.random() < 0.20 && opponent) {
    return foul(opponent, player, newState);
  }

  // Tacklesieg
  if (opponent) {
    playerStats[opponent.id].tacklesSucceeded += 1;
    log.push(createLogEntry('TACKLE_WIN', newState, { playerId: opponent.id, againstId: player.id }));
    const after = maybeInjuryOnEvent(player, newState, 'DUEL_LOSS');
    after.ball.inPossessionOfTeam = opponent.teamId;
    after.ball.playerInPossessionId = opponent.id;
    after.ball.context = { type: 'OPEN_PLAY', lastAction: 'TACKLE_WIN', lastActionPlayerId: opponent.id, potentialAssistBy: null };
    return after;
  }

  return newState;
}

export function shoot(player, state) {
  const newState = cloneState(state);
  const { log, playerStats, homeTeam, awayTeam, players } = newState;
  ensurePlayerStats(playerStats, player.id);
  playerStats[player.id].shots += 1;

  const bonus = getPositionalBonus('SHOOT', player.position);
  const shootSkill = (player.strength || 50) + bonus;

  const oppTeamId = player.teamId === homeTeam.id ? awayTeam.id : homeTeam.id;
  const goalkeeper =
    players.find(p => p.teamId === oppTeamId && positionKeyToGroup(p.position) === 'TOR') ||
    players.find(p => p.teamId === oppTeamId);

  const onTargetChance = clamp(0.45 + (safe(player.strength)-70)/120, 0.20, 0.90);
  function safe(x){ const n=Number(x); return Number.isFinite(n)?n:50; }

  if (Math.random() > onTargetChance) {
    log.push(createLogEntry('SHOT_OFF_TARGET', newState, { playerId: player.id, gkId: goalkeeper?.id || null }));
    const defenseZone = homeTeam.id === oppTeamId ? ZONES.HOME_DEFENSE : ZONES.AWAY_DEFENSE;
    newState.ball.inPossessionOfTeam = oppTeamId;
    newState.ball.playerInPossessionId = goalkeeper?.id || null;
    newState.ball.zone = defenseZone;
    newState.ball.context = { type: 'OPEN_PLAY', lastAction: 'SHOT_OFF_TARGET', lastActionPlayerId: player.id, potentialAssistBy: null };
    return newState;
  }

  playerStats[player.id].shotsOnTarget += 1;

  if (!goalkeeper) {
    playerStats[player.id].goals += 1;
    log.push(createLogEntry('GOAL_EMPTY_NET', newState, { playerId: player.id }));
    const newHomeScore = player.teamId === homeTeam.id ? newState.homeScore + 1 : newState.homeScore;
    const newAwayScore = player.teamId === awayTeam.id ? newState.awayScore + 1 : newState.awayScore;
    newState.homeScore = newHomeScore;
    newState.awayScore = newAwayScore;

    const kickoff = players.find(p => p.teamId === oppTeamId) || null;
    newState.ball = { inPossessionOfTeam: oppTeamId, playerInPossessionId: kickoff?.id || null, zone: ZONES.HOME_MIDFIELD, context: { type: 'KICKOFF' } };
    newState.log.push(createLogEntry('KICKOFF', newState, { playerId: kickoff?.id || null }));
    return newState;
  }

  const goalkeeperSkill = (goalkeeper.strength || 50) + getPositionalBonus('SAVE', sanitizePos(goalkeeper.position));

  if (calculateSuccess(shootSkill, goalkeeperSkill, 0.45)) {
    playerStats[player.id].goals += 1;

    const assisterId = newState.ball.context?.potentialAssistBy || null;
    if (assisterId) {
      ensurePlayerStats(playerStats, assisterId);
      playerStats[assisterId].assists = (playerStats[assisterId].assists || 0) + 1;
      newState.log.push(createLogEntry('ASSIST', newState, { playerId: assisterId }));
    }

    const newHomeScore = player.teamId === homeTeam.id ? newState.homeScore + 1 : newState.homeScore;
    const newAwayScore = player.teamId === awayTeam.id ? newState.awayScore + 1 : newState.awayScore;

    newState.log.push(createLogEntry('GOAL', { ...newState, homeScore: newHomeScore, awayScore: newAwayScore }, { playerId: player.id, gkId: goalkeeper.id }));

    const kickoff = newState.players.find(p => p.teamId === oppTeamId) || null;
    newState.homeScore = newHomeScore;
    newState.awayScore = newAwayScore;
    newState.ball = { inPossessionOfTeam: oppTeamId, playerInPossessionId: kickoff?.id || null, zone: ZONES.HOME_MIDFIELD, context: { type: 'KICKOFF' } };
    newState.log.push(createLogEntry('KICKOFF', newState, { playerId: kickoff?.id || null }));
    return newState;
  }

  // gehalten
  ensurePlayerStats(playerStats, goalkeeper.id);
  playerStats[goalkeeper.id].saves += 1;
  newState.log.push(createLogEntry('SHOOT_SAVE', newState, { playerId: player.id, gkId: goalkeeper.id }));

  // Rebound?
  if (Math.random() < 0.27) {
    newState.ball.inPossessionOfTeam = player.teamId;
    newState.ball.playerInPossessionId = null;
    newState.ball.context = { type: 'REBOUND' };
    return newState;
  }

  const defenseZone = homeTeam.id === oppTeamId ? ZONES.HOME_DEFENSE : ZONES.AWAY_DEFENSE;
  newState.ball.inPossessionOfTeam = goalkeeper.teamId;
  newState.ball.playerInPossessionId = goalkeeper.id;
  newState.ball.zone = defenseZone;
  newState.ball.context = { type: 'OPEN_PLAY', lastAction: 'SAVE', lastActionPlayerId: goalkeeper.id, potentialAssistBy: null };
  return newState;
}

export function foul(fouler, fouledPlayer, state) {
  const newState = cloneState(state);
  const { log, playerStats } = newState;
  ensurePlayerStats(playerStats, fouler.id);
  ensurePlayerStats(playerStats, fouledPlayer.id);

  playerStats[fouler.id].foulsCommitted += 1;
  newState.log.push(createLogEntry('FOUL', newState, { byId: fouler.id, onId: fouledPlayer.id }));

  // Karten (nur Pflichtspiele)
  let bookedState = maybeBookCard(fouler, newState);
  // Verletzungschance
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
  const foulZone = newState.ball.context?.foulLocation || newState.ball.zone;
  const isHome = player.teamId === newState.homeTeam.id;
  const isAttacking = (isHome && foulZone === ZONES.AWAY_ATT) || (!isHome && foulZone === ZONES.HOME_DEFENSE);

  if (isAttacking) {
    newState.log.push(createLogEntry('FREE_KICK_SHOOT', newState, { playerId: player.id }));
    return shoot(player, newState);
  }
  newState.log.push(createLogEntry('FREE_KICK_PASS', newState, { playerId: player.id }));
  return pass(player, newState);
}

export function scrambleForRebound(state) {
  const newState = cloneState(state);
  const { log, players, homeTeam } = newState;

  const attTeamId = newState.ball.inPossessionOfTeam;
  const defTeamId = attTeamId === homeTeam.id ? newState.awayTeam.id : homeTeam.id;

  const attacker =
    players.find(p => p.teamId === attTeamId && positionKeyToGroup(p.position) === 'ATT') ||
    getTeamPlayer(attTeamId, players, null);

  const defender =
    players.find(p => p.teamId === defTeamId && positionKeyToGroup(p.position) === 'DEF') ||
    getTeamPlayer(defTeamId, players, null);

  if (!attacker || !defender) {
    const rndDef = getTeamPlayer(defTeamId, players, null) || players.find(p => p.teamId === defTeamId);
    newState.log.push(createLogEntry('REBOUND_LOSE', newState, { byId: rndDef?.id || null }));
    newState.ball.inPossessionOfTeam = defTeamId;
    newState.ball.playerInPossessionId = rndDef?.id || null;
    newState.ball.context = { type: 'OPEN_PLAY' };
    return newState;
  }

  if (calculateSuccess(attacker.strength, defender.strength, 0.50)) {
    newState.log.push(createLogEntry('REBOUND_WIN', newState, { byId: attacker.id }));
    return shoot(attacker, newState);
  }

  newState.log.push(createLogEntry('REBOUND_LOSE', newState, { byId: defender.id }));
  newState.ball.inPossessionOfTeam = defTeamId;
  newState.ball.playerInPossessionId = defender.id;
  newState.ball.context = { type: 'OPEN_PLAY' };
  return newState;
}
