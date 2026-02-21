/**
 * Markets Discovery Page
 * Shows aggregated prediction markets from Polymarket + Kalshi via Dome API
 */

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import axios from 'axios';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  Chip,
  Stack,
  Skeleton,
  Alert,
  TextField,
  InputAdornment,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Pagination,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  Star,
  StarBorder,
  NotificationsNone,
  NotificationsActive,
  ZoomIn,
  Search,
  Refresh,
  FilterList,
  Bolt,
  Code,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useMarkets, CategoryFilter } from '../hooks/useMarkets';
import { useWatchlist } from '../hooks/useWatchlist';
import { useAlerts } from '../hooks/useAlerts';

interface DataFreshness {
  last_updated: string | null;
  platforms: Record<string, { updated_at: string; item_count: number; status: string }>;
  server_time: string;
}

// Tab to category mapping
const TAB_CATEGORIES: CategoryFilter[] = ['all', 'Politics', 'Crypto', 'Sports', 'Entertainment', 'Other'];

export const Markets: React.FC = () => {
  const navigate = useNavigate();
  const [dataFreshness, setDataFreshness] = useState<DataFreshness | null>(null);
  
  // Market data hook
  const {
    filteredMarkets,
    stats,
    loading,
    error,
    setCategory,
    searchQuery,
    setSearchQuery,
    showOnlyArb,
    setShowOnlyArb,
    refresh,
  } = useMarkets({ autoRefresh: true, refreshInterval: 60000 });

  // Watchlist hook
  const { watchlist, toggleWatchlist, isWatching } = useWatchlist();

  // Alerts hook
  const { createAlert, getAlertsForMarket } = useAlerts();

  // UI state
  const [selectedTab, setSelectedTab] = useState(0);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [alertMarketId, setAlertMarketId] = useState<string | null>(null);
  const [alertTargetPrice, setAlertTargetPrice] = useState<number>(0.5);
  const [alertCondition, setAlertCondition] = useState<'above' | 'below'>('above');
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const marketsPerPage = 10;
  const [rawDataDialogOpen, setRawDataDialogOpen] = useState(false);
  const [selectedRawData, setSelectedRawData] = useState<any>(null);

  // Fetch data freshness
  useEffect(() => {
    const fetchFreshness = async () => {
      try {
        const res = await axios.get<DataFreshness>(`${import.meta.env.VITE_API_BASE_URL || ''}/dashboard/data-freshness`);
        setDataFreshness(res.data);
      } catch (err) {
        console.error('Failed to fetch data freshness:', err);
      }
    };
    fetchFreshness();
  }, []);

  // Calculate pagination
  const totalPages = Math.ceil(filteredMarkets.length / marketsPerPage);
  const startIndex = (page - 1) * marketsPerPage;
  const endIndex = startIndex + marketsPerPage;
  const paginatedMarkets = filteredMarkets.slice(startIndex, endIndex);

  const handlePageChange = (_event: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue);
    setCategory(TAB_CATEGORIES[newValue]);
    setPage(1); // Reset to first page when changing tabs
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleOpenAlertDialog = (marketId: string, currentPrice: number) => {
    setAlertMarketId(marketId);
    setAlertTargetPrice(currentPrice);
    setAlertDialogOpen(true);
  };

  const handleCreateAlert = () => {
    if (!alertMarketId) return;
    
    const market = filteredMarkets.find(m => m.id === alertMarketId);
    if (!market) return;

    createAlert({
      marketId: alertMarketId,
      marketTitle: market.title,
      type: 'price',
      condition: alertCondition,
      targetValue: alertTargetPrice,
      enabled: true,
    });

    setAlertDialogOpen(false);
    setAlertMarketId(null);
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const formatExpiryDate = (expiryTime: number | null) => {
    if (!expiryTime) return 'No expiry';
    const date = new Date(expiryTime * 1000); // Convert seconds to milliseconds
    return format(date, "MMM d, ''yy");
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h4" fontWeight={700} gutterBottom>
              Markets Overview
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="body2" color="text.secondary">
                Live prediction markets from Polymarket & Kalshi via Dome API
              </Typography>
              {dataFreshness?.last_updated && (
                <Chip
                  size="small"
                  label={`Updated: ${new Date(dataFreshness.last_updated).toLocaleTimeString()}`}
                  sx={{ 
                    backgroundColor: 'rgba(34, 197, 94, 0.1)', 
                    color: '#22C55E',
                    fontSize: '0.7rem',
                    height: 22,
                  }}
                  icon={<Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#22C55E', ml: 1 }} />}
                />
              )}
            </Stack>
          </Box>
          <Stack direction="row" spacing={1}>
            <Tooltip title="Refresh markets">
              <IconButton onClick={handleRefresh} disabled={refreshing}>
                {refreshing ? <CircularProgress size={24} /> : <Refresh />}
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        {/* Error Alert */}
        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}. Showing cached/mock data.
          </Alert>
        )}

        {/* Stats Cards */}
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Active Markets
                </Typography>
                {loading ? (
                  <Skeleton variant="text" width={80} height={40} />
                ) : (
                  <>
                    <Typography variant="h4" fontWeight={700}>
                      {stats.totalActiveMarkets.toLocaleString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Across all platforms
                    </Typography>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Total Liquidity
                </Typography>
                {loading ? (
                  <Skeleton variant="text" width={100} height={40} />
                ) : (
                  <>
                    <Typography variant="h4" fontWeight={700}>
                      {formatCurrency(stats.totalLiquidity)}
                    </Typography>
                    <Typography variant="caption" color="success.main">
                      Live aggregated
                    </Typography>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  24h Volume
                </Typography>
                {loading ? (
                  <Skeleton variant="text" width={80} height={40} />
                ) : (
                  <>
                    <Typography variant="h4" fontWeight={700}>
                      {formatCurrency(stats.totalVolume24h)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Combined volume
                    </Typography>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Biggest Mover
                </Typography>
                {loading ? (
                  <Skeleton variant="text" width={120} height={40} />
                ) : stats.biggestMover ? (
                  <>
                    <Typography variant="h6" fontWeight={700} noWrap>
                      {stats.biggestMover.title.slice(0, 20)}...
                    </Typography>
                    <Typography
                      variant="caption"
                      color={stats.biggestMover.change24h > 0 ? 'success.main' : 'error.main'}
                    >
                      {stats.biggestMover.change24h > 0 ? '+' : ''}
                      {stats.biggestMover.change24h.toFixed(1)}% 24h
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No data
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Actions Row */}
        <Stack direction="row" spacing={2} sx={{ mt: 3 }} flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            placeholder="Search markets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 250 }}
          />
          <Button
            variant={showOnlyArb ? 'contained' : 'outlined'}
            startIcon={<Bolt />}
            onClick={() => setShowOnlyArb(!showOnlyArb)}
            color={showOnlyArb ? 'warning' : 'inherit'}
          >
            Arbitrage Only
          </Button>
          <Button
            variant="outlined"
            onClick={() => navigate('/screener')}
            startIcon={<FilterList />}
          >
            Advanced Screener
          </Button>
          <Button
            variant="outlined"
            startIcon={<Star />}
            onClick={() => navigate('/portfolio')}
          >
            Watchlist ({watchlist.size})
          </Button>
        </Stack>
      </Box>

      {/* Market Tables */}
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <Tabs
          value={selectedTab}
          onChange={handleTabChange}
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            px: 2,
          }}
        >
          <Tab label="Trending" />
          <Tab label="Politics" />
          <Tab label="Crypto" />
          <Tab label="Sports" />
          <Tab label="Entertainment" />
          <Tab label="Other" />
        </Tabs>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell width={40}></TableCell>
                <TableCell>Event</TableCell>
                <TableCell align="center" width={100}>Platform</TableCell>
                <TableCell align="center" width={120}>Category</TableCell>
                <TableCell align="right" width={140}>Volume (Total)</TableCell>
                <TableCell align="right" width={120}>Expiry</TableCell>
                <TableCell align="center" width={100}>Status</TableCell>
                <TableCell align="center" width={140}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell><Skeleton variant="circular" width={24} height={24} /></TableCell>
                    <TableCell><Skeleton variant="text" width="80%" /></TableCell>
                    <TableCell><Skeleton variant="text" width={80} /></TableCell>
                    <TableCell><Skeleton variant="text" width={80} /></TableCell>
                    <TableCell><Skeleton variant="text" width={120} /></TableCell>
                    <TableCell><Skeleton variant="text" width={100} /></TableCell>
                    <TableCell><Skeleton variant="text" width={60} /></TableCell>
                    <TableCell><Skeleton variant="text" width={100} /></TableCell>
                  </TableRow>
                ))
              ) : paginatedMarkets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      No markets found matching your criteria
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedMarkets.map((market) => {
                  const hasAlerts = getAlertsForMarket(market.id).length > 0;
                  // Use eventId for database events, fall back to market.id
                  const eventId = (market as any).eventId || market.id.replace(`${market.platform.toLowerCase()}_`, '');
                  const platformSlug = market.platform.toLowerCase() === 'polymarket' ? 'poly' : market.platform.toLowerCase();
                  
                  return (
                    <TableRow
                      key={market.id}
                      hover
                      sx={{
                        cursor: 'pointer',
                        '&:hover': {
                          backgroundColor: 'action.hover',
                        },
                      }}
                      onClick={() => navigate(`/event/${platformSlug}/${encodeURIComponent(eventId)}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <IconButton
                          size="small"
                          onClick={() => toggleWatchlist(market.id)}
                        >
                          {isWatching(market.id) ? (
                            <Star fontSize="small" color="primary" />
                          ) : (
                            <StarBorder fontSize="small" />
                          )}
                        </IconButton>
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {market.title}
                          </Typography>
                          {market.hasArb && (
                            <Chip
                              label="⚡ Arb Opportunity"
                              size="small"
                              color="warning"
                              sx={{ mt: 0.5 }}
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={market.platform === 'POLYMARKET' ? 'Poly' : 'Kalshi'}
                          size="small"
                          color={market.platform === 'POLYMARKET' ? 'primary' : 'secondary'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={market.category}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600}>
                          {formatCurrency(market.volume24h)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">
                          {formatExpiryDate(market.expiryTime)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label="Open"
                          size="small"
                          color="success"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                        <Stack direction="row" spacing={0} justifyContent="center">
                          <Tooltip title="View raw data">
                            <IconButton
                              size="small"
                              onClick={() => {
                                setSelectedRawData(market);
                                setRawDataDialogOpen(true);
                              }}
                            >
                              <Code fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={hasAlerts ? 'Has alerts' : 'Create alert'}>
                            <IconButton
                              size="small"
                              onClick={() => handleOpenAlertDialog(market.id, market.yesPrice)}
                              color={hasAlerts ? 'primary' : 'default'}
                            >
                              {hasAlerts ? (
                                <NotificationsActive fontSize="small" />
                              ) : (
                                <NotificationsNone fontSize="small" />
                              )}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="View Event Details">
                            <IconButton
                              size="small"
                              onClick={() => {
                                const evtId = (market as any).eventId || market.id.replace(`${market.platform.toLowerCase()}_`, '');
                                const pSlug = market.platform.toLowerCase() === 'polymarket' ? 'poly' : market.platform.toLowerCase();
                                navigate(`/event/${pSlug}/${encodeURIComponent(evtId)}`);
                              }}
                            >
                              <ZoomIn fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        {!loading && filteredMarkets.length > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 3, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">
              Showing {startIndex + 1}-{Math.min(endIndex, filteredMarkets.length)} of {filteredMarkets.length} markets
            </Typography>
            <Pagination
              count={totalPages}
              page={page}
              onChange={handlePageChange}
              color="primary"
              showFirstButton
              showLastButton
              size="large"
            />
          </Box>
        )}
      </Paper>

      {/* Create Alert Dialog */}
      <Dialog open={alertDialogOpen} onClose={() => setAlertDialogOpen(false)}>
        <DialogTitle>Create Price Alert</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1, minWidth: 300 }}>
            <FormControl fullWidth>
              <InputLabel>Condition</InputLabel>
              <Select
                value={alertCondition}
                label="Condition"
                onChange={(e) => setAlertCondition(e.target.value as 'above' | 'below')}
              >
                <MenuItem value="above">Price goes above</MenuItem>
                <MenuItem value="below">Price goes below</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Target Price (%)"
              type="number"
              value={(alertTargetPrice * 100).toFixed(0)}
              onChange={(e) => setAlertTargetPrice(Number(e.target.value) / 100)}
              InputProps={{
                endAdornment: <InputAdornment position="end">%</InputAdornment>,
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAlertDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateAlert} variant="contained">
            Create Alert
          </Button>
        </DialogActions>
      </Dialog>

      {/* Raw Data Dialog */}
      <Dialog 
        open={rawDataDialogOpen} 
        onClose={() => setRawDataDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Raw Market Data
          {selectedRawData && (
            <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
              {selectedRawData.platform} - {selectedRawData.title}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          <Box
            component="pre"
            sx={{
              backgroundColor: 'background.default',
              p: 2,
              borderRadius: 1,
              overflow: 'auto',
              fontSize: '0.875rem',
              fontFamily: 'monospace',
              maxHeight: '60vh',
            }}
          >
            {selectedRawData && JSON.stringify(selectedRawData, null, 2)}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRawDataDialogOpen(false)}>Close</Button>
          <Button 
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(selectedRawData, null, 2));
            }}
            variant="outlined"
          >
            Copy JSON
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Markets;
