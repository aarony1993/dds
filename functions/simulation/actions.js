// functions/simulation/actions.js
import {
  getPositionalBonus,
  calculateSuccess,
  getOpponent,
  findBestPassRecipient,
  getTeamPlayer,
  applyRatingDelta,
  getPlayerById,
  sanitizePos,
  positionKeyToGroup,
} from './utils.js';
import { createLogEntry } from './logger.js';
import { RATING_DELTAS, DISCIPLINE, INJURIES } from './constants.js';

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

// ----- Verfügbarkeit / Regeln -----
function isCompetitive(state) { return !!(state?.isCompetitive); }

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

// Fallback: Ballverlust
export function turnover(player, state) {
  const newState = cloneState(state);
  const opponent = getOpponent(player, newState);
  newState.log.push(createLogEntry('TURNOVER', newState, { player, opponent }));
  newState.ball.inPossessionOfTeam = opponent.teamId;
  newState.ball.playerInPossessionId = opponent.id;
  return newState;
}

// ---------------------------------------------------
// Aktionen
// ---------------------------------------------------

export function pass(player, state) {
  const newState = cloneState(state);
  const { log, playerRatings, playerStats } = newState;

  const newContext = {
    type: 'OPEN_PLAY',
    lastAction: 'PASS',
    lastActionPlayerId: player.id,
    potentialAssistBy: null,
  };

  if (playerStats[player.id]) playerStats[player.id].passes += 1;

  const bonus = getPositionalBonus('PASS', player.position);
  const passSkill = player.strength + bonus;
  const opponent = getOpponent(player, newState);
  const defenseSkill = opponent.strength + getPositionalBonus('TACKLE', opponent.position);

  const base = 0.85;
  if (calculateSuccess(passSkill, defenseSkill, base)) {
    const recipient = findBestPassRecipient(player, newState) || getTeamPlayer(player.teamId, newState.players, player.id, newState);
    if (!recipient) {
      // treat as fail
    } else {
      if (playerStats[player.id]) playerStats[player.id].passesCompleted += 1;
      applyRatingDelta(playerRatings, player.id, RATING_DELTAS.PASS_SUCCESS);
      log.push(createLogEntry('PASS_SUCCESS', newState, { player, recipient }));
      newContext.potentialAssistBy = player.id;
      newState.ball.playerInPossessionId = recipient.id;
      newState.ball.context = newContext;
      return newState;
    }
  }

  // Fehlpass → Interception
  if (playerStats[opponent.id]) playerStats[opponent.id].interceptions += 1;
  applyRatingDelta(playerRatings, player.id, RATING_DELTAS.PASS_FAIL);
  applyRatingDelta(playerRatings, opponent.id, RATING_DELTAS.TACKLE_WIN);
  log.push(createLogEntry('PASS_FAIL', newState, { player, opponent }));

  newState.ball.inPossessionOfTeam = opponent.teamId;
  newState.ball.playerInPossessionId = opponent.id;
  newState.ball.context = newContext;
  return newState;
}

export function dribble(player, state) {
  const newState = cloneState(state);
  const { log, playerRatings, playerStats, homeTeam } = newState;
  const opponent = getOpponent(player, newState);

  if (playerStats[player.id]) playerStats[player.id].dribbles += 1;
  if (playerStats[opponent.id]) playerStats[opponent.id].tackles += 1;

  const bonus = getPositionalBonus('DRIBBLE', player.position);
  const dribbleSkill = player.strength + bonus;
  const tackleSkill = opponent.strength + getPositionalBonus('TACKLE', opponent.position);

  if (calculateSuccess(dribbleSkill, tackleSkill, 0.7)) {
    if (playerStats[player.id]) playerStats[player.id].dribblesSucceeded += 1;
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

  if (playerStats[opponent.id]) playerStats[opponent.id].tacklesSucceeded += 1;
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
  return after;
}

export function shoot(player, state) {
  const newState = cloneState(state);
  const { log, playerRatings, playerStats, homeTeam, awayTeam, players } = newState;

  if (playerStats[player.id]) playerStats[player.id].shots += 1;

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
    newState.ball.playerInPossessionId = goalkeeper.id;
    newState.ball.zone = defenseZone;
    newState.ball.context = ctx;
    return newState;
  }

  if (playerStats[player.id]) playerStats[player.id].shotsOnTarget += 1;

  if (!goalkeeper) {
    if (playerStats[player.id]) playerStats[player.id].goals += 1;
    applyRatingDelta(playerRatings, player.id, RATING_DELTAS.SHOOT_EMPTY_NET);

    const newHomeScore = player.teamId === homeTeam.id ? newState.homeScore + 1 : newState.homeScore;
    const newAwayScore = player.teamId === awayTeam.id ? newState.awayScore + 1 : newState.awayScore;

    log.push(createLogEntry('SHOOT_EMPTY_NET', { ...newState, homeScore: newHomeScore, awayScore: newAwayScore }, { player }));

    const kickoffPlayer =
      players.find(p => p.teamId === opponentTeamId && p.positionGroup === 'ATT') ||
      players.find(p => p.teamId === opponentTeamId);

    newState.homeScore = newHomeScore;
    newState.awayScore = newAwayScore;
    newState.log = log;
    newState.ball = {
      inPossessionOfTeam: opponentTeamId,
      playerInPossessionId: kickoffPlayer.id,
      zone: 'HOME_MIDFIELD',
      context: { type: 'KICKOFF' },
    };
    newState.log.push(createLogEntry('KICKOFF', newState, { player: kickoffPlayer }));
    return newState;
  }

  const goalkeeperSkill = goalkeeper.strength + getPositionalBonus('SAVE', sanitizePos(goalkeeper.position) || 'TW');

  // Tor?
  if (calculateSuccess(shootSkill, goalkeeperSkill, 0.45)) {
    if (playerStats[player.id]) playerStats[player.id].goals += 1;
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
      playerInPossessionId: kickoffPlayer.id,
      zone: 'HOME_MIDFIELD',
      context: { type: 'KICKOFF' },
    };
    newState.log.push(createLogEntry('KICKOFF', newState, { player: kickoffPlayer }));
    return newState;
  }

  // gehalten
  if (playerStats[goalkeeper.id]) playerStats[goalkeeper.id].saves += 1;
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
  return newState;
}

