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
    possession: isHome ? "home" : "away",
    playerWithBall: safePlayerRef(kick) // nur die ID für den Event-Log
  };

  return {
    ...state,
    events:         [...state.events, evt],
    playerWithBall: kick,  // IMMER das Spielerobjekt!
    ballZone:       zone,
    possession:     isHome ? "home" : "away",
    justWonDuel:    false,
    attackTicks:    0,
    pendingAction:  null
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

  // Ratings initialisieren (nur aufgestellte Spieler)
  const playerRatings = initRatings([...home, ...away], state?.playerRatings);

  // Beim allerersten Tick: Kickoff-Event erzeugen
  if (!state || !state.events || state.events.length === 0) {
    return getKickoffState(
      home, away, homeTeam, awayTeam,
      {
        minute:           0,
        possession:       null,
        playerWithBall:   null,
        ballZone:         null,
        events:           [],
        score:            { home: 0, away: 0 },
        justWonDuel:      false,
        attackTicks:      0,
        playerRatings,
        ratingEventsBuffer: [],
        pendingAction:    null
      }
    );
  }

  // --- Ablauf eines normalen Simulations-Ticks ---
  const isHome    = state.possession === "home";
  const ballTeam  = isHome ? "home" : "away";
  const oppTeam   = isHome ? "away" : "home";
  const poss      = isHome ? home : away;
  const opp       = isHome ? away : home;
  const { rel: curRel } = parseZone(state.ballZone);
  const currentMin = (state.minute || 0) + 90 / 120;

  let nextPoss   = state.possession;
  let nextPlayer = state.playerWithBall;
  let nextZone   = state.ballZone;
  let nextScore  = { ...state.score };
  let text       = "";

  const tickDeltas = {};

  // Spielerobjekt aus playerWithBall-ID holen (falls aktuell nur ID gespeichert)
  if (typeof nextPlayer === "string") {
    nextPlayer = poss.find(p => p.id === nextPlayer) || poss[0];
  }

  // Angreifer bestimmen (möglichst den aktuellen Ballführer)
  let attacker = poss.find(p => p.id === nextPlayer.id) || poss[0];

  // Verteidiger bestimmen (aus gegnerischer Spiegelzone wählen, sonst Zufall)
  const defZone = parseZone(opponentZone(state.ballZone)).rel;
  let defList = getPlayersByZone(opp.filter(p => p.position !== "TW"), defZone);
  if (!defList.length) defList = opp.filter(p => p.position !== "TW");
  let defender = defList.length ? defList[Math.floor(Math.random() * defList.length)] : attacker;

  // Nächste Aktion festlegen (inkl. erzwungener Aktionen)
  let action;
  if (state.pendingAction) {
    // Vorher gesetzte Aktion (z.B. nach Foul oder Dribbling) ausführen
    action = state.pendingAction;
  } else {
    action = chooseAction(curRel);
    if (state.justWonDuel && action === "duel") {
      // Nach gewonnenem Zweikampf keinen erneuten Zweikampf, sondern Pass
      action     = "pass";
      nextPlayer = attacker;
      nextZone   = buildZone(ballTeam, "midfield");
    }
  }
  // Status-Flags zurücksetzen
  state.justWonDuel = false;
  state.pendingAction = null;

  // Aktion ausführen
  let result;
  switch (action) {
    case "pass":
      result = passActions.simulatePass({
        poss, attacker, defender, curRel, ballTeam, oppTeam, state, currentMin, tickDeltas, playerRatings
      });
      break;
    case "dribble":
      result = dribbleActions.simulateDribble({
        poss, attacker, defender, opp, curRel, ballTeam, oppTeam, state, currentMin, tickDeltas, playerRatings
      });
      break;
    case "killerPass":
      result = killerPassActions.simulateKillerPass({
        poss, attacker, defender, opp, curRel, ballTeam, oppTeam, state, currentMin, tickDeltas, playerRatings
      });
      break;
    case "duel":
      result = duelActions.simulateDuel({
        poss, attacker, defender, opp, curRel, ballTeam, oppTeam, state, currentMin, tickDeltas, playerRatings,
        homeTeam, awayTeam
      });
      break;
    case "shoot":
      result = shootActions.simulateShoot({
        poss, attacker, defender, opp, curRel, ballTeam, oppTeam, state, currentMin, tickDeltas, playerRatings
      });
      break;
    case "header":
      result = headerActions.simulateHeader({
        poss, attacker, defender, opp, curRel, ballTeam, oppTeam, state, currentMin, tickDeltas, playerRatings
      });
      break;
    case "freekick":
      result = freekickActions.simulateFreekick({
        poss, attacker, defender, opp, curRel, ballTeam, oppTeam, state, currentMin, tickDeltas, playerRatings
      });
      break;
    default:
      // Keine besondere Aktion – Ball halten
      result = {
        nextPlayer: attacker,
        nextZone: state.ballZone,
        text: `${Math.round(currentMin)}' – Ball läuft in den eigenen Reihen.`
      };
      break;
  }

  // Ergebnis der Aktion verarbeiten
  if (result.switchPossession) {
    // Ballbesitz wechselt zur gegnerischen Mannschaft
    nextPoss = oppTeam;
  } else {
    nextPoss = ballTeam;
  }
  if (result.goal) {
    // Tor: Spielstand aktualisieren und Anstoß für das gegnerische Team
    if (ballTeam === "home") {
      nextScore.home++;
    } else {
      nextScore.away++;
    }
    nextPoss = oppTeam;
    const mids = getPlayersByZone(opp, "midfield");
    const kickPlayer = mids.length ? mids[Math.floor(Math.random() * mids.length)] : opp[0];
    nextPlayer = kickPlayer;
    nextZone   = buildZone(oppTeam, "midfield");
  } else {
    nextPlayer = result.nextPlayer || nextPlayer;
    nextZone   = result.nextZone   || nextZone;
  }
  text = result.text || text;

  // Flags für den nächsten Tick setzen
  let nextJustWonDuel = false;
  let nextPendingAction = null;
  if (result.justWonDuel) {
    nextJustWonDuel = true;
  }
  if (result.foul) {
    nextPendingAction = "freekick";
  }
  if (result.actionOverride) {
    nextPendingAction = result.actionOverride;
  }

  // Spielerbewertungen minimal Richtung Ausgangswert deklinieren
  decayRatings(playerRatings);

  // Bewertung-Events zwischenspeichern
  const ratingEventsBuffer = appendRatingEvents(
    state.ratingEventsBuffer,
    tickDeltas,
    Math.round(currentMin),
    action
  );

  // Aktuelles Event protokollieren
  const evt = {
    minute:        Math.round(currentMin),
    text,
    type:          action,
    possession:    nextPoss,
    playerWithBall: safePlayerRef(nextPlayer)
  };

  // Neuen Spielstand zurückgeben
  return {
    minute:         currentMin,
    possession:     nextPoss,
    playerWithBall: nextPlayer, // Spielerobjekt (für nächsten Tick)
    ballZone:       nextZone,
    events:         [...state.events, evt],
    score:          nextScore,
    justWonDuel:    nextJustWonDuel,
    attackTicks:    (nextPoss === state.possession && nextZone.endsWith("Attack"))
                     ? (state.attackTicks || 0) + 1
                     : 0,
    playerRatings,
    ratingEventsBuffer,
    pendingAction:  nextPendingAction
  };
}

module.exports = { getNextGameState };
