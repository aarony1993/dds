// simulationEngine.js

/*************************************************
 * Konfiguration / Tuning
 *************************************************/
const LOG_RATING_EVENTS = true;          // Hybrid: nur relevante Deltas loggen
const ONE_EVENT_PER_TICK = true;         // Alle Deltas eines Ticks zusammenfassen
const RATING_BASE = 600;                 // 6.00 Start
const RATING_MIN = 100;                  // 1.00 Minimum
const RATING_MAX = 1000;                 // 10.00 Maximum
const RATING_DECAY_FACTOR = 0.002;       // leichte Regression pro Tick Richtung 6.0 (0 = aus)
const PROGRESS_BONUS_CAP = 50;           // maximaler Bonus durch AttackTicks

// Rating-Deltas (in Punkten, also 1 = 0.01 Note)
const DELTAS = {
  pass_success: +2,
  pass_fail: -3,
  progressive_pass_bonus: +1,        // zusätzlich zum pass_success
  dribble_win: +4,
  dribble_loss: -4,
  duel_win: +3,
  duel_loss: -3,
  killer_pass_success: +6,
  killer_pass_fail: -5,
  shot_on_target: +5,                 // Schuss gehalten
  goal: +18,
  header_goal: +16,
  freekick_goal: +20,
  save: +5,                           // Keeper-Parade
  concede_goal_keeper: -8,            // Tor kassiert (Torwart)
  foul_drawn: +3,
  foul_committed: -3
};

