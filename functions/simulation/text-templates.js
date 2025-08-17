export const TEXT_TEMPLATES = {
  // --- POSITIVE AKTIONEN ---
  PASS_SUCCESS: [
    "{player} spielt einen sauberen Pass zu {recipient}.",
    "{player} mit einem präzisen Zuspiel auf {recipient}.",
    "Der Ball kommt sicher bei {recipient} an, gespielt von {player}.",
    "Kurzpass von {player} auf {recipient}.",
  ],
  DRIBBLE_SUCCESS: [
    "{player} dribbelt erfolgreich an {opponent} vorbei!",
    "{player} lässt {opponent} mit einer Körpertäuschung stehen.",
    "Starkes Dribbling von {player}, {opponent} hat das Nachsehen.",
  ],
  SHOOT_SAVE: [
    "{player} zieht ab, aber {opponent} pariert glänzend!",
    "Riesenchance für {player}, doch {opponent} hält den Ball sicher!",
    "Ein guter Schuss von {player}, aber eine noch bessere Parade von {opponent}!",
  ],
  GOAL: [
    "TOR!!! {player} hämmert den Ball unhaltbar ins Netz!",
    "Ein fantastischer Treffer von {player}!",
    "{player} überwindet {opponent} mit einem platzierten Schuss!",
  ],
  ASSIST: ["Die Vorlage kam von {player}!"],

  // --- NEGATIVE AKTIONEN ---
  PASS_FAIL: [
    "Fehlpass von {player}! {opponent} fängt den Ball ab.",
    "Ungenaues Zuspiel von {player}, {opponent} ist dazwischen.",
    "Missverständnis im Aufbau, {opponent} schnappt sich den Ball von {player}.",
  ],
  TACKLE_WIN: [
    "{opponent} stoppt {player} in einem fairen Zweikampf!",
    "{player} verliert den Ball im Duell mit {opponent}.",
    "Starke Defensivaktion von {opponent} gegen {player}.",
  ],
  FOUL: ["Foul von {player} an {opponent}! Es gibt Freistoß."],
  
  // FINAL KORRIGIERT: Bessere Texte für Schüsse, die daneben gehen.
  SHOT_OFF_TARGET: [
    "Der Schuss von {player} geht am Tor vorbei. Abstoß für {opponent}.",
    "{player} verzieht, der Ball segelt über die Latte. Abstoß für {opponent}.",
    "Chance vertan! {player} schießt aus guter Position daneben. Abstoß für {opponent}.",
  ],

  // --- SPEZIALPÄSSE & FLANKEN ---
  CROSS_SUCCESS: ["Gute Flanke von {player} in die Mitte, wo {recipient} wartet!"],
  CROSS_FAIL: ["Die Flanke von {player} wird von {opponent} geblockt."],
  THROUGH_BALL_SUCCESS: ["Tödlicher Pass von {player}! {recipient} ist durch!"],
  THROUGH_BALL_FAIL: ["Der Steilpass von {player} ist zu lang und landet bei {opponent}."],

  // --- SONDERSITUATIONEN ---
  REBOUND_SCRAMBLE: ["Abpraller! Der Ball ist frei im Strafraum..."],
  REBOUND_WIN: ["{player} reagiert am schnellsten und kommt zum Nachschuss!"],
  REBOUND_LOSE: ["{opponent} ist zur Stelle und klärt die brenzlige Situation!"],
  
  DEFAULT: ["{player} führt den Ball im Mittelfeld."], // Besserer Standardtext
};