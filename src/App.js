import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link as RouterLink, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { db } from './firebase/config';
import { collection, query, where, onSnapshot, getDocs, limit } from 'firebase/firestore';

// Page- und Component-Imports (alle deine Seiten bleiben erhalten)
import LoginPage from './pages/LoginPage';
import TeamPage from './pages/TeamPage';
import Taktikboard from './pages/Taktikboard';
import GamePage from './pages/GamePage';
import AdminRoute from './components/AdminRoute';
import AdminPlayersPage from './pages/AdminPlayersPage';
import AdminTransfersPage from './pages/AdminTransfersPage';
import TransfermarktPage from './pages/TransfermarktPage';
import ChallengePage from './pages/ChallengePage';
import MatchHistoryPage from './pages/MatchHistoryPage';
import MatchResultPage from './pages/MatchResultPage';

// DDS Styling-Imports
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AppBar, Toolbar, Typography, Container, Box, Button, Badge } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { de } from 'date-fns/locale';
import theme from './theme';

// Deine Navbar-Komponente (unverändert)
function Navbar() {
  const { user, isAdmin } = useAuth(); // Annahme: useAuth liefert auch 'isAdmin'
  const [liveGameId, setLiveGameId] = useState(null);
  const [teamId, setTeamId] = useState(null);

  useEffect(() => {
    if (!user) return;
    // Annahme: Die teamId ist jetzt direkt im user-Objekt dank unserem neuen AuthContext
    if (user.teamId) {
       setTeamId(user.teamId);
    }
  }, [user]);

  useEffect(() => {
    if (!teamId) return;
    const gamesQuery = query(
      collection(db, "games"),
      where("status", "==", "live"),
      where("teamIds", "array-contains", teamId)
    );
    const unsubscribe = onSnapshot(gamesQuery, (snapshot) => {
      if (!snapshot.empty) {
        setLiveGameId(snapshot.docs[0].id);
      } else {
        setLiveGameId(null);
      }
    });
    return () => unsubscribe();
  }, [teamId]);

  return (
    <AppBar position="static" elevation={0} sx={{ mb: 4, bgcolor: "background.paper", borderBottom: "2px solid", borderColor: "primary.main" }}>
      <Toolbar sx={{ minHeight: 60, px: 2 }}>
        <Typography variant="h6" component={RouterLink} to="/" sx={{ flexGrow: 1, color: "primary.main", fontWeight: 800, fontSize: 26, textDecoration: "none", letterSpacing: 1, mr: 2 }}>
          ⚽ DEADLINE DAY SIM
        </Typography>
        <Button color="inherit" component={RouterLink} to="/">Mein Kader</Button>
        <Button color="inherit" component={RouterLink} to="/historie">Historie</Button>
        <Button color="inherit" component={RouterLink} to="/taktik">Taktik</Button>
        <Button color="inherit" component={RouterLink} to="/transfermarkt">Transfermarkt</Button>
        <Button color="inherit" component={RouterLink} to="/challenge">Freundschaftsspiele</Button>
        <Button component={RouterLink} to={liveGameId ? `/game/${liveGameId}` : '#'} variant="contained" color="primary" disabled={!liveGameId} sx={{ ml: 2, bgcolor: "primary.main", color: "background.default", fontWeight: 700, '&:hover': { bgcolor: "#ffc447" } }}>
          {liveGameId && <Badge color="error" variant="dot" sx={{mr: 1}} />}
          Live Spiel
        </Button>
        {isAdmin && (
          <Box sx={{ ml: 2, borderLeft: '1px solid #465674', pl: 2 }}>
            <Button color="inherit" component={RouterLink} to="/admin/players">Admin: Spieler</Button>
            <Button color="inherit" component={RouterLink} to="/admin/transfers">Admin: Transfers</Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
}

// Die Haupt-App-Komponente, die das Routing steuert
function App() {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={de}>
        <CssBaseline />
        <AuthProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
          <ToastContainer theme="dark" autoClose={3000} hideProgressBar={false} />
        </AuthProvider>
      </LocalizationProvider>
    </ThemeProvider>
  );
}

// AppContent steuert, was basierend auf dem Login-Status angezeigt wird
function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    // Zeige eine Ladeanzeige, während der Auth-Status geprüft wird
    return <Typography sx={{textAlign: 'center', mt: 10}}>Lade...</Typography>;
  }
  
  return (
    <>
      {/* Die Navbar wird nur für eingeloggte Benutzer angezeigt */}
      {user && <Navbar />}
      <Container sx={{ pb: 6 }}>
        <Routes>
          {user ? (
            /* --- Routen für eingeloggte Benutzer --- */
            <>
              <Route path="/" element={<TeamPage />} />
              <Route path="/historie" element={<MatchHistoryPage />} />
              <Route path="/taktik" element={<Taktikboard />} />
              <Route path="/game/:gameId" element={<GamePage />} />
              <Route path="/match/:gameId" element={<MatchResultPage />} />
              <Route path="/transfermarkt" element={<TransfermarktPage />} />
              <Route path="/challenge" element={<ChallengePage />} />
              <Route path="/admin/players" element={<AdminRoute><AdminPlayersPage /></AdminRoute>} />
              <Route path="/admin/transfers" element={<AdminRoute><AdminTransfersPage /></AdminRoute>} />
              {/* Leitet eine fälschlicherweise aufgerufene Login-Seite zur Startseite um */}
              <Route path="/login" element={<Navigate to="/" replace />} /> 
              {/* Fallback für unbekannte Routen */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          ) : (
            /* --- Routen für nicht eingeloggte Benutzer --- */
            <>
              <Route path="/login" element={<LoginPage />} />
              {/* Leitet alle anderen Pfade zur Login-Seite um */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </>
          )}
        </Routes>
      </Container>
    </>
  );
}

export default App;