/**
 * EventGraph - Global Header Component
 * Professional trading terminal header with search, navigation, and actions
 */

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  IconButton,
  InputBase,
  Badge,
  Tooltip,
  Stack,
  Typography,
  Button,
  alpha,
  useTheme,
  Chip,
} from '@mui/material';
import {
  Search as SearchIcon,
  Notifications as NotificationsIcon,
  TrendingUp,
  AutoAwesome,
  KeyboardCommandKey,
} from '@mui/icons-material';
import { ThemeToggle } from '../components/ThemeToggle';

interface HeaderProps {
  onNewChat: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onNewChat }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchFocused, setSearchFocused] = useState(false);

  const handleAskPredictions = () => {
    onNewChat();
    navigate('/ask-predictions');
  };

  // Get page title based on current route
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Dashboard';
    if (path === '/events') return 'Events';
    if (path.startsWith('/event/')) return 'Event Analytics';
    if (path === '/terminal') return 'Terminal';
    if (path === '/screener') return 'Screener';
    if (path === '/agent') return 'AI Agent';
    if (path === '/agent-workflows') return 'AI Workflows';
    if (path === '/portfolio') return 'Portfolio';
    if (path === '/alerts') return 'Alerts';
    if (path === '/settings') return 'Settings';
    if (path === '/ask-predictions') return 'Ask Predictions';
    return 'EventGraph';
  };

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
        borderBottom: theme.palette.mode === 'dark' 
          ? `1px solid ${alpha(theme.palette.divider, 0.08)}`
          : `1px solid rgba(15, 23, 42, 0.1)`,
        backgroundColor: theme.palette.mode === 'dark'
          ? alpha(theme.palette.background.default, 0.8)
          : theme.palette.background.paper,
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 1100,
        boxShadow: theme.palette.mode === 'light' 
          ? '0 1px 3px rgba(15, 23, 42, 0.04)'
          : 'none',
      }}
    >
      {/* Left: Page Title */}
      <Stack direction="row" alignItems="center" spacing={2}>
        <Typography
          variant="h6"
          fontWeight={700}
          sx={{ 
            color: 'text.primary',
            fontSize: '1.1rem',
            letterSpacing: '-0.02em',
          }}
        >
          {getPageTitle()}
        </Typography>
        
        {/* Live indicator */}
        <Chip
          size="small"
          label="LIVE"
          sx={{
            height: 20,
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            backgroundColor: alpha(theme.palette.success.main, 0.15),
            color: theme.palette.success.main,
            border: `1px solid ${alpha(theme.palette.success.main, 0.3)}`,
            '& .MuiChip-label': { px: 1 },
          }}
        />
      </Stack>

      {/* Center: Search */}
      <Box
        sx={{
          flex: '0 1 480px',
          mx: 4,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: theme.palette.mode === 'dark'
              ? alpha(theme.palette.text.primary, searchFocused ? 0.08 : 0.04)
              : searchFocused ? alpha(theme.palette.primary.main, 0.04) : '#F1F5F9',
            borderRadius: 2,
            border: theme.palette.mode === 'dark'
              ? `1px solid ${alpha(theme.palette.divider, searchFocused ? 0.2 : 0.08)}`
              : `1px solid ${searchFocused ? 'rgba(14, 165, 233, 0.4)' : 'rgba(15, 23, 42, 0.1)'}`,
            px: 2,
            py: 0.75,
            transition: 'all 0.2s ease',
            '&:hover': {
              backgroundColor: theme.palette.mode === 'dark'
                ? alpha(theme.palette.text.primary, 0.06)
                : alpha(theme.palette.primary.main, 0.04),
              borderColor: theme.palette.mode === 'dark'
                ? alpha(theme.palette.divider, 0.15)
                : 'rgba(14, 165, 233, 0.3)',
            },
          }}
        >
          <SearchIcon sx={{ color: 'text.secondary', fontSize: 20, mr: 1.5 }} />
          <InputBase
            placeholder="Search markets, events, or ask AI..."
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            sx={{
              flex: 1,
              fontSize: '0.875rem',
              '& input': {
                padding: 0,
                '&::placeholder': {
                  color: 'text.secondary',
                  opacity: 0.8,
                },
              },
            }}
          />
          <Stack direction="row" spacing={0.5} sx={{ ml: 1 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                px: 0.75,
                py: 0.25,
                borderRadius: 1,
                backgroundColor: alpha(theme.palette.text.primary, 0.08),
                fontSize: '0.7rem',
                color: 'text.secondary',
              }}
            >
              <KeyboardCommandKey sx={{ fontSize: 12, mr: 0.25 }} />
              K
            </Box>
          </Stack>
        </Box>
      </Box>

      {/* Right: Actions */}
      <Stack direction="row" alignItems="center" spacing={1.5}>
        {/* Ask AI Button */}
        <Button
          variant="contained"
          size="small"
          startIcon={<AutoAwesome sx={{ fontSize: 16 }} />}
          onClick={handleAskPredictions}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.8rem',
            borderRadius: 2,
            px: 2,
            py: 0.75,
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
            boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.3)}`,
            '&:hover': {
              background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
            },
          }}
        >
          Ask AI
        </Button>

        {/* Notifications */}
        <Tooltip title="Alerts">
          <IconButton
            size="small"
            onClick={() => navigate('/alerts')}
            sx={{
              color: 'text.secondary',
              '&:hover': { color: 'text.primary', backgroundColor: alpha(theme.palette.text.primary, 0.05) },
            }}
          >
            <Badge 
              badgeContent={3} 
              color="error"
              sx={{
                '& .MuiBadge-badge': {
                  fontSize: '0.65rem',
                  minWidth: 16,
                  height: 16,
                },
              }}
            >
              <NotificationsIcon sx={{ fontSize: 20 }} />
            </Badge>
          </IconButton>
        </Tooltip>

        {/* Theme Toggle */}
        <ThemeToggle />
      </Stack>
    </Box>
  );
};
