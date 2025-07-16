import React, { useState } from 'react';
import {
  Container, Box, Typography, TextField, Button, Paper, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Link
} from '@mui/material';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, updateProfile, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const LoginPage = () => {
  // Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginNotice, setLoginNotice] = useState('');
  const [loading, setLoading] = useState(false);

  // Registration
  const [registerOpen, setRegisterOpen] = useState(false);
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState('');

  // Password Reset
  const [pwResetOpen, setPwResetOpen] = useState(false);
  const [pwResetEmail, setPwResetEmail] = useState('');
  const [pwResetMsg, setPwResetMsg] = useState('');
  const [pwResetError, setPwResetError] = useState('');

  // Resend Verification
  const [showResend, setShowResend] = useState(false);
  const [resendSuccess, setResendSuccess] = useState('');
  const [resendError, setResendError] = useState('');

  // Login-Handler
  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoginError('');
    setLoginNotice('');
    setLoading(true);

    if (!email || !password) {
      setLoginError('Bitte fülle beide Felder aus.');
      setLoading(false);
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      if (auth.currentUser && !auth.currentUser.emailVerified) {
        setShowResend(true);
        setLoginNotice('Deine E-Mail ist noch nicht bestätigt. Bitte bestätige deine E-Mail, um fortzufahren.');
        await signOut(auth);
        setLoading(false);
        return;
      }
      setShowResend(false);
    } catch (err) {
      setShowResend(false);
      switch (err.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          setLoginError('Ungültige E-Mail oder falsches Passwort.');
          break;
        case 'auth/invalid-email':
          setLoginError('Bitte gib eine gültige E-Mail-Adresse ein.');
          break;
        case 'auth/user-disabled':
          setLoginError('Dieser Account ist deaktiviert.');
          break;
        default:
          setLoginError('Ein unbekannter Fehler ist aufgetreten. Versuche es später erneut.');
          break;
      }
    } finally {
      setLoading(false);
    }
  };

  // Registrierung-Handler
  const handleRegister = async (event) => {
    event.preventDefault();
    setRegisterError('');
    setRegisterSuccess('');

    if (!regEmail || !regPassword || !regUsername) {
      setRegisterError('Bitte fülle alle Felder aus.');
      return;
    }

    try {
      const result = await createUserWithEmailAndPassword(auth, regEmail, regPassword);
      await updateProfile(result.user, { displayName: regUsername });
      await sendEmailVerification(result.user);

      await setDoc(doc(db, 'users', result.user.uid), {
        email: regEmail,
        username: regUsername,
        createdAt: new Date(),
        teamId: null,
        verified: false,
      });

      await signOut(auth);

      setRegisterSuccess('Registrierung erfolgreich! Bitte prüfe dein Postfach und bestätige deine E-Mail-Adresse.');
      setRegEmail('');
      setRegPassword('');
      setRegUsername('');
    } catch (err) {
      switch (err.code) {
        case 'auth/email-already-in-use':
          setRegisterError('Diese E-Mail-Adresse ist bereits registriert.');
          break;
        case 'auth/invalid-email':
          setRegisterError('Ungültige E-Mail-Adresse.');
          break;
        case 'auth/weak-password':
          setRegisterError('Das Passwort ist zu schwach (mind. 6 Zeichen).');
          break;
        default:
          setRegisterError('Ein unbekannter Fehler ist aufgetreten. Versuche es später erneut.');
          break;
      }
    }
  };

  // Passwort vergessen
  const handlePwReset = async (e) => {
    e.preventDefault();
    setPwResetMsg('');
    setPwResetError('');
    if (!pwResetEmail) {
      setPwResetError('Bitte gib deine E-Mail-Adresse ein.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, pwResetEmail);
      setPwResetMsg('E-Mail zum Zurücksetzen des Passworts wurde gesendet – prüfe dein Postfach!');
      setPwResetEmail('');
    } catch (err) {
      switch (err.code) {
        case 'auth/user-not-found':
          setPwResetError('Falls ein Account existiert, wurde die E-Mail versendet. (Kein weiterer Hinweis aus Datenschutzgründen.)');
          break;
        case 'auth/invalid-email':
          setPwResetError('Ungültige E-Mail-Adresse.');
          break;
        default:
          setPwResetError('Ein Fehler ist aufgetreten. Versuche es später erneut.');
      }
    }
  };

  // Resend Verification Mail
  const handleResendVerification = async () => {
    setResendSuccess('');
    setResendError('');
    try {
      const user = auth.currentUser;
      // Da User schon ausgeloggt wurde, erst kurz wieder einloggen:
      const result = await signInWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(result.user);
      await signOut(auth);
      setResendSuccess('Bestätigungsmail wurde erneut gesendet. Bitte prüfe dein Postfach.');
    } catch (err) {
      setResendError('Fehler beim Senden der Bestätigungsmail.');
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
          {loginError && <Alert severity="error" sx={{ width: '100%', mt: 2 }}>{loginError}</Alert>}
          {loginNotice && <Alert severity="warning" sx={{ width: '100%', mt: 2 }}>
            {loginNotice}
            {showResend && (
              <>
                <br />
                <Button variant="text" size="small" sx={{ mt: 1 }} onClick={handleResendVerification}>
                  Bestätigungsmail erneut senden
                </Button>
                {resendSuccess && <Alert severity="success" sx={{ mt: 1 }}>{resendSuccess}</Alert>}
                {resendError && <Alert severity="error" sx={{ mt: 1 }}>{resendError}</Alert>}
              </>
            )}
          </Alert>}
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
        <Box sx={{ width: '100%', textAlign: 'center', mb: 1 }}>
          <Link component="button" variant="body2" sx={{ mt: 1 }} onClick={() => setPwResetOpen(true)}>
            Passwort vergessen?
          </Link>
        </Box>
        <Button
          color="primary"
          variant="outlined"
          fullWidth
          sx={{ mt: 1 }}
          onClick={() => setRegisterOpen(true)}
        >
          Noch kein Account? Jetzt registrieren
        </Button>
      </Paper>

      {/* Passwort vergessen Dialog */}
      <Dialog open={pwResetOpen} onClose={() => { setPwResetOpen(false); setPwResetEmail(''); setPwResetMsg(''); setPwResetError(''); }}>
        <DialogTitle>Passwort zurücksetzen</DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={handlePwReset} sx={{ mt: 1 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              label="E-Mail-Adresse"
              type="email"
              value={pwResetEmail}
              onChange={(e) => setPwResetEmail(e.target.value)}
              autoFocus
            />
            {pwResetError && <Alert severity="error" sx={{ width: '100%', mt: 2 }}>{pwResetError}</Alert>}
            {pwResetMsg && <Alert severity="success" sx={{ width: '100%', mt: 2 }}>{pwResetMsg}</Alert>}
            <DialogActions sx={{ px: 0, pb: 0 }}>
              <Button onClick={() => setPwResetOpen(false)}>Abbrechen</Button>
              <Button
                variant="contained"
                type="submit"
                disabled={!!pwResetMsg}
              >
                Abschicken
              </Button>
            </DialogActions>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Registrierungs-Dialog */}
      <Dialog open={registerOpen} onClose={() => { setRegisterOpen(false); setRegisterError(''); setRegisterSuccess(''); }}>
        <DialogTitle>Registrieren</DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={handleRegister} sx={{ mt: 1 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              label="E-Mail-Adresse"
              type="email"
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
              autoFocus
            />
            <TextField
              margin="normal"
              required
              fullWidth
              label="Nutzername"
              value={regUsername}
              onChange={(e) => setRegUsername(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              label="Passwort"
              type="password"
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
            />
            {registerError && <Alert severity="error" sx={{ width: '100%', mt: 2 }}>{registerError}</Alert>}
            {registerSuccess && <Alert severity="success" sx={{ width: '100%', mt: 2 }}>{registerSuccess}</Alert>}
            <DialogActions sx={{ px: 0, pb: 0 }}>
              <Button onClick={() => setRegisterOpen(false)}>Abbrechen</Button>
              <Button
                variant="contained"
                type="submit"
                disabled={!!registerSuccess}
              >
                Registrieren
              </Button>
            </DialogActions>
          </Box>
        </DialogContent>
      </Dialog>
    </Container>
  );
};

export default LoginPage;
