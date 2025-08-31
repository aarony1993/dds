// functions/simulation/constants.js

export const POSITIONAL_BONUSES = {
  SHOOT: { ST: 15, MS: 15, HS: 12, ZOM: 8, RA: 5, LA: 5 },
  PASS: { ZM: 15, ZOM: 12, ZDM: 10, IV: 5 },
  CROSS: { LV: 15, RV: 15, LM: 12, RM: 12, LA: 10, RA: 10 },
  THROUGH_BALL: { ZOM: 15, ZM: 12, ST: 8 },
  LONG_BALL: { IV: 15, ZDM: 12, TW: 10 },
  DRIBBLE: { RA: 15, LA: 15, ZOM: 12, RM: 10, LM: 10, ZM: 8 },
  TACKLE: { IV: 15, ZDM: 12, LV: 10, RV: 10, ZM: 5 },
  SAVE: { TW: 20 },
};

export const RATING_DELTAS = {
  GOAL: 2.0,
  ASSIST: 1.2,
  SHOOT_EMPTY_NET: 1.5,
  SHOOT_SAVE_GK: 0.5,

  REBOUND_WIN: 0.4,
  REBOUND_LOSE_DEF: 0.15,

  TACKLE_WIN: 0.15,
  DRIBBLE_SUCCESS: 0.1,
  DRIBBLE_FAIL: -0.1,

  SHOT_OFF_TARGET: -0.25,
  SHOOT_SAVE_PLAYER: -0.2,

  FOUL_COMMITTED: -0.3,
  FOUL_DRAWN: 0.15,

  PASS_SUCCESS: 0.01,
  PASS_FAIL: -0.03,

  THROUGH_BALL_SUCCESS: 0.4,
  THROUGH_BALL_FAIL: -0.1,

  CROSS_SUCCESS: 0.2,
  CROSS_FAIL: -0.08,
};

// --- Simulation Tuning (aus der letzten Runde) ---
export const SIM_TUNING = {
  ACTIONS_PER_MINUTE: 3,
  WEIGHT_MULT: {
    PASS: 1.4,
    DRIBBLE: 1.3,
    SHOOT: 0.75,
    THROUGH_BALL: 1.0,
    CROSS: 0.9,
  },
};

// --- Karten & Sperren ---
export const DISCIPLINE = {
  ENABLE_IN_FRIENDLIES: false,   // nur Pflichtspiele
  YELLOW_PROB: 0.22,             // Chance, dass ein Foul Gelb gibt
  STRAIGHT_RED_PROB: 0.02,       // direkte Rote
  SECOND_YELLOW_RED: true,        // Gelb-Rot
  YELLOWS_FOR_SUSPENSION: 5,      // 5× Gelb -> 1 Spiel Sperre (einfaches Modell)
  SUSPENSION_MATCHES_RED: 2,      // direkte Rote -> 2 Spiele
  SUSPENSION_MATCHES_SECOND_YELLOW: 1, // Gelb-Rot -> 1 Spiel
};

// --- Verletzungen ---
export const INJURIES = {
  ENABLE_IN_FRIENDLIES: false,    // nur Pflichtspiele
  GK_IMMUNE: true,                // Torhüter verletzen sich nie
  FROM_FOUL_PROB: 0.10,           // Verletzungschance für Gefoulten
  FROM_DUEL_LOSS_PROB: 0.04,      // Verletzung nach verlorenem Zweikampf
  BENCH_SUBS_MAX: 5,              // Max. Wechsel (für Auto-Wechsel bei Verletzung)
  // Dauer in Spielen (diskrete Verteilung)
  DURATION_BUCKETS: [1, 2, 3, 4, 6],
  DURATION_WEIGHTS: [0.40, 0.30, 0.15, 0.10, 0.05],
};