// Multiplikatoren für Detailpositionen und Aktionen
const positionActionModifiers = {
  "TW":  [1.1, 0.7, 0.3, 0.2],
  "IV":  [1.3, 0.8, 0.5, 0.4],
  "LV":  [1.2, 0.9, 0.7, 0.6],
  "RV":  [1.2, 0.9, 0.7, 0.6],
  "ZDM": [1.2, 1.1, 0.7, 0.6],
  "ZM":  [1.0, 1.3, 1.1, 1.0],
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

// Vorlagen für Aktionsbeschreibungen (mit {minute})
const templates = {
  kickoff: [
    "Anstoß für {team}. {attacker} startet das Spiel.",
    "{team} übernimmt per Anstoß. {attacker} legt los.",
    "Spielbeginn für {team}, {attacker} führt den Anstoß aus."
  ],
  pass: [
    "{minute}' – {attacker} spielt einen präzisen Pass zu {target}.",
    "{minute}' – {attacker} steckt den Ball auf {target} durch.",
    "{minute}' – Feiner Pass von {attacker} auf {target}."
  ],
  pass_intercept: [
    "{minute}' – {defender} fängt den Pass von {attacker} ab!"
  ],
  dribble: [
    "{minute}' – {attacker} setzt sich im Dribbling durch.",
    "{minute}' – Gelungener Dribbling-Versuch von {attacker}.",
    "{minute}' – {attacker} tanzt mit dem Ball am Fuß."
  ],
  dribble_lost: [
    "{minute}' – {defender} nimmt {attacker} den Ball im Dribbling ab!"
  ],
  killerPass: [
    "{minute}' – Tödlicher Pass von {attacker} auf {target} – Großchance!",
    "{minute}' – {attacker} spielt den tödlichen Pass zu {target}."
  ],
  killerPass_fail: [
    "{minute}' – {defender} unterbindet den Killerpass von {attacker}!"
  ],
  duel_win: [
    "{minute}' – {attacker} gewinnt den Zweikampf gegen {defender}.",
    "{minute}' – Starker Zweikampf von {attacker} gegen {defender}."
  ],
  duel_loss: [
    "{minute}' – {defender} setzt sich im Zweikampf gegen {attacker} durch."
  ],
  shoot: [
    "{minute}' – {attacker} zieht aus der Distanz ab.",
    "{minute}' – Schussversuch von {attacker} aufs Tor."
  ],
  header: [
    "{minute}' – {attacker} setzt zum Kopfball an!"
  ],
  goal: [
    "{minute}' – TOOOOR! {attacker} trifft gegen {goalkeeper}.",
    "{minute}' – Jubel! {attacker} überwindet {goalkeeper}."
  ],
  save: [
    "{minute}' – {goalkeeper} pariert gegen {attacker}.",
    "{minute}' – Glanzparade von {goalkeeper} gegen {attacker}."
  ],
  foul: [
    "{minute}' – Foul an {attacker}. Freistoß für {team}.",
    "{minute}' – {attacker} wird gefoult – Freistoß für {team}."
  ],
  freekick: [
    "{minute}' – Freistoß von {attacker}.",
    "{minute}' – {attacker} tritt den Freistoß."
  ],
  freekick_saved: [
    "{minute}' – Freistoß von {attacker} – {goalkeeper} hält!"
  ]
};

/*************************************************
 * Hilfsfunktionen
 *************************************************/
function normalizePosition(pos) {
  return (typeof pos === "string") ? pos.replace(/\d+$/, "") : pos;
}
function weightedRandomChance(base, atk, def, modA, modD, spread = 0.15) {
  const ratingA = atk * modA;
  const ratingD = def * modD;
  const diff    = (ratingA - ratingD) / 70; // etwas defensiver
  const luck    = (Math.random()*2 - 1)*spread;
  return base + diff + luck;
}
function choosePlayer(arr) { return arr && arr.length ? arr[Math.floor(Math.random()*arr.length)] : null; }
function formatName(p) {
  if (!p) return "Unbekannt";
  return p.name || `${p.firstName||p.vorname||""} ${p.lastName||p.nachname||""}`.trim() || "Unbekannt";
}
function safePlayerRef(p) { return p && p.id ? p.id : null; }

function assignDetail(players, lineup) {
  const inLineup = lineup ? Object.values(lineup) : null;
  const pool     = inLineup ? players.filter(p=>inLineup.includes(p.id)) : players;
  if (lineup) {
    return Object.entries(lineup)
      .map(([det,id])=>{
        const pl=pool.find(x=>x.id===id);
        return pl?{...pl,position:normalizePosition(det)}:null;
      }).filter(Boolean);
  }
  return pool.map(p=>({
    ...p,
    position: normalizePosition(groupToDefaultDetail[p.positionGroup]||"IV")
  }));
}

function getMod(p, act) {
  if (!p||!p.position) return 1;
  const mods = positionActionModifiers[ normalizePosition(p.position) ];
  if (!Array.isArray(mods)) return 1;
  switch(act) {
    case "tackle": return mods[0];
    case "pass":   return mods[1];
    case "dribble":return mods[2];
    case "shot":   return mods[3];
    default: return 1;
  }
}

function getPlayersByZone(players, zone) {
  const map = {
    defense: ["IV","LV","RV","TW"],
    midfield:["ZDM","ZM","LM","RM","ZOM"],
    attack:  ["ST","MS","LA","RA","HS"]
  };
  return players.filter(p=>map[zone]?.includes(normalizePosition(p.position)));
}
function isDefensive(p) {
  return ["IV","LV","RV","ZDM"].includes(normalizePosition(p.position));
}
function getNextRelativeZone(z) {
  if (z==="defense") return "midfield";
  if (z==="midfield")return "attack";
  return null;
}
function getPreviousRelativeZone(z) {
  if (z==="attack") return "midfield";
  if (z==="midfield")return "defense";
  return null;
}
function buildZone(team, rel) { return `${team}${rel.charAt(0).toUpperCase()+rel.slice(1)}`; }
function parseZone(ctx) {
  if (!ctx) return {};
  const team = ctx.startsWith("home")?"home":"away";
  const rel  = ctx.endsWith("Defense")  ?"defense"
             : ctx.endsWith("Midfield")?"midfield"
             : ctx.endsWith("Attack")  ?"attack":null;
  return {team,rel};
}
function opponentZone(ctx) {
  const {team,rel}=parseZone(ctx);
  const opp = team==="home"?"away":"home";
  if (rel==="defense") return buildZone(opp,"attack");
  if (rel==="midfield")return buildZone(opp,"midfield");
  if (rel==="attack")  return buildZone(opp,"defense");
  return null;
}
function chooseAction(rel) {
  const r=Math.random();
  if (rel==="midfield") {
    if (r<0.48) return "pass";
    if (r<0.72) return "dribble";
    if (r<0.78) return "killerPass";
    return "duel";
  }
  if (rel==="attack") {
    if (r<0.39) return "pass";
    if (r<0.50) return "dribble";
    if (r<0.66) return "shoot"; // reduziert
    return "duel";
  }
  return r<0.82?"pass":"duel";
}

// Text-Template
function describe(type, data) {
  const arr = templates[type];
  if (!arr) return "";
  let txt = arr[Math.floor(Math.random()*arr.length)];
  Object.entries(data||{}).forEach(([k,v])=>{
    txt = txt.replace(new RegExp(`{${k}}`,'g'), v||"");
  });
  return txt;
}

/*************************************************
 * Rating Utility
 *************************************************/
function initRatings(players, existingMap) {
  const map = existingMap ? {...existingMap} : {};
  players.forEach(p=>{
    if (!map[p.id]) map[p.id] = RATING_BASE;
  });
  return map;
}
function clamp(val,min,max){ return val<min?min:val>max?max:val; }
function applyDelta(ratings, playerId, delta, deltasAcc) {
  if (!playerId) return;
  if (ratings[playerId] === undefined) ratings[playerId] = RATING_BASE;
  ratings[playerId] = clamp(ratings[playerId] + delta, RATING_MIN, RATING_MAX);
  if (delta !== 0) deltasAcc[playerId] = (deltasAcc[playerId]||0) + delta;
}
function decayRatings(ratings) {
  if (RATING_DECAY_FACTOR <= 0) return;
  const center = RATING_BASE;
  Object.keys(ratings).forEach(id=>{
    const diff = ratings[id] - center;
    ratings[id] = ratings[id] - diff * RATING_DECAY_FACTOR;
  });
}

/*************************************************
 * Kickoff
 *************************************************/
function getKickoffState(home,away,homeTeam,awayTeam,state) {
  const isHome=Math.random()<0.5;
  const teamPl = isHome?home:away;
  const teamInf= isHome?homeTeam:awayTeam;
  const mids   = getPlayersByZone(teamPl,"midfield");
  const kick   = choosePlayer(mids)||choosePlayer(teamPl);
  const zone   = buildZone(isHome?"home":"away","midfield");
  const text   = describe("kickoff",{team:teamInf.name,attacker:formatName(kick)});
  const evt={ minute: Math.round(state.minute), text, type:"kickoff", possession: state.possession, playerWithBall: safePlayerRef(kick) };

  // Rating: neutral (kein Delta)
  return {
    ...state,
    events: [...state.events,evt],
    playerWithBall: kick,
    ballZone: zone,
    possession: isHome?"home":"away",
    justWonDuel: false,
    attackTicks: 0
  };
}

/*************************************************
 * Hauptfunktion
 *************************************************/
function getNextGameState(state,homeTeam,awayTeam,rawHome,rawAway,lineupHome=null,lineupAway=null) {
  const home=assignDetail(rawHome,lineupHome);
  const away=assignDetail(rawAway,lineupAway);

  // Ratings initialisieren / zusammenführen (nur aufgestellte)
  const playerRatings = initRatings([...home, ...away], state?.playerRatings);

  if (!state || !state.playerWithBall) {
    return getKickoffState(
      home, away, homeTeam, awayTeam,
      {
        minute:0,
        possession:null,
        playerWithBall:null,
        ballZone:null,
        events:[],
        score:{home:0,away:0},
        justWonDuel:false,
        attackTicks:0,
        playerRatings,
        ratingEventsBuffer: []
      }
    );
  }

  const isHome     = state.possession==="home";
  const ballTeam   = isHome?"home":"away";
  const oppTeam    = isHome?"away":"home";
  const poss       = isHome?home:away;
  const opp        = isHome?away:home;
  const {rel:curRel}= parseZone(state.ballZone);
  const currentMin = (state.minute||0)+90/120;

  let nextPoss   = state.possession;
  let nextPlayer = state.playerWithBall;
  let nextZone   = state.ballZone;
  let nextScore  = {...state.score};
  let action     = chooseAction(curRel);
  let text       = "";

  // Deltas-Akkumulator (playerId -> deltaPoints)
  const tickDeltas = {};

  // Ballführer Auswahl
  let poolAtt = poss;
  if (curRel!=="attack")
    poolAtt = poolAtt.filter(p=>!["ST","MS","LA","RA","HS"].includes(normalizePosition(p.position)));
  else {
    const str = poss.filter(p=>["ST","MS","LA","RA","HS"].includes(normalizePosition(p.position)));
    if (str.length) poolAtt=str;
  }
  let attacker = poolAtt.find(p=>p.id===state.playerWithBall.id)||choosePlayer(poolAtt)||choosePlayer(poss);

  // Defender
  const defZone = parseZone(opponentZone(state.ballZone)).rel;
  let defList = getPlayersByZone(opp.filter(p=>normalizePosition(p.position)!=="TW"),defZone);
  if (!defList.length) defList = opp.filter(p=>normalizePosition(p.position)!=="TW");
  let defender = choosePlayer(defList)||{id:"dummy",strength:1,position:"IV"};

  // justWonDuel-Kette unterbrechen
  if (state.justWonDuel && action==="duel") {
    action="pass";
    text=describe("pass",{minute:Math.round(currentMin),attacker:formatName(attacker),target:formatName(attacker)});
    nextPlayer=attacker;
    nextZone=buildZone(ballTeam,"midfield");
  }
  state.justWonDuel=false;

  // Abwehrspieler Einschränkungen
  const isDef = isDefensive(attacker);
  const isGK  = normalizePosition(attacker.position)==="TW";
  if (isDef && !isGK && (action==="shoot"||action==="killerPass"||(action==="dribble"&&curRel==="attack"))) {
    action="pass";
    text=describe("pass",{minute:Math.round(currentMin),attacker:formatName(attacker),target:formatName(attacker)});
    nextPlayer=attacker;
    nextZone=buildZone(ballTeam,curRel);
  }

  /******** Aktionen ********/
  switch(action) {
    case "pass": {
      const mates = poss.filter(p=>p.id!==attacker.id && normalizePosition(p.position)!=="TW");
      const nRel= getNextRelativeZone(curRel);
      const pRel= getPreviousRelativeZone(curRel);
      let tgt=null,tgtRel=curRel;
      if (nRel) { const arr=getPlayersByZone(mates,nRel); if(arr.length){tgt=choosePlayer(arr);tgtRel=nRel;} }
      if(!tgt){ const arr=getPlayersByZone(mates,curRel); if(arr.length){tgt=choosePlayer(arr);} }
      if(!tgt&&pRel){ const arr=getPlayersByZone(mates,pRel); if(arr.length){tgt=choosePlayer(arr);tgtRel=pRel;} }
      if(!tgt) tgt=choosePlayer(mates)||attacker;

      let base=0.78, dmod=getMod(defender,"tackle");
      if(tgtRel===nRel){base=0.82; dmod*=0.9;}
      const success = weightedRandomChance(base,attacker.strength,defender.strength,getMod(attacker,"pass"),dmod,0.09)>0.5;
      if (success) {
        text=describe("pass",{minute:Math.round(currentMin),attacker:formatName(attacker),target:formatName(tgt)});
        nextPlayer=tgt;
        nextZone=buildZone(ballTeam,tgtRel);
        applyDelta(playerRatings, attacker.id, DELTAS.pass_success, tickDeltas);
        if(tgtRel===nRel) applyDelta(playerRatings, attacker.id, DELTAS.progressive_pass_bonus, tickDeltas);
      } else {
        text=describe("pass_intercept",{minute:Math.round(currentMin),attacker:formatName(attacker),defender:formatName(defender)});
        nextPoss=oppTeam;
        nextPlayer=defender;
        nextZone=buildZone(oppTeam,"defense");
        applyDelta(playerRatings, attacker.id, DELTAS.pass_fail, tickDeltas);
        applyDelta(playerRatings, defender.id, DELTAS.pass_success, tickDeltas); // kleiner Bonus für Interception
      }
      break;
    }
    case "dribble": {
      const success = weightedRandomChance(
        0.55,attacker.strength,defender.strength,
        getMod(attacker,"dribble"),getMod(defender,"tackle"),0.10)>0.5;
      if (success) {
        if(curRel==="attack") {
          action="shoot";
          text=describe("shoot",{minute:Math.round(currentMin),attacker:formatName(attacker)});
          nextPlayer=attacker;
          nextZone=buildZone(ballTeam,"attack");
          applyDelta(playerRatings, attacker.id, DELTAS.dribble_win, tickDeltas);
        } else if(["LM","RM"].includes(normalizePosition(attacker.position))) {
          action="header";
          const hdr=choosePlayer(getPlayersByZone(poss,"attack"))||attacker;
            text=describe("header",{minute:Math.round(currentMin),attacker:formatName(attacker),target:formatName(hdr)});
          nextPlayer=hdr; nextZone=buildZone(ballTeam,"attack");
          applyDelta(playerRatings, attacker.id, DELTAS.dribble_win, tickDeltas);
        } else {
          const nr=getNextRelativeZone(curRel)||curRel;
          text=describe("dribble",{minute:Math.round(currentMin),attacker:formatName(attacker)});
          nextPlayer=attacker;
          nextZone=buildZone(ballTeam,isDefensive(attacker)?"midfield":nr);
          applyDelta(playerRatings, attacker.id, DELTAS.dribble_win, tickDeltas);
        }
      } else {
        text=describe("dribble_lost",{minute:Math.round(currentMin),attacker:formatName(attacker),defender:formatName(defender)});
        nextPoss=oppTeam; nextPlayer=defender; nextZone=buildZone(oppTeam,"defense");
        applyDelta(playerRatings, attacker.id, DELTAS.dribble_loss, tickDeltas);
        applyDelta(playerRatings, defender.id, DELTAS.duel_win, tickDeltas);
      }
      break;
    }
    case "killerPass": {
      const tgtList=getPlayersByZone(poss,"attack");
      const tgt=tgtList.length?choosePlayer(tgtList):attacker;
      const success = weightedRandomChance(
        0.19,attacker.strength,defender.strength,
        getMod(attacker,"pass"),getMod(defender,"tackle"),0.18)>0.57;
      if (success) {
        text=describe("killerPass",{minute:Math.round(currentMin),attacker:formatName(attacker),target:formatName(tgt)});
        nextPlayer=tgt;
        nextZone=buildZone(ballTeam,isDefensive(attacker)?"midfield":"attack");
        applyDelta(playerRatings, attacker.id, DELTAS.killer_pass_success, tickDeltas);
      } else {
        text=describe("killerPass_fail",{minute:Math.round(currentMin),attacker:formatName(attacker),defender:formatName(defender)});
        nextPoss=oppTeam; nextPlayer=defender; nextZone=buildZone(oppTeam,"defense");
        applyDelta(playerRatings, attacker.id, DELTAS.killer_pass_fail, tickDeltas);
        applyDelta(playerRatings, defender.id, DELTAS.pass_success, tickDeltas);
      }
      break;
    }
    case "header": {
      const kpr=choosePlayer(getPlayersByZone(opp,"defense").filter(p=>normalizePosition(p.position)==="TW"))||defender;
      const success = weightedRandomChance(
        0.23, attacker.strength, kpr.strength,
        getMod(attacker,"shot"), getMod(kpr,"tackle"), 0.08)>0.65;
      if (success) {
        const goalText=describe("goal",{minute:Math.round(currentMin),attacker:formatName(attacker),goalkeeper:formatName(kpr)});
        nextScore[ballTeam]++;
        applyDelta(playerRatings, attacker.id, DELTAS.header_goal, tickDeltas);
        if (normalizePosition(kpr.position)==="TW")
          applyDelta(playerRatings, kpr.id, DELTAS.concede_goal_keeper, tickDeltas);

        // Goal Event
        const goalEvent = {
          minute: Math.round(currentMin),
          text: goalText,
          type: 'goal',
          possession: ballTeam,
          playerWithBall: safePlayerRef(attacker),
          scorer: safePlayerRef(attacker),
          against: safePlayerRef(kpr)
        };
        const newStateAfterGoal = {
          ...state,
          minute: currentMin,
          events: [...state.events, goalEvent],
          score: nextScore,
          justWonDuel:false,
          attackTicks:0,
          playerRatings,
          ratingEventsBuffer: appendRatingEvents(state.ratingEventsBuffer, tickDeltas, goalEvent.minute, 'goal')
        };
        return getKickoffState(home,away,homeTeam,awayTeam,newStateAfterGoal);
      } else {
        text=describe("save",{minute:Math.round(currentMin),goalkeeper:formatName(kpr),attacker:formatName(attacker)});
        nextPoss=oppTeam; nextPlayer=kpr; nextZone=buildZone(oppTeam,"defense");
        applyDelta(playerRatings, attacker.id, DELTAS.shot_on_target, tickDeltas);
        if (normalizePosition(kpr.position)==="TW")
          applyDelta(playerRatings, kpr.id, DELTAS.save, tickDeltas);
      }
      break;
    }
    case "shoot": {
      const kpr=choosePlayer(getPlayersByZone(opp,"defense").filter(p=>normalizePosition(p.position)==="TW"))||defender;
      const success = weightedRandomChance(
        0.15+(state.attackTicks||0)*0.008,
        attacker.strength,kpr.strength,
        getMod(attacker,"shot"),getMod(kpr,"tackle"),0.08)>0.70;
      if (success) {
        const goalText=describe("goal",{minute:Math.round(currentMin),attacker:formatName(attacker),goalkeeper:formatName(kpr)});
        nextScore[ballTeam]++;
        applyDelta(playerRatings, attacker.id, DELTAS.goal, tickDeltas);
        if (normalizePosition(kpr.position)==="TW")
          applyDelta(playerRatings, kpr.id, DELTAS.concede_goal_keeper, tickDeltas);

        const goalEvent = {
          minute: Math.round(currentMin),
            text: goalText,
          type: 'goal',
          possession: ballTeam,
          playerWithBall: safePlayerRef(attacker),
          scorer: safePlayerRef(attacker),
          against: safePlayerRef(kpr)
        };
        const newStateAfterGoal = {
          ...state,
          minute: currentMin,
          events: [...state.events, goalEvent],
          score: nextScore,
          justWonDuel:false,
          attackTicks:0,
          playerRatings,
          ratingEventsBuffer: appendRatingEvents(state.ratingEventsBuffer, tickDeltas, goalEvent.minute, 'goal')
        };
        return getKickoffState(home,away,homeTeam,awayTeam,newStateAfterGoal);
      } else {
        text=describe("save",{minute:Math.round(currentMin),goalkeeper:formatName(kpr),attacker:formatName(attacker)});
        nextPoss=oppTeam; nextPlayer=kpr; nextZone=buildZone(oppTeam,"defense");
        applyDelta(playerRatings, attacker.id, DELTAS.shot_on_target, tickDeltas);
        if (normalizePosition(kpr.position)==="TW")
          applyDelta(playerRatings, kpr.id, DELTAS.save, tickDeltas);
      }
      break;
    }
    case "duel": {
      const defList2=getPlayersByZone(opp,curRel).filter(p=>normalizePosition(p.position)!=="TW");
      defender=choosePlayer(defList2)||defender;
      const succ=weightedRandomChance(
        0.61,attacker.strength,defender.strength,
        getMod(attacker,"tackle"),getMod(defender,"tackle"),0.11)>0.5;
      if(succ) {
        text=describe("duel_win",{minute:Math.round(currentMin),attacker:formatName(attacker),defender:formatName(defender)});
        nextPlayer=attacker;
        if(curRel==="defense")      nextZone=buildZone(ballTeam,"midfield");
        else if(curRel==="midfield")nextZone=buildZone(ballTeam,isDefensive(attacker)?"midfield":"attack");
        else                        nextZone=state.ballZone;
        state.justWonDuel=true;
        applyDelta(playerRatings, attacker.id, DELTAS.duel_win, tickDeltas);
        applyDelta(playerRatings, defender.id, DELTAS.duel_loss, tickDeltas);
      } else {
        if(Math.random()<0.09) {
          // Foul
          text=describe("foul",{minute:Math.round(currentMin),attacker:formatName(attacker),team:(ballTeam==='home'?homeTeam.name:awayTeam.name)});
          action="freekick";
          nextZone=state.ballZone;
          applyDelta(playerRatings, attacker.id, DELTAS.foul_drawn, tickDeltas);
          applyDelta(playerRatings, defender.id, DELTAS.foul_committed, tickDeltas);
        } else {
          text=describe("duel_loss",{minute:Math.round(currentMin),attacker:formatName(attacker),defender:formatName(defender)});
          nextPoss=oppTeam; nextPlayer=defender; nextZone=buildZone(oppTeam,"defense");
          applyDelta(playerRatings, attacker.id, DELTAS.duel_loss, tickDeltas);
          applyDelta(playerRatings, defender.id, DELTAS.duel_win, tickDeltas);
        }
      }
      break;
    }
    case "freekick": {
      const kpr2=choosePlayer(getPlayersByZone(opp,"defense").filter(p=>normalizePosition(p.position)==="TW"))||defender;
      const success = weightedRandomChance(
        0.19,attacker.strength,kpr2.strength,
        getMod(attacker,"shot"),getMod(kpr2,"tackle"),0.12)>0.69;
      if (success) {
        const goalText=describe("goal",{minute:Math.round(currentMin),attacker:formatName(attacker),goalkeeper:formatName(kpr2)});
        nextScore[ballTeam]++;
        applyDelta(playerRatings, attacker.id, DELTAS.freekick_goal, tickDeltas);
        if (normalizePosition(kpr2.position)==="TW")
          applyDelta(playerRatings, kpr2.id, DELTAS.concede_goal_keeper, tickDeltas);
        const goalEvent = {
          minute: Math.round(currentMin),
          text: goalText,
          type: 'goal',
          possession: ballTeam,
          playerWithBall: safePlayerRef(attacker),
          scorer: safePlayerRef(attacker),
          against: safePlayerRef(kpr2)
        };
        const newStateAfterGoal = {
          ...state,
          minute: currentMin,
          events: [...state.events, goalEvent],
          score: nextScore,
          justWonDuel:false,
          attackTicks:0,
          playerRatings,
          ratingEventsBuffer: appendRatingEvents(state.ratingEventsBuffer, tickDeltas, goalEvent.minute, 'goal')
        };
        return getKickoffState(home,away,homeTeam,awayTeam,newStateAfterGoal);
      } else {
        text=describe("freekick_saved",{minute:Math.round(currentMin),attacker:formatName(attacker),goalkeeper:formatName(kpr2)});
        nextPoss=oppTeam; nextPlayer=kpr2; nextZone=buildZone(oppTeam,"defense");
        applyDelta(playerRatings, attacker.id, DELTAS.shot_on_target, tickDeltas);
        if (normalizePosition(kpr2.position)==="TW")
          applyDelta(playerRatings, kpr2.id, DELTAS.save, tickDeltas);
      }
      break;
    }
    default:
      text = `${Math.round(currentMin)}' – Ball läuft in den eigenen Reihen.`;
      nextZone = state.ballZone;
      break;
  }

  // Decay (nach Aktion)
  decayRatings(playerRatings);

  // RatingEvents (nur wenn Deltas)
  const ratingEventsBuffer = appendRatingEvents(state.ratingEventsBuffer, tickDeltas, Math.round(currentMin), action);

  // Event anhängen
  const evt={minute:Math.round(currentMin),text,type:action,possession:nextPoss,playerWithBall:safePlayerRef(nextPlayer)};

  return {
    minute:currentMin,
    possession:nextPoss,
    playerWithBall:nextPlayer,
    ballZone:nextZone,
    events:[...state.events,evt],
    score:nextScore,
    justWonDuel:state.justWonDuel,
    attackTicks:(nextPoss===state.possession && nextZone.endsWith("Attack"))?(state.attackTicks||0)+1:0,
    playerRatings,
    ratingEventsBufferI
  };
}

/*************************************************
 * Rating Events Buffer Helper
 *************************************************/
function appendRatingEvents(buffer, tickDeltas, minute, actionTag) {
  if (!LOG_RATING_EVENTS) return buffer || [];
  const deltaKeys = Object.keys(tickDeltas);
  if (!deltaKeys.length) return buffer || [];
  if (!buffer) buffer = [];

  if (ONE_EVENT_PER_TICK) {
    // Zusammenfassen in ein Objekt
    buffer.push({
      minute,
      actionTag,
      deltas: tickDeltas,      // {playerId: deltaPoints}
      timestamp: Date.now()
    });
  } else {
    // Einzelne Einträge pro Spieler
    deltaKeys.forEach(pid=>{
      buffer.push({
        minute,
        actionTag,
        playerId: pid,
        delta: tickDeltas[pid],
        timestamp: Date.now()
      });
    });
  }
  return buffer;
}

/*************************************************
 * Export
 *************************************************/
module.exports = { getNextGameState };
