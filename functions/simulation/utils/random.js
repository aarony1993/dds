// src/simulation/utils/random.js

/**
 * Gibt ein zufälliges Element aus einem Array zurück.
 */
export function choosePlayer(arr) {
  return arr && arr.length
    ? arr[Math.floor(Math.random() * arr.length)]
    : null;
}

/**
 * Liefert eine Zufallswahrscheinlichkeit, basierend auf Stärke und Modifikatoren.
 */
export function weightedRandomChance(base, atk, def, modA, modD, spread = 0.15) {
  const ratingA = atk * modA;
  const ratingD = def * modD;
  const diff    = (ratingA - ratingD) / 70;
  const luck    = (Math.random() * 2 - 1) * spread;
  return base + diff + luck;
}
