import { getPositionalBonus, calculateSuccess, getOpponent, findBestPassRecipient, getTeamPlayer, applyRatingDelta, getPlayerById } from './utils.js';
import { createLogEntry } from './logger.js';
import { RATING_DELTAS } from './constants.js';
import * as logger from "firebase-functions/logger";

function createNewState(oldState) {
    return {
        ...oldState,
        log: [...oldState.log],
        playerRatings: { ...oldState.playerRatings },
        playerStats: JSON.parse(JSON.stringify(oldState.playerStats)),
        ball: { 
            ...oldState.ball, 
            context: { ...(oldState.ball.context || {}) } 
        },
    }
}

export function pass(player, state) {
  const newState = createNewState(state);
  const { log, playerRatings, playerStats, players, homeTeam, homeTeamTactics, awayTeamTactics } = newState;
  const newContext = { type: 'OPEN_PLAY', lastAction: 'PASS', lastActionPlayerId: player.id, potentialAssistBy: null };

  if (playerStats[player.id]) playerStats[player.id].passes += 1;

  const bonus = getPositionalBonus('PASS', player.position);
  const passSkill = player.strength + bonus;
  const opponent = getOpponent(player, newState);
  const defenseSkill = opponent.strength + getPositionalBonus('TACKLE', opponent.position);
  
  const tactics = player.teamId === homeTeam.id ? homeTeamTactics : awayTeamTactics;
  let successModifier = 0;
  if (tactics.passStyle === 'sicher') successModifier = 0.1;
  if (tactics.passStyle === 'riskant') successModifier = -0.1;

  if (calculateSuccess(passSkill, defenseSkill, 0.85 + successModifier)) {
    const recipient = findBestPassRecipient(player, newState);
    const finalRecipient = recipient || getTeamPlayer(player.teamId, players, player.id);
    if (!finalRecipient) {
       applyRatingDelta(playerRatings, player.id, RATING_DELTAS.PASS_FAIL);
       log.push(createLogEntry('PASS_FAIL', newState, { player, opponent }));
       return { ...newState, log, ball: { ...newState.ball, inPossessionOfTeam: opponent.teamId, playerInPossessionId: opponent.id, context: newContext }};
    }

    if (playerStats[player.id]) playerStats[player.id].passesCompleted += 1;
    applyRatingDelta(playerRatings, player.id, RATING_DELTAS.PASS_SUCCESS);
    log.push(createLogEntry('PASS_SUCCESS', newState, { player, recipient: finalRecipient }));
    newContext.potentialAssistBy = player.id;
    return { ...newState, log, ball: { ...newState.ball, playerInPossessionId: finalRecipient.id, context: newContext } };
  } else {
    applyRatingDelta(playerRatings, player.id, RATING_DELTAS.PASS_FAIL);
    applyRatingDelta(playerRatings, opponent.id, RATING_DELTAS.TACKLE_WIN);
    log.push(createLogEntry('PASS_FAIL', newState, { player, opponent }));
    return { ...newState, log, ball: { ...newState.ball, inPossessionOfTeam: opponent.teamId, playerInPossessionId: opponent.id, context: newContext } };
  }
}

export function dribble(player, state) {
  const newState = createNewState(state);
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
    let newZone = newState.ball.zone;
    if (isHomeTeam) {
        const zoneOrder = ['HOME_DEFENSE', 'HOME_MIDFIELD', 'AWAY_MIDFIELD', 'AWAY_ATTACK'];
        const currentIndex = zoneOrder.indexOf(newState.ball.zone);
        const newIndex = Math.min(currentIndex + 1, 3);
        newZone = zoneOrder[newIndex];
    } else {
        const zoneOrder = ['AWAY_ATTACK', 'AWAY_MIDFIELD', 'HOME_MIDFIELD', 'HOME_DEFENSE'];
        const currentIndex = zoneOrder.indexOf(newState.ball.zone);
        const newIndex = Math.min(currentIndex + 1, 3);
        newZone = zoneOrder[newIndex];
    }
    const newContext = { type: 'OPEN_PLAY', lastAction: 'DRIBBLE_SUCCESS', lastActionPlayerId: player.id, justBeatenPlayerId: opponent.id, potentialAssistBy: null };
    const isAttackingZone = (isHomeTeam && newZone === 'AWAY_ATTACK') || (!isHomeTeam && newZone === 'HOME_DEFENSE');
    if(isAttackingZone) { newContext.priorityAction = 'MUST_SHOOT'; }
    return { ...newState, log, ball: { ...newState.ball, zone: newZone, context: newContext } };
  } else {
    const foulChance = 0.2;
    if(Math.random() < foulChance) {
        return foul(opponent, player, newState);
    }
    
    if (playerStats[opponent.id]) playerStats[opponent.id].tacklesSucceeded += 1;
    applyRatingDelta(playerRatings, opponent.id, RATING_DELTAS.TACKLE_WIN);
    applyRatingDelta(playerRatings, player.id, RATING_DELTAS.DRIBBLE_FAIL);
    log.push(createLogEntry('TACKLE_WIN', newState, { player, opponent }));
    const newContext = {type: 'OPEN_PLAY', lastAction: 'TACKLE_WIN', lastActionPlayerId: opponent.id, potentialAssistBy: null};
    return { ...newState, log, ball: { ...newState.ball, inPossessionOfTeam: opponent.teamId, playerInPossessionId: opponent.id, context: newContext } };
  }
}

