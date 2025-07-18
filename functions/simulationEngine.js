// simulationEngine.js

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

// Default‑Detailposition pro Positionsgruppe
const groupToDefaultDetail = {
  "DEF": "IV",
  "MID": "ZM",
  "ATT": "ST",
  "TOR": "TW"
};

// Vorlagen für Aktionsbeschreibungen
const templates = {
  kickoff: [
    "Anstoß für {team}. {attacker} startet das Spiel.",
    "{team} übernimmt per Anstoß. {attacker} legt los.",
    "Spielbeginn für {team}, {attacker} führt den Anstoß aus."
  ],
  pass: [
    "{attacker} spielt einen präzisen Pass zu {target}.",
    "{attacker} steckt den Ball auf {target} durch.",
    "{attacker} findet mit seinem Zuspiel {target}.",
    "Feiner Pass von {attacker} auf {target}."
  ],
  dribble: [
    "{attacker} setzt sich im Dribbling durch.",
    "Gelungener Dribbling-Versuch von {attacker}.",
    "{attacker} tanzt mit dem Ball am Fuß.",
  ],
  killerPass: [
    "Tödlicher Pass von {attacker} auf {target} – Großchance!",
    "{attacker} spielt den tödlichen Pass zu {target}.",
  ],
  duel: [
    "{attacker} gewinnt den Zweikampf gegen {target}.",
    "Starker Zweikampf von {attacker} gegen {target}.",
  ],
  shoot: [
    "{attacker} zieht aus der Distanz ab.",
    "Schussversuch von {attacker} aufs Tor.",
  ],
  header: [
    "Kopfball von {attacker} auf {target}.",
    "{attacker} verlängert per Kopf zu {target}.",
  ],
  goal: [
    "TOOOOR! {attacker} trifft gegen {goalkeeper}.",
    "Jubel! {attacker} überwindet {goalkeeper}.",
  ],
  foul: [
    "Foul an {attacker}. Freistoß für {team}.",
    "{attacker} wird gefoult – Freistoßpunkte für {team}.",
  ],
  freekick: [
    "Freistoß von {attacker}.",
    "{attacker} legt sich den Ball für den Freistoß zurecht.",
  ]
};

// Hilfsfunktionen
function normalizePosition(pos) {
  return (typeof pos === "string") ? pos.replace(/\d+$/, "") : pos;
}
function weightedRandomChance(base, atk, def, modA, modD, spread = 0.15) {
  const ratingA = atk * modA;
  const ratingD = def * modD;
  const diff    = (ratingA - ratingD) / 50;
  const luck    = (Math.random()*2 - 1)*spread;
  return base + diff + luck;
}
function choosePlayer(arr) {
  return arr && arr.length ? arr[Math.floor(Math.random()*arr.length)] : null;
}
function formatName(p) {
  if (!p) return "Unbekannt";
  return p.name || `${p.firstName||p.vorname||""} ${p.lastName||p.nachname||""}`.trim() || "Unbekannt";
}
function safePlayerRef(p) {
  return p && p.id ? p.id : null;
}

// Lineup-Filter & Positionszuweisung
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
function buildZone(team, rel) {
  return `${team}${rel.charAt(0).toUpperCase()+rel.slice(1)}`;
}
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
    if (r<0.45) return "pass";
    if (r<0.70) return "dribble";
    if (r<0.77) return "killerPass";
    return "duel";
  }
  if (rel==="attack") {
    if (r<0.32) return "pass";
    if (r<0.42) return "dribble";
    if (r<0.77) return "shoot";
    return "duel";
  }
  return r<0.8?"pass":"duel";
}

// Zufällige Beschreibung aus Vorlagen
function describe(type,data) {
  const arr=templates[type];
  if (!arr) return "";
  let txt=arr[Math.floor(Math.random()*arr.length)];
  return txt
    .replace(/{attacker}/g, data.attacker)
    .replace(/{target}/g, data.target||"")
    .replace(/{team}/g, data.team||"")
    .replace(/{goalkeeper}/g,data.goalkeeper||"");
}

