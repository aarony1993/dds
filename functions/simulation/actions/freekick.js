// functions/simulation/actions/freekick.js

const { DELTAS } = require("../constants");
const { formatName, describe } = require("../utils/formatters");
const { getMod } = require("../utils/positions");
const { getPlayersByZone, buildZone } = require("../utils/zones");
const { applyDelta } = require("../rating");
const { choosePlayer, weightedRandomChance } = require("../utils/random");

/**
 * Simuliert einen Freistoß und gibt das Ergebnisobjekt zurück.
 */
function doFreekick({
  attacker,
  opp,
  ballTeam,
  oppTeam,
  playerRatings,
  tickDeltas,
  state,
  currentMin
}) {
  // Torwart bestimmen
  const keepers = getPlayersByZone(opp, "defense").filter(p => p.position === "TW");
  const kpr = choosePlayer(keepers) || choosePlayer(opp);

  const success = weightedRandomChance(
    0.19,
    attacker.strength,
    kpr.strength,
    getMod(attacker, "shot"),
    getMod(kpr, "tackle"),
    0.12
  ) > 0.69;

  if (success) {
    const goalText = describe("goal", {
      minute: Math.round(currentMin),
      attacker: formatName(attacker),
      goalkeeper: formatName(kpr)
    });
    applyDelta(playerRatings, attacker.id, DELTAS.freekick_goal, tickDeltas);
    if (kpr && kpr.position === "TW") {
      applyDelta(playerRatings, kpr.id, DELTAS.concede_goal_keeper, tickDeltas);
    }
    return {
      goal: true,
      nextPlayer: attacker,
      nextZone: null,
      text: goalText,
      scorer: attacker,
      against: kpr
    };
  } else {
    const text = describe("freekick_saved", {
      minute: Math.round(currentMin),
      attacker: formatName(attacker),
      goalkeeper: formatName(kpr)
    });
    applyDelta(playerRatings, attacker.id, DELTAS.shot_on_target, tickDeltas);
    if (kpr && kpr.position === "TW") {
      applyDelta(playerRatings, kpr.id, DELTAS.save, tickDeltas);
    }
    return {
      nextPlayer: kpr,
      nextZone: buildZone(oppTeam, "defense"),
      text,
      switchPossession: true
    };
  }
}

module.exports = { doFreekick };
