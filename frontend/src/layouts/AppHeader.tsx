/**
 * App Header - Premium Trading Terminal Header
 * Global search, branding, and quick actions
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  InputBase,
  Typography,
  Button,
  IconButton,
  Tooltip,
  Stack,
  Chip,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Search as SearchIcon,
  AutoAwesome,
  KeyboardCommandKey,
  TrendingUp,
  Home as HomeIcon,
  ShowChart as MarketsIcon,
  FilterList as ScreenerIcon,
  SwapHoriz as ArbitrageIcon,
  NotificationsActive as AlertsIcon,
  AttachMoney as PricingIcon,
  Analytics as AnalyticsIcon,
} from '@mui/icons-material';
import { keyframes } from '@mui/system';
import { ThemeToggle } from '../components/ThemeToggle';

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
`;

const liveDot = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
  50% { box-shadow: 0 0 0 4px rgba(34, 197, 94, 0); }
`;

const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

interface AppHeaderProps {
  onAskAI?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ onAskAI }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Detect macOS vs Windows/Linux
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

  // Global keyboard shortcut: ⌘S (macOS) or Ctrl+S (Windows/Linux)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      if (modifier && e.key.toLowerCase() === 's') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isMac]);

  const handleSearch = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (searchValue.trim()) {
        navigate(`/events?search=${encodeURIComponent(searchValue.trim())}`);
      } else {
        // Clear search → navigate to /events without search param
        navigate('/events');
      }
      searchInputRef.current?.blur();
    }
  };

  const handleAskAI = () => {
    if (onAskAI) onAskAI();
    navigate('/ask-predictions');
  };

  // Page context with icon and accent color
  const getPageContext = () => {
    const path = location.pathname;
    if (path === '/') return { title: 'Dashboard', icon: HomeIcon, color: '#8B5CF6' };
    if (path === '/events') return { title: 'Markets', icon: MarketsIcon, color: '#3B82F6' };
    if (path.startsWith('/event/')) return { title: 'Event Analytics', icon: AnalyticsIcon, color: '#6366F1' };
    if (path === '/screener') return { title: 'Screener', icon: ScreenerIcon, color: '#EC4899' };
    if (path === '/arbitrage') return { title: 'Arbitrage', icon: ArbitrageIcon, color: '#22C55E' };
    if (path === '/alerts') return { title: 'Alerts', icon: AlertsIcon, color: '#F59E0B' };
    if (path === '/pricing') return { title: 'Pricing', icon: PricingIcon, color: '#14B8A6' };
    if (path === '/ask-predictions') return { title: 'Ask AI', icon: AutoAwesome, color: '#8B5CF6' };
    return { title: 'EventGraph', icon: TrendingUp, color: theme.palette.primary.main };
  };

  const pageContext = getPageContext();

  return (
    <Box
      component="header"
      sx={{
        height: 56,
        minHeight: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 3,
        borderBottom: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
        backgroundColor: alpha(theme.palette.background.default, 0.85),
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 1100,
      }}
    >
      {/* Left: Logo + Page Title */}
      <Stack direction="row" alignItems="center" spacing={2}>
        <Box
          onClick={() => navigate('/')}
          sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <Box
            component="img"
            src={theme.palette.mode === 'dark' ? '/assets/EG logo white.png' : '/assets/EGlogo black.png'}
            alt="EventGraph"
            sx={{
              height: 36,
              width: 'auto',
              objectFit: 'contain',
            }}
          />
        </Box>

        {/* Page Context Badge */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            ml: 1,
            px: 1.5,
            py: 0.5,
            borderRadius: 2,
            backgroundColor: alpha(pageContext.color, theme.palette.mode === 'dark' ? 0.1 : 0.06),
            border: `1px solid ${alpha(pageContext.color, 0.15)}`,
            transition: 'all 0.3s ease',
          }}
        >
          {/* Page Icon */}
          <pageContext.icon
            sx={{
              fontSize: 18,
              color: pageContext.color,
            }}
          />

          {/* Page Title */}
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              color: pageContext.color,
              fontSize: '0.82rem',
              letterSpacing: '0.02em',
            }}
          >
            {pageContext.title}
          </Typography>

          {/* Live Dot */}
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: '#22C55E',
              animation: `${liveDot} 2s ease-in-out infinite`,
              ml: 0.5,
            }}
          />
        </Box>
      </Stack>

      {/* Center: Global Search - absolutely centered */}
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: 480,
          px: 2,
          pointerEvents: 'none',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: searchFocused 
              ? alpha(theme.palette.background.paper, 0.9)
              : alpha(theme.palette.background.paper, 0.5),
            borderRadius: 2,
            border: `1px solid ${searchFocused ? theme.palette.primary.main : alpha(theme.palette.divider, 0.1)}`,
            px: 1.5,
            py: 0.5,
            transition: 'all 0.2s ease',
            boxShadow: searchFocused ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.1)}` : 'none',
            pointerEvents: 'auto',
          }}
        >
          <SearchIcon sx={{ color: 'text.secondary', fontSize: 20, mr: 1 }} />
          <InputBase
            inputRef={searchInputRef}
            placeholder="Search markets, events, or ask AI..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={handleSearch}
            sx={{
              flex: 1,
              fontSize: '0.875rem',
              '& input::placeholder': {
                color: 'text.secondary',
                opacity: 0.7,
              },
            }}
          />
          <Chip
            size="small"
            label={
              <Stack direction="row" alignItems="center" spacing={0.25}>
                {isMac ? (
                  <KeyboardCommandKey sx={{ fontSize: 12 }} />
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700 }}>Ctrl</span>
                )}
                <span>S</span>
              </Stack>
            }
            sx={{
              height: 22,
              fontSize: '0.65rem',
              fontWeight: 600,
              backgroundColor: alpha(theme.palette.text.primary, 0.08),
              color: 'text.secondary',
              '& .MuiChip-label': { px: 0.75 },
            }}
          />
        </Box>
      </Box>

      {/* Right: Actions */}
      <Stack direction="row" alignItems="center" spacing={1.5}>
        {/* Ask AI Button - hide when already on ask-predictions page */}
        {location.pathname !== '/ask-predictions' && (
          <Button
            variant="contained"
            size="small"
            startIcon={<AutoAwesome sx={{ fontSize: 16 }} />}
            onClick={handleAskAI}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              px: 2,
              py: 0.75,
              borderRadius: 2,
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
              boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.3)}`,
              '&:hover': {
                background: `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
              },
            }}
          >
            Ask AI
          </Button>
        )}

        {/* Theme Toggle */}
        <ThemeToggle />
      </Stack>
    </Box>
  );
};

export const APP_HEADER_HEIGHT = 56;
