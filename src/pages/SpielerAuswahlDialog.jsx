import React from 'react';
import Dialog from '@mui/material/Dialog';
import { List, ListItem, ListItemText, Avatar, Typography } from '@mui/material';

const slotPositionMap = {
  TOR: ['TOR'],
  LV: ['DEF'], RV: ['DEF'], IV: ['DEF'],
  LM: ['MID'], RM: ['MID'], ZM: ['MID'], DM: ['MID'], OM: ['MID'],
  ST: ['ATT'], MS: ['ATT']
};

const positionLabels = {
  TOR: "Torwart",
  DEF: "Abwehr",
  MID: "Mittelfeld",
  ATT: "Sturm"
};

export default function SpielerAuswahlDialog({ offen, slot, alleSpieler, onClose, onSelect }) {
  const erlaubte = slotPositionMap[slot] || [];
  const passendeSpieler = alleSpieler.filter(sp => erlaubte.includes(sp.position));

  return (
    <Dialog open={offen} onClose={onClose}>
      <div style={{padding: 24, minWidth: 320, background: "#222"}}>
        <Typography variant="h6" gutterBottom>Spieler auswählen ({slot})</Typography>
        {passendeSpieler.length === 0 && (
          <Typography variant="body2" color="error">
            Keine passenden Spieler verfügbar.
          </Typography>
        )}
        <List>
          {passendeSpieler.map(sp => (
            <ListItem button key={sp.id} onClick={() => onSelect(sp)}>
              <Avatar src={sp.photoUrl} sx={{mr:2}}/>
              <ListItemText 
                primary={<b>{sp.name}</b>}
                secondary={`Position: ${positionLabels[sp.position] || sp.position} | Stärke: ${sp.strength}`}
              />
            </ListItem>
          ))}
        </List>
      </div>
    </Dialog>
  );
}
