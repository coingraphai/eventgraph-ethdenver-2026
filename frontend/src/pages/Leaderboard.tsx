import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Tooltip,
  IconButton,
  Link as MuiLink,
  Alert,
  Paper,
  Grid,
} from '@mui/material';
import {
  TrendingUp,
  OpenInNew,
  Refresh,
  EmojiEvents,
  ShowChart,
  AttachMoney,
} from '@mui/icons-material';

interface Trader {
  rank: number;
  wallet_address: string;
  platform: string;
  profile_url: string;
  pnl: number;
  pnl_24h: number;
  pnl_7d: number;
  pnl_30d: number;
  volume: number;
  trades: number;
  win_rate: number;
  roi: number;
  avg_position_size: number;
  last_trade: string;
  updated_at: string;
  // Phase 1 enhanced fields
  is_whale?: boolean;
  is_active_7d?: boolean;
  strategy_type?: string;
  top_market_1?: string;
  avg_hold_duration_hours?: number;
}

interface LeaderboardStats {
  total_traders: number;
  total_pnl: number;
  total_volume: number;
  total_trades: number;
  avg_win_rate: number;
  platform_breakdown: Record<string, number>;
}

export const Leaderboard: React.FC = () => {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [stats, setStats] = useState<LeaderboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [timeWindow, setTimeWindow] = useState<string>('all_time');
  const [platform, setPlatform] = useState<string>('all');
  const [limit, setLimit] = useState<number>(100);
  const [showWhalesOnly, setShowWhalesOnly] = useState<boolean>(false);
  const [showActiveOnly, setShowActiveOnly] = useState<boolean>(false);
  const [strategyFilter, setStrategyFilter] = useState<string>('all');

  useEffect(() => {
    fetchLeaderboard();
    fetchStats();
  }, [timeWindow, platform]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        time_window: timeWindow,
      });
      
      if (platform !== 'all') {
        params.append('platform', platform);
      }
      
      const response = await fetch(`/api/leaderboard?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setTraders(data.traders);
      } else {
        setError(data.error || 'Failed to load leaderboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch leaderboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    setStatsLoading(true);
    
    try {
      const response = await fetch('/api/leaderboard/stats');
      const data = await response.json();
      
      if (data.success) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchLeaderboard();
    fetchStats();
  };

  const formatPnL = (pnl: number) => {
    const color = pnl >= 0 ? 'success' : 'error';
    const sign = pnl >= 0 ? '+' : '';
    return (
      <Chip
        label={`${sign}$${pnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        color={color}
        size="small"
        sx={{ fontWeight: 'bold', minWidth: 100 }}
      />
    );
  };

  const formatWallet = (wallet: string) => {
    if (wallet.length > 15) {
      return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
    }
    return wallet;
  };

  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case 'polymarket':
        return 'primary';
      case 'kalshi':
        return 'secondary';
      case 'limitless':
        return 'info';
      default:
        return 'default';
    }
  };

  const getPlatformIcon = (platform: string) => {
    // Could add custom platform icons here
    return <EmojiEvents fontSize="small" />;
  };

  const getTimeWindowLabel = (window: string) => {
    switch (window) {
      case '24h':
        return '24 Hours';
      case '7d':
        return '7 Days';
      case '30d':
        return '30 Days';
      case 'all_time':
        return 'All Time';
      default:
        return window;
    }
  };

  const getPnLByTimeWindow = (trader: Trader) => {
    switch (timeWindow) {
      case '24h':
        return trader.pnl_24h;
      case '7d':
        return trader.pnl_7d;
      case '30d':
        return trader.pnl_30d;
      case 'all_time':
      default:
        return trader.pnl;
    }
  };

  // Phase 1: Strategy type colors
  const getStrategyColor = (strategy?: string) => {
    switch (strategy) {
      case 'scalper':
        return 'info';
      case 'swing_trader':
        return 'success';
      case 'long_term':
        return 'secondary';
      case 'arbitrageur':
        return 'warning';
      case 'mixed':
        return 'default';
      default:
        return 'default';
    }
  };

  const getStrategyLabel = (strategy?: string) => {
    switch (strategy) {
      case 'scalper':
        return 'Scalper';
      case 'swing_trader':
        return 'Swing';
      case 'long_term':
        return 'Long-term';
      case 'arbitrageur':
        return 'Arbitrage';
      case 'mixed':
        return 'Mixed';
      default:
        return 'Unknown';
    }
  };

  // Phase 1: Filter traders client-side
  const filteredTraders = traders.filter(trader => {
    if (showWhalesOnly && !trader.is_whale) return false;
    if (showActiveOnly && !trader.is_active_7d) return false;
    if (strategyFilter !== 'all' && trader.strategy_type !== strategyFilter) return false;
    return true;
  });

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
          <EmojiEvents sx={{ fontSize: 40, color: 'warning.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">
              Trader Leaderboard
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Top performing traders across prediction markets
            </Typography>
          </Box>
        </Stack>

        {/* Stats Cards */}
        {!statsLoading && stats && (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h6" color="primary" fontWeight="bold">
                  {stats.total_traders}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Traders
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h6" color="success.main" fontWeight="bold">
                  ${stats.total_pnl.toLocaleString()}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Combined PnL
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h6" color="info.main" fontWeight="bold">
                  ${stats.total_volume.toLocaleString()}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Volume
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h6" color="warning.main" fontWeight="bold">
                  {(stats.avg_win_rate * 100).toFixed(1)}%
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Avg Win Rate
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        )}
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            {/* Row 1: Time, Platform, Limit */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              {/* Time Window Filter */}
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Time Period
                </Typography>
                <ToggleButtonGroup
                  value={timeWindow}
                  exclusive
                  onChange={(_, value) => value && setTimeWindow(value)}
                  size="small"
                  fullWidth
                >
                  <ToggleButton value="24h">24h</ToggleButton>
                  <ToggleButton value="7d">7d</ToggleButton>
                  <ToggleButton value="30d">30d</ToggleButton>
                  <ToggleButton value="all_time">All Time</ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {/* Platform Filter */}
              <FormControl sx={{ minWidth: 200 }}>
                <InputLabel>Platform</InputLabel>
                <Select
                  value={platform}
                  label="Platform"
                  onChange={(e) => setPlatform(e.target.value)}
                  size="small"
                >
                  <MenuItem value="all">All Platforms</MenuItem>
                  <MenuItem value="polymarket">Polymarket</MenuItem>
                  <MenuItem value="kalshi">Kalshi</MenuItem>
                </Select>
              </FormControl>

              {/* Limit Selector */}
              <FormControl sx={{ minWidth: 150 }}>
                <InputLabel>Show Top</InputLabel>
                <Select
                  value={limit}
                  label="Show Top"
                  onChange={(e) => setLimit(Number(e.target.value))}
                  size="small"
                >
                  <MenuItem value={50}>Top 50</MenuItem>
                  <MenuItem value={100}>Top 100</MenuItem>
                  <MenuItem value={250}>Top 250</MenuItem>
                  <MenuItem value={500}>Top 500</MenuItem>
                  <MenuItem value={1000}>Top 1,000</MenuItem>
                  <MenuItem value={2000}>Top 2,000</MenuItem>
                </Select>
              </FormControl>

              {/* Refresh Button */}
              <Tooltip title="Refresh data">
                <IconButton onClick={handleRefresh} color="primary" disabled={loading}>
                  <Refresh />
                </IconButton>
              </Tooltip>
            </Stack>

            {/* Row 2: Phase 1 Enhanced Filters */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              {/* Strategy Filter */}
              <FormControl sx={{ minWidth: 200 }}>
                <InputLabel>Strategy Type</InputLabel>
                <Select
                  value={strategyFilter}
                  label="Strategy Type"
                  onChange={(e) => setStrategyFilter(e.target.value)}
                  size="small"
                >
                  <MenuItem value="all">All Strategies</MenuItem>
                  <MenuItem value="scalper">Scalper</MenuItem>
                  <MenuItem value="swing_trader">Swing Trader</MenuItem>
                  <MenuItem value="long_term">Long-term</MenuItem>
                  <MenuItem value="arbitrageur">Arbitrage</MenuItem>
                  <MenuItem value="mixed">Mixed</MenuItem>
                </Select>
              </FormControl>

              {/* Whales Only Toggle */}
              <ToggleButtonGroup
                value={showWhalesOnly ? 'whales' : 'all'}
                exclusive
                onChange={(_, value) => setShowWhalesOnly(value === 'whales')}
                size="small"
              >
                <ToggleButton value="all">All Traders</ToggleButton>
                <ToggleButton value="whales">🐋 Whales Only</ToggleButton>
              </ToggleButtonGroup>

              {/* Active Only Toggle */}
              <ToggleButtonGroup
                value={showActiveOnly ? 'active' : 'all'}
                exclusive
                onChange={(_, value) => setShowActiveOnly(value === 'active')}
                size="small"
              >
                <ToggleButton value="all">All Status</ToggleButton>
                <ToggleButton value="active">🟢 Active Only</ToggleButton>
              </ToggleButtonGroup>

              {/* Results Counter */}
              <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
                Showing {filteredTraders.length} of {traders.length} traders
              </Typography>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* Info Alert */}
      <Alert severity="success" sx={{ mb: 3 }}>
        <Typography variant="body2" fontWeight="bold">
          ✅ LIVE DATA: Real trader stats from actual Polymarket trades via Dome API
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          📊 <strong>Ranked by PnL (Profit/Loss)</strong> - Top performers by profitability
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          👥 Showing most active traders from last 90 days, sorted by total profit
        </Typography>
      </Alert>

      {/* Error State */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Loading State */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        /* Leaderboard Table */
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'background.paper' }}>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                    Rank
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Trader</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Strategy</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Platform</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    PnL ({getTimeWindowLabel(timeWindow)})
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    Volume
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    Trades
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    Win Rate
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    ROI
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                    Action
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTraders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        No traders found for the selected filters
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTraders.map((trader) => (
                    <TableRow
                      key={`${trader.platform}-${trader.wallet_address}`}
                      hover
                      sx={{
                        '&:nth-of-type(odd)': {
                          backgroundColor: 'action.hover',
                        },
                      }}
                    >
                      {/* Rank */}
                      <TableCell align="center">
                        <Chip
                          label={`#${trader.rank}`}
                          size="small"
                          color={trader.rank <= 3 ? 'warning' : 'default'}
                          sx={{
                            fontWeight: trader.rank <= 3 ? 'bold' : 'normal',
                            minWidth: 50,
                          }}
                        />
                      </TableCell>

                      {/* Trader Wallet with Whale Badge & Activity */}
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          {/* Activity Indicator */}
                          <Tooltip title={trader.is_active_7d ? "Active (traded in last 7 days)" : "Inactive"}>
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                backgroundColor: trader.is_active_7d ? 'success.main' : 'error.main',
                              }}
                            />
                          </Tooltip>
                          
                          {/* Wallet Address */}
                          <Tooltip title={trader.wallet_address}>
                            <Typography
                              variant="body2"
                              fontFamily="monospace"
                              sx={{ cursor: 'pointer' }}
                            >
                              {formatWallet(trader.wallet_address)}
                            </Typography>
                          </Tooltip>
                          
                          {/* Whale Badge */}
                          {trader.is_whale && (
                            <Tooltip title="Whale - Large Position Sizes">
                              <Chip
                                label="🐋"
                                size="small"
                                color="info"
                                sx={{ height: 20, fontSize: '0.75rem' }}
                              />
                            </Tooltip>
                          )}
                          
                          {/* Top Market Tag */}
                          {trader.top_market_1 && (
                            <Tooltip title={`Specializes in: ${trader.top_market_1}`}>
                              <Chip
                                label={trader.top_market_1.slice(0, 20) + (trader.top_market_1.length > 20 ? '...' : '')}
                                size="small"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.65rem', maxWidth: 150 }}
                              />
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>

                      {/* Strategy Type */}
                      <TableCell>
                        <Tooltip title={`Avg hold: ${trader.avg_hold_duration_hours?.toFixed(1) || '0'}h`}>
                          <Chip
                            label={getStrategyLabel(trader.strategy_type)}
                            size="small"
                            color={getStrategyColor(trader.strategy_type)}
                          />
                        </Tooltip>
                      </TableCell>

                      {/* Platform */}
                      <TableCell>
                        <Chip
                          label={trader.platform}
                          size="small"
                          color={getPlatformColor(trader.platform)}
                          icon={getPlatformIcon(trader.platform)}
                        />
                      </TableCell>

                      {/* PnL */}
                      <TableCell align="right">
                        {formatPnL(getPnLByTimeWindow(trader))}
                      </TableCell>

                      {/* Volume */}
                      <TableCell align="right">
                        <Typography variant="body2" color="text.secondary">
                          ${trader.volume.toLocaleString()}
                        </Typography>
                      </TableCell>

                      {/* Trades */}
                      <TableCell align="right">
                        <Typography variant="body2">
                          {trader.trades.toLocaleString()}
                        </Typography>
                      </TableCell>

                      {/* Win Rate */}
                      <TableCell align="right">
                        <Chip
                          label={`${(trader.win_rate * 100).toFixed(1)}%`}
                          size="small"
                          color={trader.win_rate >= 0.6 ? 'success' : 'default'}
                        />
                      </TableCell>

                      {/* ROI */}
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          color={trader.roi >= 0 ? 'success.main' : 'error.main'}
                          fontWeight="bold"
                        >
                          {trader.roi >= 0 ? '+' : ''}
                          {trader.roi.toFixed(1)}%
                        </Typography>
                      </TableCell>

                      {/* Action - External Link */}
                      <TableCell align="center">
                        <Button
                          size="small"
                          variant="outlined"
                          endIcon={<OpenInNew />}
                          component={MuiLink}
                          href={trader.profile_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{ textTransform: 'none' }}
                        >
                          View Profile
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          
          {/* Footer with trader count */}
          {!loading && traders.length > 0 && (
            <Box sx={{ p: 2, backgroundColor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary">
                Showing top {filteredTraders.length} traders (filtered from {traders.length})
              </Typography>
            </Box>
          )}
        </Card>
      )}

      {/* Explanation Footer */}
      <Card sx={{ mt: 3, p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          <strong>💡 How to use:</strong>
        </Typography>
        <Typography variant="body2" color="text.secondary" component="ul" sx={{ pl: 3, mt: 1 }}>
          <li>Browse up to <strong>2,000 top traders</strong> ranked by profit & loss (PnL)</li>
          <li>Filter by time period (24h, 7d, 30d, all-time) and platform</li>
          <li><strong>🐋 Whale traders</strong> have large position sizes ($50K+ avg or $500K+ volume)</li>
          <li><strong>Strategy types</strong>: Scalper (fast trades), Swing (medium-term), Long-term, Arbitrage</li>
          <li><strong>🟢 Green dot</strong> = Active (traded in last 7 days), <strong>🔴 Red dot</strong> = Inactive</li>
          <li>Click "View Profile" to see full trader details on the platform website</li>
          <li>Analyze their stats: win rate, ROI, volume, and trade count</li>
          <li>Use insights to inform your own trading strategies</li>
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
          🔄 Data refreshed periodically from live trades. Run <code>python populate_trader_stats.py</code> to update manually.
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          ⚠️ Note: Data shown is for educational purposes. Past performance does not guarantee future results.
        </Typography>
      </Card>
    </Box>
  );
};

