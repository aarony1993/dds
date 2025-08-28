// functions/simulation/season.js
// ESM, Node 20+/22. index.js initialisiert admin bereits.
// Diese Datei exportiert:
//  - generateSeasonFixtures(teams, rounds)
//  - createSeason (Callable): erzeugt Saison + Spiele + Tabelle.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import admin from "firebase-admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";

// -----------------------------
// Helpers
// -----------------------------

/**
 * Fisher-Yates Shuffle (in-place)
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * "Circle method" für Round-Robin bei gerader Teamanzahl
 * @param {string[]} teams - Liste der Team-IDs (gerade Anzahl)
 * @returns {Array<Array<[homeId, awayId]>>} - Spieltage (Array) mit Paarungen (Array)
 */
function roundRobinPairings(teams) {
  const n = teams.length;
  if (n % 2 !== 0) throw new Error("Teams müssen eine gerade Anzahl sein.");

  // Berger-Tabelle: Fixiere erstes Team, rotiere den Rest
  const fixed = teams[0];
  const rest = teams.slice(1);
  const rounds = n - 1; // Hinrunde
  const matchdays = [];

  for (let r = 0; r < rounds; r++) {
    // Paarungen pro Spieltag
    const pairs = [];

    // Team 1 (fixed) gegen rest[0]
    const t2 = rest[0];
    // In der klassischen Variante alterniert Heim/Auswärts pro Spieltag;
    // Wir machen eine einfache, später ausgewogen (via balanced home/away in Rückrunde).
    pairs.push([fixed, t2]);

    // Übrige Paare
    for (let i = 1; i < rest.length / 2 + 1; i++) {
      const a = rest[i];
      const b = rest[rest.length - i];
      pairs.push([a, b]);
    }

    matchdays.push(pairs);

    // Rotation: letztes Element nach vorne schieben
    rest.unshift(rest.pop());
  }

  return matchdays;
}

/**
 * Erzeugt Fixtureliste für Hin- & Rückrunde (rounds = 2).
 * @param {string[]} teamIds
 * @param {number} rounds
 * @returns {Array<{matchday:number, round:number, homeId:string, awayId:string}>}
 */
export function generateSeasonFixtures(teamIds, rounds = 2) {
  if (!Array.isArray(teamIds) || teamIds.length < 2) {
    throw new Error("teamIds benötigt mindestens 2 Teams.");
  }
  if (teamIds.length % 2 !== 0) {
    throw new Error("teamIds muss eine gerade Anzahl enthalten (z. B. 18).");
  }
  if (rounds < 1) rounds = 1;

  const hin = roundRobinPairings(teamIds); // Array Spieltage, jede mit Paaren [home, away]
  const fixtures = [];

  // Hinrunde
  hin.forEach((pairs, idx) => {
    const matchday = idx + 1;
    for (const [homeId, awayId] of pairs) {
      fixtures.push({ matchday, round: 1, homeId, awayId });
    }
  });

  // Rückrunde: spiegeln/tauschen Heim/Auswärts
  for (let r = 2; r <= rounds; r++) {
    hin.forEach((pairs, idx) => {
      const matchday = (hin.length * (r - 1)) + (idx + 1);
      for (const [homeId, awayId] of pairs) {
        fixtures.push({ matchday, round: r, homeId: awayId, awayId: homeId });
      }
    });
  }

  return fixtures;
}

/**
 * "yyyy-mm-dd" Key aus Date
 */