export function shoot(player, state) {
  const newState = createNewState(state);
  const { log, playerRatings, playerStats, homeTeam, awayTeam, players } = newState;
  const context = newState.ball.context || {};
  
  if (playerStats[player.id]) playerStats[player.id].shots += 1;

  const bonus = getPositionalBonus('SHOOT', player.position);
  const shootSkill = player.strength + bonus;
  const opponentTeamId = player.teamId === homeTeam.id ? awayTeam.id : homeTeam.id;
  const goalkeeper = players.find(p => p.teamId === opponentTeamId && p.positionGroup === 'TOR');

  const onTargetChance = 0.7 + (player.strength - 75) / 100;
  if (Math.random() > onTargetChance) {
      applyRatingDelta(playerRatings, player.id, RATING_DELTAS.SHOT_OFF_TARGET);
      log.push(createLogEntry('SHOT_OFF_TARGET', newState, { player, opponent: goalkeeper }));
      const defenseZone = homeTeam.id === opponentTeamId ? 'HOME_DEFENSE' : 'AWAY_DEFENSE';
      const newContext = { type: 'OPEN_PLAY', lastAction: 'SHOT_OFF_TARGET', lastActionPlayerId: player.id };
      return { ...newState, log, ball: { inPossessionOfTeam: opponentTeamId, playerInPossessionId: goalkeeper.id, zone: defenseZone, context: newContext } };
  }

  if (playerStats[player.id]) playerStats[player.id].shotsOnTarget += 1;

  if (!goalkeeper) {
    if (playerStats[player.id]) playerStats[player.id].goals = (playerStats[player.id].goals || 0) + 1;
    applyRatingDelta(playerRatings, player.id, RATING_DELTAS.SHOOT_EMPTY_NET);
    const newHomeScore = player.teamId === homeTeam.id ? newState.homeScore + 1 : newState.homeScore;
    const newAwayScore = player.teamId === awayTeam.id ? newState.awayScore + 1 : newState.awayScore;
    log.push(createLogEntry('SHOOT_EMPTY_NET', { ...newState, homeScore: newHomeScore, awayScore: newAwayScore }, { player }));
    const kickoffPlayer = players.find(p => p.teamId === opponentTeamId);
    log.push(createLogEntry('KICKOFF', newState, { player: kickoffPlayer }));
    return { ...newState, homeScore: newHomeScore, awayScore: newAwayScore, log, ball: { inPossessionOfTeam: opponentTeamId, playerInPossessionId: kickoffPlayer.id, zone: 'HOME_MIDFIELD', context: { type: 'KICKOFF' } } };
  }

  const goalkeeperSkill = goalkeeper.strength + getPositionalBonus('SAVE', goalkeeper.position || 'TW');

  if (calculateSuccess(shootSkill, goalkeeperSkill, 0.45)) {
    if (playerStats[player.id]) playerStats[player.id].goals = (playerStats[player.id].goals || 0) + 1;
    applyRatingDelta(playerRatings, player.id, RATING_DELTAS.GOAL);
    const assisterId = context.potentialAssistBy;
    if (assisterId && assisterId !== player.id) {
        if(playerStats[assisterId]) playerStats[assisterId].assists = (playerStats[assisterId].assists || 0) + 1;
        applyRatingDelta(playerRatings, assisterId, RATING_DELTAS.ASSIST);
        const assister = getPlayerById(players, assisterId);
        log.push(createLogEntry('ASSIST', newState, { player: assister }));
    }
    const newHomeScore = player.teamId === homeTeam.id ? newState.homeScore + 1 : newState.homeScore;
    const newAwayScore = player.teamId === awayTeam.id ? newState.awayScore + 1 : newState.awayScore;
    log.push(createLogEntry('GOAL', { ...newState, homeScore: newHomeScore, awayScore: newAwayScore }, { player, opponent: goalkeeper }));
    const kickoffPlayer = players.find(p => p.teamId === opponentTeamId && (p.position === 'ST' || p.positionGroup === 'ATT')) || players.find(p => p.teamId === opponentTeamId);
    log.push(createLogEntry('KICKOFF', newState, { player: kickoffPlayer }));
    return { ...newState, homeScore: newHomeScore, awayScore: newAwayScore, log, ball: { inPossessionOfTeam: opponentTeamId, playerInPossessionId: kickoffPlayer.id, zone: 'HOME_MIDFIELD', context: { type: 'KICKOFF' } } };
  } else {
    if (playerStats[goalkeeper.id]) playerStats[goalkeeper.id].saves += 1;
    applyRatingDelta(playerRatings, player.id, RATING_DELTAS.SHOOT_SAVE_PLAYER);
    applyRatingDelta(playerRatings, goalkeeper.id, RATING_DELTAS.SHOOT_SAVE_GK);
    
    const reboundChance = 0.25;
    if (Math.random() < reboundChance) {
        log.push(createLogEntry('SHOOT_SAVE', newState, { player, opponent: goalkeeper }));
        log.push(createLogEntry('REBOUND_SCRAMBLE', newState));
        return { ...newState, log, ball: { ...newState.ball, inPossessionOfTeam: player.teamId, playerInPossessionId: null, context: { type: 'REBOUND' } } };
    }
    log.push(createLogEntry('SHOOT_SAVE', newState, { player, opponent: goalkeeper }));
    const defenseZone = homeTeam.id === goalkeeper.teamId ? 'HOME_DEFENSE' : 'AWAY_DEFENSE';
    const newContext = {type: 'OPEN_PLAY', lastAction: 'SAVE', lastActionPlayerId: goalkeeper.id, potentialAssistBy: null};
    return { ...newState, log, ball: { inPossessionOfTeam: goalkeeper.teamId, playerInPossessionId: goalkeeper.id, zone: defenseZone, context: newContext } };
  }
}

