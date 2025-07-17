// simulationEngine.js

// Multiplikatoren für jede Detailposition und Aktion
const positionActionModifiers = {
  //      Tackling  Pass  Dribbling  Schuss
  "TW":  [1.1,     0.7,   0.3,      0.2],
  "IV":  [1.3,     0.8,   0.5,      0.4],
  "LV":  [1.2,     0.9,   0.7,      0.6],
  "RV":  [1.2,     0.9,   0.7,      0.6],
  "ZDM": [1.2,     1.1,   0.7,      0.6],
  "ZM":  [1.0,     1.3,   1.1,      0.8],
  "LM":  [0.9,     1.2,   1.2,      0.9],
  "RM":  [0.9,     1.2,   1.2,      0.9],
  "ZOM": [0.7,     1.3,   1.3,      1.1],
  "HS":  [0.6,     1.0,   1.2,      1.3],
  "ST":  [0.5,     0.8,   1.1,      1.4],
  "MS":  [0.5,     0.7,   1.0,      1.5],
  "LA":  [0.6,     0.9,   1.2,      1.3],
  "RA":  [0.6,     0.9,   1.2,      1.3],
};

// Aktionen je Zone
const zoneActions = {
  defense:   ["pass", "duel"],
  midfield:  ["pass", "dribble", "killerPass", "duel"],
  attack:    ["pass", "dribble", "shoot", "duel"],
};

function getPlayersByZone(teamPlayers, zone) {
  if (zone === "defense") {
    return teamPlayers.filter(p => ["IV", "LV", "RV", "TW"].includes(p.position));
  }
  if (zone === "midfield") {
    return teamPlayers.filter(p => ["ZDM", "ZM", "LM", "RM", "ZOM"].includes(p.position));
  }
  if (zone === "attack") {
    return teamPlayers.filter(p => ["ST", "MS", "LA", "RA", "HS"].includes(p.position));
  }
  return [];
}

const actionIndex = {
  tackle: 0,  // Tackling (Duel)
  pass: 1,    // Pass
  dribble: 2, // Dribbling
  shot: 3     // Schuss
};

function weightedRandomChance(base, attacker, defender, modA, modD, spread = 0.15) {
  const ratingA = attacker * modA;
  const ratingD = defender * modD;
  const strengthDiff = (ratingA - ratingD) / 100;
  const luck = (Math.random() * 2 - 1) * spread;
  return base + strengthDiff + luck;
}

function getActionForZone(zone, minute) {
  // Zone-spezifische, realistischere Auswahl
  if (zone === "defense") {
    return Math.random() < 0.8 ? "pass" : "duel";
  }
  if (zone === "midfield") {
    const r = Math.random();
    if (r < 0.45) return "pass";
    if (r < 0.70) return "dribble";
    if (r < 0.77) return "killerPass";
    return "duel";
  }
  if (zone === "attack") {
    const r = Math.random();
    if (r < 0.32) return "pass";
    if (r < 0.52) return "dribble";
    if (r < 0.82) return "shoot";
    return "duel";
  }
  return "pass";
}

function chooseOpponent(players) {
  if (!players || players.length === 0) return null;
  return players[Math.floor(Math.random() * players.length)];
}

function killerPassSuccess(attacker, defender) {
  // Tödlicher Pass: sehr schwer, hoher Reward
  return weightedRandomChance(0.19, attacker.strength, defender.strength,
    positionActionModifiers[attacker.position][actionIndex.pass],
    positionActionModifiers[defender.position][actionIndex.tackle],
    0.18);
}

function isFoul() {
  return Math.random() < 0.09;
}

function formatPlayerName(player) {
  if (!player) return "Unbekannt";
  if (player.name) return player.name;
  return `${player.firstName || ""} ${player.lastName || ""}`.trim() || "Unbekannt";
}

function safePlayerRef(player) {
  return player && player.id ? player.id : null;
}

