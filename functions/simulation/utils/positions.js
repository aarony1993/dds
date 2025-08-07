// functions/simulation/utils/positions.js

const { positionActionModifiers, groupToDefaultDetail } = require("../constants");

/**
 * Entfernt Ziffern am Ende der Positionsbezeichnung (z. B. "IV1" → "IV").
 */
function normalizePosition(pos) {
  return typeof pos === "string" ? pos.replace(/\d+$/, "") : pos;
}

/**
 * Gibt den passenden Aktionsmodifikator zur Position zurück.
 */
function getMod(p, act) {
  if (!p || !p.position) return 1;
  const mods = positionActionModifiers[normalizePosition(p.position)];
  if (!Array.isArray(mods)) return 1;
  switch (act) {
    case "tackle":  return mods[0];
    case "pass":    return mods[1];
    case "dribble": return mods[2];
    case "shot":    return mods[3];
    default:        return 1;
  }
}

/**
 * Weist jedem Spieler im Kader eine Detailposition zu.
 * Bei lineup = Objekt: detail → ID. Bei lineup = Array: Reihenfolge oder Standard.
 */
function assignDetail(players, lineup) {
  if (lineup) {
    // lineup ist Array von IDs oder Objekt detail→ID
    const ids = Array.isArray(lineup) ? lineup : Object.values(lineup);
    return ids
      .map(id => {
        const pl = players.find(p => p.id === id);
        if (!pl) return null;
        const det = !Array.isArray(lineup)
          ? Object.keys(lineup).find(k => lineup[k] === id)
          : null;
        return {
          ...pl,
          position: normalizePosition(det || pl.position)
        };
      })
      .filter(Boolean);
  }
  // Fallback: Standardposition nach PositionGroup
  return players.map(p => ({
    ...p,
    position: normalizePosition(groupToDefaultDetail[p.positionGroup] || "IV")
  }));
}

module.exports = { normalizePosition, getMod, assignDetail };
