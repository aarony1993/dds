// simulationEngine.js

const positionActionModifiers = {
  "TW":  [1.1, 0.7, 0.3, 0.2],
  "IV":  [1.3, 0.8, 0.5, 0.4],
  "LV":  [1.2, 0.9, 0.7, 0.6],
  "RV":  [1.2, 0.9, 0.7, 0.6],
  "ZDM": [1.2, 1.1, 0.7, 0.6],
  "ZM":  [1.0, 1.3, 1.1, 0.8],
  "LM":  [0.9, 1.2, 1.2, 0.9],
  "RM":  [0.9, 1.2, 1.2, 0.9],
  "ZOM": [0.7, 1.3, 1.3, 1.1],
  "HS":  [0.6, 1.0, 1.2, 1.3],
  "ST":  [0.5, 0.8, 1.1, 1.4],
  "MS":  [0.5, 0.7, 1.0, 1.5],
  "LA":  [0.6, 0.9, 1.2, 1.3],
  "RA":  [0.6, 0.9, 1.2, 1.3],
};

const groupToDefaultDetail = {
  "DEF": "IV",
  "MID": "ZM",
  "ATT": "ST",
  "TOR": "TW"
};

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

function isFoul() {
  return Math.random() < 0.09;
}

function formatPlayerName(player) {
  if (!player) return "Unbekannt";
  if (player.name) return player.name;
  return `${player.firstName || player.vorname || ""} ${player.lastName || player.nachname || ""}`.trim() || "Unbekannt";
}

function safePlayerRef(player) {
  return player && player.id ? player.id : null;
}

function assignDetailPositions(players, lineup = null) {
  if (lineup) {
    return Object.entries(lineup)
      .map(([detail, id]) => {
        const p = players.find(sp => sp.id === id);
        if (!p) return null;
        return { ...p, position: detail || "IV" }; // Notfall-Fallback
      })
      .filter(Boolean);
  }
  // Sicherstellen, dass position **niemals** undefined ist!
  return players.map(p => {
    const posGroup = p.positionGroup || "";
    const safePos = groupToDefaultDetail[posGroup] || "IV";
    return { ...p, position: safePos };
  });
}


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

function getMod(player, action) {
  const mods = positionActionModifiers[player.position];
  if (!mods) return 1; // Fallback: neutral
  switch (action) {
    case 'tackle': return mods[0];
    case 'pass': return mods[1];
    case 'dribble': return mods[2];
    case 'shot': return mods[3];
    default: return 1;
  }
}

function killerPassSuccess(attacker, defender) {
  return weightedRandomChance(0.19, attacker.strength, defender.strength,
    getMod(attacker, 'pass'),
    getMod(defender, 'tackle'),
    0.18);
}

// ---- KICKOFF-STARTLOGIK ----
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
function getNextGameState(state, homeTeam, awayTeam, rawHomePlayers, rawAwayPlayers, lineupHome = null, lineupAway = null) {
  const homePlayers = assignDetailPositions(rawHomePlayers, lineupHome);
  const awayPlayers = assignDetailPositions(rawAwayPlayers, lineupAway);

  if (
    !state ||
    !state.playerWithBall ||
    !state.possession ||
    typeof state.minute === "undefined" ||
    (Array.isArray(state.events) && state.events.length === 0)
  ) {
    return getKickoffState(homePlayers, awayPlayers, homeTeam, awayTeam, state || {});
  }

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

  let attacker = possessionPlayers.find(p => p.id === (state.playerWithBall?.id || state.playerWithBall)) || chooseOpponent(possessionPlayers);
  if (!attacker) attacker = chooseOpponent(possessionPlayers);
  let defenders = getPlayersByZone(oppositionPlayers, zone);
  if (!defenders.length) defenders = oppositionPlayers;
  let defender = chooseOpponent(defenders);

  let action = getActionForZone(zone, nextMinute);
  let isStandard = false;

  switch (action) {
    case "pass": {
      const teammates = getPlayersByZone(possessionPlayers, zone).filter(p => p.id !== attacker.id);
      const target = teammates.length ? chooseOpponent(teammates) : attacker;
      const success =
        weightedRandomChance(0.79,
          attacker.strength, defender.strength,
          getMod(attacker, 'pass'),
          getMod(defender, 'tackle'),
          0.10) > 0.5;

      if (success) {
        eventText = `${Math.round(nextMinute)}' – ${formatPlayerName(attacker)} spielt einen Pass zu ${formatPlayerName(target)}.`;
        nextPlayerWithBall = target;
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
          getMod(attacker, 'dribble'),
          getMod(defender, 'tackle'),
          0.13) > 0.5;
      if (success) {
        eventText = `${Math.round(nextMinute)}' – ${formatPlayerName(attacker)} setzt sich im Dribbling durch.`;
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
      const success = killerPassSuccess(attacker, defender) > 0.57;

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
          getMod(attacker, 'shot'),
          getMod(keeper, 'tackle'),
          0.13);

      if (shootChance > 0.63) {
        eventText = `${Math.round(nextMinute)}' – TOOOOR! ${formatPlayerName(attacker)} trifft gegen ${formatPlayerName(keeper)}!`;
        if (nextPossession === "home") score.home += 1; else score.away += 1;
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
          getMod(attacker, 'tackle'),
          getMod(defender, 'tackle'),
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
          getMod(attacker, 'shot'),
          getMod(keeper, 'tackle'),
          0.15);
      if (shootChance > 0.59) {
        eventText = `${Math.round(nextMinute)}' – Freistoß von ${formatPlayerName(attacker)} – TOOOOR!`;
        if (nextPossession === "home") score.home += 1; else score.away += 1;
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

  if (!nextPlayerWithBall) nextPlayerWithBall = chooseOpponent(possessionPlayers);

  events.push({
    minute: Math.round(nextMinute),
    text: eventText,
    type: action,
    possession: next
