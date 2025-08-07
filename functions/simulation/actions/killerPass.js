// functions/simulation/actions/killerPass.js

const { DELTAS } = require("../constants");
const { formatName, describe } = require("../utils/formatters");
const { getMod, isDefensive } = require("../utils/positions");
const { buildZone } = require("../utils/zones");
const { choosePlayer, weightedRandomChance } = require("../utils/random");
const { applyDelta } = require("../rating");

/**
 * Simuliert einen Killerpass und gibt das Ergebnisobjekt zurück.
 */
function doKillerPass({
  attacker,
  poss,
  opp,
  defender,
  curRel,
  state,
  currentMin,
  ballTeam,
  oppTeam,
  playerRatings,
  tickDeltas
}) {
  const tgtList = poss.filter(p => ["ST", "MS", "LA", "RA", "HS"].includes(p.position));
  const tgt     = tgtList.length ? choosePlayer(tgtList) : attacker;
  const success = weightedRandomChance(
    0.19,
    attacker.strength,
    defender.strength,
    getMod(attacker, "pass"),
    getMod(defender, "tackle"),
    0.18
  ) > 0.57;

  if (success) {
    const text = describe("killerPass", {
      minute: Math.round(currentMin),
      attacker: formatName(attacker),
      target: formatName(tgt)
    });
    applyDelta(playerRatings, attacker.id, DELTAS.killer_pass_success, tickDeltas);
    return {
      nextPlayer: tgt,
      nextZone: buildZone(ballTeam, isDefensive(attacker) ? "midfield" : "attack"),
      text,
      switchPossession: false
    };
  } else {
    const text = describe("killerPass_fail", {
      minute: Math.round(currentMin),
      attacker: formatName(attacker),
      defender: formatName(defender)
    });
    applyDelta(playerRatings, attacker.id, DELTAS.killer_pass_fail, tickDeltas);
    applyDelta(playerRatings, defender.id, DELTAS.pass_success, tickDeltas);
    return {
      nextPlayer: defender,
      nextZone: buildZone(oppTeam, "defense"),
      text,
      switchPossession: true
    };
  }
}

module.exports = { doKillerPass };
