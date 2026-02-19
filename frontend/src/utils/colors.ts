/**
 * EventGraph - Consistent Color System
 * Unified color language across all components
 */

// Trading Colors
export const TRADING_COLORS = {
  // YES/BUY - Green
  YES: '#22C55E',
  YES_LIGHT: '#4ADE80',
  YES_DARK: '#16A34A',
  YES_BG: 'rgba(34, 197, 94, 0.12)',
  
  // NO/SELL - Red
  NO: '#EF4444',
  NO_LIGHT: '#F87171',
  NO_DARK: '#DC2626',
  NO_BG: 'rgba(239, 68, 68, 0.12)',
  
  // Positive Change
  POSITIVE: '#22C55E',
  POSITIVE_BG: 'rgba(34, 197, 94, 0.1)',
  
  // Negative Change
  NEGATIVE: '#EF4444',
  NEGATIVE_BG: 'rgba(239, 68, 68, 0.1)',
  
  // Neutral
  NEUTRAL: '#94A3B8',
};

// Platform Colors
export const PLATFORM_COLORS = {
  polymarket: {
    primary: '#87CEEB',
    secondary: '#5DADE2',
    bg: 'rgba(135, 206, 235, 0.12)',
    label: 'Polymarket',
  },
  kalshi: {
    primary: '#CE93D8',
    secondary: '#BA68C8',
    bg: 'rgba(206, 147, 216, 0.12)',
    label: 'Kalshi',
  },
  limitless: {
    primary: '#90EE90',
    secondary: '#66BB6A',
    bg: 'rgba(144, 238, 144, 0.12)',
    label: 'Limitless',
  },
  opiniontrade: {
    primary: '#FFA500',
    secondary: '#FF8C00',
    bg: 'rgba(255, 165, 0, 0.12)',
    label: 'OpinionTrade',
  },
};

// Chart Colors (6 harmonious colors for data visualization)
export const CHART_COLORS = {
  blue: '#87CEEB',
  cyan: '#00BFFF',
  green: '#22C55E',
  amber: '#F59E0B',
  purple: '#A78BFA',
  teal: '#14B8A6',
};

// Status Colors
export const STATUS_COLORS = {
  open: {
    color: '#22C55E',
    bg: 'rgba(34, 197, 94, 0.12)',
    label: 'Open',
  },
  closed: {
    color: '#94A3B8',
    bg: 'rgba(148, 163, 184, 0.12)',
    label: 'Closed',
  },
  resolved: {
    color: '#3B82F6',
    bg: 'rgba(59, 130, 246, 0.12)',
    label: 'Resolved',
  },
  pending: {
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.12)',
    label: 'Pending',
  },
};

// Helper to get platform color config
export const getPlatformColors = (platform: string) => {
  const key = platform.toLowerCase() as keyof typeof PLATFORM_COLORS;
  return PLATFORM_COLORS[key] || PLATFORM_COLORS.polymarket;
};

// Helper to format price change with color
export const getPriceChangeColor = (change: number) => {
  if (change > 0) return TRADING_COLORS.POSITIVE;
  if (change < 0) return TRADING_COLORS.NEGATIVE;
  return TRADING_COLORS.NEUTRAL;
};

// Helper to format price with appropriate styling
export const formatPriceDisplay = (price: number | null | undefined) => {
  if (price == null) return { text: '—', color: TRADING_COLORS.NEUTRAL };
  const cents = Math.round(price * 100);
  return {
    text: `${cents}¢`,
    color: TRADING_COLORS.NEUTRAL,
  };
};

// Helper for yes/no price styling
export const getYesNoStyle = (type: 'yes' | 'no') => {
  return type === 'yes' 
    ? { color: TRADING_COLORS.YES, bg: TRADING_COLORS.YES_BG }
    : { color: TRADING_COLORS.NO, bg: TRADING_COLORS.NO_BG };
};
