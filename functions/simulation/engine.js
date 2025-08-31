// functions/simulation/engine.js
import * as actions from './actions.js';
import { getPlayerById, getOpponent } from './utils.js';
import { createLogEntry } from './logger.js';
import { SIM_TUNING } from './constants.js';

/**
 * Initialisiert den zentralen Spielzustand (GameState) für ein neues Spiel.
 */
function initializeGameState(homeTeam, awayTeam, players, homeLineup, awayLineup) {
  const startingPlayerId =
    homeLineup.find((pos) => pos.position === 'ZM')?.playerId ||
    homeLineup.find((pos) => pos.positionGroup === 'MID')?.playerId ||
    homeLineup[5].playerId;

  const startingPlayer = players.find((p) => p.id === startingPlayerId);

  const playerRatings = {};
  const playerStats = {};

  players.forEach((p) => {
    playerRatings[p.id] = 6.0;
    playerStats[p.id] = {
      shots: 0,
      shotsOnTarget: 0,
      goals: 0,
      assists: 0,

      passes: 0,
      passesCompleted: 0,

      dribbles: 0,
      dribblesSucceeded: 0,

      tackles: 0,
      tacklesSucceeded: 0,

      foulsCommitted: 0,
      saves: 0,

      crosses: 0,
      crossesCompleted: 0,

      throughBalls: 0,
      throughBallsCompleted: 0,

      interceptions: 0,
    };
  });

  return {
    minute: 0,
    half: 1,
    homeScore: 0,
    awayScore: 0,

    homeTeam,
    awayTeam,
    players,
    homeLineup,
    awayLineup,

    playerRatings,
    playerStats,

    // Taktiken in den GameState legen
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
      context: { type: 'OPEN_PLAY' },
    },

    log: [
      createLogEntry('GAME_START', { homeTeam, awayTeam, minute: 0 }, { player: startingPlayer }),
    ],
  };
}

/**
 * KI-Logik: nächste Aktion bestimmen.
 */
function determineAction(player, gameState) {
  const context = gameState.ball.context || {};
  if (context.priorityAction) return context.priorityAction;
  if (context.type === 'FREE_KICK') return 'HANDLE_FREE_KICK';
  if (context.type === 'REBOUND') return 'SCRAMBLE_FOR_REBOUND';

  const lineup = player.teamId === gameState.homeTeam.id ? gameState.homeLineup : gameState.awayLineup;
  const playerPosInfo = lineup.find((p) => p.playerId === player.id);
  const position = playerPosInfo?.position || '';
  const zone = gameState.ball.zone;

  let weights = { PASS: 0.5, DRIBBLE: 0.4, SHOOT: 0.05, THROUGH_BALL: 0.05, CROSS: 0.05 };

  // 1) Grundtendenz je Position
  if (['ST', 'MS', 'HS'].includes(position))
    weights = { PASS: 0.2, DRIBBLE: 0.1, SHOOT: 0.6, THROUGH_BALL: 0.1, CROSS: 0 };
  else if (['LA', 'RA', 'LM', 'RM'].includes(position))
    weights = { PASS: 0.3, DRIBBLE: 0.3, SHOOT: 0.1, THROUGH_BALL: 0.1, CROSS: 0.2 };
  else if (['ZOM', 'ZM'].includes(position))
    weights = { PASS: 0.5, DRIBBLE: 0.2, SHOOT: 0.1, THROUGH_BALL: 0.2, CROSS: 0 };
  else if (['IV', 'LV', 'RV', 'ZDM'].includes(position))
    weights = { PASS: 0.8, DRIBBLE: 0.2, SHOOT: 0, THROUGH_BALL: 0, CROSS: 0 };
  else if (position === 'TW') return 'PASS';

  // 2) Tak­tik­einfluss
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

  // 3) Zonen-Einfluss
  const isAttackingZone =
    (isHomeTeam && zone === 'AWAY_ATTACK') || (!isHomeTeam && zone === 'HOME_DEFENSE');
  if (isAttackingZone) {
    weights.SHOOT *= 2.0;
    weights.CROSS *= 2.0;
  }

  // 4) Neu: Multiplikatoren aus SIM_TUNING anwenden
  const mult = (SIM_TUNING && SIM_TUNING.WEIGHT_MULT) || {};
  weights.PASS *= mult.PASS ?? 1;
  weights.DRIBBLE *= mult.DRIBBLE ?? 1;
  weights.SHOOT *= mult.SHOOT ?? 1;
  weights.CROSS *= mult.CROSS ?? 1;
  weights.THROUGH_BALL *= mult.THROUGH_BALL ?? 1;

  // 5) Normalisieren & auswählen
  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0);
  if (totalWeight <= 0) return 'PASS';

  let r = Math.random() * totalWeight;
  for (const key of Object.keys(weights)) {
    r -= weights[key];
    if (r <= 0) return key;
  }
  return 'PASS';
}

/**
 * Einen einzelnen, sauberen Spielzug ausführen.
 */
