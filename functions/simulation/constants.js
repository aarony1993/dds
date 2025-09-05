// ESM
export const ZONES = {
  HOME_DEF: 'HOME_DEFENSE',
  HOME_MID: 'HOME_MIDFIELD',
  AWAY_MID: 'AWAY_MIDFIELD',
  AWAY_ATT: 'AWAY_ATTACK',
};

export const ENGINE = {
  MAX_MINUTE: 96,         // inkl. Nachspielzeit
  TICK_MINUTE_STEP: 1,
  START_ZONE: ZONES.HOME_MID,
};

export const ACTION_BASES = {
  PASS: 0.82,
  DRIBBLE: 0.68,
  SHOOT_ON_TARGET: 0.62,
  SAVE: 0.55,
  THROUGH_BALL: 0.50,
  CROSS: 0.60,
  REBOUND_WIN: 0.50,
};

export const RATING_DELTAS = {
  PASS_SUCCESS: +0.15,
  PASS_FAIL: -0.10,
  DRIBBLE_SUCCESS: +0.20,
  DRIBBLE_FAIL: -0.12,
  TACKLE_WIN: +0.15,
  GOAL: +0.90,
  ASSIST: +0.50,
  SHOOT_SAVE_GK: +0.35,
  SHOOT_SAVE_PLAYER: -0.05,
  SHOT_OFF_TARGET: -0.10,
  SHOOT_EMPTY_NET: +0.80,
  FOUL_COMMITTED: -0.10,
  FOUL_DRAWN: +0.10,
  REBOUND_WIN: +0.15,
  REBOUND_LOSE_DEF: +0.05,
  CROSS_SUCCESS: +0.20,
  CROSS_FAIL: -0.08,
  THROUGH_BALL_SUCCESS: +0.30,
  THROUGH_BALL_FAIL: -0.10,
};

export const DISCIPLINE = {
  ENABLE_IN_FRIENDLIES: false,
  YELLOW_PROB: 0.18,              // Basiswahrscheinlichkeit bei Foul
  STRAIGHT_RED_PROB: 0.02,
  SECOND_YELLOW_RED: true,
  SUSPENSION_MATCHES_RED: 2,
  SUSPENSION_MATCHES_SECOND_YELLOW: 1,
  YELLOW_ACC_THRESHOLD: 5,        // Beispiel: 5 Gelbe => 1 Spiel Sperre
};

export const INJURIES = {
  ENABLE_IN_FRIENDLIES: false,
  FROM_FOUL_PROB: 0.10,
  FROM_DUEL_LOSS_PROB: 0.035,
  DURATION_BUCKETS: [1, 2, 3, 4],       // Matches out
  DURATION_WEIGHTS: [0.50, 0.30, 0.15, 0.05],
  GK_IMMUNE: true,                      // Keeper nicht verletzen/sperren? -> keine Verletzung
};

// Positionsgruppen
export const POS_GROUPS = {
  TOR: ['TW'],
  DEF: ['IV', 'LV', 'RV'],
  MID: ['ZDM', 'ZM', 'LM', 'RM', 'ZOM'],
  ATT: ['HS', 'ST', 'MS', 'LA', 'RA'],
};

export const CROSSERS = new Set(['LA','RA','LM','RM','LV','RV']); // nur diese dürfen flanken
