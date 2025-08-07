// functions/simulation/kickoff.js

const { getPlayersByZone, buildZone } = require("./utils/zones");
const { formatName, safePlayerRef, describe } = require("./utils/formatters");

/**
 * Erstellt den initialen Spielzustand zum Anstoß.
 * @param {*} home       - Array der Heimspieler (aufgestellt)
 * @param {*} away       - Array der Auswärtsspieler (aufgestellt)
 * @param {*} homeTeam   - Teamobjekt Heim
 * @param {*} awayTeam   - Teamobjekt Auswärts
 * @param {*} state      - Vorheriger Zustand (typisch: mit minute, events, ... oder leeres Startobjekt)
 * @returns Neuer Spielzustand (Objekt)
 */
function getKickoffState(home, away, homeTeam, awayTeam, state) {
  const isHome  = Math.random() < 0.5;
  const teamPl  = isHome ? home : away;
  const teamInf = isHome ? homeTeam : awayTeam;
  const mids    = getPlayersByZone(teamPl, "midfield");
  const kick    = mids.length ? mids[Math.floor(Math.random() * mids.length)] : teamPl[0];
  const zone    = buildZone(isHome ? "home" : "away", "midfield");
  const text    = describe("kickoff", {
    minute: state.minute,
    team: teamInf.name,
    attacker: formatName(kick),
  });

  const evt = {
    minute: state.minute,
    text,
    type: "kickoff",
    possession: state.possession,
    playerWithBall: safePlayerRef(kick),
  };

  return {
    ...state,
    events:         [...(state.events || []), evt],
    playerWithBall: kick,
    ballZone:       zone,
    possession:     isHome ? "home" : "away",
    justWonDuel:    false,
    attackTicks:    0,
  };
}

module.exports = { getKickoffState };
ja