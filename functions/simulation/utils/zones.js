// functions/simulation/utils/zones.js

const { normalizePosition } = require("./positions");

/**
 * Mapping: Zonen auf Positionsgruppen.
 */
const zoneMap = {
  defense:  ["IV", "LV", "RV", "TW"],
  midfield: ["ZDM", "ZM", "LM", "RM", "ZOM"],
  attack:   ["ST", "MS", "LA", "RA", "HS"],
};

/**
 * Holt alle Spieler einer Zone (defense, midfield, attack)
 */
function getPlayersByZone(players, zone) {
  return players.filter(p => zoneMap[zone]?.includes(normalizePosition(p.position)));
}

/**
 * Liefert "defense" → "midfield" → "attack" (oder umgekehrt)
 */
function getNextRelativeZone(z) {
  if (z === "defense")  return "midfield";
  if (z === "midfield") return "attack";
  return null;
}

function getPreviousRelativeZone(z) {
  if (z === "attack")   return "midfield";
  if (z === "midfield") return "defense";
  return null;
}

/**
 * Zonenbezeichnung für aktuelle Teamseite und Zone
 */
function buildZone(team, rel) {
  return `${team}${rel.charAt(0).toUpperCase() + rel.slice(1)}`;
}

/**
 * Zerlegt einen Zonenstring ("homeMidfield") in { team, rel }
 */
function parseZone(ctx) {
  if (!ctx) return {};
  const team = ctx.startsWith("home") ? "home" : "away";
  const rel  = ctx.endsWith("Defense")  ? "defense"
             : ctx.endsWith("Midfield") ? "midfield"
             : ctx.endsWith("Attack")   ? "attack"
             : null;
  return { team, rel };
}

/**
 * Liefert die gegnerische Spiegelzone zu einer Ballzone
 */
function opponentZone(ctx) {
  const { team, rel } = parseZone(ctx);
  const opp = team === "home" ? "away" : "home";
  if (rel === "defense")  return buildZone(opp, "attack");
  if (rel === "midfield") return buildZone(opp, "midfield");
  if (rel === "attack")   return buildZone(opp, "defense");
  return null;
}

module.exports = {
  getPlayersByZone,
  getNextRelativeZone,
  getPreviousRelativeZone,
  buildZone,
  parseZone,
  opponentZone
};
