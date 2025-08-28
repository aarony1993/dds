import * as actions from './actions.js';
import { getPlayerById, getOpponent } from './utils.js';
import { createLogEntry } from './logger.js';

/**
 * Initialisiert den zentralen Spielzustand (GameState) für ein neues Spiel.
 */
function initializeGameState(homeTeam, awayTeam, players, homeLineup, awayLineup) {
  const startingPlayerId = homeLineup.find(pos => pos.position === 'ZM')?.playerId || homeLineup.find(pos => pos.positionGroup === 'MID')?.playerId || homeLineup[5].playerId;
  const startingPlayer = players.find(p => p.id === startingPlayerId);

  const playerRatings = {};
  const playerStats = {};

  players.forEach(p => {
    playerRatings[p.id] = 6.0;
    playerStats[p.id] = {
      shots: 0, shotsOnTarget: 0, goals: 0, assists: 0,
      passes: 0, passesCompleted: 0,
      dribbles: 0, dribblesSucceeded: 0,
      tackles: 0, tacklesSucceeded: 0,
      foulsCommitted: 0, saves: 0,
      crosses: 0, crossesCompleted: 0,
      throughBalls: 0, throughBallsCompleted: 0,
      interceptions: 0,
    };
  });

  return {
    minute: 0,
    homeScore: 0,
    awayScore: 0,
    homeTeam,
    awayTeam,
    players,
    homeLineup,
    awayLineup,
    playerRatings,
    playerStats,
    // Fügt die Taktiken dem gameState hinzu
    homeTeamTactics: {
      defensiveLine: homeTeam.tacticDefensiveLine || 'normal',
      passStyle: homeTeam.tacticPassStyle || 'gemischt',
    },
    awayTeamTactics: {
      defensiveLine: awayTeam.tacticDefensiveLine || 'normal',
      passStyle: awayTeam.tacticPassStyle || 'gemischt',
    },
    ball: {
      inPossessionOfTeam: homeTeam.id,
      playerInPossessionId: startingPlayer.id,
      zone: 'HOME_MIDFIELD',
      context: { type: 'OPEN_PLAY' }
    },
    log: [createLogEntry('GAME_START', { homeTeam, awayTeam, minute: 0 }, { player: startingPlayer })],
    half: 1,
  };
}

/**
 * Die KI-Logik, die die nächste Aktion für einen Spieler bestimmt.
 */
function determineAction(player, gameState) {
  const context = gameState.ball.context || {};
  if (context.priorityAction) return context.priorityAction;
  if (context.type === 'FREE_KICK') return 'HANDLE_FREE_KICK';
  if (context.type === 'REBOUND') return 'SCRAMBLE_FOR_REBOUND';
  
  const lineup = player.teamId === gameState.homeTeam.id ? gameState.homeLineup : gameState.awayLineup;
  const playerPosInfo = lineup.find(p => p.playerId === player.id);
  const position = playerPosInfo?.position || '';
  const zone = gameState.ball.zone;
  
  let weights = { PASS: 0.5, DRIBBLE: 0.4, SHOOT: 0.05, THROUGH_BALL: 0.05, CROSS: 0.05 };

  // 1. Grund-Tendenzen basierend auf der Position
  if (['ST', 'MS', 'HS'].includes(position)) weights = { PASS: 0.2, DRIBBLE: 0.1, SHOOT: 0.6, THROUGH_BALL: 0.1, CROSS: 0 };
  else if (['LA', 'RA', 'LM', 'RM'].includes(position)) weights = { PASS: 0.3, DRIBBLE: 0.3, SHOOT: 0.1, THROUGH_BALL: 0.1, CROSS: 0.2 };
  else if (['ZOM', 'ZM'].includes(position)) weights = { PASS: 0.5, DRIBBLE: 0.2, SHOOT: 0.1, THROUGH_BALL: 0.2, CROSS: 0 };
  else if (['IV', 'LV', 'RV', 'ZDM'].includes(position)) weights = { PASS: 0.8, DRIBBLE: 0.2, SHOOT: 0, THROUGH_BALL: 0, CROSS: 0 };
  else if (['TW'].includes(position)) return 'PASS';

  // 2. Einfluss der Team-Taktik
  const isHomeTeam = player.teamId === gameState.homeTeam.id;
  const tactics = isHomeTeam ? gameState.homeTeamTactics : gameState.awayTeamTactics;
  
  if (tactics.passStyle === 'riskant') {
    weights.THROUGH_BALL *= 2.0;
    weights.PASS *= 0.5;
  } else if (tactics.passStyle === 'sicher') {
    weights.PASS *= 2.0;
    weights.THROUGH_BALL = 0;
    weights.DRIBBLE *= 0.5;
  }

  // 3. Zonen-Einfluss
  const isAttackingZone = (isHomeTeam && zone === 'AWAY_ATTACK') || (!isHomeTeam && zone === 'HOME_DEFENSE');
  if (isAttackingZone) {
    weights.SHOOT *= 2.0;
    weights.CROSS *= 2.0;
  }
  
  // 4. Normalisierung & Auswahl
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (totalWeight === 0) return 'PASS';
  for (const action in weights) { weights[action] /= totalWeight; }
  
  let cumulativeProbability = 0;
  const randomNumber = Math.random();
  for (const action in weights) {
    cumulativeProbability += weights[action];
    if (randomNumber <= cumulativeProbability) return action;
  }
  return 'PASS';
}

