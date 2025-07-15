// src/pages/LoginPage.js
import React, { useState } from 'react';
import { signUp, signIn } from '../services/authService';

// NEU: MUI-Komponenten importieren
import { Button, TextField, Box, Typography, Container } from '@mui/material';

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleRegister = async (e) => {
    e.preventDefault();
    await signUp(email, password);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    await signIn(email, password);
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Typography component="h1" variant="h5">
          Login / Registrierung
        </Typography>
        <Box component="form" sx={{ mt: 1 }}>
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
          <Box sx={{ display: 'flex', gap: 2, mt: 3, mb: 2 }}>
            <Button
              type="submit"
              fullWidth
              variant="contained"
              onClick={handleLogin}
            >
              Login
            </Button>
            <Button
              type="submit"
              fullWidth
              variant="outlined"
              onClick={handleRegister}
            >
              Registrieren
            </Button>
          </Box>
        </Box>
      </Box>
    </Container>
  );
}

export default LoginPage;