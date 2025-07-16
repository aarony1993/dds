import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/config';
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Alert
} from '@mui/material';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    if (!email || !password) {
        setError('Bitte fülle beide Felder aus.');
        setLoading(false);
        return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Die Weiterleitung geschieht jetzt automatisch in App.js!
      // Wir müssen hier nichts mehr tun.
    } catch (err) {
      switch (err.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          setError('Ungültige E-Mail oder falsches Passwort.');
          break;
        case 'auth/invalid-email':
          setError('Bitte gib eine gültige E-Mail-Adresse ein.');
          break;
        default:
          setError('Ein unbekannter Fehler ist aufgetreten. Versuche es später erneut.');
          break;
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Paper 
        elevation={6}
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 4,
          bgcolor: 'background.paper'
        }}
      >
        <Typography variant="h4" component="h1" sx={{ color: 'primary.main', fontWeight: 700, mb: 1 }}>
          ⚽ DEADLINE DAY
        </Typography>
        <Typography component="h2" variant="h6" sx={{ mb: 3 }}>
          Manager-Login
        </Typography>
        
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="E-Mail-Adresse"
            name="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Passwort"
            type="password"
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <Alert severity="error" sx={{width: '100%', mt: 2}}>{error}</Alert>}
          <Button
            type="submit"
            fullWidth
            variant="contained"
            disabled={loading}
            sx={{ mt: 3, mb: 2, py: 1.5, fontWeight: 'bold' }}
          >
            {loading ? 'Logge ein...' : 'Anmelden'}
          </Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default LoginPage;