export function cross(player, state) {
  const newState = cloneState(state);
  const { log, playerRatings, playerStats, players } = newState;
  const newContext = { type: 'OPEN_PLAY', lastAction: 'CROSS', lastActionPlayerId: player.id, potentialAssistBy: null };

  if (playerStats[player.id]) playerStats[player.id].crosses += 1;

  const bonus = getPositionalBonus('CROSS', player.position);
  const crossSkill = player.strength + bonus;
  const opponent = getOpponent(player, newState);
  const defenseSkill = opponent.strength + getPositionalBonus('TACKLE', opponent.position);

  if (calculateSuccess(crossSkill, defenseSkill, 0.7)) {
    if (playerStats[player.id]) playerStats[player.id].crossesCompleted += 1;
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

  applyRatingDelta(playerRatings, player.id, RATING_DELTAS.CROSS_FAIL);
  log.push(createLogEntry('CROSS_FAIL', newState, { player, opponent }));

  newState.ball.inPossessionOfTeam = opponent.teamId;
  newState.ball.playerInPossessionId = opponent.id;
  newState.ball.context = newContext;
  return newState;
}

export function throughBall(player, state) {
  const newState = cloneState(state);
  const { log, playerRatings, playerStats } = newState;
  const newContext = { type: 'OPEN_PLAY', lastAction: 'THROUGH_BALL', lastActionPlayerId: player.id, potentialAssistBy: null };

  if (playerStats[player.id]) playerStats[player.id].throughBalls += 1;

  const bonus = getPositionalBonus('THROUGH_BALL', player.position);
  const passSkill = player.strength + bonus;
  const opponent = getOpponent(player, newState);
  const defenseSkill = opponent.strength + getPositionalBonus('TACKLE', opponent.position);

  const base = 0.5;
  if (calculateSuccess(passSkill, defenseSkill, base)) {
    if (playerStats[player.id]) playerStats[player.id].throughBallsCompleted += 1;
    applyRatingDelta(playerRatings, player.id, RATING_DELTAS.THROUGH_BALL_SUCCESS);

    const recipient = findBestPassRecipient(player, newState);
    if (recipient) {
      log.push(createLogEntry('THROUGH_BALL_SUCCESS', newState, { player, recipient }));
      newContext.potentialAssistBy = player.id;
      newContext.priorityAction = 'MUST_SHOOT';
      newState.ball.playerInPossessionId = recipient.id;
      newState.ball.context = newContext;
      return newState;
    }
  }

  applyRatingDelta(playerRatings, player.id, RATING_DELTAS.THROUGH_BALL_FAIL);
  log.push(createLogEntry('THROUGH_BALL_FAIL', newState, { player, opponent }));

  newState.ball.inPossessionOfTeam = opponent.teamId;
  newState.ball.playerInPossessionId = opponent.id;
  newState.ball.context = newContext;
  return newState;
}

export function foul(fouler, fouledPlayer, state) {
  const newState = cloneState(state);
  const { log, playerRatings, playerStats } = newState;

  if (playerStats[fouler.id]) playerStats[fouler.id].foulsCommitted += 1;

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
    newState.ball.playerInPossessionId = randomDefender?.id;
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
