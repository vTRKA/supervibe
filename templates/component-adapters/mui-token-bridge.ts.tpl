// MUI theme bridging project design tokens
// Source: prototypes/_design-system/tokens.css
// Generated: <ISO-date>
// IMPORTANT: regenerate when tokens.css changes.

import { createTheme } from '@mui/material/styles';

const cssVar = (name: string) => `var(${name})`;

export const theme = createTheme({
  palette: {
    primary: {
      main: cssVar('--color-primary-500'),
      light: cssVar('--color-primary-300'),
      dark: cssVar('--color-primary-700'),
      contrastText: cssVar('--color-on-primary'),
    },
    secondary: {
      main: cssVar('--color-secondary-500'),
    },
    background: {
      default: cssVar('--color-bg-default'),
      paper: cssVar('--color-bg-elevated'),
    },
    text: {
      primary: cssVar('--color-text-primary'),
      secondary: cssVar('--color-text-secondary'),
    },
    error: { main: cssVar('--color-danger-500') },
    warning: { main: cssVar('--color-warning-500') },
    success: { main: cssVar('--color-success-500') },
  },
  typography: {
    fontFamily: cssVar('--type-family-body'),
    h1: { fontFamily: cssVar('--type-family-display') },
    button: { textTransform: 'none' },
  },
  shape: {
    borderRadius: 8, // overridden per-component via sx with var(--radius-md)
  },
  spacing: 4, // 0.25rem; multiply via sx={{ p: 4 }} → 16px
  transitions: {
    duration: {
      shortest: 150,
      shorter: 200,
      short: 250,
      standard: 300,
      complex: 375,
    },
  },
});
