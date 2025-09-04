// functions/simulation/ai/choosePassRecipient.js

// ---- Tuning ----
export const PASS_TARGETING_CONFIG = {
  weights: {
    ability: 0.6,
    roleBias: 0.2,
    progression: 0.2,
    openness: 0.3,
    distance: 0.25,
    rotation: 0.3,
    antiBounce: 0.2,
  },
  distanceK: 0.25,
  distanceKShort: 0.35,
  distanceKLong: 0.10,
  temperature: 0.8,
  epsilon: 0.12,
  topK: 3,
  minProbFloorCount: 4,
  minProbFloor: 0.05,
  keeperLongBallShare: 0.30,
  keeperShortPassSafety: 0.05,
};

// Positiongruppen -> grobe Feldordnung
const GROUP_INDEX = Object.freeze({
  TOR: -1,
  DEF: 0,
  MID: 1,
  ATT: 2,
});

// ---- Helpers ----
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function nz(v, d = 0) { return (typeof v === 'number' && !Number.isNaN(v)) ? v : d; }
function norm01(v, min = 0, max = 100) { return clamp((nz(v) - min) / (max - min), 0, 1); }

function softmax(scores, temperature) {
  const t = temperature > 0 ? temperature : 1;
  const exps = scores.map(s => Math.exp(s / t));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map(e => e / sum);
}

function pickTopKIndexes(arr, k) {
  const idx = arr.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v);
  return idx.slice(0, Math.max(1, k)).map(x => x.i);
}

function randomChoiceWeighted(items, probs) {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += probs[i];
    if (r <= acc) return items[i];
  }
  return items[items.length - 1];
}

function groupIndexOf(p) {
  const g = (p && p.positionGroup) ? String(p.positionGroup).toUpperCase() : 'MID';
  return GROUP_INDEX[g] ?? 1;
}

function abilityScore(player) {
  const s = player?.strength ?? player?.overall ?? player?.rating;
  return norm01(nz(s, 50), 0, 100);
}

function roleBiasScore(targetG, passerG, opts) {
  let bias = 0;
  if (targetG === GROUP_INDEX.DEF) {
    bias += (passerG <= GROUP_INDEX.DEF) ? 0.15 : -0.10;
  } else if (targetG === GROUP_INDEX.MID) {
    bias += 0.10;
  } else if (targetG === GROUP_INDEX.ATT) {
    bias += (passerG >= GROUP_INDEX.MID) ? 0.15 : 0.05;
  }
  if (opts?.wingFocus && targetG >= GROUP_INDEX.MID) bias += 0.05;
  return bias;
}

function progressionScore(passerG, targetG, longBallMode) {
  const delta = targetG - passerG;
  if (delta >= 2) return longBallMode ? 0.22 : 0.18;
  if (delta === 1) return 0.15;
  if (delta === 0) return 0.05;
  return -0.10;
}

function distanceCost(passerG, targetG, k) {
  const dist = Math.abs(targetG - passerG); // 0..2
  return -clamp(dist / 2, 0, 1) * k;
}

function opennessScore(target, teammates, opponents, opts) {
  const tg = groupIndexOf(target);
  const teamGroupSize = teammates.filter(t => groupIndexOf(t) === tg).length || 1;

  let relevantOpp = 0;
  if (tg === GROUP_INDEX.DEF) {
    relevantOpp = opponents.filter(o => groupIndexOf(o) >= GROUP_INDEX.MID).length;
  } else if (tg === GROUP_INDEX.MID) {
    relevantOpp = opponents.filter(o => groupIndexOf(o) >= GROUP_INDEX.MID).length;
  } else if (tg === GROUP_INDEX.ATT) {
    relevantOpp = opponents.filter(o => groupIndexOf(o) >= GROUP_INDEX.DEF).length;
  }

  let ratio = relevantOpp / teamGroupSize;
  if (opts?.highPressOpp) ratio *= 1.15;

  const tight = clamp(ratio / 4, 0, 1); // grobe Norm
  return -0.25 * tight + 0.15 * (1 - tight);
}

function rotationPenalty(target, gameMeta) {
  const touches = gameMeta?.consecutiveTouches || {};
  const v = nz(touches[target.id], 0);
  return -Math.min(0.30, 0.15 * v);
}

function antiBouncePenalty(passer, target, gameMeta) {
  if (!gameMeta?.lastPassFrom || !gameMeta?.lastReceiver) return 0;
  const isImmediateBounce = (target.id === gameMeta.lastPassFrom) && (passer.id === gameMeta.lastReceiver);
  return isImmediateBounce ? -0.20 : 0;
}

