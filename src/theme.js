// theme.js
import { createTheme } from "@mui/material/styles";

const DDS_BG = "#111e2e";
const DDS_PANEL = "#192a3a";
const DDS_CARD = "#162138";
const DDS_ACCENT = "#ffbc29";

// Kontraststarke Textfarben
const DDS_TEXT_PRIMARY = "#E8F1FD";
const DDS_TEXT_SECONDARY = "rgba(232,241,253,0.78)";
const DDS_TEXT_DISABLED = "rgba(232,241,253,0.5)";

// dezente Linienfarbe
const DDS_DIVIDER = "rgba(232,241,253,0.12)";

// optionales Sekundär-Akzent (für Chips/Badges etc.)
const DDS_SECONDARY_MAIN = "#5ec2ff";

const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: DDS_BG,
      paper: DDS_PANEL,
    },
    primary: {
      main: DDS_ACCENT,
      contrastText: DDS_BG,
    },
    secondary: {
      main: DDS_SECONDARY_MAIN,
      contrastText: DDS_BG,
    },
    text: {
      primary: DDS_TEXT_PRIMARY,
      secondary: DDS_TEXT_SECONDARY,
      disabled: DDS_TEXT_DISABLED,
    },
    divider: DDS_DIVIDER,
  },
  typography: {
    fontFamily:
      'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    body1: { lineHeight: 1.5 },
    body2: { lineHeight: 1.45 },
    button: { textTransform: "none", fontWeight: 700 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "html, body, #root": { height: "100%" },
        body: {
          backgroundColor: DDS_BG,
          color: DDS_TEXT_PRIMARY, // Basis-Textfarbe
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        },
        // Häufige „blass“-Ursachen: globale Opacitys – deaktivieren
        p: { opacity: 1 },
        span: { opacity: 1 },
        small: { opacity: 1 },
        "::selection": { background: "rgba(255,188,41,0.35)" },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: DDS_PANEL,
          color: DDS_TEXT_PRIMARY,
          backgroundImage: "none",
        },
      },
    },

    MuiTypography: {
      defaultProps: {
        color: "inherit", // erbt vom Elternteil (Body = primary)
      },
      styleOverrides: {
        root: {
          color: "inherit",
        },
      },
    },

    // Sekundärtexte klarer machen (z. B. in Listen)
    MuiListItemText: {
      styleOverrides: {
        primary: { color: DDS_TEXT_PRIMARY },
        secondary: { color: DDS_TEXT_SECONDARY },
      },
    },

    // Buttons
    MuiButton: {
      styleOverrides: {
        root: { fontWeight: 700, borderRadius: 8 },
        contained: {
          backgroundColor: DDS_ACCENT,
          color: DDS_BG,
          "&:hover": { backgroundColor: "#ffc447" },
        },
        outlined: {
          borderColor: DDS_ACCENT,
          color: DDS_ACCENT,
          "&:hover": { backgroundColor: DDS_CARD, borderColor: DDS_ACCENT },
        },
      },
    },

    // Tabs
    MuiTabs: {
      styleOverrides: {
        indicator: { backgroundColor: DDS_ACCENT },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          color: DDS_TEXT_SECONDARY,
          "&.Mui-selected": { color: DDS_ACCENT },
          textTransform: "none",
          fontWeight: 600,
        },
      },
    },

    // Chip
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 700, borderRadius: 8 },
      },
    },

    // Divider
    MuiDivider: {
      styleOverrides: {
        root: { backgroundColor: DDS_DIVIDER, borderColor: DDS_DIVIDER },
      },
    },

    // Inputs/Felder/Labels gut lesbar
    MuiInputBase: {
      styleOverrides: {
        root: { color: DDS_TEXT_PRIMARY },
        input: { color: DDS_TEXT_PRIMARY },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: { borderColor: "rgba(232,241,253,0.18)" },
      },
    },
    MuiFormLabel: {
      styleOverrides: {
        root: { color: DDS_TEXT_SECONDARY },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { color: DDS_TEXT_SECONDARY },
      },
    },

    // Tabellen (falls genutzt)
    MuiTableCell: {
      styleOverrides: {
        root: { color: DDS_TEXT_PRIMARY, borderColor: DDS_DIVIDER },
        head: { color: DDS_TEXT_PRIMARY, fontWeight: 700 },
      },
    },
  },
});

export default theme;
