import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Box, Container } from "@mui/material";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Navbar from "./components/Navbar";

// Pages
import LoginPage from "./pages/LoginPage";
import TeamPage from "./pages/TeamPage";
import Taktikboard from "./pages/Taktikboard";
import MatchHistoryPage from "./pages/MatchHistoryPage";
import MatchResultPage from "./pages/MatchResultPage";
import ChallengePage from "./pages/ChallengePage";
import TransfermarktPage from "./pages/TransfermarktPage";
import PendingActionsPage from "./pages/PendingActionsPage";
import FinancePage from "./pages/FinancePage";
import TransferHistoryPage from "./pages/TransferHistoryPage";
import CompetitionsPage from "./pages/CompetitionsPage";   // Wettbewerbe
import PlayerSearchPage from "./pages/PlayerSearchPage";   // Spielersuche
import PlayerDetailPage from "./pages/PlayerDetailPage";   // Spieler-Details
import AdminPage from "./pages/AdminPage";

// ---------- Private Route ----------
function PrivateRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// ---------- App Shell ----------
function AppShell() {
  const { user } = useAuth();

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      {user && <Navbar />}
      <Container maxWidth="lg" sx={{ pb: 6 }}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Private */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <TeamPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/taktik"
            element={
              <PrivateRoute>
                <Taktikboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/historie"
            element={
              <PrivateRoute>
                <MatchHistoryPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/match/:gameId"
            element={
              <PrivateRoute>
                <MatchResultPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/challenge"
            element={
              <PrivateRoute>
                <ChallengePage />
              </PrivateRoute>
            }
          />
          <Route
            path="/transfermarkt"
            element={
              <PrivateRoute>
                <TransfermarktPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/pending"
            element={
              <PrivateRoute>
                <PendingActionsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/finanzen"
            element={
              <PrivateRoute>
                <FinancePage />
              </PrivateRoute>
            }
          />
          <Route
            path="/transferhistorie"
            element={
              <PrivateRoute>
                <TransferHistoryPage />
              </PrivateRoute>
            }
          />

          {/* NEU */}
          <Route
            path="/competitions"
            element={
              <PrivateRoute>
                <CompetitionsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/players"
            element={
              <PrivateRoute>
                <PlayerSearchPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/player/:playerId"
            element={
              <PrivateRoute>
                <PlayerDetailPage />
              </PrivateRoute>
            }
          />

          {/* Admin */}
          <Route
            path="/admin"
            element={
              <PrivateRoute>
                <AdminPage />
              </PrivateRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Container>
    </Box>
  );
}

// ---------- Root ----------
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  );
}