// Kickoff-Ereignis (nach Tor oder Spielstart)
function getKickoffState(home,away,homeTeam,awayTeam,state) {
  const isHome=Math.random()<0.5;
  const teamPl = isHome?home:away;
  const teamInf= isHome?homeTeam:awayTeam;
  const mids   = getPlayersByZone(teamPl,"midfield");
  const kick   = choosePlayer(mids)||choosePlayer(teamPl);
  const zone   = buildZone(isHome?"home":"away","midfield");
  const text   = describe("kickoff",{team:teamInf.name,attacker:formatName(kick)});
  const evt={ minute: Math.round(state.minute), text, type:"kickoff", possession: state.possession, playerWithBall: safePlayerRef(kick) };
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

// Haupt‐Simulations‐Funktion
function getNextGameState(state,homeTeam,awayTeam,rawHome,rawAway,lineupHome=null,lineupAway=null) {
  const home=assignDetail(rawHome,lineupHome);
  const away=assignDetail(rawAway,lineupAway);

  // Initialisierung
  if (!state||!state.playerWithBall) {
    return getKickoffState(home,away,homeTeam,awayTeam,{
      minute:0, possession:null, playerWithBall:null, ballZone:null,
      events:[], score:{home:0,away:0}, justWonDuel:false, attackTicks:0
    });
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

  // Auswahl Ballführer (nur im Lineup und zonengerecht)
  let poolAtt = poss.filter(p=>true);
  if (curRel!="attack") poolAtt = poolAtt.filter(p=>!["ST","MS","LA","RA","HS"].includes(normalizePosition(p.position)));
  if (curRel==="attack") {
    const str = poss.filter(p=>["ST","MS","LA","RA","HS"].includes(normalizePosition(p.position)));
    if (str.length) poolAtt=str;
  }
  let attacker = poolAtt.find(p=>p.id===state.playerWithBall.id)||choosePlayer(poolAtt)||choosePlayer(poss);

  // Defender in relevanter Zone
  const defZone = parseZone(opponentZone(state.ballZone)).rel;
  let defList = getPlayersByZone(opp.filter(p=>normalizePosition(p.position)!="TW"),defZone);
  if (!defList.length) defList = opp.filter(p=>normalizePosition(p.position)!="TW");
  let defender = choosePlayer(defList)||{id:"dummy",strength:1,position:"IV"};

  // justWonDuel‑Unterbrechung
  if (state.justWonDuel && action==="duel") {
    action="pass";
    text=describe("pass",{attacker:formatName(attacker),target:formatName(attacker)});
    nextPlayer=attacker;
    nextZone=buildZone(ballTeam,"midfield");
  }
  state.justWonDuel=false;

  // Abwehrspieler-Regel
  const isDef = isDefensive(attacker);
  const isGoalie = normalizePosition(attacker.position)==="TW";
  if (isDef && !isGoalie && (action==="shoot"||action==="killerPass"||(action==="dribble"&&curRel==="attack"))) {
    action="pass";
    text=describe("pass",{attacker:formatName(attacker),target:formatName(attacker)});
    nextPlayer=attacker;
    nextZone=buildZone(ballTeam,curRel);
  }

  // Aktion ausführen
  switch(action) {
    case "pass": {
      const mates = poss.filter(p=>p.id!==attacker.id&&normalizePosition(p.position)!="TW");
      const nRel= getNextRelativeZone(curRel);
      const pRel= getPreviousRelativeZone(curRel);
      let tgt=null,tgtRel=curRel;
      if (nRel) { const arr=getPlayersByZone(mates,nRel); if(arr.length){tgt=choosePlayer(arr);tgtRel=nRel;} }
      if(!tgt){ const arr=getPlayersByZone(mates,curRel); if(arr.length){tgt=choosePlayer(arr);} }
      if(!tgt&&pRel){ const arr=getPlayersByZone(mates,pRel); if(arr.length){tgt=choosePlayer(arr);tgtRel=pRel;} }
      if(!tgt) tgt=choosePlayer(mates)||attacker;
      let base=0.79, dmod=getMod(defender,"tackle"); if(tgtRel===nRel){base=0.85; dmod*=0.8;}
      if(weightedRandomChance(base,attacker.strength,defender.strength,getMod(attacker,"pass"),dmod,0.1)>0.5) {
        text=describe("pass",{attacker:formatName(attacker),target:formatName(tgt)});
        nextPlayer=tgt;
        nextZone=buildZone(ballTeam,tgtRel);
      } else {
        text=describe("pass",{attacker:formatName(attacker),target:formatName(defender)});
        nextPoss=oppTeam;
        nextPlayer=defender;
        nextZone=buildZone(oppTeam,"defense");
      }
      break;
    }
    case "dribble": {
      if(weightedRandomChance(0.63,attacker.strength,defender.strength,getMod(attacker,"dribble"),getMod(defender,"tackle"),0.13)>0.5) {
        if(curRel==="attack") {
          action="shoot";
          text=describe("shoot",{attacker:formatName(attacker)});
          nextPlayer=attacker;
          nextZone=buildZone(ballTeam,"attack");
        } else if(["LM","RM"].includes(normalizePosition(attacker.position))) {
          action="header";
          const hdr=choosePlayer(getPlayersByZone(poss,"attack"))||attacker;
          text=describe("header",{attacker:formatName(attacker),target:formatName(hdr)});
          nextPlayer=hdr; nextZone=buildZone(ballTeam,"attack");
        } else {
          const nr=getNextRelativeZone(curRel)||curRel;
          text=describe("dribble",{attacker:formatName(attacker)});
          nextPlayer=attacker;
          nextZone=buildZone(ballTeam,isDef?"midfield":nr);
        }
      } else {
        text=describe("duel",{attacker:formatName(defender),target:formatName(attacker)});
        nextPoss=oppTeam; nextPlayer=defender; nextZone=buildZone(oppTeam,"defense");
      }
      break;
    }
    case "killerPass": {
      const tgtList=getPlayersByZone(poss,"attack");
      const tgt=tgtList.length?choosePlayer(tgtList):attacker;
      if(weightedRandomChance(0.19,attacker.strength,defender.strength,getMod(attacker,"pass"),getMod(defender,"tackle"),0.18)>0.57) {
        text=describe("killerPass",{attacker:formatName(attacker),target:formatName(tgt)});
        nextPlayer=tgt;
        nextZone=buildZone(ballTeam,isDef?"midfield":"attack");
      } else {
        text=describe("duel",{attacker:formatName(defender),target:formatName(attacker)});
        nextPoss=oppTeam; nextPlayer=defender; nextZone=buildZone(oppTeam,"defense");
      }
      break;
    }
    case "header": {
      const kpr=choosePlayer(getPlayersByZone(opp,"defense").filter(p=>normalizePosition(p.position)==="TW"))||defender;
      if(weightedRandomChance(0.45,attacker.strength,kpr.strength,getMod(attacker,"shot"),getMod(kpr,"tackle"),0.1)>0.5) {
        text=describe("goal",{attacker:formatName(attacker),goalkeeper:formatName(kpr)});
        nextScore[ballTeam]++;
        return getKickoffState(home,away,homeTeam,awayTeam,{...state,minute:currentMin,events:[...state.events,{minute:Math.round(currentMin),text,type:'goal',possession:ballTeam,playerWithBall:safePlayerRef(attacker)}],score:nextScore,justWonDuel:false,attackTicks:0,kickoffActive:false});
      } else {
        text=describe("header",{attacker:formatName(attacker),target:formatName(kpr)});
        nextPoss=oppTeam; nextPlayer=kpr; nextZone=buildZone(oppTeam,"defense");
      }
      break;
    }
    case "shoot": {
      const kpr=choosePlayer(getPlayersByZone(opp,"defense").filter(p=>normalizePosition(p.position)==="TW"))||defender;
      if(weightedRandomChance(0.25+(state.attackTicks||0)*0.01,attacker.strength,kpr.strength,getMod(attacker,"shot"),getMod(kpr,"tackle"),0.13)>0.63) {
        text=describe("goal",{attacker:formatName(attacker),goalkeeper:formatName(kpr)});
        nextScore[ballTeam]++;
        return getKickoffState(home,away,homeTeam,awayTeam,{...state,minute:currentMin,events:[...state.events,{minute:Math.round(currentMin),text,type:'goal',possession:ballTeam,playerWithBall:safePlayerRef(attacker)}],score:nextScore,justWonDuel:false,attackTicks:0,kickoffActive:false});
      } else {
        text=describe("shoot",{attacker:formatName(attacker)}).replace('{attacker}',formatName(attacker));
        nextPoss=oppTeam; nextPlayer=kpr; nextZone=buildZone(oppTeam,"defense");
      }
      break;
    }
    case "duel": {
      const defList2=getPlayersByZone(opp,curRel).filter(p=>normalizePosition(p.position)!="TW");
      defender=choosePlayer(defList2)||defender;
      const succ=weightedRandomChance(0.61,attacker.strength,defender.strength,getMod(attacker,"tackle"),getMod(defender,"tackle"),0.11)>0.5;
      if(succ) {
        text=describe("duel",{attacker:formatName(attacker),target:formatName(defender)});
        nextPlayer=attacker;
        if(curRel==="defense")      nextZone=buildZone(ballTeam,"midfield");
        else if(curRel==="midfield")nextZone=buildZone(ballTeam,isDef?"midfield":"attack");
        else                          nextZone=state.ballZone;
        state.justWonDuel=true;
      } else {
        if(Math.random()<0.09) {
          text=describe("foul",{attacker:formatName(attacker),team:(ballTeam==='home'?homeTeam.name:awayTeam.name)});
          action="freekick"; nextZone=state.ballZone;
        } else {
          text=describe("duel",{attacker:formatName(defender),target:formatName(attacker)});
          nextPoss=oppTeam; nextPlayer=defender; nextZone=buildZone(oppTeam,"defense");
        }
      }
      break;
    }
    case "freekick": {
      const kpr2=choosePlayer(getPlayersByZone(opp,"defense").filter(p=>normalizePosition(p.position)==="TW"))||defender;
      if(weightedRandomChance(0.32,attacker.strength,kpr2.strength,getMod(attacker,"shot"),getMod(kpr2,"tackle"),0.15)>0.59) {
        text=describe("goal",{attacker:formatName(attacker),goalkeeper:formatName(kpr2)});
        nextScore[ballTeam]++;
        return getKickoffState(home,away,homeTeam,awayTeam,{...state,minute:currentMin,events:[...state.events,{minute:Math.round(currentMin),text,type:'freekick',possession:ballTeam,playerWithBall:safePlayerRef(attacker)}],score:nextScore,justWonDuel:false,attackTicks:0,kickoffActive:false});
      } else {
        text=describe("freekick",{attacker:formatName(attacker)}) + ` – gehalten von ${formatName(kpr2)}.`;
        nextPoss=oppTeam; nextPlayer=kpr2; nextZone=buildZone(oppTeam,"defense");
      }
      break;
    }
    default:
      text = `${Math.round(currentMin)}' – Ball läuft in den eigenen Reihen.`;
      nextZone = state.ballZone;
      break;
  }

  // Event anhängen
  const evt={minute:Math.round(currentMin),text,type:action,possession:nextPoss,playerWithBall:safePlayerRef(nextPlayer)};
  return {minute:currentMin,possession:nextPoss,playerWithBall:nextPlayer,ballZone:nextZone,events:[...state.events,evt],score:nextScore,justWonDuel:state.justWonDuel,attackTicks:(nextPoss===state.possession && nextZone.endsWith("Attack"))?(state.attackTicks||0)+1:0};
}

module.exports={getNextGameState};