function executeTick(gameState) {
  const context = gameState.ball.context || {};

  // Spezialkontexte zuerst behandeln
  if (context.type === 'REBOUND') return actions.scrambleForRebound(gameState);
  if (context.type === 'FREE_KICK') {
    const player = getPlayerById(gameState.players, gameState.ball.playerInPossessionId);
    return actions.handleFreeKick(player, gameState);
  }

  const playerInPossession = getPlayerById(
    gameState.players,
    gameState.ball.playerInPossessionId
  );

  if (!playerInPossession) {
    // Fallback: Ballbesitz neu vergeben (extrem selten)
    const randomTeam = Math.random() < 0.5 ? gameState.homeTeam : gameState.awayTeam;
    const randomPlayer = gameState.players.find((p) => p.teamId === randomTeam.id);
    gameState.ball.inPossessionOfTeam = randomTeam.id;
    gameState.ball.playerInPossessionId = randomPlayer.id;
    return gameState;
  }

  // Kontext zurück auf Open Play
  const oldContext = context;
  gameState.ball.context = {
    type: 'OPEN_PLAY',
    priorityAction: null,
    lastAction: oldContext.lastAction,
    lastActionPlayerId: oldContext.lastActionPlayerId,
    potentialAssistBy: oldContext.potentialAssistBy,
    justBeatenPlayerId: null,
  };

  const actionToPerform = determineAction(playerInPossession, gameState);

  switch (actionToPerform) {
    case 'SHOOT':
      return actions.shoot(playerInPossession, gameState);
    case 'PASS':
      return actions.pass(playerInPossession, gameState);
    case 'DRIBBLE':
      return actions.dribble(playerInPossession, gameState);
    case 'CROSS':
      return actions.cross(playerInPossession, gameState);
    case 'THROUGH_BALL':
      return actions.throughBall(playerInPossession, gameState);
    default: {
      // Fallback: Ballverlust
      const opponent = getOpponent(playerInPossession, gameState);
      return {
        ...gameState,
        log: [
          ...gameState.log,
          createLogEntry('PASS_FAIL', gameState, { player: playerInPossession, opponent }),
        ],
        ball: {
          ...gameState.ball,
          inPossessionOfTeam: opponent.teamId,
          playerInPossessionId: opponent.id,
          context: { type: 'OPEN_PLAY' },
        },
      };
    }
  }
}

/**
 * Vollständige Spielsimulation.
 */
export function runSimulation(homeTeam, awayTeam, players, homeLineup, awayLineup) {
  let gameState = initializeGameState(homeTeam, awayTeam, players, homeLineup, awayLineup);

  // Nachspielzeiten
  const firstHalfStoppage = Math.floor(Math.random() * 3) + 1;
  const secondHalfStoppage = Math.floor(Math.random() * 5) + 1;
  const gameDuration = 90 + firstHalfStoppage + secondHalfStoppage;
  const halfTimeMinute = 45 + firstHalfStoppage;

  while (gameState.minute < gameDuration) {
    gameState.minute += 1;
    if (gameState.ball.context?.type === 'GAME_END') break;

    // Halbzeit
    if (gameState.minute === halfTimeMinute) {
      gameState.log.push(createLogEntry('HALF_TIME', gameState));
      gameState.half = 2;

      const secondHalfKickoffTeam = gameState.homeLineup.some(
        (p) => p.playerId === gameState.ball.playerInPossessionId
      )
        ? awayTeam
        : homeTeam;

      const kickoffPlayer =
        gameState.players.find(
          (p) => p.teamId === secondHalfKickoffTeam.id && p.positionGroup === 'ATT'
        ) || gameState.players.find((p) => p.teamId === secondHalfKickoffTeam.id);

      gameState.ball = {
        inPossessionOfTeam: secondHalfKickoffTeam.id,
        playerInPossessionId: kickoffPlayer.id,
        zone: 'HOME_MIDFIELD',
        context: { type: 'KICKOFF' },
      };
      gameState.log.push(createLogEntry('KICKOFF', gameState, { player: kickoffPlayer }));
      continue;
    }

    // NEU: mehrere Mikro-Ticks pro Minute (APM)
    const apm = Math.max(1, Math.round(SIM_TUNING?.ACTIONS_PER_MINUTE || 1));
    // kleines „Jitter“, damit es natürlicher schwankt
    const jitter = (Math.random() < 0.35 ? 1 : 0) - (Math.random() < 0.2 ? 1 : 0);
    const microTicks = Math.max(1, apm + jitter);

    for (let j = 0; j < microTicks; j++) {
      const newState = executeTick(gameState);
      if (!newState || !newState.ball) {
        // harter Abbruch bei invalidem Zustand
        break;
      }
      gameState = newState;
      if (gameState.ball.context?.type === 'GAME_END') break;
    }
  }

  // Abschluss
  const finalRatings = {};
  for (const playerId of Object.keys(gameState.playerRatings)) {
    finalRatings[playerId] = parseFloat((gameState.playerRatings[playerId] || 6.0).toFixed(2));
  }
  gameState.playerRatings = finalRatings;

  const lastPlayer = getPlayerById(gameState.players, gameState.ball.playerInPossessionId);
  gameState.log.push(createLogEntry('GAME_END', gameState, { player: lastPlayer }));

  return gameState;
}
