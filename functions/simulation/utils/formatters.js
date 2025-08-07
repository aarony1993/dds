// functions/simulation/utils/formatters.js

const { templates } = require('../templates');

/**
 * Gibt den angezeigten Spielernamen zurück.
 */
function formatName(p) {
  if (!p) return "Unbekannt";
  if (p.name) return p.name;
  const first = p.firstName || p.vorname || "";
  const last  = p.lastName  || p.nachname  || "";
  return `${first} ${last}`.trim() || "Unbekannt";
}

/**
 * Gibt die Spieler-ID (für Referenzen) zurück, sonst null.
 */
function safePlayerRef(p) {
  return p && p.id ? p.id : null;
}

/**
 * Generiert eine Ereignisbeschreibung aus Templates.
 */
function describe(type, data) {
  const arr = templates[type];
  if (!arr) return "";
  let txt = arr[Math.floor(Math.random() * arr.length)];
  Object.entries(data || {}).forEach(([k,v]) => {
    txt = txt.replace(new RegExp(`\\{${k}\\}`, 'g'), v || "");
  });
  return txt;
}

module.exports = { formatName, safePlayerRef, describe };
