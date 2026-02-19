import { createTheme, ThemeOptions } from '@mui/material/styles';

/**
 * Professional Analytics Color Scheme
 * Primary: Sky Blue - Calm, trustworthy, elegant
 * 
 * Sky Blue (#87CEEB) - Soft, professional, approachable
 * Light Sky Blue (#87CEFA) for accents
 * Deep Sky Blue (#00BFFF) for emphasis
 */

// Dark theme colors - Sky Blue Design
const darkColors = {
  background: {
    primary: '#0A0F1A',    // Deep space dark
    secondary: '#111827',  // Cards/panels - dark navy
    tertiary: '#0D1219',   // Input fields
    gradient: 'linear-gradient(135deg, #0A0F1A 0%, #1A2744 100%)',
  },
  border: {
    primary: '#1E293B',    // Subtle slate borders
    secondary: '#334155',  // Dividers
    accent: '#87CEEB',     // Sky Blue accent
  },
  primary: {
    main: '#87CEEB',       // Sky Blue - signature color
    light: '#B0E0E6',      // Powder blue - lighter variant
    dark: '#00BFFF',       // Deep sky blue - deeper variant
    glow: 'rgba(135, 206, 235, 0.20)', // Soft glow
  },
  secondary: {
    main: '#00BFFF',       // Deep sky blue - complementary
    light: '#87CEFA',      // Light sky blue
    dark: '#1E90FF',       // Dodger blue
  },
  text: {
    primary: '#F1F5F9',    // Soft white
    secondary: '#94A3B8',  // Muted slate
    muted: '#64748B',      // Dim slate
  },
  accent: {
    cyan: 'rgba(135, 206, 235, 0.12)',   // Sky blue tint for highlights
    purple: 'rgba(0, 191, 255, 0.10)',   // Deep sky blue tint for secondary
    gradient: 'linear-gradient(135deg, #87CEEB 0%, #00BFFF 100%)',
  },
  success: {
    main: '#22C55E',       // Green for gains
    light: '#4ADE80',
    dark: '#16A34A',
  },
  error: {
    main: '#EF4444',       // Red for losses
    light: '#F87171',
    dark: '#DC2626',
  },
  warning: {
    main: '#F59E0B',       // Amber for caution
    light: '#FBBF24',
    dark: '#D97706',
  },
  chart: {
    blue: '#87CEEB',
    cyan: '#00BFFF',
    green: '#22C55E',
    amber: '#F59E0B',
    purple: '#A78BFA',
    teal: '#14B8A6',
  },
};

// Light theme colors - Clean, Bold, Professional Design for YC
const lightColors = {
  background: {
    primary: '#FAFBFC',    // Clean off-white background
    secondary: '#FFFFFF',  // Pure white cards
    tertiary: '#F1F5F9',   // Light slate for inputs
    accent: '#F0F9FF',     // Very light blue accent areas
    elevated: '#FFFFFF',   // Elevated surfaces
    gradient: 'linear-gradient(135deg, #FAFBFC 0%, #F0F9FF 100%)',
  },
  border: {
    primary: 'rgba(15, 23, 42, 0.08)',   // Visible slate borders
    secondary: 'rgba(15, 23, 42, 0.12)', // Slightly stronger dividers
    accent: '#0EA5E9',     // Sky blue accent (more saturated)
    strong: 'rgba(15, 23, 42, 0.16)',    // Strong borders for emphasis
  },
  primary: {
    main: '#0EA5E9',       // Vibrant sky blue - more saturated for visibility
    light: '#38BDF8',
    dark: '#0284C7',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#0284C7',       // Deep sky blue
    light: '#38BDF8',
    dark: '#0369A1',
  },
  text: {
    primary: '#0F172A',    // Deep slate - maximum contrast
    secondary: '#334155',  // Darker slate gray for better readability
    muted: '#64748B',      // Still visible muted text
    heading: '#020617',    // Near-black for headings
  },
  accent: {
    blue: 'rgba(14, 165, 233, 0.06)',
    blueMedium: 'rgba(14, 165, 233, 0.12)',
    blueStrong: 'rgba(14, 165, 233, 0.18)',
    gradient: 'linear-gradient(135deg, #F0F9FF 0%, #BAE6FD 100%)',
  },
  success: {
    main: '#16A34A',       // Darker green for better contrast
    light: '#22C55E',
    dark: '#15803D',
  },
  error: {
    main: '#DC2626',       // Stronger red
    light: '#EF4444',
    dark: '#B91C1C',
  },
  warning: {
    main: '#D97706',       // Darker amber for visibility
    light: '#F59E0B',
    dark: '#B45309',
  },
  button: {
    primary: '#0EA5E9',
    primaryHover: '#0284C7',
    primaryText: '#FFFFFF',
    secondary: '#F1F5F9',
    secondaryHover: '#E2E8F0',
    secondaryText: '#0F172A',
  },
};

