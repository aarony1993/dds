// functions/simulation/actions/duel.js

const { DELTAS } = require("../constants");
const { formatName, describe } = require("../utils/formatters");
const { getMod, isDefensive } = require("../utils/positions");
const { buildZone } = require("../utils/zones");
const { applyDelta } = require("../rating");
const { choosePlayer, weightedRandomChance } = require("../utils/random");

/**
 * Simuliert einen Zweikampf (Duel) und gibt das Ergebnisobjekt zurück.
 */
function simulateDuel({
  attacker,
  defender,
  poss,
  opp,
  curRel,
  state,
  currentMin,
  ballTeam,
  oppTeam,
  playerRatings,
  tickDeltas,
  homeTeam,
  awayTeam
}) {
  const defList2 = opp.filter(
    p =>
      ["IV", "LV", "RV", "ZDM", "ZM", "LM", "RM", "ZOM", "HS", "ST", "MS", "LA", "RA"].includes(p.position) &&
      p.position !== "TW"
  );
  const usedDefender = choosePlayer(defList2) || defender;

  const succ =
    weightedRandomChance(
      0.61,
      attacker.strength,
      usedDefender.strength,
      getMod(attacker, "tackle"),
      getMod(usedDefender, "tackle"),
      0.11
    ) > 0.5;

  if (succ) {
    const text = describe("duel_win", {
      minute: Math.round(currentMin),
      attacker: formatName(attacker),
      defender: formatName(usedDefender)
    });
    applyDelta(playerRatings, attacker.id, DELTAS.duel_win, tickDeltas);
    applyDelta(playerRatings, usedDefender.id, DELTAS.duel_loss, tickDeltas);

    let nextZone = state.ballZone;
    if (curRel === "defense") nextZone = buildZone(ballTeam, "midfield");
    else if (curRel === "midfield") nextZone = buildZone(ballTeam, isDefensive(attacker) ? "midfield" : "attack");

    return {
      nextPlayer: attacker,
      nextZone,
      text,
      switchPossession: false,
      justWonDuel: true
    };
  } else {
    // Foul-Chance
    if (Math.random() < 0.09) {
      const text = describe("foul", {
        minute: Math.round(currentMin),
        attacker: formatName(attacker),
        team: (ballTeam === "home" ? homeTeam.name : awayTeam.name)
      });
      applyDelta(playerRatings, attacker.id, DELTAS.foul_drawn, tickDeltas);
      applyDelta(playerRatings, usedDefender.id, DELTAS.foul_committed, tickDeltas);
      return {
        nextPlayer: attacker,
        nextZone: state.ballZone,
        text,
        switchPossession: false,
        foul: true
      };
    } else {
      const text = describe("duel_loss", {
        minute: Math.round(currentMin),
        attacker: formatName(attacker),
        defender: formatName(usedDefender)
      });
      applyDelta(playerRatings, attacker.id, DELTAS.duel_loss, tickDeltas);
      applyDelta(playerRatings, usedDefender.id, DELTAS.duel_win, tickDeltas);
      return {
        nextPlayer: usedDefender,
        nextZone: buildZone(oppTeam, "defense"),
        text,
        switchPossession: true
      };
    }
  }
}

module.exports = { simulateDuel };