/**
 * Führt einen einzelnen, sauberen Spielzug aus.
 */
function executeTick(gameState) {
  const context = gameState.ball.context || {};
  if (context.type === 'REBOUND') return actions.scrambleForRebound(gameState);
  if (context.type === 'FREE_KICK') {
    const player = getPlayerById(gameState.players, gameState.ball.playerInPossessionId);
    return actions.handleFreeKick(player, gameState);
  }
  
  const playerInPossession = getPlayerById(gameState.players, gameState.ball.playerInPossessionId);
  if (!playerInPossession) {
    console.error(`Minute ${gameState.minute}: Kritischer Fehler! Kein Spieler im Ballbesitz.`);
    const randomTeam = Math.random() < 0.5 ? gameState.homeTeam : gameState.awayTeam;
    const randomPlayer = gameState.players.find(p => p.teamId === randomTeam.id);
    gameState.ball.inPossessionOfTeam = randomTeam.id;
    gameState.ball.playerInPossessionId = randomPlayer.id;
    return gameState;
  }
  
  const oldContext = context;
  gameState.ball.context = {
      type: 'OPEN_PLAY', priorityAction: null, lastAction: oldContext.lastAction,
      lastActionPlayerId: oldContext.lastActionPlayerId, potentialAssistBy: oldContext.potentialAssistBy,
      justBeatenPlayerId: null
  };
  
  const actionToPerform = determineAction(playerInPossession, gameState);
  let newGameState;

  switch (actionToPerform) {
    case 'SHOOT': newGameState = actions.shoot(playerInPossession, gameState); break;
    case 'PASS': newGameState = actions.pass(playerInPossession, gameState); break;
    case 'DRIBBLE': newGameState = actions.dribble(playerInPossession, gameState); break;
    case 'CROSS': newGameState = actions.cross(playerInPossession, gameState); break;
    case 'THROUGH_BALL': newGameState = actions.throughBall(playerInPossession, gameState); break;
    default: 
      const opponent = getOpponent(playerInPossession, gameState);
      newGameState = { 
          ...gameState, 
          log: [...gameState.log, createLogEntry('PASS_FAIL', gameState, { player: playerInPossession, opponent })],
          ball: { ...gameState.ball, inPossessionOfTeam: opponent.teamId, playerInPossessionId: opponent.id, context: {type: 'OPEN_PLAY'} }
      };
      break;
  }
  return newGameState || gameState;
}

/**
 * Die Hauptfunktion, die eine komplette Spielsimulation ausführt.
 */
export function runSimulation(homeTeam, awayTeam, players, homeLineup, awayLineup) {
  let gameState = initializeGameState(homeTeam, awayTeam, players, homeLineup, awayLineup);
  
  const firstHalfStoppage = Math.floor(Math.random() * 3) + 1;
  const secondHalfStoppage = Math.floor(Math.random() * 5) + 1;
  const gameDuration = 90 + firstHalfStoppage + secondHalfStoppage;
  const halfTimeMinute = 45 + firstHalfStoppage;

  while (gameState.minute < gameDuration) {
    gameState.minute++;
    if (gameState.ball.context?.type === 'GAME_END') break;

    if (gameState.minute === halfTimeMinute) {
        gameState.log.push(createLogEntry('HALF_TIME', gameState));
        gameState.half = 2;
        const secondHalfKickoffTeam = gameState.homeLineup.some(p => p.playerId === gameState.ball.playerInPossessionId) ? awayTeam : homeTeam;
        const kickoffPlayer = players.find(p => p.teamId === secondHalfKickoffTeam.id && p.positionGroup === 'ATT') || players.find(p => p.teamId === secondHalfKickoffTeam.id);
        
        gameState.ball = {
            inPossessionOfTeam: secondHalfKickoffTeam.id,
            playerInPossessionId: kickoffPlayer.id,
            zone: 'HOME_MIDFIELD',
            context: { type: 'KICKOFF' }
        };
        gameState.log.push(createLogEntry('KICKOFF', gameState, { player: kickoffPlayer }));
        continue;
    }

    const newState = executeTick(gameState);
    if (!newState || !newState.ball) {
        console.error(`FATALER FEHLER: Tick in Minute ${gameState.minute} hat einen ungültigen Zustand zurückgegeben.`, { lastValidState: gameState });
        break; 
    }
    gameState = newState;
  }

  if (gameState) {
    const finalRatings = {};
    for (const playerId in gameState.playerRatings) {
      const rawRating = gameState.playerRatings[playerId];
      finalRatings[playerId] = parseFloat((rawRating || 6.0).toFixed(2));
    }
    gameState.playerRatings = finalRatings;
    const lastPlayer = getPlayerById(gameState.players, gameState.ball.playerInPossessionId);
    gameState.log.push(createLogEntry('GAME_END', gameState, { player: lastPlayer }));
  }
  
  return gameState;
}

