// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

import { ThemeProvider, CssBaseline } from "@mui/material";
import theme from "./theme"; // falls dein Theme woanders liegt, ggf. Pfad anpassen
import "./index.css";

// WICHTIG: AuthProvider einbinden, damit useAuth() einen Context hat
import { AuthProvider } from "./context/AuthContext";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </React.StrictMode>
  </ThemeProvider>
);

reportWebVitals();
