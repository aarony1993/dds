import { basePos, positionKeyToGroup, oneStepForwardZone, twoStepsForwardZone } from '../utils.js';
import { CROSSERS } from '../constants.js';

/**
 * Normaler Pass: max. 1 Zone vor.
 * - Torhüter: nur DEF-Empfänger (100% safe wird in actions.js behandelt)
 * - Stürmer: KEIN Rückpass zu DEF/TW
 */
export function allowedGroupsForNormalPass(actorBasePos) {
  const group = positionKeyToGroup(actorBasePos);
  if (group === 'TOR') return ['DEF'];                   // GK -> nur DEF
  if (group === 'DEF') return ['DEF','MID'];             // DEF -> DEF/MID
  if (group === 'MID') return ['MID','ATT','DEF'];       // MID -> bevorzugt vorwärts, aber auch seitwärts/absichern erlaubt
  if (group === 'ATT') return ['ATT','MID'];             // ATT -> niemals zu DEF/TW
  return ['MID'];
}

/**
 * Ermittelt die Ziel-Zone nach Pass, abhängig von Intent.
 * - 'NORMAL': max. 1 Zone vorwärts
 * - 'THROUGH': bis zu 2 Zonen vorwärts
 * - 'SAFE': gleichbleibend/seitwärts (Engine regelt Zonenwechsel in actions)
 */
export function computeZoneAfterPass(actor, state, intent='NORMAL') {
  const current = state.ball.zone;
  if (intent === 'SAFE') return current;
  if (intent === 'THROUGH') return twoStepsForwardZone(current, actor.teamId, state);
  return oneStepForwardZone(current, actor.teamId, state);
}

/**
 * Findet besten Empfänger unter Beachtung von:
 * - keine absurden Rückpässe (ATT -> DEF/TW verboten)
 * - GK -> nur DEF
 * - Zone-Intent (normal/through)
 * - leichte Präferenz für stärkere und passend positionierte Spieler
 */
export function findBestPassRecipient(actor, state, intent='NORMAL') {
  const teamPlayers = state.players.filter(p => p.teamId === actor.teamId && p.id !== actor.id);
  if (teamPlayers.length === 0) return null;

  const actorBase = basePos(actor.position);
  const allowedGroups = new Set(allowedGroupsForNormalPass(actorBase));

  const candidates = teamPlayers.filter(p => {
    const g = positionKeyToGroup(p.position);
    if (!allowedGroups.has(g)) return false;
    // Optional: nur minimale Zone nach vorn – Engine setzt ball.zone separat
    // Verhindere völligen Quatsch: ATT zurück zu TW/DEF
    if (positionKeyToGroup(actor.position) === 'ATT' && (g === 'DEF' || g === 'TOR')) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  // Gewichtung: Stärke + Positionspassung + Außen für Flankenoptionen im letzten Drittel
  const weights = candidates.map(p => {
    const g = positionKeyToGroup(p.position);
    let w = p.strength || 50;
    if (g === 'ATT') w += 8;
    if (g === 'MID') w += 4;
    if (CROSSERS.has(p.position)) w += 3;
    return w;
  });

  let total = weights.reduce((s,w)=>s+w,0);
  let r = Math.random()*total;
  for (let i=0;i<candidates.length;i++){
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}
