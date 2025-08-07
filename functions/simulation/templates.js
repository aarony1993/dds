// src/simulation/templates.js

/*************************************************
 * Text-Vorlagen für Ereignisbeschreibungen
 *************************************************/
export const templates = {
  kickoff: [
    "{minute}' – Anstoß für {team}. {attacker} startet das Spiel.",
    "{minute}' – {team} übernimmt per Anstoß. {attacker} legt los.",
    "{minute}' – Spielbeginn für {team}, {attacker} führt den Anstoß aus."
  ],
  pass: [
    "{minute}' – {attacker} spielt einen präzisen Pass zu {target}.",
    "{minute}' – {attacker} steckt den Ball auf {target} durch.",
    "{minute}' – Feiner Pass von {attacker} auf {target}."
  ],
  pass_intercept: [
    "{minute}' – {defender} fängt den Pass von {attacker} ab!"
  ],
  dribble: [
    "{minute}' – {attacker} setzt sich im Dribbling durch.",
    "{minute}' – Gelungener Dribbling-Versuch von {attacker}.",
    "{minute}' – {attacker} tanzt mit dem Ball am Fuß."
  ],
  dribble_lost: [
    "{minute}' – {defender} nimmt {attacker} den Ball im Dribbling ab!"
  ],
  killerPass: [
    "{minute}' – Tödlicher Pass von {attacker} auf {target} – Großchance!",
    "{minute}' – {attacker} spielt den tödlichen Pass zu {target}."
  ],
  killerPass_fail: [
    "{minute}' – {defender} unterbindet den Killerpass von {attacker}!"
  ],
  duel_win: [
    "{minute}' – {attacker} gewinnt den Zweikampf gegen {defender}.",
    "{minute}' – Starker Zweikampf von {attacker} gegen {defender}."
  ],
  duel_loss: [
    "{minute}' – {defender} setzt sich im Zweikampf gegen {attacker} durch."
  ],
  shoot: [
    "{minute}' – {attacker} zieht aus der Distanz ab.",
    "{minute}' – Schussversuch von {attacker} aufs Tor."
  ],
  header: [
    "{minute}' – {attacker} setzt zum Kopfball an!"
  ],
  goal: [
    "{minute}' – TOOOOR! {attacker} trifft gegen {goalkeeper}.",
    "{minute}' – Jubel! {attacker} überwindet {goalkeeper}."
  ],
  save: [
    "{minute}' – {goalkeeper} pariert gegen {attacker}.",
    "{minute}' – Glanzparade von {goalkeeper} gegen {attacker}."
  ],
  foul: [
    "{minute}' – Foul an {attacker}. Freistoß für {team}.",
    "{minute}' – {attacker} wird gefoult – Freistoß für {team}."
  ],
  freekick: [
    "{minute}' – Freistoß von {attacker}.",
    "{minute}' – {attacker} tritt den Freistoß."
  ],
  freekick_saved: [
    "{minute}' – Freistoß von {attacker} – {goalkeeper} hält!"
  ]
};