export function cross(player, state) {
  const newState = createNewState(state);
  const { log, playerRatings, playerStats, players } = newState;
  const newContext = { type: 'OPEN_PLAY', lastAction: 'CROSS', lastActionPlayerId: player.id, potentialAssistBy: null };

  if (playerStats[player.id]) playerStats[player.id].crosses = (playerStats[player.id].crosses || 0) + 1;
  const bonus = getPositionalBonus('CROSS', player.position);
  const crossSkill = player.strength + bonus;
  const opponent = getOpponent(player, newState);
  const defenseSkill = opponent.strength + getPositionalBonus('TACKLE', opponent.position);

  if (calculateSuccess(crossSkill, defenseSkill, 0.7)) {
    if (playerStats[player.id]) playerStats[player.id].crossesCompleted = (playerStats[player.id].crossesCompleted || 0) + 1;
    applyRatingDelta(playerRatings, player.id, RATING_DELTAS.CROSS_SUCCESS);
    const target = players.find(p => p.teamId === player.teamId && ['ST', 'MS', 'HS'].includes(p.position));
    if (target) {
        log.push(createLogEntry('CROSS_SUCCESS', newState, { player, recipient: target }));
        newContext.potentialAssistBy = player.id;
        newContext.priorityAction = 'MUST_SHOOT';
        return { ...newState, log, ball: { ...newState.ball, playerInPossessionId: target.id, context: newContext } };
    }
  }
  
  applyRatingDelta(playerRatings, player.id, RATING_DELTAS.CROSS_FAIL);
  log.push(createLogEntry('CROSS_FAIL', newState, { player, opponent }));
  return { ...newState, log, ball: { ...newState.ball, inPossessionOfTeam: opponent.teamId, playerInPossessionId: opponent.id, context: newContext } };
}

