// functions/simulation/utils.js
import { POSITIONAL_BONUSES } from './constants.js';

export const getPlayerById = (players, id) => players.find(p => p.id === id);
export const sanitizePos = (position) => (position || '').replace(/[0-9]/g, '');

export const getPositionalBonus = (action, position) => {
  const posKey = sanitizePos(position);
  return POSITIONAL_BONUSES[action]?.[posKey] || 0;
};

// Erfolgschance mit reduzierter Skill-Differenz
export const calculateSuccess = (skillA, skillB, baseChance = 0.5) => {
  const diff = (skillA - skillB) / 200; // halbierter Einfluss
  const chance = Math.max(0.05, Math.min(0.95, baseChance + diff));
  return Math.random() < chance;
};

export function applyRatingDelta(ratings, playerId, delta) {
  if (!ratings || playerId == null || typeof delta !== 'number') return;
  const current = ratings[playerId] ?? 6.0;
  const next = Math.max(1.0, Math.min(10.0, current + delta));
  ratings[playerId] = next;
}

export function positionKeyToGroup(posKey) {
  if (!posKey) return '';
  if (['TW'].includes(posKey)) return 'TOR';
  if (['IV','LV','RV'].includes(posKey)) return 'DEF';
  if (['ZM','ZOM','ZDM','LM','RM'].includes(posKey)) return 'MID';
  if (['ST','HS','MS','LA','RA'].includes(posKey)) return 'ATT';
  return '';
}

// --- Verfügbarkeit während des Spiels ---
function isInactive(state, id) {
  return (state?.sentOff?.[id]) || (state?.injuredOff?.[id]) || (state?.subbedOut?.[id]);
}

export function getOpponent(player, state) {
  const opponentTeamId = player.teamId === state.homeTeam.id ? state.awayTeam.id : state.homeTeam.id;
  const justBeaten = state.ball?.context?.justBeatenPlayerId;
  let pool = state.players.filter(
    p => p.teamId === opponentTeamId && sanitizePos(p.position) !== 'TW' && !isInactive(state, p.id)
  );
  if (justBeaten && pool.some(p => p.id === justBeaten)) {
    return pool.find(p => p.id === justBeaten);
  }
  if (pool.length === 0) {
    pool = state.players.filter(p => p.teamId === opponentTeamId && !isInactive(state, p.id));
  }
  return pool[Math.floor(Math.random() * pool.length)] || state.players.find(p => p.teamId === opponentTeamId);
}

export function getTeamPlayer(teamId, players, selfId, state) {
  const pool = players.filter(p => p.teamId === teamId && p.id !== selfId && !isInactive(state, p.id));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function findBestPassRecipient(player, state) {
  const teammates = state.players.filter(p =>
    p.teamId === player.teamId &&
    p.id !== player.id &&
    sanitizePos(p.position) !== 'TW' &&
    !isInactive(state, p.id)
  );
  if (teammates.length === 0) return null;
  // Bevorzuge ATT/MID & hohe Stärke
  teammates.sort((a,b) => {
    const ga = positionKeyToGroup(sanitizePos(a.position));
    const gb = positionKeyToGroup(sanitizePos(b.position));
    const wa = (ga === 'ATT' ? 3 : ga === 'MID' ? 2 : 1);
    const wb = (gb === 'ATT' ? 3 : gb === 'MID' ? 2 : 1);
    return (b.strength*wb) - (a.strength*wa);
  });
  return teammates[0];
}
