/**
 * EventGraph - Navigation Rail
 * Fixed navigation with icons + labels like modern trading apps
 * Clean, professional trading terminal aesthetic
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Box,
  Stack,
  Typography,
  Divider,
  Badge,
} from '@mui/material';
import {
  ShowChart as MarketsIcon,
  FilterList as ScreenerIcon,
  SwapHoriz as ArbitrageIcon,
  AutoAwesome as AskAIIcon,
  TrendingUp,
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';
import { keyframes } from '@mui/system';

const RAIL_WIDTH = 72;

// Pulse animation for AI button
const pulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(135, 206, 235, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(135, 206, 235, 0); }
`;

interface NavItem {
  name: string;
  icon: React.ElementType;
  route: string;
  badge?: number;
}

interface IconRailProps {
  onNewChat?: () => void;
}

export const IconRail: React.FC<IconRailProps> = ({ onNewChat }) => {
  const location = useLocation();
  const theme = useTheme();

  // Main navigation items - Streamlined for YC demo
  // Focus on core value: aggregation + insights (no trading/wallet features yet)
  const mainNavItems: NavItem[] = [
    { name: 'Markets', icon: MarketsIcon, route: '/events' },
    { name: 'Screener', icon: ScreenerIcon, route: '/screener' },
    { name: 'Arbitrage', icon: ArbitrageIcon, route: '/arbitrage' },
  ];

  // Bottom items - Removed Alerts/Settings for cleaner demo
  const bottomNavItems: NavItem[] = [];

  const isActive = (route: string) => {
    if (route === '/') return location.pathname === '/';
    return location.pathname.startsWith(route);
  };

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(item.route);

    return (
      <Box
        key={item.name}
        component={Link}
        to={item.route}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          py: 1,
          px: 0.5,
          borderRadius: 1.5,
          textDecoration: 'none',
          color: active ? 'primary.main' : 'text.secondary',
          backgroundColor: active ? alpha(theme.palette.primary.main, 0.12) : 'transparent',
          transition: 'all 0.15s ease',
          cursor: 'pointer',
          '&:hover': {
            backgroundColor: active 
              ? alpha(theme.palette.primary.main, 0.16)
              : alpha(theme.palette.text.primary, 0.06),
            color: active ? 'primary.main' : 'text.primary',
          },
        }}
      >
        {item.badge ? (
          <Badge 
            badgeContent={item.badge} 
            color="error" 
            sx={{ 
              '& .MuiBadge-badge': { 
                fontSize: '0.55rem', 
                minWidth: 14, 
                height: 14,
                right: -2,
                top: 0,
              } 
            }}
          >
            <Icon sx={{ fontSize: 20 }} />
          </Badge>
        ) : (
          <Icon sx={{ fontSize: 20 }} />
        )}
        <Typography
          sx={{
            fontSize: '0.6rem',
            fontWeight: active ? 600 : 500,
            mt: 0.25,
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          {item.name}
        </Typography>
      </Box>
    );
  };

  return (
    <Box
      sx={{
        width: RAIL_WIDTH,
        minWidth: RAIL_WIDTH,
        height: '100vh',
        backgroundColor: theme.palette.background.default,
        borderRight: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        py: 1,
        px: 0.5,
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 1200,
      }}
    >
      {/* Logo */}
      <Box
        component={Link}
        to="/"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          py: 1,
          mb: 1,
          borderRadius: 2,
          textDecoration: 'none',
          background: location.pathname === '/'
            ? `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`
            : 'transparent',
          color: location.pathname === '/' ? 'white' : 'primary.main',
          transition: 'all 0.2s ease',
          '&:hover': {
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
            color: 'white',
          },
        }}
      >
        <TrendingUp sx={{ fontSize: 22 }} />
        <Typography
          sx={{
            fontSize: '0.55rem',
            fontWeight: 700,
            mt: 0.25,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Home
        </Typography>
      </Box>

      <Divider sx={{ width: '80%', mb: 1, opacity: 0.15 }} />

      {/* Main Navigation */}
      <Stack spacing={0.25} alignItems="center" sx={{ flex: 1, width: '100%' }}>
        {mainNavItems.map(renderNavItem)}
      </Stack>

      {/* AI Button - Featured */}
      <Box
        component={Link}
        to="/ask-predictions"
        onClick={onNewChat}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          py: 1,
          mb: 1,
          borderRadius: 2,
          textDecoration: 'none',
          background: isActive('/ask-predictions')
            ? `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`
            : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.15)} 0%, ${alpha(theme.palette.primary.dark, 0.08)} 100%)`,
          color: isActive('/ask-predictions') ? 'white' : 'primary.main',
          border: `1px solid ${alpha(theme.palette.primary.main, 0.25)}`,
          animation: !isActive('/ask-predictions') ? `${pulse} 3s ease-in-out infinite` : 'none',
          transition: 'all 0.2s ease',
          cursor: 'pointer',
          '&:hover': {
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
            color: 'white',
          },
        }}
      >
        <AskAIIcon sx={{ fontSize: 20 }} />
        <Typography
          sx={{
            fontSize: '0.55rem',
            fontWeight: 600,
            mt: 0.25,
          }}
        >
          Ask AI
        </Typography>
      </Box>
    </Box>
  );
};

export const ICON_RAIL_WIDTH = RAIL_WIDTH;