// For backward compatibility
const colors = darkColors;

const themeOptions: ThemeOptions = {
  palette: {
    mode: 'dark',
    primary: {
      main: colors.primary.main,
      light: colors.primary.light,
      dark: colors.primary.dark,
    },
    secondary: {
      main: colors.secondary.main,
      light: colors.secondary.light,
      dark: colors.secondary.dark,
    },
    success: {
      main: colors.success.main,
      light: colors.success.light,
      dark: colors.success.dark,
    },
    error: {
      main: colors.error.main,
      light: colors.error.light,
      dark: colors.error.dark,
    },
    warning: {
      main: colors.warning.main,
      light: colors.warning.light,
      dark: colors.warning.dark,
    },
    info: {
      main: colors.primary.main,
      light: colors.primary.light,
      dark: colors.primary.dark,
    },
    background: {
      default: colors.background.primary,
      paper: colors.background.secondary,
    },
    text: {
      primary: colors.text.primary,
      secondary: colors.text.secondary,
    },
  },
  typography: {
    fontFamily: '"Outfit", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '42px',
      fontWeight: 600,
      letterSpacing: '-0.04em',
      lineHeight: 1.4,
    },
    h2: {
      fontSize: '20px',
      fontWeight: 600,
      letterSpacing: '-0.02em',
      lineHeight: 1.4,
    },
    body1: {
      fontSize: '16px',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '14px',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    caption: {
      fontSize: '12px',
      fontWeight: 400,
      lineHeight: 1.4,
    },
  },
  shape: {
    borderRadius: 10,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: `${colors.primary.main} ${colors.background.secondary}`,
          '&::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: colors.background.secondary,
          },
          '&::-webkit-scrollbar-thumb': {
            background: colors.border.secondary,
            borderRadius: '4px',
            '&:hover': {
              background: colors.primary.main,
            },
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: '10px',
          fontSize: '15px',
          fontWeight: 600,
          padding: '10px 24px',
          transition: 'all 0.2s ease-in-out',
        },
        contained: {
          backgroundColor: colors.primary.main,
          color: colors.background.primary,
          boxShadow: `0 0 20px ${colors.primary.glow}`,
          '&:hover': {
            backgroundColor: colors.primary.light,
            boxShadow: `0 0 30px ${colors.primary.glow}, 0 4px 15px rgba(0, 0, 0, 0.3)`,
            transform: 'translateY(-1px)',
          },
        },
        outlined: {
          borderColor: colors.primary.main,
          borderWidth: '1.5px',
          color: colors.primary.main,
          '&:hover': {
            borderColor: colors.primary.light,
            backgroundColor: colors.accent.cyan,
            borderWidth: '1.5px',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: colors.background.secondary,
          borderRadius: '16px',
          border: `1px solid ${colors.border.primary}`,
          backdropFilter: 'blur(10px)',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            borderColor: colors.border.secondary,
            boxShadow: `0 8px 32px rgba(0, 0, 0, 0.3)`,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: colors.background.secondary,
          backgroundImage: 'none',
          borderRadius: '12px',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: colors.background.primary,
          borderRight: `1px solid ${colors.border.primary}`,
          backgroundImage: 'none',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: colors.background.tertiary,
            borderRadius: '12px',
            transition: 'all 0.2s ease',
            '& fieldset': {
              borderColor: colors.border.primary,
              transition: 'all 0.2s ease',
            },
            '&:hover fieldset': {
              borderColor: colors.primary.main,
            },
            '&.Mui-focused fieldset': {
              borderColor: colors.primary.main,
              boxShadow: `0 0 0 3px ${colors.primary.glow}`,
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: 600,
          transition: 'all 0.2s ease',
        },
        filled: {
          backgroundColor: colors.accent.cyan,
          color: colors.primary.main,
          border: `1px solid ${colors.primary.main}`,
        },
        outlined: {
          borderColor: colors.border.secondary,
          '&:hover': {
            backgroundColor: colors.accent.cyan,
            borderColor: colors.primary.main,
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          backgroundColor: colors.primary.main,
          height: '3px',
          borderRadius: '3px 3px 0 0',
          boxShadow: `0 0 10px ${colors.primary.glow}`,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '14px',
          color: colors.text.secondary,
          transition: 'all 0.2s ease',
          '&.Mui-selected': {
            color: colors.primary.main,
          },
          '&:hover': {
            color: colors.primary.light,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: colors.text.secondary,
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: colors.accent.cyan,
            color: colors.primary.main,
          },
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: colors.border.primary,
        },
      },
    },
  },
};

