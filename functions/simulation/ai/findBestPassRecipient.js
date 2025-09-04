// functions/simulation/ai/findBestPassRecipient.js
// Auswahl- & Routing-Logik für Pass-Empfänger mit folgenden Leitplanken:
// - Torhüter passen ausschließlich "sicher" in die DEF-Gruppe (100% Zielgruppe).
// - Normale Pässe spielen maximal eine Zone nach vorne (keine "Skip"-Zonen).
// - Abwehrspieler sollen nicht "vorn herumturnen": Bevorzugt DEF/MID als Ziele,
//   nur situativ ATT (im Mittelfeld). Keine riskanten Vertikalpässe aus der letzten Linie.
// - Die Zonen werden deterministisch aus Empfängergruppe & Team-Perspektive abgeleitet.
//
// Exporte:
// - allowedGroupsForNormalPass(state)
// - computeZoneAfterPass(passer, recipient, state)
// - choosePassRecipient(passer, state)
// - findBestPassRecipient(passer, state)  (Alias auf choosePassRecipient)
// - applyTouchState(state, passer, recipient)  (Hilfsfunktion zum Setzen von Ball/Zonen)

import {
  sanitizePos,
  positionKeyToGroup,
} from '../utils.js';

// ---------------------------------------------------------
// interne Helfer
// ---------------------------------------------------------
function groupOf(player) {
  if (!player) return 'MID';
  const posKey = sanitizePos(player.position);
  return positionKeyToGroup(posKey); // 'TOR' | 'DEF' | 'MID' | 'ATT'
}

function isHomeTeam(state, teamId) {
  return state?.homeTeam?.id === teamId;
}

function allTeammates(state, teamId) {
  return (state?.players || []).filter(p => p.teamId === teamId);
}

function withoutSelf(players, selfId) {
  return players.filter(p => p.id !== selfId);
}

function ratingOf(player) {
  // Fallback: nutze strength, falls vorhanden; sonst 50
  return Number.isFinite(player?.strength) ? player.strength : 50;
}

// Gewichte nach Gruppe für "sichere" / "kurze" Pässe
const BASE_GROUP_WEIGHTS = {
  TOR: 0.0,
  DEF: 1.0,
  MID: 0.9,
  ATT: 0.5,
};

// Bonus für ähnliche/nachbarliche Rollen (z. B. IV->IV, IV->ZDM, ZM->ZOM etc.)
// Hier einfach: DEF<->DEF hoch, DEF->MID gut, MID->MID gut, MID->ATT okay.
function compatibilityBonus(fromGroup, toGroup) {
  if (fromGroup === toGroup) {
    if (fromGroup === 'DEF') return 0.25;
    if (fromGroup === 'MID') return 0.2;
    return 0.1;
  }
  if (fromGroup === 'DEF' && toGroup === 'MID') return 0.2;
  if (fromGroup === 'MID' && toGroup === 'ATT') return 0.15;
  if (fromGroup === 'MID' && toGroup === 'DEF') return 0.1;
  return 0.0;
}

// ---------------------------------------------------------
// Zonenmodell
// ---------------------------------------------------------
// Verfügbar im System: 'HOME_DEFENSE', 'HOME_MIDFIELD', 'AWAY_MIDFIELD', 'AWAY_ATTACK', 'AWAY_DEFENSE'
// (In der Engine wird an manchen Stellen 'AWAY_DEFENSE' verwendet.)
const HOME_CHAIN = ['HOME_DEFENSE', 'HOME_MIDFIELD', 'AWAY_MIDFIELD', 'AWAY_ATTACK'];
const AWAY_CHAIN = ['AWAY_DEFENSE', 'AWAY_MIDFIELD', 'HOME_MIDFIELD', 'HOME_ATTACK']; // HOME_ATTACK wird selten genutzt; zur Vollständigkeit

function zoneChainForTeam(state, teamId) {
  return isHomeTeam(state, teamId) ? HOME_CHAIN : AWAY_CHAIN;
}

// ---------------------------------------------------------
// 1) Erlaubte Empfängergruppen je aktueller Ballzone
//    (Maximal eine Zone nach vorne; Rück- & Querpässe erlaubt.)
// ---------------------------------------------------------
export function allowedGroupsForNormalPass(state) {
  const zone = state?.ball?.zone || 'HOME_MIDFIELD';
  const inTeam = state?.ball?.inPossessionOfTeam;
  const isHome = isHomeTeam(state, inTeam);

  // Vereinfachtes Mapping: Von DEF -> DEF/MID; Von MID -> DEF/MID/ATT; Von ATT -> MID/ATT
  // Wir mappen „Zone“ auf „empfohlene Gruppen“ aus Sicht des ballführenden Teams.
  if (isHome) {
    switch (zone) {
      case 'HOME_DEFENSE':
        return ['DEF', 'MID'];              // maximal eine vor (MID), sonst DEF
      case 'HOME_MIDFIELD':
        return ['DEF', 'MID', 'ATT'];       // eine vor (ATT) okay
      case 'AWAY_MIDFIELD':
      case 'AWAY_ATTACK':
        return ['MID', 'ATT'];              // in der letzten Phase: kein Sprung weiter als eine Zone
      default:
        return ['DEF', 'MID'];              // Fallback konservativ
    }
  } else {
    switch (zone) {
      case 'AWAY_DEFENSE':
        return ['DEF', 'MID'];
      case 'AWAY_MIDFIELD':
        return ['DEF', 'MID', 'ATT'];
      case 'HOME_MIDFIELD':
      case 'HOME_ATTACK':
        return ['MID', 'ATT'];
      default:
        return ['DEF', 'MID'];
    }
  }
}

