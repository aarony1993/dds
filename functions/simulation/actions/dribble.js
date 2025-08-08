// functions/simulation/actions/dribble.js

const { DELTAS } = require("../constants");
const { formatName, describe } = require("../utils/formatters");
const { getMod, isDefensive } = require("../utils/positions");
const { buildZone, getNextRelativeZone } = require("../utils/zones");
const { choosePlayer, weightedRandomChance } = require("../utils/random");
const { applyDelta } = require("../rating");

/**
 * Simuliert ein Dribbling und gibt das Ergebnisobjekt zurück.
 */
function simulateDribble({
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
  const success = weightedRandomChance(
    0.55,
    attacker.strength,
    defender.strength,
    getMod(attacker, "dribble"),
    getMod(defender, "tackle"),
    0.10
  ) > 0.5;

  if (success) {
    if (curRel === "attack") {
      // Dribbling im Angriff → Schuss
      const text = describe("shoot", {
        minute: Math.round(currentMin),
        attacker: formatName(attacker)
      });
      applyDelta(playerRatings, attacker.id, DELTAS.dribble_win, tickDeltas);
      return {
        actionOverride: "shoot",
        nextPlayer: attacker,
        nextZone: buildZone(ballTeam, "attack"),
        text,
        switchPossession: false
      };
    } else if (["LM", "RM"].includes(attacker.position)) {
      // Flügel: Kopfballspiel
      const hdr = choosePlayer(poss.filter(p => ["ST", "MS", "LA", "RA", "HS"].includes(p.position))) || attacker;
      const text = describe("header", {
        minute: Math.round(currentMin),
        attacker: formatName(attacker),
        target: formatName(hdr)
      });
      applyDelta(playerRatings, attacker.id, DELTAS.dribble_win, tickDeltas);
      return {
        actionOverride: "header",
        nextPlayer: hdr,
        nextZone: buildZone(ballTeam, "attack"),
        text,
        switchPossession: false
      };
    } else {
      // Normales erfolgreiches Dribbling
      const nr = getNextRelativeZone(curRel) || curRel;
      const text = describe("dribble", {
        minute: Math.round(currentMin),
        attacker: formatName(attacker)
      });
      applyDelta(playerRatings, attacker.id, DELTAS.dribble_win, tickDeltas);
      return {
        nextPlayer: attacker,
        nextZone: buildZone(ballTeam, isDefensive(attacker) ? "midfield" : nr),
        text,
        switchPossession: false
      };
    }
  } else {
    // Dribbling verloren
    const text = describe("dribble_lost", {
      minute: Math.round(currentMin),
      attacker: formatName(attacker),
      defender: formatName(defender)
    });
    applyDelta(playerRatings, attacker.id, DELTAS.dribble_loss, tickDeltas);
    applyDelta(playerRatings, defender.id, DELTAS.duel_win, tickDeltas);
    return {
      nextPlayer: defender,
      nextZone: buildZone(oppTeam, "defense"),
      text,
      switchPossession: true
    };
  }
}

module.exports = { simulateDribble };
