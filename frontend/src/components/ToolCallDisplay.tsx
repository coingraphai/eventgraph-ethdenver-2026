import React from 'react';
import {
  Box,
  Typography,
  Chip,
  Stack,
  Paper,
  useTheme,
  Fade,
  LinearProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  BarChart as BarChartIcon,
  Compare as CompareIcon,
  Category as CategoryIcon,
  TrendingUp as TrendingUpIcon,
  Info as InfoIcon,
  Api as ApiIcon,
  Bolt as BoltIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { ToolCallInfo } from '../services/chatApi';

interface ToolCallDisplayProps {
  toolCalls: ToolCallInfo[];
}

// Human-readable labels and icons for each tool
const TOOL_CONFIG: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  search_events: {
    label: 'Search Events',
    icon: <SearchIcon sx={{ fontSize: 14 }} />,
    description: 'Searching prediction markets...',
  },
  get_market_overview: {
    label: 'Market Overview',
    icon: <BarChartIcon sx={{ fontSize: 14 }} />,
    description: 'Getting market stats...',
  },
  get_top_markets: {
    label: 'Top Markets',
    icon: <TrendingUpIcon sx={{ fontSize: 14 }} />,
    description: 'Fetching top markets by volume...',
  },
  get_category_breakdown: {
    label: 'Categories',
    icon: <CategoryIcon sx={{ fontSize: 14 }} />,
    description: 'Analyzing categories...',
  },
  compare_platforms: {
    label: 'Compare Platforms',
    icon: <CompareIcon sx={{ fontSize: 14 }} />,
    description: 'Comparing platforms...',
  },
  get_event_detail: {
    label: 'Event Detail',
    icon: <InfoIcon sx={{ fontSize: 14 }} />,
    description: 'Getting event details...',
  },
  polymarket_get_markets: {
    label: 'Polymarket API',
    icon: <ApiIcon sx={{ fontSize: 14 }} />,
    description: 'Calling Polymarket...',
  },
  kalshi_get_markets: {
    label: 'Kalshi API',
    icon: <ApiIcon sx={{ fontSize: 14 }} />,
    description: 'Calling Kalshi...',
  },
  polymarket_get_trade_history: {
    label: 'Trade History',
    icon: <ApiIcon sx={{ fontSize: 14 }} />,
    description: 'Fetching trade history...',
  },
  polymarket_get_market_price: {
    label: 'Market Price',
    icon: <ApiIcon sx={{ fontSize: 14 }} />,
    description: 'Getting market price...',
  },
  polymarket_get_orderbook_history: {
    label: 'Orderbook',
    icon: <ApiIcon sx={{ fontSize: 14 }} />,
    description: 'Fetching orderbook...',
  },
  matching_markets_sports: {
    label: 'Sports Match',
    icon: <ApiIcon sx={{ fontSize: 14 }} />,
    description: 'Matching sports markets...',
  },
};

const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({ toolCalls }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <Fade in timeout={300}>
      <Paper
        elevation={0}
        sx={{
          mb: 2,
          p: 1.5,
          borderRadius: '12px',
          background: isDark
            ? 'linear-gradient(135deg, rgba(30, 30, 30, 0.9) 0%, rgba(20, 25, 20, 0.9) 100%)'
            : 'linear-gradient(135deg, rgba(247, 255, 228, 0.95) 0%, rgba(240, 250, 220, 0.95) 100%)',
          border: `1px solid ${isDark ? 'rgba(187, 217, 119, 0.15)' : 'rgba(187, 217, 119, 0.3)'}`,
          backdropFilter: 'blur(10px)',
        }}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <BoltIcon sx={{ fontSize: 16, color: '#BBD977' }} />
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              fontSize: '11px',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: isDark ? 'rgba(187, 217, 119, 0.8)' : 'rgba(120, 160, 60, 0.9)',
            }}
          >
            Tool Calls ({toolCalls.length})
          </Typography>
        </Box>

        {/* Tool Call Chips */}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {toolCalls.map((tc, idx) => {
            const config = TOOL_CONFIG[tc.tool] || {
              label: tc.tool,
              icon: <ApiIcon sx={{ fontSize: 14 }} />,
              description: 'Processing...',
            };
            const isComplete = tc.status === 'complete';
            const isCache = tc.source === 'cache';

            return (
              <Fade in timeout={200 + idx * 100} key={`${tc.tool}-${idx}`}>
                <Box sx={{ position: 'relative' }}>
                  <Chip
                    size="small"
                    icon={
                      isComplete ? (
                        <CheckCircleIcon sx={{ fontSize: 14, color: '#BBD977 !important' }} />
                      ) : (
                        <>{config.icon}</>
                      )
                    }
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <span>{config.label}</span>
                        {isCache && (
                          <Box
                            component="span"
                            sx={{
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '1px 4px',
                              borderRadius: '4px',
                              backgroundColor: isDark
                                ? 'rgba(187, 217, 119, 0.15)'
                                : 'rgba(187, 217, 119, 0.25)',
                              color: isDark ? '#BBD977' : '#6B8E23',
                              letterSpacing: '0.03em',
                            }}
                          >
                            INSTANT
                          </Box>
                        )}
                      </Box>
                    }
                    sx={{
                      height: 28,
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 500,
                      backgroundColor: isDark
                        ? isComplete
                          ? 'rgba(187, 217, 119, 0.08)'
                          : 'rgba(255, 255, 255, 0.05)'
                        : isComplete
                          ? 'rgba(187, 217, 119, 0.15)'
                          : 'rgba(0, 0, 0, 0.04)',
                      border: `1px solid ${
                        isComplete
                          ? isDark
                            ? 'rgba(187, 217, 119, 0.25)'
                            : 'rgba(187, 217, 119, 0.4)'
                          : isDark
                            ? 'rgba(255, 255, 255, 0.1)'
                            : 'rgba(0, 0, 0, 0.08)'
                      }`,
                      color: isDark ? '#E0E0E0' : '#333',
                      transition: 'all 0.3s ease',
                      '& .MuiChip-icon': {
                        color: isComplete
                          ? '#BBD977'
                          : isDark
                            ? 'rgba(187, 217, 119, 0.6)'
                            : 'rgba(120, 160, 60, 0.7)',
                      },
                      ...(!isComplete && {
                        animation: 'toolPulse 1.5s ease-in-out infinite',
                      }),
                    }}
                  />
                  {/* Progress bar for in-progress tools */}
                  {!isComplete && (
                    <LinearProgress
                      sx={{
                        position: 'absolute',
                        bottom: 0,
                        left: 4,
                        right: 4,
                        height: 2,
                        borderRadius: 1,
                        backgroundColor: 'transparent',
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: '#BBD977',
                        },
                      }}
                    />
                  )}
                </Box>
              </Fade>
            );
          })}
        </Stack>

        {/* Pulse animation */}
        <style>
          {`
            @keyframes toolPulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.7; }
            }
          `}
        </style>
      </Paper>
    </Fade>
  );
};

export default ToolCallDisplay;
