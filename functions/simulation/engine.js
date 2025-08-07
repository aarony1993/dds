// functions/simulation/engine.js

const { assignDetail } = require("./utils/positions");
const { chooseAction } = require("./chooser");
const { getNextRelativeZone, getPreviousRelativeZone, buildZone, parseZone, getPlayersByZone, opponentZone } = require("./utils/zones");
const { initRatings, applyDelta, decayRatings } = require("./rating");
const { appendRatingEvents } = require("./rating/eventsBuffer");
const { formatName, safePlayerRef, describe } = require("./utils/formatters");
const passActions      = require("./actions/pass");
const dribbleActions   = require("./actions/dribble");
const killerPassActions= require("./actions/killerPass");
const duelActions      = require("./actions/duel");
const shootActions     = require("./actions/shoot");
const headerActions    = require("./actions/header");
const freekickActions  = require("./actions/freekick");

/**
 * Initialisiert den ersten Spielstatus (Kickoff).
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
    events:         [...state.events, evt],
    playerWithBall: kick,
    ballZone:       zone,
    possession:     isHome ? "home" : "away",
    justWonDuel:    false,
    attackTicks:    0,
  };
}

/**
 * Hauptsimulationsschritt – ruft die Logikmodule auf.
 */
function getNextGameState(
  state,
  homeTeam,
  awayTeam,
  rawHome,
  rawAway,
  lineupHome = null,
  lineupAway = null
) {
  // Nur aufgestellte Spieler verwenden
  const home = assignDetail(rawHome, lineupHome);
  const away = assignDetail(rawAway, lineupAway);

  // Ratings initialisieren (nur aufgestellte)
  const playerRatings = initRatings([...home, ...away], state?.playerRatings);

  // Erster Aufruf → Kickoff
  if (!state || !state.playerWithBall) {
    return getKickoffState(
      home, away, homeTeam, awayTeam,
      {
        minute:           0,
        possession:       null,
        playerWithBall:   null,
        ballZone:         null,
        events:           [],
        score:            { home:0, away:0 },
        justWonDuel:      false,
        attackTicks:      0,
        playerRatings,
        ratingEventsBuffer: [],
      }
    );
  }

  // --- Ablauf eines normalen Simulations-Ticks ---
  const isHome      = state.possession === "home";
  const ballTeam    = isHome ? "home" : "away";
  const oppTeam     = isHome ? "away" : "home";
  const poss        = isHome ? home : away;
  const opp         = isHome ? away : home;
  const { rel:curRel } = parseZone(state.ballZone);
  const currentMin  = (state.minute || 0) + 90 / 120;

  let nextPoss     = state.possession;
  let nextPlayer   = state.playerWithBall;
  let nextZone     = state.ballZone;
  let nextScore    = { ...state.score };
  let action       = chooseAction(curRel);
  let text         = "";

  const tickDeltas = {};

  // Angreifer wählen
  let poolAtt = poss.filter(p => p.id !== state.playerWithBall.id);
  if (!poolAtt.length) poolAtt = poss;
  let attacker = poolAtt.find(p => p.id === state.playerWithBall.id) || poolAtt[0];

  // Verteidiger wählen
  const defZone = parseZone(opponentZone(state.ballZone)).rel;
  let defList = getPlayersByZone(opp.filter(p => p.position !== "TW"), defZone);
  if (!defList.length) defList = opp.filter(p => p.position !== "TW");
  let defender = defList.length ? defList[Math.floor(Math.random() * defList.length)] : attacker;

  // justWonDuel → Pass erzwingen
  if (state.justWonDuel && action === "duel") {
    action     = "pass";
    nextPlayer = attacker;
    nextZone   = buildZone(ballTeam,"midfield");
  }
  state.justWonDuel = false;

  // Aktionen dispatchen:
  switch (action) {
    case "pass":
      ({ nextPoss, nextPlayer, nextZone, text } = passActions.simulatePass({
        poss, attacker, defender, curRel, ballTeam, oppTeam, state, currentMin, tickDeltas, playerRatings
      }));
      break;
    case "dribble":
      ({ nextPoss, nextPlayer, nextZone, text } = dribbleActions.simulateDribble({
        poss, attacker, defender, curRel, ballTeam, oppTeam, state, currentMin, tickDeltas, playerRatings
      }));
      break;
    case "killerPass":
      ({ nextPoss, nextPlayer, nextZone, text } = killerPassActions.simulateKillerPass({
        poss, attacker, defender, curRel, ballTeam, oppTeam, state, currentMin, tickDeltas, playerRatings
      }));
      break;
    case "duel":
      ({ nextPoss, nextPlayer, nextZone, text } = duelActions.simulateDuel({
        poss, attacker, defender, curRel, ballTeam, oppTeam, state, currentMin, tickDeltas, playerRatings
      }));
      break;
    case "shoot":
      ({ nextPoss, nextPlayer, nextZone, text } = shootActions.simulateShoot({
        poss, attacker, defender, curRel, ballTeam, oppTeam, state, currentMin, tickDeltas, playerRatings
      }));
      break;
    case "header":
      ({ nextPoss, nextPlayer, nextZone, text } = headerActions.simulateHeader({
        poss, attacker, defender, curRel, ballTeam, oppTeam, state, currentMin, tickDeltas, playerRatings
      }));
      break;
    case "freekick":
      ({ nextPoss, nextPlayer, nextZone, text } = freekickActions.simulateFreekick({
        poss, attacker, defender, curRel, ballTeam, oppTeam, state, currentMin, tickDeltas, playerRatings
      }));
      break;
    default:
      text     = `${Math.round(currentMin)}' – Ball läuft in den eigenen Reihen.`;
      nextZone = state.ballZone;
      break;
  }

  // Rating-Decay
  decayRatings(playerRatings);

  // Rating-events puffern
  const ratingEventsBuffer = appendRatingEvents(
    state.ratingEventsBuffer,
    tickDeltas,
    Math.round(currentMin),
    action
  );

  // Aktuelles Event
  const evt = {
    minute:         Math.round(currentMin),
    text,
    type:           action,
    possession:     nextPoss,
    playerWithBall: safePlayerRef(nextPlayer)
  };

  // Neuer State
  return {
    minute:           currentMin,
    possession:       nextPoss,
    playerWithBall:   nextPlayer,
    ballZone:         nextZone,
    events:           [...state.events, evt],
    score:            nextScore,
    justWonDuel:      state.justWonDuel,
    attackTicks:      (nextPoss===state.possession && nextZone.endsWith("Attack"))
                        ? (state.attackTicks||0) + 1
                        : 0,
    playerRatings,
    ratingEventsBuffer
  };
}

module.exports = { getNextGameState };