// Light theme options - Professional, Bold, YC-Ready
const lightThemeOptions: ThemeOptions = {
  palette: {
    mode: 'light',
    primary: {
      main: lightColors.primary.main,
      light: lightColors.primary.light,
      dark: lightColors.primary.dark,
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: lightColors.secondary.main,
      light: lightColors.secondary.light,
      dark: lightColors.secondary.dark,
    },
    success: {
      main: lightColors.success.main,
      light: lightColors.success.light,
      dark: lightColors.success.dark,
    },
    error: {
      main: lightColors.error.main,
      light: lightColors.error.light,
      dark: lightColors.error.dark,
    },
    warning: {
      main: lightColors.warning.main,
      light: lightColors.warning.light,
      dark: lightColors.warning.dark,
    },
    info: {
      main: lightColors.primary.main,
      light: lightColors.primary.light,
      dark: lightColors.primary.dark,
    },
    background: {
      default: lightColors.background.primary,
      paper: lightColors.background.secondary,
    },
    text: {
      primary: lightColors.text.primary,
      secondary: lightColors.text.secondary,
    },
    divider: lightColors.border.secondary,
    action: {
      active: lightColors.text.primary,
      hover: lightColors.accent.blue,
      selected: lightColors.accent.blueMedium,
      disabled: 'rgba(15, 23, 42, 0.26)',
      disabledBackground: 'rgba(15, 23, 42, 0.08)',
    },
  },
  typography: {
    fontFamily: '"Outfit", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '42px',
      fontWeight: 700,
      letterSpacing: '-0.03em',
      lineHeight: 1.3,
      color: lightColors.text.heading,
    },
    h2: {
      fontSize: '20px',
      fontWeight: 700,
      letterSpacing: '-0.02em',
      lineHeight: 1.4,
      color: lightColors.text.heading,
    },
    h3: {
      fontSize: '18px',
      fontWeight: 600,
      letterSpacing: '-0.01em',
      lineHeight: 1.4,
      color: lightColors.text.primary,
    },
    h4: {
      fontSize: '16px',
      fontWeight: 600,
      letterSpacing: '-0.01em',
      lineHeight: 1.4,
      color: lightColors.text.primary,
    },
    h5: {
      fontSize: '14px',
      fontWeight: 600,
      lineHeight: 1.4,
      color: lightColors.text.primary,
    },
    h6: {
      fontSize: '13px',
      fontWeight: 600,
      lineHeight: 1.4,
      color: lightColors.text.primary,
    },
    subtitle1: {
      fontSize: '16px',
      fontWeight: 500,
      lineHeight: 1.5,
      color: lightColors.text.primary,
    },
    subtitle2: {
      fontSize: '14px',
      fontWeight: 500,
      lineHeight: 1.5,
      color: lightColors.text.secondary,
    },
    body1: {
      fontSize: '16px',
      fontWeight: 450,
      lineHeight: 1.6,
      color: lightColors.text.primary,
    },
    body2: {
      fontSize: '14px',
      fontWeight: 450,
      lineHeight: 1.5,
      color: lightColors.text.primary,
    },
    caption: {
      fontSize: '12px',
      fontWeight: 500,
      lineHeight: 1.4,
      color: lightColors.text.secondary,
    },
    button: {
      fontWeight: 600,
      textTransform: 'none' as const,
    },
  },
  shape: {
    borderRadius: 10,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          // Stronger scrollbar for light mode
          scrollbarColor: `${lightColors.primary.main} ${lightColors.background.tertiary}`,
          '&::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: lightColors.background.tertiary,
          },
          '&::-webkit-scrollbar-thumb': {
            background: lightColors.border.secondary,
            borderRadius: '4px',
            '&:hover': {
              background: lightColors.primary.main,
            },
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: '10px',
          fontSize: '15px',
          fontWeight: 600,
          padding: '10px 24px',
          transition: 'all 0.2s ease-in-out',
        },
        contained: {
          backgroundColor: lightColors.button.primary,
          color: lightColors.button.primaryText,
          boxShadow: '0 2px 8px rgba(14, 165, 233, 0.3)',
          '&:hover': {
            backgroundColor: lightColors.button.primaryHover,
            boxShadow: '0 4px 16px rgba(14, 165, 233, 0.4)',
            transform: 'translateY(-1px)',
          },
        },
        outlined: {
          borderColor: lightColors.primary.main,
          borderWidth: '2px',
          color: lightColors.primary.dark,
          fontWeight: 600,
          '&:hover': {
            borderColor: lightColors.primary.dark,
            backgroundColor: lightColors.accent.blue,
            borderWidth: '2px',
          },
        },
        text: {
          color: lightColors.primary.dark,
          fontWeight: 600,
          '&:hover': {
            backgroundColor: lightColors.accent.blue,
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: lightColors.background.secondary,
          borderRadius: '16px',
          border: `1px solid ${lightColors.border.secondary}`,
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.04)',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08), 0 8px 24px rgba(15, 23, 42, 0.06)',
            borderColor: lightColors.border.strong,
          },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: lightColors.background.secondary,
          borderRight: `1px solid ${lightColors.border.secondary}`,
          color: lightColors.text.primary,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: lightColors.background.tertiary,
            borderRadius: '12px',
            transition: 'all 0.2s ease',
            '& fieldset': {
              borderColor: lightColors.border.secondary,
              borderWidth: '1.5px',
              transition: 'all 0.2s ease',
            },
            '&:hover fieldset': {
              borderColor: lightColors.primary.main,
            },
            '&.Mui-focused fieldset': {
              borderColor: lightColors.primary.main,
              borderWidth: '2px',
              boxShadow: '0 0 0 3px rgba(14, 165, 233, 0.12)',
            },
          },
          '& .MuiInputBase-input': {
            color: lightColors.text.primary,
            fontWeight: 500,
          },
          '& .MuiInputLabel-root': {
            color: lightColors.text.secondary,
            fontWeight: 500,
          },
          '& .MuiInputBase-input::placeholder': {
            color: lightColors.text.muted,
            opacity: 1,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: 600,
        },
        filled: {
          backgroundColor: lightColors.accent.blueMedium,
          color: lightColors.text.primary,
          border: `1px solid ${lightColors.primary.light}`,
        },
        outlined: {
          borderColor: lightColors.border.secondary,
          color: lightColors.text.primary,
          fontWeight: 600,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: lightColors.text.secondary,
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: lightColors.accent.blue,
            color: lightColors.text.primary,
          },
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: lightColors.border.secondary,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: lightColors.background.secondary,
          backgroundImage: 'none',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06), 0 2px 8px rgba(15, 23, 42, 0.04)',
        },
        outlined: {
          borderColor: lightColors.border.secondary,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: lightColors.background.secondary,
          borderBottom: `1px solid ${lightColors.border.secondary}`,
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
          color: lightColors.text.primary,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          color: lightColors.text.primary,
          borderColor: lightColors.border.secondary,
          fontWeight: 450,
          fontSize: '14px',
        },
        head: {
          backgroundColor: lightColors.background.tertiary,
          color: lightColors.text.heading,
          fontWeight: 700,
          fontSize: '13px',
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: lightColors.accent.blue,
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          color: lightColors.text.primary,
          fontWeight: 500,
          borderRadius: '8px',
          '&:hover': {
            backgroundColor: lightColors.accent.blue,
          },
          '&.Mui-selected': {
            backgroundColor: lightColors.accent.blueMedium,
            color: lightColors.primary.dark,
            fontWeight: 600,
            '&:hover': {
              backgroundColor: lightColors.accent.blueStrong,
            },
          },
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: {
          color: lightColors.text.secondary,
          minWidth: '40px',
        },
      },
    },
    MuiListItemText: {
      styleOverrides: {
        primary: {
          color: lightColors.text.primary,
          fontWeight: 500,
        },
        secondary: {
          color: lightColors.text.secondary,
          fontWeight: 450,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          color: lightColors.text.secondary,
          fontWeight: 600,
          fontSize: '14px',
          textTransform: 'none',
          '&.Mui-selected': {
            color: lightColors.text.primary,
            fontWeight: 700,
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          backgroundColor: lightColors.primary.main,
          height: '3px',
          borderRadius: '3px 3px 0 0',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: lightColors.text.heading,
          color: '#FFFFFF',
          fontSize: '12px',
          fontWeight: 500,
          padding: '8px 12px',
          borderRadius: '6px',
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        root: {
          // Ensure all typography has proper color
        },
      },
    },
    MuiBadge: {
      styleOverrides: {
        colorError: {
          backgroundColor: lightColors.error.main,
          color: '#FFFFFF',
          fontWeight: 600,
        },
        colorSuccess: {
          backgroundColor: lightColors.success.main,
          color: '#FFFFFF',
          fontWeight: 600,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
        standardSuccess: {
          backgroundColor: 'rgba(22, 163, 74, 0.1)',
          color: lightColors.success.dark,
          borderLeft: `4px solid ${lightColors.success.main}`,
        },
        standardError: {
          backgroundColor: 'rgba(220, 38, 38, 0.1)',
          color: lightColors.error.dark,
          borderLeft: `4px solid ${lightColors.error.main}`,
        },
        standardWarning: {
          backgroundColor: 'rgba(217, 119, 6, 0.1)',
          color: lightColors.warning.dark,
          borderLeft: `4px solid ${lightColors.warning.main}`,
        },
        standardInfo: {
          backgroundColor: 'rgba(14, 165, 233, 0.1)',
          color: lightColors.primary.dark,
          borderLeft: `4px solid ${lightColors.primary.main}`,
        },
      },
    },
  },
};

// Dark theme options (existing)
const darkThemeOptions = themeOptions;

export const theme = createTheme(themeOptions);
export { colors, themeOptions, lightThemeOptions, darkThemeOptions, lightColors, darkColors };