// ---- NEU: KICKOFF-STARTLOGIK ----
function getKickoffState(homePlayers, awayPlayers, homeTeam, awayTeam, state) {
  const isHome = Math.random() < 0.5;
  const teamPlayers = isHome ? homePlayers : awayPlayers;
  const team = isHome ? homeTeam : awayTeam;
  const mids = getPlayersByZone(teamPlayers, "midfield");
  const kicker = mids.length ? chooseOpponent(mids) : chooseOpponent(teamPlayers);
  const playerName = formatPlayerName(kicker);
  const teamName = team?.name || (isHome ? "Heimteam" : "Auswärtsteam");

  return {
    ...state,
    minute: 0,
    possession: isHome ? "home" : "away",
    playerWithBall: kicker,
    ballPosition: "midfield",
    events: [
      {
        minute: 0,
        text: `Anstoß für ${teamName}. ${playerName} startet das Spiel.`,
        type: "kickoff",
        possession: isHome ? "home" : "away",
        playerWithBall: safePlayerRef(kicker)
      }
    ],
    score: state.score || { home: 0, away: 0 }
  };
}

// ---- Hauptfunktion ----
function getNextGameState(state, homeTeam, awayTeam, homePlayers, awayPlayers) {
  // KICKOFF-START, falls Minute 0 oder Daten fehlen
  if (
    !state ||
    !state.playerWithBall ||
    !state.possession ||
    typeof state.minute === "undefined" ||
    (Array.isArray(state.events) && state.events.length === 0)
  ) {
    return getKickoffState(homePlayers, awayPlayers, homeTeam, awayTeam, state || {});
  }

  // Teams & Spieler bestimmen
  const possessionIsHome = state.possession === "home";
  const possessionTeam = possessionIsHome ? homeTeam : awayTeam;
  const oppositionTeam = possessionIsHome ? awayTeam : homeTeam;
  const possessionPlayers = possessionIsHome ? homePlayers : awayPlayers;
  const oppositionPlayers = possessionIsHome ? awayPlayers : homePlayers;
  const zone = state.ballPosition || "midfield";
  const minuteStep = 90 / 120;
  const nextMinute = Math.min((state.minute || 0) + minuteStep, 90);

  let events = Array.isArray(state.events) ? [...state.events] : [];
  let eventText = "";
  let nextPossession = state.possession;
  let nextPlayerWithBall = state.playerWithBall;
  let nextZone = zone;
  let score = { ...state.score };

  // Spieler-Objekte finden
  let attacker = possessionPlayers.find(p => p.id === (state.playerWithBall?.id || state.playerWithBall)) || chooseOpponent(possessionPlayers);
  if (!attacker) attacker = chooseOpponent(possessionPlayers);
  let defenders = getPlayersByZone(oppositionPlayers, zone);
  if (!defenders.length) defenders = oppositionPlayers;
  let defender = chooseOpponent(defenders);

  // Aktion auswählen
  let action = getActionForZone(zone, nextMinute);
  let isStandard = false;

  // --- Aktionen ---
  switch (action) {
    case "pass": {
      // Zielspieler finden
      const teammates = getPlayersByZone(possessionPlayers, zone).filter(p => p.id !== attacker.id);
      const target = teammates.length ? chooseOpponent(teammates) : attacker;
      const success =
        weightedRandomChance(0.79,  // Höher für mehr Spielfluss!
          attacker.strength, defender.strength,
          positionActionModifiers[attacker.position][actionIndex.pass],
          positionActionModifiers[defender.position][actionIndex.tackle],
          0.10) > 0.5;

      if (success) {
        eventText = `${Math.round(nextMinute)}' – ${formatPlayerName(attacker)} spielt einen Pass zu ${formatPlayerName(target)}.`;
        nextPlayerWithBall = target;
        // ggf. Zone vorwärts
        if (zone === "midfield" && ["ST", "MS", "LA", "RA", "HS"].includes(target.position)) {
          nextZone = "attack";
        } else if (zone === "defense" && ["ZDM", "ZM", "ZOM", "LM", "RM"].includes(target.position)) {
          nextZone = "midfield";
        }
      } else {
        eventText = `${Math.round(nextMinute)}' – ${formatPlayerName(attacker)}'s Pass wird von ${formatPlayerName(defender)} abgefangen!`;
        nextPossession = nextPossession === "home" ? "away" : "home";
        nextPlayerWithBall = defender;
        nextZone = zone === "attack" ? "midfield" : zone === "midfield" ? "defense" : "defense";
      }
      break;
    }
    case "dribble": {
      const success =
        weightedRandomChance(0.63,
          attacker.strength, defender.strength,
          positionActionModifiers[attacker.position][actionIndex.dribble],
          positionActionModifiers[defender.position][actionIndex.tackle],
          0.13) > 0.5;
      if (success) {
        eventText = `${Math.round(nextMinute)}' – ${formatPlayerName(attacker)} setzt sich im Dribbling durch.`;
        // Ball bleibt, ggf. Zone vorwärts
        if (zone === "midfield") nextZone = "attack";
        if (zone === "defense") nextZone = "midfield";
      } else {
        if (isFoul()) {
          isStandard = true;
          if (["ST", "MS", "LA", "RA", "HS"].includes(attacker.position) && zone === "attack") {
            eventText = `${Math.round(nextMinute)}' – Foul an ${formatPlayerName(attacker)} im Angriff – direkter Freistoß!`;
            action = "freekick";
          } else {
            eventText = `${Math.round(nextMinute)}' – Foul an ${formatPlayerName(attacker)}. Freistoß, Ballbesitz bleibt.`;
            if (zone === "defense") nextZone = "midfield";
            if (zone === "midfield") nextZone = "attack";
          }
        } else {
          eventText = `${Math.round(nextMinute)}' – ${formatPlayerName(attacker)} verliert den Ball im Dribbling an ${formatPlayerName(defender)}.`;
          nextPossession = nextPossession === "home" ? "away" : "home";
          nextPlayerWithBall = defender;
          nextZone = zone === "attack" ? "midfield" : zone === "midfield" ? "defense" : "defense";
        }
      }
      break;
    }
    case "killerPass": {
      const targets = getPlayersByZone(possessionPlayers, "attack");
      const target = targets.length ? chooseOpponent(targets) : attacker;
      const success = killerPassSuccess(attacker, defender) > 0.57; // Extrem schwer!

      if (success) {
        eventText = `${Math.round(nextMinute)}' – Tödlicher Pass! ${formatPlayerName(attacker)} schickt ${formatPlayerName(target)} steil. Großchance!`;
        nextPlayerWithBall = target;
        nextZone = "attack";
      } else {
        eventText = `${Math.round(nextMinute)}' – ${formatPlayerName(attacker)} versucht den tödlichen Pass – aber ${formatPlayerName(defender)} hat aufgepasst!`;
        nextPossession = nextPossession === "home" ? "away" : "home";
        nextPlayerWithBall = defender;
        nextZone = "midfield";
      }
      break;
    }
    case "shoot": {
      const gks = oppositionPlayers.filter(p => p.position === "TW");
      const keeper = gks.length ? gks[0] : chooseOpponent(oppositionPlayers);
      const baseChance = 0.25;
      const shootChance =
        weightedRandomChance(baseChance,
          attacker.strength, keeper.strength,
          positionActionModifiers[attacker.position][actionIndex.shot],
          positionActionModifiers[keeper.position][actionIndex.tackle],
          0.13);

      if (shootChance > 0.63) {
        eventText = `${Math.round(nextMinute)}' – TOOOOR! ${formatPlayerName(attacker)} trifft gegen ${formatPlayerName(keeper)}!`;
        if (nextPossession === "home") score.home += 1; else score.away += 1;
        // Nach Tor: Ballbesitzwechsel und Anstoß (Kickoff-Logik wiederholen)
        return getKickoffState(homePlayers, awayPlayers, homeTeam, awayTeam, {
          ...state,
          minute: nextMinute,
          events: [
            ...events,
            {
              minute: Math.round(nextMinute),
              text: eventText,
              type: "goal",
              possession: nextPossession,
              playerWithBall: safePlayerRef(attacker)
            }
          ],
          score
        });
      } else {
        eventText = `${Math.round(nextMinute)}' – ${formatPlayerName(attacker)} schießt – aber ${formatPlayerName(keeper)} pariert!`;
        nextPossession = nextPossession === "home" ? "away" : "home";
        nextPlayerWithBall = keeper;
        nextZone = "defense";
      }
      break;
    }
    case "duel": {
      const success =
        weightedRandomChance(0.61,
          attacker.strength, defender.strength,
          positionActionModifiers[attacker.position][actionIndex.tackle],
          positionActionModifiers[defender.position][actionIndex.tackle],
          0.11) > 0.5;
      if (success) {
        eventText = `${Math.round(nextMinute)}' – ${formatPlayerName(attacker)} gewinnt den Zweikampf gegen ${formatPlayerName(defender)}.`;
        if (zone === "defense") nextZone = "midfield";
        if (zone === "midfield") nextZone = "attack";
      } else {
        if (isFoul()) {
          isStandard = true;
          if (["ST", "MS", "LA", "RA", "HS"].includes(attacker.position) && zone === "attack") {
            eventText = `${Math.round(nextMinute)}' – Foul an ${formatPlayerName(attacker)} im Angriff – direkter Freistoß!`;
            action = "freekick";
          } else {
            eventText = `${Math.round(nextMinute)}' – Foul an ${formatPlayerName(attacker)}. Das Spiel läuft nach Freistoß weiter.`;
            if (zone === "defense") nextZone = "midfield";
            if (zone === "midfield") nextZone = "attack";
          }
        } else {
          eventText = `${Math.round(nextMinute)}' – ${formatPlayerName(defender)} gewinnt den Zweikampf gegen ${formatPlayerName(attacker)}.`;
          nextPossession = nextPossession === "home" ? "away" : "home";
          nextPlayerWithBall = defender;
          nextZone = zone === "attack" ? "midfield" : zone === "midfield" ? "defense" : "defense";
        }
      }
      break;
    }
    case "freekick": {
      const gks = oppositionPlayers.filter(p => p.position === "TW");
      const keeper = gks.length ? gks[0] : chooseOpponent(oppositionPlayers);
      const baseChance = 0.32;
      const shootChance =
        weightedRandomChance(baseChance,
          attacker.strength, keeper.strength,
          positionActionModifiers[attacker.position][actionIndex.shot],
          positionActionModifiers[keeper.position][actionIndex.tackle],
          0.15);
      if (shootChance > 0.59) {
        eventText = `${Math.round(nextMinute)}' – Freistoß von ${formatPlayerName(attacker)} – TOOOOR!`;
        if (nextPossession === "home") score.home += 1; else score.away += 1;
        // Nach Tor: Kickoff
        return getKickoffState(homePlayers, awayPlayers, homeTeam, awayTeam, {
          ...state,
          minute: nextMinute,
          events: [
            ...events,
            {
              minute: Math.round(nextMinute),
              text: eventText,
              type: "goal",
              possession: nextPossession,
              playerWithBall: safePlayerRef(attacker)
            }
          ],
          score
        });
      } else {
        eventText = `${Math.round(nextMinute)}' – Freistoß von ${formatPlayerName(attacker)} – gehalten von ${formatPlayerName(keeper)}.`;
        nextPossession = nextPossession === "home" ? "away" : "home";
        nextPlayerWithBall = keeper;
        nextZone = "defense";
      }
      break;
    }
    default:
      eventText = `${Math.round(nextMinute)}' – Ball läuft in den eigenen Reihen.`;
      break;
  }

  // Fallbacks, falls irgendwas fehlt
  if (!nextPlayerWithBall) nextPlayerWithBall = chooseOpponent(possessionPlayers);

  events.push({
    minute: Math.round(nextMinute),
    text: eventText,
    type: action,
    possession: nextPossession,
    playerWithBall: safePlayerRef(nextPlayerWithBall)
  });

  return {
    ...state,
    minute: nextMinute,
    events,
    ballPosition: nextZone,
    possession: nextPossession,
    playerWithBall: nextPlayerWithBall,
    score,
  };
}

module.exports = {
  getNextGameState
};
