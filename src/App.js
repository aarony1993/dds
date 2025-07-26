import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Container, Typography } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { de } from 'date-fns/locale';
import theme from './theme';

import Navbar from './components/Navbar';

import LoginPage from './pages/LoginPage';
import TeamPage from './pages/TeamPage';
import Taktikboard from './pages/Taktikboard';
import GamePage from './pages/GamePage';
import AdminPage from './pages/AdminPage';
import TransfermarktPage from './pages/TransfermarktPage';
import ChallengePage from './pages/ChallengePage';
import MatchHistoryPage from './pages/MatchHistoryPage';
import MatchResultPage from './pages/MatchResultPage';
import PendingActionsPage from './pages/PendingActionsPage';
import PlayerDetailPage from './pages/PlayerDetailPage';


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

// ---- Die eigentliche Routing-/Layout-Logik ----
function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return <Typography sx={{ textAlign: 'center', mt: 10 }}>Lade...</Typography>;
  }

  return (
    <>
      {user && <Navbar />}
      <Container sx={{ pb: 6 }}>
        <Routes>
          {user ? (
            <>
              <Route path="/" element={<TeamPage />} />
              <Route path="/historie" element={<MatchHistoryPage />} />
              <Route path="/taktik" element={<Taktikboard />} />
              <Route path="/game/:gameId" element={<GamePage />} />
              <Route path="/match/:gameId" element={<MatchResultPage />} />
              <Route path="/transfermarkt" element={<TransfermarktPage />} />
              <Route path="/challenge" element={<ChallengePage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
              <Route path="/pending" element={<PendingActionsPage />} />
              <Route path="/players/:playerId" element={<PlayerDetailPage />} />
            </>
          ) : (
            <>
              <Route path="/login" element={<LoginPage />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </>
          )}
        </Routes>
      </Container>
    </>
  );
}

export default App;
