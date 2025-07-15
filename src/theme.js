import { createTheme } from '@mui/material/styles';

const DDS_BG = "#111e2e";
const DDS_PANEL = "#192a3a";
const DDS_CARD = "#162138";
const DDS_ACCENT = "#ffbc29";
const DDS_TEXT = "#f2f2f7";
const DDS_SECONDARY = "#465674";

const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: DDS_BG,
      paper: DDS_PANEL
    },
    primary: {
      main: DDS_ACCENT,
      contrastText: DDS_BG
    },
    secondary: {
      main: DDS_SECONDARY,
      contrastText: DDS_TEXT
    },
    text: {
      primary: DDS_TEXT,
      secondary: DDS_SECONDARY
    }
  },
  typography: {
    fontFamily: "Inter, Roboto, Arial, sans-serif",
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 }
  },
  shape: {
    borderRadius: 12
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: DDS_PANEL,
          color: DDS_TEXT
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          fontWeight: 700,
          borderRadius: 8
        },
        contained: {
          backgroundColor: DDS_ACCENT,
          color: DDS_BG,
          '&:hover': {
            backgroundColor: "#ffc447"
          }
        },
        outlined: {
          borderColor: DDS_ACCENT,
          color: DDS_ACCENT,
          '&:hover': {
            backgroundColor: DDS_CARD,
            borderColor: DDS_ACCENT
          }
        }
      }
    },
    MuiTabs: {
      styleOverrides: {
        root: { },
        indicator: {
          backgroundColor: DDS_ACCENT
        }
      }
    },
    MuiTab: {
      styleOverrides: {
        root: {
          color: DDS_TEXT,
          '&.Mui-selected': {
            color: DDS_ACCENT
          }
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 700,
          borderRadius: 8
        }
      }
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          color: DDS_TEXT
        }
      }
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          backgroundColor: DDS_SECONDARY
        }
      }
    }
  }
});

export default theme;
