// functions/simulation/text-templates.js
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
  CROSS_SUCCESS: [
    "Gute Flanke von {player} in die Mitte, wo {recipient} wartet!",
    "{player} bringt den Ball scharf herein – {recipient} lauert!",
    "Hereingabe von {player} findet {recipient} im Strafraum.",
  ],
  THROUGH_BALL_SUCCESS: [
    "Tödlicher Pass von {player}! {recipient} ist durch!",
    "{player} steckt genial auf {recipient} durch – Großchance!",
    "Kluger Steilpass von {player} auf {recipient}!",
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
  ASSIST: [
    "Die Vorlage kam von {player}!",
    "Assist von {player} – stark vorbereitet!",
    "{player} bereitet den Treffer vor!",
  ],

  // --- NEGATIVE AKTIONEN ---
  PASS_FAIL: [
    "Fehlpass von {player}! {opponent} fängt den Ball ab.",
    "Ungenaues Zuspiel von {player}, {opponent} ist dazwischen.",
    "Missverständnis im Aufbau, {opponent} schnappt sich den Ball von {player}.",
  ],
  CROSS_FAIL: [
    "Die Flanke von {player} wird von {opponent} geblockt.",
    "{player} flankt – doch {opponent} klärt.",
    "Flanke von {player} verendet – {opponent} passt auf.",
  ],
  THROUGH_BALL_FAIL: [
    "Der Steilpass von {player} ist zu lang und landet bei {opponent}.",
    "{player} versucht den Steckpass, aber {opponent} antizipiert.",
    "Idee gut, Ausführung schwach – {opponent} fängt den Pass von {player} ab.",
  ],
  TACKLE_WIN: [
    "{opponent} stoppt {player} in einem fairen Zweikampf!",
    "{player} verliert den Ball im Duell mit {opponent}.",
    "Starke Defensivaktion von {opponent} gegen {player}.",
  ],
  FOUL: [
    "Foul von {player} an {opponent}! Es gibt Freistoß.",
    "{player} bringt {opponent} zu Fall – Freistoß.",
    "Unnötiges Foul von {player} gegen {opponent}.",
  ],

  // FINAL KORRIGIERT: Bessere Texte für Schüsse, die daneben gehen.
  SHOT_OFF_TARGET: [
    "Der Schuss von {player} geht am Tor vorbei. Abstoß für {opponent}.",
    "{player} verzieht, der Ball segelt über die Latte. Abstoß für {opponent}.",
    "Chance vertan! {player} schießt aus guter Position daneben. Abstoß für {opponent}.",
  ],

  // --- STANDARD-/Sondersituationen ---
  FREE_KICK_PASS: [
    "{player} führt den Freistoß kurz aus.",
    "Clever: {player} spielt den Freistoß auf einen Mitspieler.",
  ],
  FREE_KICK_SHOOT: [
    "{player} nimmt den direkten Freistoß!",
    "{player} versucht es direkt – gefährlich!",
  ],
  KICKOFF: [
    "Anstoß – es geht weiter.",
    "Der Ball rollt wieder.",
    "Anstoß ausgeführt.",
  ],
  REBOUND_SCRAMBLE: [
    "Abpraller! Der Ball ist frei im Strafraum...",
    "Gewusel im Sechzehner – wer schnappt sich den Ball?",
  ],
  REBOUND_WIN: [
    "{player} reagiert am schnellsten und kommt zum Nachschuss!",
    "{player} setzt nach – zweite Chance!",
  ],
  REBOUND_LOSE: [
    "{opponent} ist zur Stelle und klärt die brenzlige Situation!",
    "{opponent} behauptet den Ball im Getümmel.",
  ],
  HALF_TIME: [
    "Halbzeit – kurze Verschnaufpause.",
    "Der Schiri bittet zur Halbzeit in die Kabinen.",
  ],

  // --- KARTEN & SPERREN ---
  YELLOW_CARD: [
    "Gelbe Karte für {player}.",
    "Der Schiri zeigt {player} Gelb.",
    "{player} wird verwarnt – Gelb.",
  ],
  SECOND_YELLOW_RED: [
    "Gelb-Rot! {player} muss runter.",
    "Zweite Gelbe für {player} – Platzverweis!",
    "{player} fliegt mit Gelb-Rot vom Platz.",
  ],
  RED_CARD: [
    "Rote Karte! {player} muss vom Platz.",
    "Harte Entscheidung: Platzverweis für {player}!",
    "Rot gegen {player} – Unterzahl!",
  ],

  // --- VERLETZUNGEN & Wechsel ---
  INJURY: [
    "{player} bleibt liegen – sieht nach einer Verletzung aus.",
    "{player} hat sich verletzt und kann nicht weitermachen.",
    "Aua! {player} muss behandelt werden – verletzungsbedingt raus.",
  ],
  SUBSTITUTION_INJURY: [
    "Verletzungsbedingter Wechsel bei {player}.",
    "Wechsel wegen Verletzung: {player} verlässt den Platz.",
    "Coach reagiert: {player} wird verletzt ausgewechselt.",
  ],
  INJURY_NO_SUB: [
    "{player} verletzt – kein Wechsel mehr möglich!",
    "Bitter: {player} raus, Team in Unterzahl.",
    "Verletzung bei {player}; die Bank ist leer – Unterzahl.",
  ],

  // --- FALLBACK ---
  DEFAULT: [
    "{player} führt den Ball im Mittelfeld.",
    "{player} sucht eine Anspielstation.",
    "{player} beruhigt das Spiel.",
  ],
};