// ---------------------------------------------------------
// 2) Neue Ballzone nach einem Pass – deterministisch aus Team & Empfängergruppe
//    (keine „Zonensprünge“ > 1 Schritt)
// ---------------------------------------------------------
export function computeZoneAfterPass(passer, recipient, state) {
  const recipientGroup = groupOf(recipient);
  const isHome = isHomeTeam(state, recipient?.teamId);
  if (isHome) {
    if (recipientGroup === 'DEF' || recipientGroup === 'TOR') return 'HOME_DEFENSE';
    if (recipientGroup === 'MID') return 'HOME_MIDFIELD';
    // ATT als „ein Schritt nach vorn“: erst AWAY_MIDFIELD (letzte Vorstoß-Zone folgt z. B. per Dribbling)
    return 'AWAY_MIDFIELD';
  } else {
    if (recipientGroup === 'DEF' || recipientGroup === 'TOR') return 'AWAY_DEFENSE';
    if (recipientGroup === 'MID') return 'AWAY_MIDFIELD';
    return 'HOME_MIDFIELD';
  }
}

// ---------------------------------------------------------
// 3) Empfängerauswahl
// ---------------------------------------------------------
export function choosePassRecipient(passer, state) {
  if (!passer || !state) return null;

  const teammates = withoutSelf(allTeammates(state, passer.teamId), passer.id);
  if (teammates.length === 0) return null;

  const fromGroup = groupOf(passer);
  const allowed = new Set(allowedGroupsForNormalPass(state));

  // Sonderfall: Torhüter -> nur DEF erlauben (100% sicher)
  const onlyDef = fromGroup === 'TOR';
  const candidatePool = teammates.filter(t => {
    const g = groupOf(t);
    if (onlyDef) return g === 'DEF';
    // Abwehrspieler: zurück oder daneben, nur situativ nach vorne
    if (fromGroup === 'DEF') {
      if (g === 'ATT') return false; // kein direkter DEF->ATT im „normalen“ Aufbauspiel
    }
    return allowed.has(g);
  });

  if (candidatePool.length === 0) return null;

  // Scoring: Stärke + Grundgewicht je Gruppe + Kompatibilitätsbonus
  // Zusätzlich leichter Bonus für „gleiche Zone“ (heuristisch durch fromGroup==toGroup angenähert)
  const scored = candidatePool.map(p => {
    const g = groupOf(p);
    const baseW = BASE_GROUP_WEIGHTS[g] ?? 0.5;
    const compat = compatibilityBonus(fromGroup, g);
    const str = ratingOf(p);
    const noise = Math.random() * 3; // leichte Streuung, damit Verteilung nicht zu deterministisch ist
    // TW bevorzugt die stärkeren DEF leicht
    const gkBias = fromGroup === 'TOR' && g === 'DEF' ? 5 : 0;

    // Rückpass- & Querpasse sind „sicher“, daher kleiner Stabilitätsbonus,
    // Vorwärtspass (MID->ATT) ok, DEF->MID auch gut – steckt in base/compat drin.
    const score = str * 0.6 + baseW * 25 + compat * 20 + noise + gkBias;
    return { player: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  // Softmax-artige Auswahl, aber simpel: Top 3 gewichten, damit nicht immer Nr. 1
  const top = scored.slice(0, Math.min(3, scored.length));
  const total = top.reduce((s, x) => s + x.score, 0);
  let r = Math.random() * total;
  for (const x of top) {
    if ((r -= x.score) <= 0) return x.player;
  }
  return top[0].player;
}

// Bequemer Alias für bestehende Aufrufer
export function findBestPassRecipient(passer, state) {
  return choosePassRecipient(passer, state);
}

// ---------------------------------------------------------
// 4) Ballbesitz-/Zonen-Update nach erfolgreichem Pass
// ---------------------------------------------------------
export function applyTouchState(state, passer, recipient) {
  if (!state || !passer || !recipient) return state;
  const next = {
    ...state,
    ball: {
      ...(state.ball || {}),
      inPossessionOfTeam: recipient.teamId,
      playerInPossessionId: recipient.id,
      zone: computeZoneAfterPass(passer, recipient, state),
      context: {
        ...(state.ball?.context || {}),
        lastAction: 'PASS',
        lastActionPlayerId: passer.id,
        potentialAssistBy: passer.id, // kann in shoot() genutzt werden
        type: 'OPEN_PLAY',
      },
    },
  };
  return next;
}
