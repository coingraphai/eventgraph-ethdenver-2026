/**
 * Enhanced Portfolio Page
 * Professional portfolio management with:
 * - Glassmorphism design
 * - Animated metric cards
 * - Enhanced data visualization
 * - Modern trading interface
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  Grid,
  Card,
  CardContent,
  alpha,
  useTheme,
  keyframes,
  Stack,
  LinearProgress,
} from '@mui/material';
import { 
  TrendingUp, 
  TrendingDown,
  AccountBalanceWallet,
  ShowChart,
  Receipt,
  History,
} from '@mui/icons-material';

// Animations
const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 4px 20px rgba(135, 206, 235, 0.15); }
  50% { box-shadow: 0 4px 30px rgba(135, 206, 235, 0.25); }
`;

interface Position {
  id: string;
  event: string;
  side: 'YES' | 'NO';
  size: number;
  avgEntry: number;
  currentMark: number;
  pnl: number;
  pnlPercent: number;
  venue: string;
}

interface Order {
  id: string;
  event: string;
  side: 'BUY' | 'SELL';
  direction: 'YES' | 'NO';
  size: number;
  price: number;
  filled: number;
  status: 'Open' | 'Partial' | 'Filled' | 'Cancelled';
  venue: string;
}

const mockPositions: Position[] = [
  {
    id: '1',
    event: 'Bitcoin to reach $150k by end of 2026',
    side: 'YES',
    size: 500,
    avgEntry: 0.65,
    currentMark: 0.68,
    pnl: 15,
    pnlPercent: 4.6,
    venue: 'Polymarket',
  },
  {
    id: '2',
    event: 'Democrats win 2026 midterm elections',
    side: 'NO',
    size: 800,
    avgEntry: 0.52,
    currentMark: 0.48,
    pnl: 32,
    pnlPercent: 7.7,
    venue: 'Kalshi',
  },
  {
    id: '3',
    event: 'Ethereum ETF approval in Q1 2026',
    side: 'YES',
    size: 300,
    avgEntry: 0.78,
    currentMark: 0.75,
    pnl: -9,
    pnlPercent: -3.8,
    venue: 'Polymarket',
  },
];

const mockOrders: Order[] = [
  {
    id: '1',
    event: 'Bitcoin to reach $150k by end of 2026',
    side: 'BUY',
    direction: 'YES',
    size: 200,
    price: 0.67,
    filled: 120,
    status: 'Partial',
    venue: 'Polymarket',
  },
  {
    id: '2',
    event: 'Super Bowl LX winner - Kansas City Chiefs',
    side: 'SELL',
    direction: 'NO',
    size: 150,
    price: 0.42,
    filled: 0,
    status: 'Open',
    venue: 'Kalshi',
  },
];

export const Portfolio: React.FC = () => {
  const theme = useTheme();
  const [selectedTab, setSelectedTab] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue);
  };

  const totalUnrealizedPnL = mockPositions.reduce((sum, pos) => sum + pos.pnl, 0);
  const totalExposure = mockPositions.reduce((sum, pos) => sum + pos.size * pos.avgEntry, 0);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  // Summary cards data
  const summaryCards = [
    {
      title: 'Total Exposure',
      value: formatCurrency(totalExposure),
      subtitle: `Across ${mockPositions.length} positions`,
      icon: AccountBalanceWallet,
      color: theme.palette.primary.main,
      gradient: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.15)} 0%, ${alpha(theme.palette.primary.main, 0.05)} 100%)`,
    },
    {
      title: 'Unrealized P&L',
      value: formatCurrency(totalUnrealizedPnL),
      subtitle: `${totalUnrealizedPnL >= 0 ? '+' : ''}${((totalUnrealizedPnL / totalExposure) * 100).toFixed(2)}%`,
      icon: ShowChart,
      color: totalUnrealizedPnL >= 0 ? theme.palette.success.main : theme.palette.error.main,
      gradient: totalUnrealizedPnL >= 0 
        ? `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.15)} 0%, ${alpha(theme.palette.success.main, 0.05)} 100%)`
        : `linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.15)} 0%, ${alpha(theme.palette.error.main, 0.05)} 100%)`,
    },
    {
      title: 'Realized P&L (7d)',
      value: formatCurrency(142.50),
      subtitle: '+12.4% ROI',
      icon: TrendingUp,
      color: theme.palette.success.main,
      gradient: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.15)} 0%, ${alpha(theme.palette.success.main, 0.05)} 100%)`,
    },
    {
      title: 'Total Fees Paid',
      value: formatCurrency(28.75),
      subtitle: 'Last 30 days',
      icon: Receipt,
      color: theme.palette.warning.main,
      gradient: `linear-gradient(135deg, ${alpha(theme.palette.warning.main, 0.15)} 0%, ${alpha(theme.palette.warning.main, 0.05)} 100%)`,
    },
  ];

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, minHeight: 'calc(100vh - 56px)' }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <Typography variant="h5" fontWeight={700}>
          Portfolio
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Cross-venue position and order management
      </Typography>

      {/* Portfolio Summary - Enhanced Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {summaryCards.map((card, idx) => (
          <Grid item xs={12} sm={6} md={3} key={card.title}>
            <Card
              elevation={0}
              sx={{
                background: card.gradient,
                border: `1px solid ${alpha(card.color, 0.2)}`,
                backdropFilter: 'blur(10px)',
                borderRadius: 3,
                transition: 'all 0.3s ease',
                animation: `${fadeInUp} 0.5s ease-out ${idx * 0.1}s both`,
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: `0 8px 24px ${alpha(card.color, 0.2)}`,
                },
              }}
            >
              <CardContent sx={{ p: 2.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
                  <Typography variant="body2" color="text.secondary" fontWeight={500}>
                    {card.title}
                  </Typography>
                  <Box 
                    sx={{ 
                      p: 0.75, 
                      borderRadius: 1.5, 
                      background: alpha(card.color, 0.15),
                    }}
                  >
                    <card.icon sx={{ fontSize: 18, color: card.color }} />
                  </Box>
                </Stack>
                <Typography 
                  variant="h4" 
                  fontWeight={700}
                  sx={{ 
                    color: card.title.includes('P&L') ? card.color : 'text.primary',
                    fontFamily: 'monospace',
                    mb: 0.5,
                  }}
                >
                  {card.value}
                </Typography>
                <Typography 
                  variant="caption" 
                  sx={{ color: card.title.includes('P&L') ? card.color : 'text.secondary' }}
                >
                  {card.subtitle}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Tabs - Enhanced */}
      <Paper
        elevation={0}
        sx={{
          background: alpha(theme.palette.background.paper, 0.6),
          backdropFilter: 'blur(10px)',
          border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
          borderRadius: 3,
          overflow: 'hidden',
          animation: `${fadeInUp} 0.5s ease-out 0.4s both`,
        }}
      >
        <Tabs
          value={selectedTab}
          onChange={handleTabChange}
          sx={{ 
            borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`, 
            px: 2,
            '& .MuiTab-root': {
              minWidth: 120,
              fontWeight: 600,
            },
          }}
        >
          <Tab icon={<ShowChart sx={{ fontSize: 18 }} />} iconPosition="start" label="Positions" />
          <Tab icon={<Receipt sx={{ fontSize: 18 }} />} iconPosition="start" label="Orders" />
          <Tab icon={<History sx={{ fontSize: 18 }} />} iconPosition="start" label="History" />
        </Tabs>

        {/* Positions Tab */}
        {selectedTab === 0 && (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ background: alpha(theme.palette.primary.main, 0.03) }}>
                  <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>Event</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, color: 'text.secondary' }}>Side</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: 'text.secondary' }}>Size</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: 'text.secondary' }}>Avg Entry</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: 'text.secondary' }}>Current Mark</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: 'text.secondary' }}>P&L</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>Venue</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, color: 'text.secondary' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mockPositions.map((position, idx) => (
                  <TableRow 
                    key={position.id} 
                    sx={{ 
                      transition: 'all 0.2s ease',
                      animation: `${fadeInUp} 0.4s ease-out ${idx * 0.05}s both`,
                      '&:hover': {
                        background: alpha(theme.palette.primary.main, 0.05),
                      },
                    }}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {position.event}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={position.side}
                        size="small"
                        sx={{
                          fontWeight: 700,
                          background: position.side === 'YES' 
                            ? alpha(theme.palette.success.main, 0.15)
                            : alpha(theme.palette.error.main, 0.15),
                          color: position.side === 'YES' 
                            ? theme.palette.success.main
                            : theme.palette.error.main,
                          border: `1px solid ${position.side === 'YES' 
                            ? alpha(theme.palette.success.main, 0.3)
                            : alpha(theme.palette.error.main, 0.3)}`,
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={600} fontFamily="monospace">
                        {formatCurrency(position.size)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontFamily="monospace">
                        {(position.avgEntry * 100).toFixed(1)}¢
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontFamily="monospace">
                        {(position.currentMark * 100).toFixed(1)}¢
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Box>
                        <Typography
                          variant="body2"
                          fontWeight={700}
                          fontFamily="monospace"
                          color={position.pnl >= 0 ? 'success.main' : 'error.main'}
                        >
                          {position.pnl >= 0 ? '+' : ''}{formatCurrency(position.pnl)}
                        </Typography>
                        <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5}>
                          {position.pnl >= 0 ? (
                            <TrendingUp sx={{ fontSize: 14, color: 'success.main' }} />
                          ) : (
                            <TrendingDown sx={{ fontSize: 14, color: 'error.main' }} />
                          )}
                          <Typography
                            variant="caption"
                            fontWeight={600}
                            color={position.pnl >= 0 ? 'success.main' : 'error.main'}
                          >
                            {position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
                          </Typography>
                        </Stack>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={position.venue} 
                        size="small" 
                        sx={{
                          background: alpha(theme.palette.primary.main, 0.1),
                          border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                        }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Button
                        variant="outlined"
                        size="small"
                        sx={{
                          fontWeight: 600,
                          borderColor: alpha(theme.palette.error.main, 0.5),
                          color: theme.palette.error.main,
                          '&:hover': {
                            background: alpha(theme.palette.error.main, 0.1),
                            borderColor: theme.palette.error.main,
                          },
                        }}
                      >
                        Close
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Orders Tab */}
        {selectedTab === 1 && (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Event</TableCell>
                  <TableCell align="center">Side</TableCell>
                  <TableCell align="center">Direction</TableCell>
                  <TableCell align="right">Size</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell align="right">Filled</TableCell>
                  <TableCell align="center">Status</TableCell>
                  <TableCell>Venue</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mockOrders.map((order) => (
                  <TableRow key={order.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {order.event}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={order.side}
                        size="small"
                        color={order.side === 'BUY' ? 'success' : 'error'}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={order.direction}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {formatCurrency(order.size)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {(order.price * 100).toFixed(1)}%
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {order.filled}/{order.size}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={order.status}
                        size="small"
                        color={
                          order.status === 'Filled' ? 'success' :
                          order.status === 'Partial' ? 'warning' :
                          order.status === 'Open' ? 'info' : 'default'
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Chip label={order.venue} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell align="center">
                      <Button
                        variant="outlined"
                        size="small"
                        color="error"
                        disabled={order.status === 'Filled' || order.status === 'Cancelled'}
                      >
                        Cancel
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* History Tab */}
        {selectedTab === 2 && (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              Trade history will be displayed here
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
};
