// src/simulation/constants.js

/*************************************************
 * Konfiguration / Tuning
 *************************************************/
export const LOG_RATING_EVENTS   = true;    // Hybrid: nur relevante Deltas loggen
export const ONE_EVENT_PER_TICK  = true;    // Alle Deltas eines Ticks zusammenfassen
export const RATING_BASE         = 600;     // 6.00 Start
export const RATING_MIN          = 100;     // 1.00 Minimum
export const RATING_MAX          = 1000;    // 10.00 Maximum
export const RATING_DECAY_FACTOR = 0.002;   // leichte Regression pro Tick Richtung 6.0 (0 = aus)
export const PROGRESS_BONUS_CAP  = 50;      // maximaler Bonus durch progressive Pässe

/*************************************************
 * Rating-Deltas (in Punkten, also 1 = 0.01 Note)
 *************************************************/
export const DELTAS = {
  pass_success:           2,
  pass_fail:             -3,
  progressive_pass_bonus: 1,
  dribble_win:            4,
  dribble_loss:          -4,
  duel_win:               3,
  duel_loss:             -3,
  killer_pass_success:    6,
  killer_pass_fail:      -5,
  shot_on_target:         5,
  goal:                  18,
  header_goal:           16,
  freekick_goal:         20,
  save:                   5,
  concede_goal_keeper:   -8,
  foul_drawn:             3,
  foul_committed:        -3
};

/*************************************************
 * Multiplikatoren für Detailpositionen und Aktionen
 *************************************************/
export const positionActionModifiers = {
  TW:  [1.1, 0.7, 0.3, 0.2],
  IV:  [1.3, 0.8, 0.5, 0.4],
  LV:  [1.2, 0.9, 0.7, 0.6],
  RV:  [1.2, 0.9, 0.7, 0.6],
  ZDM: [1.2, 1.1, 0.7, 0.6],
  ZM:  [1.0, 1.3, 1.1, 1.0],
  LM:  [0.9, 1.2, 1.2, 0.9],
  RM:  [0.9, 1.2, 1.2, 0.9],
  ZOM: [0.7, 1.3, 1.3, 1.1],
  HS:  [0.6, 1.0, 1.2, 1.3],
  ST:  [0.5, 0.8, 1.1, 1.4],
  MS:  [0.5, 0.7, 1.0, 1.5],
  LA:  [0.6, 0.9, 1.2, 1.3],
  RA:  [0.6, 0.9, 1.2, 1.3]
};

/*************************************************
 * Gruppenzuordnung Default-Detailposition
 *************************************************/
export const groupToDefaultDetail = {
  DEF: "IV",
  MID: "ZM",
  ATT: "ST",
  TOR: "TW"
};
