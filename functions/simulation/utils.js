import { POSITIONAL_BONUSES } from './constants.js';

export const getPlayerById = (players, id) => players.find(p => p.id === id);

export const getPositionalBonus = (action, position) => {
    const posKey = (position || '').replace(/[0-9]/g, "");
    return POSITIONAL_BONUSES[action]?.[posKey] || 0;
};

/**
 * FINAL KORRIGIERT: Der Einfluss der Stärke wird reduziert, um den Zufall zu erhöhen.
 */
export const calculateSuccess = (skillA, skillB, baseChance = 0.5) => {
  const skillDifference = skillA - skillB;
  
  // KORREKTUR: Der Einfluss wird halbiert (von 100 auf 200).
  const advantage = skillDifference / 200; 
  const successChance = baseChance + advantage;

  const clampedChance = Math.max(0.05, Math.min(0.95, successChance));
  return Math.random() < clampedChance;
};

export const getOpponent = (player, state) => {
  const justBeatenPlayerId = state.ball.context?.justBeatenPlayerId;
  const playerLineup = player.teamId === state.homeTeam.id ? state.homeLineup : state.awayLineup;
  const playerPosInfo = playerLineup.find(p => p.playerId === player.id);
  const playerPosition = playerPosInfo?.position || '';
  const opponentTeamId = player.teamId === state.homeTeam.id ? state.awayTeam.id : state.homeTeam.id;
  const opponentLineup = player.teamId === state.homeTeam.id ? state.awayLineup : state.homeLineup;

  const directOpponentMap = {
    'ST': ['IV'], 'LA': ['RV'], 'RA': ['LV'], 'ZOM': ['ZDM'], 'ZM': ['ZM', 'ZDM'],
    'ZDM': ['ZOM', 'ZM'], 'LV': ['RA', 'RM'], 'RV': ['LA', 'LM'], 'IV': ['ST', 'MS', 'HS'],
  };
  let opponentCandidates = [];
  const opponentPositions = directOpponentMap[playerPosition] || [];

  if (opponentPositions.length > 0) {
    opponentCandidates = opponentLineup
      .filter(p => opponentPositions.includes(p.position) && p.playerId !== justBeatenPlayerId)
      .map(p => getPlayerById(state.players, p.playerId))
      .filter(Boolean);
  }
  if (opponentCandidates.length === 0) {
    const playerGroup = positionKeyToGroup(playerPosition);
    const opponentGroupMap = { 'ATT': 'DEF', 'MID': 'MID', 'DEF': 'ATT' };
    const targetGroup = opponentGroupMap[playerGroup];
    opponentCandidates = state.players.filter(p => p.teamId === opponentTeamId && p.positionGroup === targetGroup && p.id !== justBeatenPlayerId);
  }
  if (opponentCandidates.length === 0) {
    opponentCandidates = state.players.filter(p => p.teamId === opponentTeamId && p.position !== 'TW' && p.id !== justBeatenPlayerId);
  }
  if (opponentCandidates.length === 0) {
      return state.players.find(p => p.teamId === opponentTeamId) || { id: 'unknown', nachname: 'Gegner' };
  }
  return opponentCandidates[Math.floor(Math.random() * opponentCandidates.length)];
};

export const getTeamPlayer = (teamId, players, selfId) => {
    const teammates = players.filter(p => p.teamId === teamId && p.id !== selfId);
    if (teammates.length === 0) return null;
    return teammates[Math.floor(Math.random() * teammates.length)];
};

export const findBestPassRecipient = (playerInPossession, state) => {
    const lineup = playerInPossession.teamId === state.homeTeam.id ? state.homeLineup : state.awayLineup;
    const teammates = state.players.filter(p => p.teamId === playerInPossession.teamId && p.id !== playerInPossession.id);
    const playerPosInfo = lineup.find(p => p.playerId === playerInPossession.id);
    const playerGroup = positionKeyToGroup(playerPosInfo?.position);

    const potentialRecipients = [];

    teammates.forEach(teammate => {
        const teammatePosInfo = lineup.find(p => p.playerId === teammate.id);
        if (!teammatePosInfo) return;
        
        const teammateGroup = positionKeyToGroup(teammatePosInfo.position);
        const teammatePosition = teammatePosInfo.position;
        let weight = 1;

        // --- TAKTISCHE PASS-GEWICHTUNG ---
        switch (playerGroup) {
            case 'DEF':
                // Verteidiger suchen den Aufbau über das Zentrum oder die Außenverteidiger
                if (teammateGroup === 'MID') weight = 10;
                if (['LV', 'RV'].includes(teammatePosition)) weight = 8; // Hohe Prio für AVs
                if (teammateGroup === 'ATT') weight = 1; 
                break;
            case 'MID':
                // Mittelfeldspieler verteilen die Bälle
                if (teammateGroup === 'ATT') weight = 10; // Pass in die Spitze
                if (['LM', 'RM', 'LA', 'RA'].includes(teammatePosition)) weight = 8; // Spielverlagerung auf den Flügel
                if (teammateGroup === 'MID') weight = 5;
                if (teammateGroup === 'DEF') weight = 2;
                break;
            case 'ATT':
                // Stürmer suchen den Abschluss oder lassen auf die Flügel/ins Mittelfeld klatschen
                if (teammateGroup === 'ATT') weight = 8;
                if (['LA', 'RA', 'ZOM'].includes(teammatePosition)) weight = 6;
                if (teammateGroup === 'MID') weight = 3;
                break;
        }
        
        for (let i = 0; i < weight; i++) {
            potentialRecipients.push(teammate);
        }
    });

    if (potentialRecipients.length === 0) {
        return getTeamPlayer(playerInPossession.teamId, state.players, playerInPossession.id);
    }

    return potentialRecipients[Math.floor(Math.random() * potentialRecipients.length)];
};

export function applyRatingDelta(ratings, playerId, delta) {
  if (!ratings || ratings[playerId] === undefined) {
    console.warn(`Konnte Rating für Spieler ${playerId} nicht anwenden.`);
    return;
  }
  const currentRating = ratings[playerId];
  const newRating = currentRating + delta;
  ratings[playerId] = Math.max(1.0, Math.min(10.0, newRating));
}

function positionKeyToGroup(posKey) {
    if (!posKey) return '';
    if (['TW'].includes(posKey)) return 'TOR';
    if (['IV', 'LV', 'RV'].includes(posKey)) return 'DEF';
    if (['ZM', 'ZOM', 'ZDM', 'LM', 'RM'].includes(posKey)) return 'MID';
    if (['ST', 'HS', 'MS', 'LA', 'RA'].includes(posKey)) return 'ATT';
    return '';
}