function dayKey(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Nächstes gültiges Matchday-Datum berechnen (mit blackout-Unterstützung)
 * @param {Date} date
 * @param {number} daysStep
 * @param {Set<string>} blackoutKeys - Menge von "yyyy-mm-dd"
 * @returns {Date}
 */
function nextMatchdayDate(date, daysStep, blackoutKeys) {
  let d = new Date(date.getTime());
  while (true) {
    const key = dayKey(d);
    if (!blackoutKeys.has(key)) return d;
    d = new Date(d.getTime() + daysStep * 24 * 60 * 60 * 1000);
  }
}

/**
 * "HH:mm" -> {hours, minutes}
 */
function parseHHmm(hhmm) {
  if (typeof hhmm !== "string") return { hours: 15, minutes: 30 };
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return {
    hours: Number.isFinite(h) ? h : 15,
    minutes: Number.isFinite(m) ? m : 30,
  };
}

/**
 * Setzt Stunden/Minuten auf einem Date und liefert Millis
 */
function withTime(date, hhmm) {
  const { hours, minutes } = parseHHmm(hhmm);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
  return d.getTime();
}

// -----------------------------
// Callable: createSeason
// -----------------------------

/**
 * Request-Format:
 * {
 *   leagueId: string,              // z.B. "BL", "PL", ...
 *   seasonLabel: string,           // "2025/26"
 *   teamIds: string[],             // 18 Team-IDs (gerade Anzahl)
 *   options?: {
 *     startDateMillis?: number,    // default: nächster Samstag 15:30
 *     rounds?: number,             // default: 2 (Hin+Rück)
 *     matchdaysPerWeek?: number,   // default: 1
 *     kickoffTimes?: string[],     // default: ["15:30"]
 *     shuffleTeams?: boolean,      // default: true
 *     blackoutDates?: number[],    // Timestamps (0 Uhr) die ausgelassen werden
 *     seasonStatus?: "planned"|"running"|"finished" // default: "planned"
 *   }
 * }
 */
export const createSeason = onCall(
  { region: "europe-west3", timeoutSeconds: 540 },
  async (req) => {
    const db = admin.firestore();

    const {
      leagueId,
      seasonLabel,
      teamIds: rawTeamIds,
      options = {},
    } = req.data || {};

    if (!leagueId) throw new HttpsError("invalid-argument", "leagueId fehlt");
    if (!seasonLabel) throw new HttpsError("invalid-argument", "seasonLabel fehlt");
    if (!Array.isArray(rawTeamIds) || rawTeamIds.length < 2)
      throw new HttpsError("invalid-argument", "teamIds müssen mindestens 2 Einträge enthalten.");
    if (rawTeamIds.length % 2 !== 0)
      throw new HttpsError("invalid-argument", "teamIds muss eine gerade Anzahl enthalten (z. B. 18).");

    // Options mit Defaults
    const {
      startDateMillis,
      rounds = 2,
      matchdaysPerWeek = 1,
      kickoffTimes = ["15:30"],
      shuffleTeams = true,
      blackoutDates = [],
      seasonStatus = "planned",
    } = options;

    // Teams validieren
    const uniqueTeams = Array.from(new Set(rawTeamIds));
    if (uniqueTeams.length !== rawTeamIds.length) {
      throw new HttpsError("invalid-argument", "teamIds enthalten Duplikate.");
    }

    // Teamliste ggf. mischen (nur Reihenfolge für die Berger-Tabelle)
    const teamOrder = shuffleTeams ? shuffle(uniqueTeams) : uniqueTeams.slice();

    // Fixtures erzeugen
    const fixtures = generateSeasonFixtures(teamOrder, rounds);
    const matchdayCount = (teamOrder.length - 1) * rounds; // z. B. 17 * 2 = 34

    // Startdatum bestimmen (Standard: nächster Samstag 15:30)
    let firstDate;
    if (Number.isFinite(startDateMillis)) {
      firstDate = new Date(startDateMillis);
    } else {
      const now = new Date();
      const day = now.getDay(); // 0=So, 6=Sa
      const daysUntilSat = (6 - day + 7) % 7 || 7; // mindestens +1 Woche, falls heute Sa
      firstDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSat);
    }

    const slots = Array.isArray(kickoffTimes) && kickoffTimes.length > 0 ? kickoffTimes : ["15:30"];
    const daysStep = Math.max(1, Math.floor(7 / Math.max(1, matchdaysPerWeek))); // grob verteilen
    const blackoutKeys = new Set(
      (blackoutDates || [])
        .filter((x) => Number.isFinite(x))
        .map((ms) => dayKey(new Date(ms)))
    );

    // Saison-Dokument anlegen
    const seasonRef = db.collection("seasons").doc();
    const seasonId = seasonRef.id;
    const seasonDoc = {
      leagueId,
      seasonLabel,
      status: seasonStatus, // "planned" | "running" | "finished"
      rounds,
      teamCount: uniqueTeams.length,
      options: {
        matchdaysPerWeek,
        kickoffTimes: slots,
        shuffleTeams,
      },
      createdAt: FieldValue.serverTimestamp(),
    };

    // Tabelle vorbereiten (0-Werte)
    const tableDocs = uniqueTeams.map((tid) => ({
      ref: seasonRef.collection("table").doc(tid),
      data: {
        teamId: tid,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
        points: 0,
        updatedAt: FieldValue.serverTimestamp(),
      },
    }));

    // Spiele anlegen: pro Spieltag Datum + Slots
    const games = [];
    let currentMatchdayDate = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate(), 0, 0, 0, 0);

    for (let md = 1; md <= matchdayCount; md++) {
      // Nächstes erlaubtes Datum (Blackout beachten)
      if (md === 1) {
        currentMatchdayDate = nextMatchdayDate(currentMatchdayDate, daysStep, blackoutKeys);
      } else {
        const nextDate = new Date(currentMatchdayDate.getTime() + daysStep * 24 * 60 * 60 * 1000);
        currentMatchdayDate = nextMatchdayDate(nextDate, daysStep, blackoutKeys);
      }

      // Fixtures dieses Spieltages
      const mdFixtures = fixtures.filter((f) => f.matchday === md);
      // Slots zuweisen
      mdFixtures.forEach((f, idx) => {
        const slot = slots[idx % slots.length];
        const kickoffMillis = withTime(currentMatchdayDate, slot);
        games.push({
          matchday: md,
          round: f.round,
          teamHomeId: f.homeId,
          teamAwayId: f.awayId,
          teamIds: [f.homeId, f.awayId],
          leagueId,
          seasonId,
          type: "LEAGUE",
          simulationMode: "batch",
          status: "scheduled",
          scheduledStartTime: Timestamp.fromMillis(kickoffMillis),
          createdAt: FieldValue.serverTimestamp(),
        });
      });
    }

    // Firestore Write (alles in EINEM Batch; 306 Spiele + 18 Tabellendocs + 1 Season = 325)
    const batch = db.batch();
    batch.set(seasonRef, seasonDoc);
    tableDocs.forEach((t) => batch.set(t.ref, t.data));
    games.forEach((g) => {
      const gameRef = db.collection("games").doc();
      batch.set(gameRef, g);
    });

    await batch.commit();

    return {
      ok: true,
      seasonId,
      leagueId,
      seasonLabel,
      matchdays: matchdayCount,
      gameCount: games.length,
      teamCount: uniqueTeams.length,
    };
  }
);
