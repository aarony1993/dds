// src/simulation/chooser.js

/**
 * Wählt basierend auf der Spielfeldzone die nächste Aktionsart.
 * 
 * @param {string} rel - relative Spielfeldzone ("defense", "midfield", "attack")
 * @returns {string} Aktionsname (z.B. "pass", "dribble", "killerPass", "duel", "shoot")
 */
export function chooseAction(rel) {
  const r = Math.random();
  if (rel === "midfield") {
    if (r < 0.48) return "pass";
    if (r < 0.72) return "dribble";
    if (r < 0.78) return "killerPass";
    return "duel";
  }
  if (rel === "attack") {
    if (r < 0.39) return "pass";
    if (r < 0.50) return "dribble";
    if (r < 0.66) return "shoot";
    return "duel";
  }
  // "defense" oder unbekannt
  return r < 0.82 ? "pass" : "duel";
}
