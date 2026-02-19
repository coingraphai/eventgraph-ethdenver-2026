/**
 * EventGraph - Premium Navigation Sidebar
 * Professional trading terminal navigation with polished styling
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Box,
  Stack,
  Typography,
  Tooltip,
  alpha,
  Divider,
} from '@mui/material';
import {
  Home as HomeIcon,
  ShowChart as MarketsIcon,
  FilterList as ScreenerIcon,
  SwapHoriz as ArbitrageIcon,
  CompareArrows as CrossVenueIcon,
  EmojiEvents as LeaderboardIcon,
  NotificationsActive as AlertsIcon,
  AutoAwesome as AskAIIcon,
  AttachMoney as PricingIcon,
  AccountBalanceWallet as VaultIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { keyframes } from '@mui/system';

const SIDEBAR_WIDTH = 64;

// Animations
const glow = keyframes`
  0%, 100% { box-shadow: 0 0 8px rgba(34, 197, 94, 0.4); }
  50% { box-shadow: 0 0 16px rgba(34, 197, 94, 0.6); }
`;

const float = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
`;

interface NavItem {
  id: string;
  name: string;
  icon: React.ElementType;
  route: string;
  color?: string;
}

interface PremiumSidebarProps {
  onNewChat?: () => void;
}

export const PremiumSidebar: React.FC<PremiumSidebarProps> = ({ onNewChat }) => {
  const location = useLocation();
  const theme = useTheme();

  const navItems: NavItem[] = [
    { id: 'home', name: 'Home', icon: HomeIcon, route: '/' },
    { id: 'markets', name: 'Markets', icon: MarketsIcon, route: '/events' },
    { id: 'screener', name: 'Screener', icon: ScreenerIcon, route: '/screener' },
    { id: 'cross-venue', name: 'Compare', icon: CrossVenueIcon, route: '/cross-venue', color: '#3B82F6' },
    { id: 'arbitrage', name: 'Arbitrage', icon: ArbitrageIcon, route: '/arbitrage', color: '#22C55E' },
    { id: 'execution', name: 'Execution', icon: VaultIcon, route: '/execution', color: '#8B5CF6' },
    { id: 'leaderboard', name: 'Leaderboard', icon: LeaderboardIcon, route: '/leaderboard', color: '#F59E0B' },
    { id: 'alerts', name: 'Alerts', icon: AlertsIcon, route: '/alerts', color: '#EF4444' },
    { id: 'pricing', name: 'Pricing', icon: PricingIcon, route: '/pricing' },
  ];

  const isActive = (route: string) => {
    if (route === '/') return location.pathname === '/';
    return location.pathname.startsWith(route);
  };

  return (
    <Box
      sx={{
        width: SIDEBAR_WIDTH,
        minWidth: SIDEBAR_WIDTH,
        height: '100vh',
        background: theme.palette.mode === 'dark' 
          ? `linear-gradient(180deg, ${alpha(theme.palette.background.paper, 0.95)} 0%, ${alpha(theme.palette.background.default, 0.98)} 100%)`
          : theme.palette.background.paper,
        borderRight: theme.palette.mode === 'dark' 
          ? `1px solid ${alpha(theme.palette.divider, 0.06)}`
          : `1px solid rgba(15, 23, 42, 0.1)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        py: 2,
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 1200,
        backdropFilter: 'blur(20px)',
        boxShadow: theme.palette.mode === 'light' 
          ? '2px 0 12px rgba(15, 23, 42, 0.04)'
          : 'none',
      }}
    >
      {/* Logo */}
      <Tooltip title="EventGraph" placement="right" arrow>
        <Box
          data-tour-id="nav-logo"
          component={Link}
          to="/"
          sx={{
            width: 48,
            height: 48,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 3,
            textDecoration: 'none',
            transition: 'all 0.2s ease',
            '&:hover': {
              transform: 'scale(1.05)',
            },
          }}
        >
          <Box
            component="img"
            src="/assets/eventgraph.png"
            alt="EventGraph"
            sx={{
              width: 40,
              height: 40,
              objectFit: 'contain',
            }}
          />
        </Box>
      </Tooltip>

      {/* Main Navigation */}
      <Stack spacing={1} alignItems="center" sx={{ flex: 1 }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.route);
          const itemColor = item.color || theme.palette.primary.main;

          return (
            <Tooltip key={item.id} title={item.name} placement="right" arrow>
              <Box
                data-tour-id={`nav-${item.id}`}
                component={Link}
                to={item.route}
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textDecoration: 'none',
                  position: 'relative',
                  transition: 'all 0.2s ease',
                  backgroundColor: active 
                    ? alpha(itemColor, theme.palette.mode === 'dark' ? 0.15 : 0.12)
                    : 'transparent',
                  color: active 
                    ? itemColor 
                    : theme.palette.mode === 'dark' ? 'text.secondary' : 'text.primary',
                  '&::before': active ? {
                    content: '""',
                    position: 'absolute',
                    left: -8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 3,
                    height: 24,
                    borderRadius: '0 4px 4px 0',
                    backgroundColor: itemColor,
                  } : {},
                  '&:hover': {
                    backgroundColor: active 
                      ? alpha(itemColor, theme.palette.mode === 'dark' ? 0.2 : 0.15)
                      : theme.palette.mode === 'dark' 
                        ? alpha(theme.palette.text.primary, 0.06)
                        : alpha(theme.palette.text.primary, 0.04),
                    color: active ? itemColor : 'text.primary',
                    transform: 'translateX(2px)',
                  },
                }}
              >
                <Icon sx={{ fontSize: 22 }} />
                <Typography
                  sx={{
                    fontSize: '0.55rem',
                    fontWeight: active ? 700 : 600,
                    mt: 0.25,
                    letterSpacing: '0.02em',
                  }}
                >
                  {item.name}
                </Typography>
              </Box>
            </Tooltip>
          );
        })}
      </Stack>

      {/* AI Button at Bottom */}
      <Tooltip title={`Ask AI (${/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl+K'})`} placement="right" arrow>
        <Box
          data-tour-id="nav-ai"
          component={Link}
          to="/ask-predictions"
          onClick={onNewChat}
          sx={{
            width: 44,
            height: 44,
            borderRadius: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
            mb: 2,
            background: isActive('/ask-predictions')
              ? `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`
              : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.primary.dark, 0.05)} 100%)`,
            color: isActive('/ask-predictions') ? 'white' : 'primary.main',
            border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
            transition: 'all 0.2s ease',
            animation: !isActive('/ask-predictions') ? `${float} 3s ease-in-out infinite` : 'none',
            '&:hover': {
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
              color: 'white',
              transform: 'scale(1.05)',
            },
          }}
        >
          <AskAIIcon sx={{ fontSize: 20 }} />
          <Typography
            sx={{
              fontSize: '0.5rem',
              fontWeight: 600,
              mt: 0.25,
            }}
          >
            AI
          </Typography>
        </Box>
      </Tooltip>
    </Box>
  );
};

export const SIDEBAR_WIDTH_EXPORT = SIDEBAR_WIDTH;
