// functions/simulation/rating/eventsBuffer.js

const { LOG_RATING_EVENTS, ONE_EVENT_PER_TICK } = require("../constants");

/**
 * Fügt Änderungen (Deltas) in den Event-Buffer ein
 */
function appendRatingEvents(buffer, tickDeltas, minute, actionTag) {
  if (!LOG_RATING_EVENTS) return buffer || [];
  const keys = Object.keys(tickDeltas);
  if (!keys.length) return buffer || [];
  if (!buffer) buffer = [];
  if (ONE_EVENT_PER_TICK) {
    buffer.push({ minute, actionTag, deltas: tickDeltas, timestamp: Date.now() });
  } else {
    keys.forEach(pid => {
      buffer.push({ minute, actionTag, playerId: pid, delta: tickDeltas[pid], timestamp: Date.now() });
    });
  }
  return buffer;
}

module.exports = { appendRatingEvents };
