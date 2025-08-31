import { TEXT_TEMPLATES } from './text-templates.js';

function getRandomTemplate(type) {
  const templates = TEXT_TEMPLATES[type] || TEXT_TEMPLATES['DEFAULT'];
  return templates[Math.floor(Math.random() * templates.length)];
}

export function createLogEntry(type, state, details = {}) {
  const fallbackPlayer = { nachname: 'ein Spieler' };
  const player = details.player && details.player.nachname ? details.player : fallbackPlayer;
  const opponent = details.opponent && details.opponent.nachname ? details.opponent : fallbackPlayer;
  const recipient = details.recipient && details.recipient.nachname ? details.recipient : fallbackPlayer;
  const minute = state.minute;
  let text = '';
  // KORREKTUR: Kein Standard-Emoji, wird im switch zugewiesen
  let emoji = '';
  let color = '#FFFFFF';

  const template = getRandomTemplate(type);
  const baseText = template
    .replace(/{player}/g, player.nachname)
    .replace(/{opponent}/g, opponent.nachname)
    .replace(/{recipient}/g, recipient.nachname);

  if (type !== 'GAME_START' && type !== 'GAME_END') {
      text = `${minute}': ${baseText}`;
  } else {
      text = baseText;
  }
  
  if (type === 'GAME_START') {
    text = `Anpfiff! ${player.nachname} führt den Anstoß für ${player.teamId === state.homeTeam.id ? state.homeTeam.name : state.awayTeam.name} aus.`;
  }
  if (type === 'GAME_END') {
    text = `Schlusspfiff! Das Spiel endet ${state.homeScore} : ${state.awayScore}. Letzter Ballbesitz: ${player.nachname}.`;
  }

  // KORREKTUR: Alle Typen werden jetzt korrekt zugewiesen
  switch (type) {
    case 'GAME_START': emoji = '🟢'; break;
    case 'GAME_END': emoji = '🏁'; break;
    case 'GOAL': case 'SHOOT_EMPTY_NET': emoji = '⚽'; color = '#4CAF50'; break;
    case 'ASSIST': emoji = '👟'; color = '#AED581'; break;
    case 'KICKOFF': emoji = '▶️'; break;
    case 'PASS_SUCCESS': emoji = '➡️'; break;
    case 'PASS_FAIL': emoji = '🛑'; color = '#FFC107'; break;
    case 'DRIBBLE_SUCCESS': emoji = '🏃‍♂️'; break;
    case 'TACKLE_WIN': emoji = '🛡️'; color = '#2196F3'; break;
    case 'SHOOT_SAVE': emoji = '🧤'; break;
    case 'SHOT_OFF_TARGET': emoji = '❌'; color = '#E57373'; break;
    case 'FOUL': emoji = '🟡'; color = '#FFEB3B'; break;
    case 'FREE_KICK_SHOOT': case 'FREE_KICK_PASS': emoji = '🎯'; break;
    case 'REBOUND_SCRAMBLE': case 'REBOUND_WIN': emoji = '💥'; break;
    case 'REBOUND_LOSE': emoji = '🛡️'; color = '#2196F3'; break;
    case 'CROSS_SUCCESS': case 'THROUGH_BALL_SUCCESS': emoji = '✨'; color = '#AED581'; break;
    case 'CROSS_FAIL': case 'THROUGH_BALL_FAIL': emoji = '🛑'; color = '#FFC107'; break;
    case 'YELLOW_CARD': emoji = '🟨'; color = '#FFEB3B'; break;
    case 'SECOND_YELLOW_RED': emoji = '🟨🟥'; color = '#F44336'; break;
    case 'RED_CARD': emoji = '🟥'; color = '#F44336'; break;
    case 'INJURY': emoji = '🚑'; color = '#E57373'; break;
    case 'SUBSTITUTION_INJURY': emoji = '🔁'; break;
    case 'INJURY_NO_SUB': emoji = '❌'; color = '#E57373'; break;
    case 'HALF_TIME': emoji = '⏸️'; break;
    default: emoji = '⚽'; break;
  }

  return { minute, type, text, emoji, color, player, opponent };
}