function buildScores({ passer, teammates, opponents, gameMeta, tactic, useKeeperLongBallBias }, tuning) {
  const passerG = groupIndexOf(passer);
  const kDistance =
    tactic?.styleShortPassing ? tuning.distanceKShort :
    tactic?.styleLongPassing  ? tuning.distanceKLong  :
                                tuning.distanceK;

  const scores = [];
  const parts = [];

  for (const t of teammates) {
    if (!t || t.id === passer.id) continue;
    const tg = groupIndexOf(t);
    if (tg === GROUP_INDEX.TOR) continue; // Keeper als Ziel i. d. R. vermeiden

    const ability = abilityScore(t);
    const roleBias = roleBiasScore(tg, passerG, { wingFocus: !!tactic?.wingFocus });
    const prog = progressionScore(passerG, tg, !!useKeeperLongBallBias);
    const dist = distanceCost(passerG, tg, kDistance);
    let open = opennessScore(t, teammates, opponents, { highPressOpp: !!tactic?.highPressOpp });
    const rot = rotationPenalty(t, gameMeta);
    const bounce = antiBouncePenalty(passer, t, gameMeta);

    // Torwart-Kurzpass: leichter Safety-Boost
    if (String(passer?.positionGroup).toUpperCase() === 'TOR' && !useKeeperLongBallBias) {
      open += tuning.keeperShortPassSafety;
    }

    const w = tuning.weights;
    const score =
      w.ability    * ability +
      w.roleBias   * roleBias +
      w.progression* prog +
      w.openness   * open +
      w.distance   * dist +
      w.rotation   * rot +
      w.antiBounce * bounce;

    scores.push(score);
    parts.push({ playerId: t.id, ability, roleBias, prog, open, dist, rot, bounce, score });
  }

  return { scores, parts };
}

function renormalizeWithFloor(probs, floor, minCount) {
  if (!probs.length) return probs;
  // Setze Floor für alle < floor
  let adjusted = probs.map(p => (p < floor ? floor : p));
  // Renormieren
  const s = adjusted.reduce((a, b) => a + b, 0) || 1;
  adjusted = adjusted.map(p => p / s);
  // Sicherstellen, dass mindestens minCount Kandidaten existieren (falls Liste kürzer, egal)
  return adjusted;
}

// ---- Public API ----
export function choosePassRecipient({
  passer,
  teammates,
  opponents,
  gameMeta = {},
  tactic = {},
  options = {},
}) {
  const tuning = {
    ...PASS_TARGETING_CONFIG,
    temperature: options.temperature ?? PASS_TARGETING_CONFIG.temperature,
    epsilon: options.epsilon ?? PASS_TARGETING_CONFIG.epsilon,
    topK: options.topK ?? PASS_TARGETING_CONFIG.topK,
  };

  const isKeeper = String(passer?.positionGroup).toUpperCase() === 'TOR';
  const useKeeperLongBallBias = isKeeper && Math.random() < tuning.keeperLongBallShare;

  const { scores, parts } = buildScores(
    { passer, teammates, opponents, gameMeta, tactic, useKeeperLongBallBias },
    tuning
  );

  // Fallback, falls keine Kandidaten (extrem selten)
  if (!scores.length) {
    const fielders = teammates.filter(t => t && t.id !== passer.id && String(t.positionGroup).toUpperCase() !== 'TOR');
    const fallback = fielders.length
      ? fielders[Math.floor(Math.random() * fielders.length)]
      : teammates.find(t => t && t.id !== passer.id) || passer;
    return { target: fallback, debug: { reason: 'fallback_no_candidates' } };
  }

  let probs = softmax(scores, tuning.temperature);
  probs = renormalizeWithFloor(probs, PASS_TARGETING_CONFIG.minProbFloor, PASS_TARGETING_CONFIG.minProbFloorCount);

  let idx;
  if (Math.random() < tuning.epsilon) {
    const top = pickTopKIndexes(probs, Math.min(tuning.topK, probs.length));
    idx = top[Math.floor(Math.random() * top.length)];
  } else {
    const items = parts.map((_, i) => i);
    idx = randomChoiceWeighted(items, probs);
  }

  const teammatesFiltered = teammates.filter(
    t => t && t.id !== passer.id && String(t.positionGroup).toUpperCase() !== 'TOR'
  );
  const chosen = teammatesFiltered[idx] ?? teammatesFiltered[0];

  const debug = {
    isKeeper,
    useKeeperLongBallBias,
    candidates: parts.map((p, i) => ({ ...p, prob: probs[i] })),
  };

  return { target: chosen, debug };
}

export function applyTouchState(gameMeta, passerId, receiverId) {
  if (!gameMeta) return;
  if (!gameMeta.consecutiveTouches) gameMeta.consecutiveTouches = {};
  gameMeta.consecutiveTouches[receiverId] = (gameMeta.consecutiveTouches[receiverId] || 0) + 1;
  if (typeof passerId === 'string' && passerId.length > 0) {
    gameMeta.consecutiveTouches[passerId] = 0;
  }
  gameMeta.lastPassFrom = passerId;
  gameMeta.lastReceiver = receiverId;
}