export function throughBall(player, state) {
  const newState = createNewState(state);
  const { log, playerRatings, playerStats } = newState;
  const newContext = { type: 'OPEN_PLAY', lastAction: 'THROUGH_BALL', lastActionPlayerId: player.id, potentialAssistBy: null };

  if (playerStats[player.id]) playerStats[player.id].throughBalls = (playerStats[player.id].throughBalls || 0) + 1;
  const bonus = getPositionalBonus('THROUGH_BALL', player.position);
  const passSkill = player.strength + bonus;
  const opponent = getOpponent(player, newState);
  const defenseSkill = opponent.strength + getPositionalBonus('TACKLE', opponent.position);

  if (calculateSuccess(passSkill, defenseSkill, 0.5 + (newState.awayTeamTactics.defensiveLine === 'hoch' ? 0.2 : newState.awayTeamTactics.defensiveLine === 'tief' ? -0.2 : 0))) {
    if (playerStats[player.id]) playerStats[player.id].throughBallsCompleted = (playerStats[player.id].throughBallsCompleted || 0) + 1;
    applyRatingDelta(playerRatings, player.id, RATING_DELTAS.THROUGH_BALL_SUCCESS);
    const recipient = findBestPassRecipient(player, newState);
    if (recipient) {
      log.push(createLogEntry('THROUGH_BALL_SUCCESS', newState, { player, recipient }));
      newContext.potentialAssistBy = player.id;
      newContext.priorityAction = 'MUST_SHOOT';
      return { ...newState, log, ball: { ...newState.ball, playerInPossessionId: recipient.id, context: newContext } };
    }
  }

  applyRatingDelta(playerRatings, player.id, RATING_DELTAS.THROUGH_BALL_FAIL);
  log.push(createLogEntry('THROUGH_BALL_FAIL', newState, { player, opponent }));
  return { ...newState, log, ball: { ...newState.ball, inPossessionOfTeam: opponent.teamId, playerInPossessionId: opponent.id, context: newContext } };
}

export function foul(fouler, fouledPlayer, state) {
    const newState = createNewState(state);
    const { log, playerRatings, playerStats } = newState;
    if (playerStats[fouler.id]) playerStats[fouler.id].foulsCommitted += 1;
    applyRatingDelta(playerRatings, fouler.id, RATING_DELTAS.FOUL_COMMITTED);
    applyRatingDelta(playerRatings, fouledPlayer.id, RATING_DELTAS.FOUL_DRAWN);
    log.push(createLogEntry('FOUL', newState, { player: fouler, opponent: fouledPlayer }));
    return { ...newState, log, ball: { ...newState.ball, inPossessionOfTeam: fouledPlayer.teamId, playerInPossessionId: fouledPlayer.id, context: { type: 'FREE_KICK', foulLocation: newState.ball.zone, lastAction: 'FOUL', lastActionPlayerId: fouler.id, potentialAssistBy: null } } };
}

export function handleFreeKick(player, state) {
    const newState = createNewState(state);
    const { log } = newState;
    const foulZone = newState.ball.context.foulLocation;
    const isHomeTeam = player.teamId === newState.homeTeam.id;
    const isAttackingZone = (isHomeTeam && foulZone === 'AWAY_ATTACK') || (!isHomeTeam && foulZone === 'HOME_DEFENSE');
    if(isAttackingZone) {
        log.push(createLogEntry('FREE_KICK_SHOOT', newState, { player }));
        return shoot(player, newState);
    } else {
        log.push(createLogEntry('FREE_KICK_PASS', newState, { player }));
        return pass(player, newState);
    }
}

export function scrambleForRebound(state) {
    const newState = createNewState(state);
    const { log, playerRatings, playerStats, players, homeTeam } = newState;
    const attackingTeamId = newState.ball.inPossessionOfTeam;
    const defendingTeamId = attackingTeamId === homeTeam.id ? state.awayTeam.id : homeTeam.id;
    const attacker = players.find(p => p.teamId === attackingTeamId && p.positionGroup === 'ATT');
    const defender = players.find(p => p.teamId === defendingTeamId && p.positionGroup === 'DEF');
    const finalAttacker = attacker || getTeamPlayer(attackingTeamId, players, null);
    const finalDefender = defender || getTeamPlayer(defendingTeamId, players, null);
    
    if(!finalAttacker || !finalDefender) {
        log.push(createLogEntry('REBOUND_LOSE', newState, { opponent: { nachname: 'Die Abwehr' } }));
        const randomDefender = getTeamPlayer(defendingTeamId, players, null) || players.find(p=>p.teamId === defendingTeamId);
        return { ...newState, log, ball: { ...newState.ball, inPossessionOfTeam: defendingTeamId, playerInPossessionId: randomDefender.id, context: {type: 'OPEN_PLAY'} } };
    }

    if(calculateSuccess(finalAttacker.strength, finalDefender.strength, 0.5)) {
        applyRatingDelta(playerRatings, finalAttacker.id, RATING_DELTAS.REBOUND_WIN);
        log.push(createLogEntry('REBOUND_WIN', newState, { player: finalAttacker }));
        return shoot(finalAttacker, newState);
    } else {
        applyRatingDelta(playerRatings, finalDefender.id, RATING_DELTAS.REBOUND_LOSE_DEF);
        log.push(createLogEntry('REBOUND_LOSE', newState, { opponent: finalDefender }));
        return { ...newState, log, ball: { ...newState.ball, inPossessionOfTeam: defendingTeamId, playerInPossessionId: finalDefender.id, context: {type: 'OPEN_PLAY'} } };
    }
}