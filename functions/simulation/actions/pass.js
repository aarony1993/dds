// functions/simulation/actions/pass.js

const { DELTAS } = require("../constants");
const { formatName, describe } = require("../utils/formatters");
const { getMod } = require("../utils/positions");
const { buildZone, getNextRelativeZone, getPreviousRelativeZone, getPlayersByZone } = require("../utils/zones");
const { choosePlayer, weightedRandomChance } = require("../utils/random");
const { applyDelta } = require("../rating");

/**
 * Simuliert eine Pass-Aktion und gibt das Ergebnis zurück.
 */
function simulatePass({
  attacker,
  poss,
  mates,
  defender,
  curRel,
  state,
  currentMin,
  ballTeam,
  oppTeam,
  playerRatings,
  tickDeltas
}) {
  const nRel  = getNextRelativeZone(curRel);
  const pRel  = getPreviousRelativeZone(curRel);
  let tgt = null, tgtRel = curRel;

  if (nRel) {
    const arr = getPlayersByZone(mates, nRel);
    if (arr.length) { tgt = choosePlayer(arr); tgtRel = nRel; }
  }
  if (!tgt) {
    const arr = getPlayersByZone(mates, curRel);
    if (arr.length) tgt = choosePlayer(arr);
  }
  if (!tgt && pRel) {
    const arr = getPlayersByZone(mates, pRel);
    if (arr.length) { tgt = choosePlayer(arr); tgtRel = pRel; }
  }
  if (!tgt) tgt = choosePlayer(mates) || attacker;

  let base = 0.78, dmod = getMod(defender, "tackle");
  if (tgtRel === nRel) { base = 0.82; dmod *= 0.9; }

  const success = weightedRandomChance(
    base,
    attacker.strength,
    defender.strength,
    getMod(attacker, "pass"),
    dmod,
    0.09
  ) > 0.5;

  if (success) {
    const text = describe("pass", {
      minute: Math.round(currentMin),
      attacker: formatName(attacker),
      target: formatName(tgt)
    });
    applyDelta(playerRatings, attacker.id, DELTAS.pass_success, tickDeltas);
    if (tgtRel === nRel) applyDelta(playerRatings, attacker.id, DELTAS.progressive_pass_bonus, tickDeltas);
    return {
      nextPlayer: tgt,
      nextZone: buildZone(ballTeam, tgtRel),
      text,
      switchPossession: false
    };
  } else {
    const text = describe("pass_intercept", {
      minute: Math.round(currentMin),
      attacker: formatName(attacker),
      defender: formatName(defender)
    });
    applyDelta(playerRatings, attacker.id, DELTAS.pass_fail, tickDeltas);
    applyDelta(playerRatings, defender.id, DELTAS.pass_success, tickDeltas);
    return {
      nextPlayer: defender,
      nextZone: buildZone(oppTeam, "defense"),
      text,
      switchPossession: true
    };
  }
}

module.exports = { simulatePass };
