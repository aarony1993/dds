// functions/simulation/rating/index.js

const { RATING_BASE, RATING_MIN, RATING_MAX, RATING_DECAY_FACTOR } = require("../constants");

/**
 * Initialisiert Ratings für Spieler (Map playerId → Rating)
 */
function initRatings(players, existingMap) {
  const map = existingMap ? { ...existingMap } : {};
  players.forEach(p => {
    if (!map[p.id]) map[p.id] = RATING_BASE;
  });
  return map;
}

/**
 * Setzt Rating eines Spielers
 */
function applyDelta(ratings, playerId, delta, deltasAcc) {
  if (!playerId) return;
  if (ratings[playerId] === undefined) ratings[playerId] = RATING_BASE;
  ratings[playerId] = clamp(ratings[playerId] + delta, RATING_MIN, RATING_MAX);
  if (delta !== 0) deltasAcc[playerId] = (deltasAcc[playerId] || 0) + delta;
}

/**
 * Regresst Ratings leicht Richtung Mittelwert
 */
function decayRatings(ratings) {
  if (RATING_DECAY_FACTOR <= 0) return;
  const center = RATING_BASE;
  Object.keys(ratings).forEach(id => {
    const diff = ratings[id] - center;
    ratings[id] -= diff * RATING_DECAY_FACTOR;
  });
}

// Helper
function clamp(val, min, max) {
  return val < min ? min : val > max ? max : val;
}

module.exports = {
  initRatings,
  applyDelta,
  decayRatings
};
