/**
 * Event Analytics Page - Comprehensive Dashboard
 * World-class prediction market analytics with:
 * - Auto-refresh every 1 hour
 * - Full market data with live prices
 * - Trade history analysis & whale alerts
 * - Volume trends & momentum scores
 * - Price distribution charts
 * - Quick filters & watchlist
 * - Share & export features
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  Button,
  Chip,
  Stack,
  Alert,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  Breadcrumbs,
  Link,
  Avatar,
  LinearProgress,
  TextField,
  InputAdornment,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Skeleton,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Badge,
  Snackbar,
  useTheme,
  alpha,
  Divider,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Pagination,
  FormControlLabel,
  Switch,
  Select,
  MenuItem,
  FormControl,
} from '@mui/material';
import {
  ArrowBack,
  OpenInNew,
  TrendingUp,
  TrendingDown,
  Search,
  Refresh,
  AccessTime,
  ShowChart,
  AttachMoney,
  BarChart as BarChartIcon,
  Timeline,
  ExpandMore,
  ShoppingCart,
  Star,
  StarBorder,
  Share,
  Download,
  FilterList,
  Whatshot,
  Warning,
  Speed,
  ContentCopy,
  Twitter,
  LocalFireDepartment,
  ViewList,
  ViewModule,
  KeyboardArrowUp,
  KeyboardArrowDown,
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from 'recharts';

import {
  fetchEventAnalytics,
  fetchPaginatedTrades,
  EnhancedEventResponse,
  PaginatedTradesResponse,
  MarketAnalytics,
  TradeRecord,
  formatVolume,
  formatPercent,
  formatPrice,
  formatPercentChange,
  getMomentumColor,
} from '../services/eventAnalyticsApi';
import {
  getCachedEventAnalytics,
  setCachedEventAnalytics,
} from '../services/globalPrefetch';

// ============================================================================
// Constants
// ============================================================================

const REFRESH_INTERVAL = 3600000; // 1 hour in milliseconds
const WATCHLIST_KEY = 'coingraph_watchlist';

// ============================================================================
// Custom Hooks
// ============================================================================

function useWatchlist() {
  const [watchlist, setWatchlist] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(WATCHLIST_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggleWatchlist = useCallback((marketId: string) => {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(marketId)) {
        next.delete(marketId);
      } else {
        next.add(marketId);
      }
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  return { watchlist, toggleWatchlist };
}

// ============================================================================
// Utility Functions
// ============================================================================

// Add ref=eventgraph to any URL for affiliate tracking
const addRefParam = (url: string): string => {
  if (!url) return url;
  return `${url}${url.includes('?') ? '&' : '?'}ref=eventgraph`;
};

// Get market link - uses source_url if available
const getMarketLink = (
  market: { market_id: string; source_url?: string | null },
  platform: string,
  eventId: string
): string => {
  // If market has source_url, use it directly (already has correct format)
  if (market.source_url) {
    return addRefParam(market.source_url);
  }
  
  // Fallback: construct URL
  if (platform === 'poly' || platform === 'polymarket') {
    return `https://polymarket.com/event/${eventId}?ref=eventgraph`;
  }
  if (platform === 'limitless') {
    return `https://limitless.exchange/markets/${eventId}?ref=eventgraph`;
  }
  if (platform === 'opiniontrade') {
    return `https://app.opinion.trade/detail?topicId=${eventId}&ref=eventgraph`;
  }
  return `https://kalshi.com/browse?search=${market.market_id}&ref=eventgraph`;
};

// ============================================================================
// Sub-Components
// ============================================================================

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

// Countdown Timer Component
const CountdownTimer: React.FC<{ endTime: number | null | undefined }> = ({ endTime }) => {
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    if (!endTime) {
      setTimeLeft('No deadline');
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const end = endTime * 1000;
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft('Ended');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${minutes}m ${seconds}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <AccessTime color="action" />
      <Typography variant="h6" fontWeight={600} color="primary">
        {timeLeft}
      </Typography>
    </Stack>
  );
};

// Momentum Badge Component
const MomentumBadge: React.FC<{ score: number | null | undefined }> = ({ score }) => {
  if (score == null) return null;

  const color = getMomentumColor(score);
  const label = score > 0 ? 'Bullish' : score < 0 ? 'Bearish' : 'Neutral';
  const icon = score > 20 ? '🚀' : score > 0 ? '📈' : score < -20 ? '📉' : '➖';

  return (
    <Chip
      label={`${icon} ${label} (${score > 0 ? '+' : ''}${score.toFixed(0)})`}
      size="small"
      sx={{
        backgroundColor: alpha(color, 0.2),
        color: color,
        fontWeight: 600,
      }}
    />
  );
};

// Whale Alert Badge
const WhaleAlertBadge: React.FC = () => (
  <Tooltip title="Whale activity detected (>$10K trades)">
    <Chip
      icon={<LocalFireDepartment />}
      label="Whale"
      size="small"
      color="warning"
      sx={{ fontWeight: 600 }}
    />
  </Tooltip>
);

// ============================================================================
// Main Page Component
// ============================================================================

export const EventAnalyticsPage: React.FC = () => {
  const { platform, eventId } = useParams<{ platform: string; eventId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { watchlist, toggleWatchlist } = useWatchlist();

  // State
  const [data, setData] = useState<EnhancedEventResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 100]);
  const [volumeFilter, setVolumeFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'volume' | 'price' | 'momentum' | '24h_change' | 'end_time'>('volume');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [convictionFilter, setConvictionFilter] = useState<'all' | 'high' | 'tossup' | 'low'>('all');
  const [whaleFilter, setWhaleFilter] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const ITEMS_PER_PAGE = itemsPerPage;

  // View mode
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Tabs
  const [mainTab, setMainTab] = useState(0);
  const [chartTab, setChartTab] = useState(0);
  const [tableTab, setTableTab] = useState(0);

  // All Trades Pagination State
  const [allTradesData, setAllTradesData] = useState<PaginatedTradesResponse | null>(null);
  const [allTradesPage, setAllTradesPage] = useState(1);
  const [allTradesLoading, setAllTradesLoading] = useState(false);
  const [allTradesFilter, setAllTradesFilter] = useState<'all' | 'YES' | 'NO'>('all');
  const [allTradesSortBy, setAllTradesSortBy] = useState<'value' | 'time'>('value');
  const [showAllTrades, setShowAllTrades] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string }>({
    open: false,
    message: '',
  });

  // Fetch data - check global cache first for instant load
  const loadData = useCallback(async (showRefreshIndicator = false) => {
    if (!platform || !eventId) return;

    const decodedEventId = decodeURIComponent(eventId);

    // Check global cache first for instant load
    if (!showRefreshIndicator) {
      const cachedData = getCachedEventAnalytics(platform, decodedEventId);
      if (cachedData) {
        console.log('⚡ [EventAnalytics] Instant load from global cache!');
        setData(cachedData);
        setLastUpdated(new Date());
        setLoading(false);
        return; // Instant load from cache!
      }
    }

    if (showRefreshIndicator) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await fetchEventAnalytics(platform, decodedEventId, {
        includeTrades: true,
        maxMarkets: 200,
      });
      setData(response);
      setLastUpdated(new Date());
      setLoading(false);
      setRefreshing(false);
      
      // Store in global cache for next time
      setCachedEventAnalytics(platform, decodedEventId, response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load event analytics';
      
      // If cache is warming up or server temporarily unavailable, silently retry with skeleton
      if (errorMessage.includes('warming up') || errorMessage.includes('503') || errorMessage.includes('unavailable')) {
        // Keep loading state true (skeleton will show), retry silently after 3 seconds
        setTimeout(() => loadData(showRefreshIndicator), 3000);
        return; // Don't set error or setLoading(false), keep skeleton showing
      }
      
      setError(errorMessage);
      setLoading(false);
      setRefreshing(false);
    }
  }, [platform, eventId]);

  // Load paginated trades for "View All Trades" mode
  const loadAllTrades = useCallback(async (page: number, filter: 'all' | 'YES' | 'NO', sortBy: 'value' | 'time') => {
    if (!platform || !eventId) return;

    const decodedEventId = decodeURIComponent(eventId);
    setAllTradesLoading(true);

    try {
      const response = await fetchPaginatedTrades(platform, decodedEventId, {
        page,
        pageSize: 100,
        tokenFilter: filter === 'all' ? null : filter,
        sortBy,
        sortOrder: 'desc',
      });
      setAllTradesData(response);
      setAllTradesPage(page);
    } catch (err) {
      console.error('Failed to load paginated trades:', err);
      setSnackbar({ open: true, message: 'Failed to load trades' });
    } finally {
      setAllTradesLoading(false);
    }
  }, [platform, eventId]);

  // Load all trades when "View All" is clicked or filters change
  useEffect(() => {
    if (showAllTrades) {
      loadAllTrades(allTradesPage, allTradesFilter, allTradesSortBy);
    }
  }, [showAllTrades, allTradesPage, allTradesFilter, allTradesSortBy, loadAllTrades]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every hour
  useEffect(() => {
    const interval = setInterval(() => {
      loadData(true);
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [loadData]);

  // Filtered markets
  const filteredMarkets = useMemo(() => {
    if (!data) return [];

    let markets = [...data.markets];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      markets = markets.filter((m) => m.title.toLowerCase().includes(query));
    }

    // Price range filter
    markets = markets.filter((m) => {
      const price = (m.yes_price || 0) * 100;
      return price >= priceRange[0] && price <= priceRange[1];
    });

    // Volume filter
    if (volumeFilter !== 'all') {
      const volumes = data.markets.map((m) => m.volume_total || 0);
      const maxVol = Math.max(...volumes);
      const threshold = volumeFilter === 'high' ? 0.5 : volumeFilter === 'medium' ? 0.1 : 0;
      const maxThreshold = volumeFilter === 'low' ? 0.1 : 1;

      markets = markets.filter((m) => {
        const ratio = (m.volume_total || 0) / maxVol;
        return ratio >= threshold && ratio <= maxThreshold;
      });
    }

    // Conviction filter (high >80% or <20%, tossup 40-60%, low conviction 20-40% or 60-80%)
    if (convictionFilter !== 'all') {
      markets = markets.filter((m) => {
        const price = (m.yes_price || 0) * 100;
        if (convictionFilter === 'high') {
          return price >= 80 || price <= 20;
        } else if (convictionFilter === 'tossup') {
          return price >= 40 && price <= 60;
        } else if (convictionFilter === 'low') {
          return (price > 20 && price < 40) || (price > 60 && price < 80);
        }
        return true;
      });
    }

    // Whale filter
    if (whaleFilter) {
      markets = markets.filter((m) => m.is_whale_active);
    }

    // Watchlist filter
    if (showWatchlistOnly) {
      markets = markets.filter((m) => watchlist.has(m.market_id));
    }

    // Sort with direction
    markets.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'price':
          comparison = (a.yes_price || 0) - (b.yes_price || 0);
          break;
        case 'momentum':
          comparison = (a.momentum_score || 0) - (b.momentum_score || 0);
          break;
        case '24h_change':
          comparison = (a.volume_change_pct || 0) - (b.volume_change_pct || 0);
          break;
        case 'end_time':
          comparison = (a.end_time || 0) - (b.end_time || 0);
          break;
        default: // volume
          comparison = (a.volume_total || 0) - (b.volume_total || 0);
      }
      return sortDirection === 'desc' ? -comparison : comparison;
    });

    return markets;
  }, [data, searchQuery, priceRange, volumeFilter, convictionFilter, whaleFilter, showWatchlistOnly, watchlist, sortBy, sortDirection]);

  // Paginated markets
  const paginatedMarkets = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredMarkets.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredMarkets, currentPage]);

  const totalPages = Math.ceil(filteredMarkets.length / ITEMS_PER_PAGE);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, priceRange, volumeFilter, convictionFilter, whaleFilter, showWatchlistOnly, sortBy, sortDirection]);

  // Handle sort column click
  const handleSortClick = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(column);
      setSortDirection('desc');
    }
  };

  // Share functionality
  const handleShare = async (type: 'copy' | 'twitter') => {
    const url = window.location.href;
    const title = data?.summary.title || 'Prediction Market Event';

    if (type === 'copy') {
      await navigator.clipboard.writeText(url);
      setSnackbar({ open: true, message: 'Link copied to clipboard!' });
    } else {
      const tweetText = `Check out "${title}" on EventGraph\n\n${url}`;
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`, '_blank');
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (!data) return;

    const headers = ['Market', 'Yes Price', 'No Price', 'Volume', '24h Volume', 'Momentum'];
    const rows = data.markets.map((m) => [
      `"${m.title}"`,
      formatPercent(m.yes_price),
      formatPercent(m.no_price),
      formatVolume(m.volume_total),
      formatVolume(m.volume_24h),
      m.momentum_score?.toFixed(0) || '-',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.summary.event_id}_markets.csv`;
    a.click();
    URL.revokeObjectURL(url);

    setSnackbar({ open: true, message: 'CSV exported successfully!' });
  };

  // Loading state - Show skeleton that matches actual layout for smooth transition
  if (loading) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1800, mx: 'auto' }}>
        {/* Header Skeleton */}
        <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
            <Skeleton variant="text" width={200} height={24} />
            <Stack direction="row" spacing={1}>
              <Skeleton variant="rectangular" width={100} height={36} sx={{ borderRadius: 1 }} />
              <Skeleton variant="rectangular" width={100} height={36} sx={{ borderRadius: 1 }} />
            </Stack>
          </Stack>
          <Grid container spacing={3}>
            <Grid item xs={12} md={8}>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                <Skeleton variant="circular" width={56} height={56} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="text" width="60%" height={32} />
                  <Skeleton variant="text" width="40%" height={20} />
                </Box>
              </Stack>
            </Grid>
            <Grid item xs={12} md={4}>
              <Grid container spacing={2}>
                {[...Array(4)].map((_, i) => (
                  <Grid item xs={6} key={i}>
                    <Skeleton variant="rectangular" height={70} sx={{ borderRadius: 1 }} />
                  </Grid>
                ))}
              </Grid>
            </Grid>
          </Grid>
        </Paper>

        {/* Overview Cards Skeleton */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[...Array(6)].map((_, i) => (
            <Grid item xs={6} sm={4} md={2} key={i}>
              <Skeleton variant="rectangular" height={100} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>

        {/* Tabs Skeleton */}
        <Paper sx={{ mb: 3 }}>
          <Stack direction="row" spacing={2} sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            {['Markets', 'Charts & Analytics', 'Trade History', 'Recent Trades'].map((label, i) => (
              <Skeleton key={i} variant="text" width={100} height={32} />
            ))}
          </Stack>
          
          {/* Table Skeleton - Matches exact table structure */}
          <Box sx={{ p: 2 }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {['Market', 'Yes / No', 'Total Vol', 'Momentum', 'End Date', 'Trade', 'Link'].map((header, i) => (
                      <TableCell key={i}>
                        <Skeleton variant="text" width={i === 0 ? 100 : 60} height={20} />
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {[...Array(10)].map((_, rowIdx) => (
                    <TableRow key={rowIdx}>
                      <TableCell>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Skeleton variant="rounded" width={32} height={32} />
                          <Skeleton variant="text" width={180} height={20} />
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Skeleton variant="rectangular" width={140} height={22} sx={{ borderRadius: 1 }} />
                      </TableCell>
                      {[...Array(2)].map((_, i) => (
                        <TableCell key={i} align="right">
                          <Skeleton variant="text" width={60} height={20} sx={{ ml: 'auto' }} />
                        </TableCell>
                      ))}
                      <TableCell align="center">
                        <Skeleton variant="circular" width={20} height={20} sx={{ mx: 'auto' }} />
                      </TableCell>
                      <TableCell align="center">
                        <Skeleton variant="rectangular" width={80} height={24} sx={{ borderRadius: 4, mx: 'auto' }} />
                      </TableCell>
                      <TableCell align="center">
                        <Skeleton variant="circular" width={24} height={24} sx={{ mx: 'auto' }} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            
            {/* Pagination Skeleton */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 2 }}>
              <Skeleton variant="text" width={150} height={20} />
              <Skeleton variant="rectangular" width={300} height={32} sx={{ borderRadius: 1 }} />
            </Stack>
          </Box>
        </Paper>
      </Box>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || 'Failed to load event'}
        </Alert>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/events')}>
          Back to Events
        </Button>
      </Box>
    );
  }

  const { summary, trade_flow, recent_trades, volume_by_market, price_distribution } = data;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1800, mx: 'auto' }}>
      {/* ================================================================== */}
      {/* HEADER SECTION */}
      {/* ================================================================== */}
      <Paper
        sx={{
          p: 3,
          mb: 3,
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.15)} 0%, ${alpha(
            theme.palette.background.paper,
            0.95
          )} 100%)`,
          borderRadius: 3,
        }}
      >
        {/* Breadcrumbs & Actions */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
          <Breadcrumbs>
            <Link
              color="inherit"
              href="/events"
              onClick={(e) => {
                e.preventDefault();
                navigate('/events');
              }}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}
            >
              <ArrowBack fontSize="small" />
              Events
            </Link>
            <Typography color="text.primary">{summary.title}</Typography>
          </Breadcrumbs>

          <Stack direction="row" spacing={1}>
            <Tooltip title="Copy link">
              <IconButton onClick={() => handleShare('copy')}>
                <ContentCopy />
              </IconButton>
            </Tooltip>
            <Tooltip title="Share to Twitter">
              <IconButton onClick={() => handleShare('twitter')}>
                <Twitter />
              </IconButton>
            </Tooltip>
            <Tooltip title="Export CSV">
              <IconButton onClick={handleExportCSV}>
                <Download />
              </IconButton>
            </Tooltip>
            <Tooltip title="Refresh data">
              <IconButton onClick={() => loadData(true)} disabled={refreshing}>
                {refreshing ? <CircularProgress size={24} /> : <Refresh />}
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        {/* Main Header Content */}
        <Grid container spacing={3}>
          {/* Left: Event Info */}
          <Grid item xs={12} md={8}>
            <Stack direction="row" spacing={3}>
              {summary.image && (
                <Avatar
                  src={summary.image}
                  variant="rounded"
                  sx={{ width: 100, height: 100 }}
                />
              )}
              <Box>
                <Typography variant="h4" fontWeight={700} gutterBottom>
                  {summary.title}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
                  <Chip label={summary.platform.toUpperCase()} color="primary" />
                  <Chip label={summary.category} variant="outlined" />
                  <Chip
                    label={summary.status}
                    color={summary.status === 'open' ? 'success' : 'default'}
                  />
                  {summary.tags.slice(0, 3).map((tag, i) => (
                    <Chip key={i} label={tag} size="small" variant="outlined" />
                  ))}
                </Stack>
                <CountdownTimer endTime={summary.end_time} />
              </Box>
            </Stack>
          </Grid>

          {/* Right: Key Stats */}
          <Grid item xs={12} md={4}>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Card variant="outlined">
                  <CardContent sx={{ py: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Markets
                    </Typography>
                    <Typography variant="h5" fontWeight={600}>
                      {summary.total_markets}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6}>
                <Card variant="outlined">
                  <CardContent sx={{ py: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Total Volume
                    </Typography>
                    <Typography variant="h5" fontWeight={600}>
                      {formatVolume(summary.total_volume)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6}>
                <Card variant="outlined">
                  <CardContent sx={{ py: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      24h Volume
                    </Typography>
                    <Typography variant="h5" fontWeight={600}>
                      {formatVolume(summary.volume_24h)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6}>
                <Card variant="outlined">
                  <CardContent sx={{ py: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Avg Price
                    </Typography>
                    <Typography variant="h5" fontWeight={600}>
                      {formatPercent(summary.avg_yes_price)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Grid>
        </Grid>

        {/* Last Updated */}
        {lastUpdated && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
            Last updated: {format(lastUpdated, 'HH:mm:ss')} (auto-refresh every hour)
          </Typography>
        )}
      </Paper>

      {/* ================================================================== */}
      {/* OVERVIEW CARDS */}
      {/* ================================================================== */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          {
            label: 'High Conviction',
            value: summary.high_conviction_count,
            subtitle: '>80% or <20%',
            icon: <Whatshot />,
            color: '#f44336',
          },
          {
            label: 'Toss-Ups',
            value: summary.toss_up_count,
            subtitle: '40-60%',
            icon: <Speed />,
            color: '#ff9800',
          },
          {
            label: 'Total Trades',
            value: trade_flow.total_trades,
            subtitle: 'Recent activity',
            icon: <ShowChart />,
            color: '#2196f3',
          },
          {
            label: 'Buy/Sell Ratio',
            value: trade_flow.buy_sell_ratio.toFixed(2),
            subtitle: trade_flow.buy_sell_ratio > 1 ? 'Bullish' : 'Bearish',
            icon: trade_flow.buy_sell_ratio > 1 ? <TrendingUp /> : <TrendingDown />,
            color: trade_flow.buy_sell_ratio > 1 ? '#4caf50' : '#f44336',
          },
          {
            label: 'Whale Trades',
            value: trade_flow.whale_trades,
            subtitle: `${formatVolume(trade_flow.whale_buy_volume + trade_flow.whale_sell_volume)}`,
            icon: <LocalFireDepartment />,
            color: '#9c27b0',
          },
          {
            label: 'Avg Trade Size',
            value: formatVolume(trade_flow.avg_trade_size),
            subtitle: 'Per transaction',
            icon: <AttachMoney />,
            color: '#00bcd4',
          },
        ].map((card, idx) => (
          <Grid item xs={6} sm={4} md={2} key={idx}>
            <Card
              variant="outlined"
              sx={{
                height: '100%',
                borderLeft: `4px solid ${card.color}`,
                transition: 'all 0.2s',
                '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 },
              }}
            >
              <CardContent>
                <Stack direction="row" justifyContent="space-between">
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {card.label}
                    </Typography>
                    <Typography variant="h5" fontWeight={600}>
                      {card.value}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {card.subtitle}
                    </Typography>
                  </Box>
                  <Box sx={{ color: card.color, opacity: 0.7 }}>{card.icon}</Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* ================================================================== */}
      {/* MAIN TABS */}
      {/* ================================================================== */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={mainTab} onChange={(_, v) => setMainTab(v)}>
          <Tab label="Markets" />
          <Tab label="Charts & Analytics" />
          <Tab label="Trade History" />
          <Tab label="Recent Trades" />
        </Tabs>

        {/* Markets Tab */}
        <TabPanel value={mainTab} index={0}>
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 280 }}>Market</TableCell>
                  <TableCell sx={{ width: 160 }} align="center">
                    Yes / No
                  </TableCell>
                  <TableCell
                    sx={{ width: 100, cursor: 'pointer' }}
                    align="right"
                    onClick={() => handleSortClick('volume')}
                  >
                    <TableSortLabel
                      active={sortBy === 'volume'}
                      direction={sortBy === 'volume' ? sortDirection : 'desc'}
                    >
                      Total Vol
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    sx={{ width: 90, cursor: 'pointer' }}
                    align="right"
                    onClick={() => handleSortClick('momentum')}
                  >
                    <TableSortLabel
                      active={sortBy === 'momentum'}
                      direction={sortBy === 'momentum' ? sortDirection : 'desc'}
                    >
                      Momentum
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    sx={{ width: 110, cursor: 'pointer' }}
                    align="right"
                    onClick={() => handleSortClick('end_time')}
                  >
                    <TableSortLabel
                      active={sortBy === 'end_time'}
                      direction={sortBy === 'end_time' ? sortDirection : 'desc'}
                    >
                      End Date
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ width: 100 }} align="center">
                    Trade
                  </TableCell>
                  <TableCell sx={{ width: 50 }} align="center">
                    Link
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedMarkets.map((market) => (
                  <TableRow
                    key={market.market_id}
                    hover
                  >
                    {/* Market Title */}
                    <TableCell>
                          <Stack direction="row" spacing={1.5} alignItems="center">
                            {market.image && (
                              <Avatar
                                src={market.image}
                                variant="rounded"
                                sx={{ width: 32, height: 32 }}
                              />
                            )}
                            <Tooltip
                              title={
                                <Box sx={{ p: 1, maxWidth: 350 }}>
                                  <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                                    {market.title}
                                  </Typography>
                                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                    <Chip 
                                      label={`YES: ${formatPercent(market.yes_price)}`} 
                                      size="small" 
                                      sx={{ 
                                        bgcolor: alpha('#4caf50', 0.2), 
                                        color: '#4caf50',
                                        fontSize: '0.7rem',
                                        height: 20,
                                      }} 
                                    />
                                    <Chip 
                                      label={`NO: ${formatPercent(market.no_price)}`} 
                                      size="small" 
                                      sx={{ 
                                        bgcolor: alpha('#ef5350', 0.2), 
                                        color: '#ef5350',
                                        fontSize: '0.7rem',
                                        height: 20,
                                      }} 
                                    />
                                  </Stack>
                                  {market.volume_total && (
                                    <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'grey.400' }}>
                                      Volume: {formatVolume(market.volume_total)}
                                    </Typography>
                                  )}
                                </Box>
                              }
                              arrow
                              placement="right"
                              enterDelay={300}
                              leaveDelay={100}
                              slotProps={{
                                tooltip: {
                                  sx: {
                                    bgcolor: alpha(theme.palette.background.paper, 0.98),
                                    border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                                    boxShadow: `0 4px 20px ${alpha(theme.palette.common.black, 0.3)}`,
                                    borderRadius: 2,
                                    '& .MuiTooltip-arrow': {
                                      color: alpha(theme.palette.background.paper, 0.98),
                                    },
                                  },
                                },
                              }}
                            >
                              <Typography
                                variant="body2"
                                fontWeight={500}
                                sx={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  maxWidth: 220,
                                  cursor: 'pointer',
                                  '&:hover': {
                                    color: theme.palette.primary.main,
                                  },
                                }}
                              >
                                {market.title}
                              </Typography>
                            </Tooltip>
                          </Stack>
                        </TableCell>

                        {/* Yes/No Price Bar */}
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {/* Yes side */}
                            <Box
                              sx={{
                                flex: (market.yes_price || 0) * 100,
                                height: 22,
                                backgroundColor: '#4caf50',
                                borderRadius: '4px 0 0 4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minWidth: 40,
                              }}
                            >
                              <Typography
                                variant="caption"
                                fontWeight={700}
                                sx={{ color: '#fff', fontSize: '0.7rem' }}
                              >
                                {formatPercent(market.yes_price)}
                              </Typography>
                            </Box>
                            {/* No side */}
                            <Box
                              sx={{
                                flex: (market.no_price || 0) * 100,
                                height: 22,
                                backgroundColor: '#ef5350',
                                borderRadius: '0 4px 4px 0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minWidth: 40,
                              }}
                            >
                              <Typography
                                variant="caption"
                                fontWeight={700}
                                sx={{ color: '#fff', fontSize: '0.7rem' }}
                              >
                                {formatPercent(market.no_price)}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>

                        {/* Total Volume */}
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={500}>
                            {formatVolume(market.volume_total)}
                          </Typography>
                        </TableCell>

                        {/* Momentum Score */}
                        <TableCell align="right">
                          <Chip
                            label={market.momentum_score != null ? `${(market.momentum_score * 100).toFixed(0)}%` : '-'}
                            size="small"
                            sx={{
                              fontSize: '0.7rem',
                              height: 22,
                              minWidth: 50,
                              bgcolor: market.momentum_score != null
                                ? alpha(getMomentumColor(market.momentum_score), 0.15)
                                : 'action.hover',
                              color: market.momentum_score != null
                                ? getMomentumColor(market.momentum_score)
                                : 'text.secondary',
                              fontWeight: 600,
                            }}
                          />
                        </TableCell>

                        {/* End Date */}
                        <TableCell align="right">
                          <Typography variant="body2" color="text.secondary">
                            {market.end_time
                              ? format(new Date(market.end_time * 1000), 'd MMM yyyy')
                              : '-'}
                          </Typography>
                        </TableCell>

                        {/* Trade Actions */}
                        <TableCell align="center">
                          <Chip
                            label="Coming Soon"
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.7rem', opacity: 0.7 }}
                          />
                        </TableCell>

                        {/* Market Link */}
                        <TableCell align="center">
                          <Tooltip title={platform === 'poly' ? "Trade on Polymarket" : "Trade on Kalshi"}>
                            <IconButton
                              size="small"
                              component="a"
                              href={getMarketLink(market, platform || 'poly', eventId || '')}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ 
                                color: 'primary.main',
                                '&:hover': { color: 'primary.dark' }
                              }}
                            >
                              <OpenInNew fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination */}
              <Stack 
                direction="row" 
                justifyContent="space-between" 
                alignItems="center"
                spacing={2}
                sx={{ mt: 3, flexWrap: 'wrap' }}
              >
                <Typography variant="body2" color="text.secondary">
                  Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredMarkets.length)} of {filteredMarkets.length} markets
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Per page:
                    </Typography>
                    <FormControl size="small">
                      <Select
                        value={itemsPerPage}
                        onChange={(e) => {
                          setItemsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        sx={{ minWidth: 70 }}
                      >
                        <MenuItem value={10}>10</MenuItem>
                        <MenuItem value={25}>25</MenuItem>
                        <MenuItem value={50}>50</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>

                  <Pagination
                    count={totalPages}
                    page={currentPage}
                    onChange={(_, page) => setCurrentPage(page)}
                    color="primary"
                    shape="rounded"
                    showFirstButton
                    showLastButton
                  />
                </Box>
              </Stack>

          {filteredMarkets.length === 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              No markets found for this event.
            </Alert>
          )}
        </TabPanel>

        {/* Charts Tab */}
        <TabPanel value={mainTab} index={1}>
          {/* Top Metrics Cards */}
          <Grid container spacing={2} sx={{ mb: 4 }}>
            <Grid item xs={6} sm={3}>
              <Card sx={{ 
                background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.15)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`,
                border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`
              }}>
                <CardContent sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TrendingUp fontSize="small" /> Price Momentum
                  </Typography>
                  <Typography variant="h5" fontWeight={700}>
                    {filteredMarkets.filter(m => (m.momentum_score || 0) > 20).length}
                  </Typography>
                  <Typography variant="caption" color="success.main">
                    Bullish markets
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={6} sm={3}>
              <Card sx={{ 
                background: `linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.15)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`,
                border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`
              }}>
                <CardContent sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <LocalFireDepartment fontSize="small" /> Whale Activity
                  </Typography>
                  <Typography variant="h5" fontWeight={700}>
                    {trade_flow.whale_trades}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatVolume(trade_flow.whale_buy_volume + trade_flow.whale_sell_volume)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={6} sm={3}>
              <Card sx={{ 
                background: `linear-gradient(135deg, ${alpha(theme.palette.warning.main, 0.15)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`,
                border: `1px solid ${alpha(theme.palette.warning.main, 0.2)}`
              }}>
                <CardContent sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Speed fontSize="small" /> Avg Trade Size
                  </Typography>
                  <Typography variant="h5" fontWeight={700}>
                    {formatVolume(trade_flow.avg_trade_size)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Per transaction
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={6} sm={3}>
              <Card sx={{ 
                background: `linear-gradient(135deg, ${alpha(theme.palette.info.main, 0.15)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`,
                border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`
              }}>
                <CardContent sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <ShowChart fontSize="small" /> Buy/Sell Ratio
                  </Typography>
                  <Typography variant="h5" fontWeight={700} color={trade_flow.buy_sell_ratio > 1 ? 'success.main' : 'error.main'}>
                    {trade_flow.buy_sell_ratio.toFixed(2)}
                  </Typography>
                  <Typography variant="caption" color={trade_flow.buy_sell_ratio > 1 ? 'success.main' : 'error.main'}>
                    {trade_flow.buy_sell_ratio > 1 ? 'Bullish' : 'Bearish'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Tabs value={chartTab} onChange={(_, v) => setChartTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
            <Tab label="Volume Analysis" />
            <Tab label="Price Distribution" />
            <Tab label="Market Trends" />
            <Tab label="Trade History" />
            <Tab label="Momentum Heatmap" />
          </Tabs>

          {/* Volume Analysis Tab */}
          <TabPanel value={chartTab} index={0}>
            <Grid container spacing={3}>
              {/* Top Markets by Volume - Horizontal Bar */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <BarChartIcon color="primary" /> Top Markets by Volume
                  </Typography>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={volume_by_market.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.1)} />
                      <XAxis type="number" tickFormatter={(v) => formatVolume(v)} tick={{ fontSize: 11 }} stroke={theme.palette.text.secondary} />
                      <YAxis type="category" dataKey="title" width={150} tick={{ fontSize: 10 }} stroke={theme.palette.text.secondary} />
                      <RechartsTooltip
                        formatter={(value: any) => formatVolume(value)}
                        contentStyle={{ 
                          backgroundColor: theme.palette.background.paper,
                          border: `1px solid ${theme.palette.divider}`,
                          borderRadius: 8
                        }}
                      />
                      <Bar dataKey="volume" fill={theme.palette.primary.main} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>

              {/* 24h vs Total Volume Comparison */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Timeline color="secondary" /> Volume Breakdown
                  </Typography>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={volume_by_market.slice(0, 8)}>
                      <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.1)} />
                      <XAxis dataKey="title" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={80} stroke={theme.palette.text.secondary} />
                      <YAxis tickFormatter={(v) => formatVolume(v)} tick={{ fontSize: 11 }} stroke={theme.palette.text.secondary} />
                      <RechartsTooltip
                        formatter={(value: any) => formatVolume(value)}
                        contentStyle={{ 
                          backgroundColor: theme.palette.background.paper,
                          border: `1px solid ${theme.palette.divider}`,
                          borderRadius: 8
                        }}
                      />
                      <Legend />
                      <Bar dataKey="volume" name="Total Volume" fill={theme.palette.primary.main} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="volume_24h" name="24h Volume" fill={theme.palette.secondary.main} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>

              {/* Volume Concentration */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AttachMoney color="success" /> Volume Concentration
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Top markets account for {((volume_by_market.slice(0, 5).reduce((sum, m) => sum + (m.volume || 0), 0) / summary.total_volume) * 100).toFixed(1)}% of total volume
                  </Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={[
                          ...volume_by_market.slice(0, 5).map(m => ({ name: m.title.slice(0, 30) + '...', value: m.volume })),
                          { name: 'Others', value: volume_by_market.slice(5).reduce((sum, m) => sum + (m.volume || 0), 0) }
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        dataKey="value"
                        label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {[theme.palette.primary.main, theme.palette.secondary.main, theme.palette.success.main, theme.palette.warning.main, theme.palette.error.main, alpha(theme.palette.text.primary, 0.3)].map((color, idx) => (
                          <Cell key={idx} fill={color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(value: any) => formatVolume(value)}
                        contentStyle={{ 
                          backgroundColor: theme.palette.background.paper,
                          border: `1px solid ${theme.palette.divider}`,
                          borderRadius: 8
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>

              {/* Volume Velocity (24h as % of Total) */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Speed color="info" /> Trading Velocity
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    24h volume as % of total volume (higher = more active)
                  </Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={volume_by_market.slice(0, 10).map(m => ({
                      title: m.title.slice(0, 20) + '...',
                      velocity: ((m.volume_24h || 0) / (m.volume || 1)) * 100
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.1)} />
                      <XAxis dataKey="title" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={80} stroke={theme.palette.text.secondary} />
                      <YAxis tick={{ fontSize: 11 }} stroke={theme.palette.text.secondary} />
                      <RechartsTooltip
                        formatter={(value: any) => `${value.toFixed(2)}%`}
                        contentStyle={{ 
                          backgroundColor: theme.palette.background.paper,
                          border: `1px solid ${theme.palette.divider}`,
                          borderRadius: 8
                        }}
                      />
                      <Bar dataKey="velocity" fill={theme.palette.info.main} radius={[4, 4, 0, 0]}>
                        {volume_by_market.slice(0, 10).map((_, idx) => (
                          <Cell key={idx} fill={idx < 3 ? theme.palette.success.main : theme.palette.info.main} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>
            </Grid>
          </TabPanel>

          {/* Price Distribution Tab */}
          <TabPanel value={chartTab} index={1}>
            <Grid container spacing={3}>
              {/* Price Range Distribution */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ShowChart color="primary" /> Price Distribution
                  </Typography>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart
                      data={Object.entries(price_distribution).map(([range, count]) => ({ range, count }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.1)} />
                      <XAxis dataKey="range" stroke={theme.palette.text.secondary} />
                      <YAxis stroke={theme.palette.text.secondary} />
                      <RechartsTooltip
                        contentStyle={{ 
                          backgroundColor: theme.palette.background.paper,
                          border: `1px solid ${theme.palette.divider}`,
                          borderRadius: 8
                        }}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {Object.keys(price_distribution).map((_, idx) => (
                          <Cell
                            key={idx}
                            fill={
                              idx < 2 || idx > 7
                                ? theme.palette.error.main
                                : idx >= 4 && idx <= 5
                                ? theme.palette.warning.main
                                : theme.palette.primary.main
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>

              {/* Conviction Breakdown - Pie Chart */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LocalFireDepartment color="warning" /> Market Conviction
                  </Typography>
                  <ResponsiveContainer width="100%" height={350}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'High Conviction (>80% or <20%)', value: summary.high_conviction_count },
                          { name: 'Toss-Up (40-60%)', value: summary.toss_up_count },
                          { name: 'Moderate (Others)', value: summary.total_markets - summary.high_conviction_count - summary.toss_up_count }
                        ]}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                      >
                        <Cell fill={theme.palette.error.main} />
                        <Cell fill={theme.palette.warning.main} />
                        <Cell fill={theme.palette.primary.main} />
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{ 
                          backgroundColor: theme.palette.background.paper,
                          border: `1px solid ${theme.palette.divider}`,
                          borderRadius: 8
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>

              {/* Price vs Volume Scatter */}
              <Grid item xs={12}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Timeline color="secondary" /> Price vs Volume Analysis
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Bubble size represents 24h trading activity
                  </Typography>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={filteredMarkets.slice(0, 15).map(m => ({
                      title: m.title.slice(0, 25) + '...',
                      price: ((m.yes_price || 0) * 100),
                      volume: m.volume_total || 0
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.1)} />
                      <XAxis dataKey="title" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={100} stroke={theme.palette.text.secondary} />
                      <YAxis yAxisId="left" orientation="left" label={{ value: 'Yes Price (%)', angle: -90, position: 'insideLeft' }} stroke={theme.palette.text.secondary} />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => formatVolume(v)} label={{ value: 'Volume', angle: 90, position: 'insideRight' }} stroke={theme.palette.text.secondary} />
                      <RechartsTooltip
                        formatter={(value: any, name: string) => name === 'volume' ? formatVolume(value) : `${value.toFixed(1)}%`}
                        contentStyle={{ 
                          backgroundColor: theme.palette.background.paper,
                          border: `1px solid ${theme.palette.divider}`,
                          borderRadius: 8
                        }}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="price" name="Yes Price" fill={theme.palette.secondary.main} radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="right" dataKey="volume" name="Volume" fill={alpha(theme.palette.primary.main, 0.5)} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>
            </Grid>
          </TabPanel>

          {/* Market Trends Tab */}
          <TabPanel value={chartTab} index={2}>
            <Grid container spacing={3}>
              {/* Volume Trends Over Time - Line Chart */}
              <Grid item xs={12}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ShowChart color="primary" /> Volume Trends
                  </Typography>
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={volume_by_market.slice(0, 15)}>
                      <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.1)} />
                      <XAxis dataKey="title" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={100} stroke={theme.palette.text.secondary} />
                      <YAxis tickFormatter={(v) => formatVolume(v)} stroke={theme.palette.text.secondary} />
                      <RechartsTooltip
                        formatter={(value: any) => formatVolume(value)}
                        contentStyle={{ 
                          backgroundColor: theme.palette.background.paper,
                          border: `1px solid ${theme.palette.divider}`,
                          borderRadius: 8
                        }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="volume" name="Total Volume" stroke={theme.palette.primary.main} strokeWidth={2} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="volume_24h" name="24h Volume" stroke={theme.palette.secondary.main} strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>

              {/* Volume Change Trends */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TrendingUp color="success" /> Volume Growth Leaders
                  </Typography>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart 
                      data={[...filteredMarkets]
                        .filter(m => (m.volume_change_pct || 0) > 0)
                        .sort((a, b) => (b.volume_change_pct || 0) - (a.volume_change_pct || 0))
                        .slice(0, 10)
                        .map(m => ({
                          title: m.title.slice(0, 20) + '...',
                          change: ((m.volume_change_pct || 0) * 100)
                        }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.1)} />
                      <XAxis dataKey="title" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={80} stroke={theme.palette.text.secondary} />
                      <YAxis stroke={theme.palette.text.secondary} />
                      <RechartsTooltip
                        formatter={(value: any) => `+${value.toFixed(1)}%`}
                        contentStyle={{ 
                          backgroundColor: theme.palette.background.paper,
                          border: `1px solid ${theme.palette.divider}`,
                          borderRadius: 8
                        }}
                      />
                      <Bar dataKey="change" fill={theme.palette.success.main} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>

              {/* Volume Decline Leaders */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TrendingDown color="error" /> Volume Decline Leaders
                  </Typography>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart 
                      data={[...filteredMarkets]
                        .filter(m => (m.volume_change_pct || 0) < 0)
                        .sort((a, b) => (a.volume_change_pct || 0) - (b.volume_change_pct || 0))
                        .slice(0, 10)
                        .map(m => ({
                          title: m.title.slice(0, 20) + '...',
                          change: Math.abs((m.volume_change_pct || 0) * 100)
                        }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.1)} />
                      <XAxis dataKey="title" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={80} stroke={theme.palette.text.secondary} />
                      <YAxis stroke={theme.palette.text.secondary} />
                      <RechartsTooltip
                        formatter={(value: any) => `-${value.toFixed(1)}%`}
                        contentStyle={{ 
                          backgroundColor: theme.palette.background.paper,
                          border: `1px solid ${theme.palette.divider}`,
                          borderRadius: 8
                        }}
                      />
                      <Bar dataKey="change" fill={theme.palette.error.main} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>
            </Grid>
          </TabPanel>

          {/* Trade Flow Tab */}
          <TabPanel value={chartTab} index={3}>
            <Grid container spacing={3}>
              {/* Buy vs Sell Volume - Pie Chart */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ShowChart color="primary" /> Buy vs Sell Volume
                  </Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Buy', value: trade_flow.buy_volume },
                          { name: 'Sell', value: trade_flow.sell_volume },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                      >
                        <Cell fill={theme.palette.success.main} />
                        <Cell fill={theme.palette.error.main} />
                      </Pie>
                      <RechartsTooltip 
                        formatter={(value: any) => formatVolume(value)}
                        contentStyle={{ 
                          backgroundColor: theme.palette.background.paper,
                          border: `1px solid ${theme.palette.divider}`,
                          borderRadius: 8
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 2 }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">Buy Count</Typography>
                      <Typography variant="h6" color="success.main">{trade_flow.buy_count}</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">Sell Count</Typography>
                      <Typography variant="h6" color="error.main">{trade_flow.sell_count}</Typography>
                    </Box>
                  </Stack>
                </Paper>
              </Grid>

              {/* Whale Activity - Donut Chart */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LocalFireDepartment color="warning" /> Whale Activity ({trade_flow.whale_trades} trades)
                  </Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Whale Buy', value: trade_flow.whale_buy_volume },
                          { name: 'Whale Sell', value: trade_flow.whale_sell_volume },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                      >
                        <Cell fill={alpha(theme.palette.success.main, 0.8)} />
                        <Cell fill={alpha(theme.palette.error.main, 0.8)} />
                      </Pie>
                      <RechartsTooltip 
                        formatter={(value: any) => formatVolume(value)}
                        contentStyle={{ 
                          backgroundColor: theme.palette.background.paper,
                          border: `1px solid ${theme.palette.divider}`,
                          borderRadius: 8
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 2 }}>
                    Total Whale Volume: {formatVolume(trade_flow.whale_buy_volume + trade_flow.whale_sell_volume)}
                  </Typography>
                </Paper>
              </Grid>

              {/* Trade Size Distribution */}
              <Grid item xs={12}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AttachMoney color="success" /> Trade Flow Summary
                  </Typography>
                  <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={12} sm={6} md={3}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="caption" color="text.secondary">Total Trades</Typography>
                          <Typography variant="h5" fontWeight={700}>{trade_flow.total_trades}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="caption" color="text.secondary">Avg Trade Size</Typography>
                          <Typography variant="h5" fontWeight={700}>{formatVolume(trade_flow.avg_trade_size)}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="caption" color="text.secondary">Buy/Sell Ratio</Typography>
                          <Typography variant="h5" fontWeight={700} color={trade_flow.buy_sell_ratio > 1 ? 'success.main' : 'error.main'}>
                            {trade_flow.buy_sell_ratio.toFixed(2)}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="caption" color="text.secondary">Whale Trades</Typography>
                          <Typography variant="h5" fontWeight={700} color="warning.main">{trade_flow.whale_trades}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>

                  {trade_flow.largest_trade && (
                    <Alert severity="info" icon={<LocalFireDepartment />} sx={{ mt: 3 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Largest Trade
                      </Typography>
                      <Typography variant="body2">
                        {trade_flow.largest_trade.side} {trade_flow.largest_trade.token_label} @{' '}
                        {formatPrice(trade_flow.largest_trade.price)} -{' '}
                        {formatVolume(trade_flow.largest_trade.usd_value || 0)} on "{trade_flow.largest_trade.market_title}"
                      </Typography>
                    </Alert>
                  )}
                </Paper>
              </Grid>
            </Grid>
          </TabPanel>

          {/* Momentum Heatmap Tab */}
          <TabPanel value={chartTab} index={4}>
            <Grid container spacing={3}>
              {/* Momentum Score Distribution */}
              <Grid item xs={12}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Speed color="primary" /> Market Momentum Scores
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Positive momentum indicates increasing volume and price conviction
                  </Typography>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={filteredMarkets.slice(0, 15).map(m => ({
                      title: m.title.slice(0, 25) + '...',
                      momentum: m.momentum_score || 0
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.1)} />
                      <XAxis dataKey="title" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={100} stroke={theme.palette.text.secondary} />
                      <YAxis domain={[-100, 100]} stroke={theme.palette.text.secondary} />
                      <RechartsTooltip
                        contentStyle={{ 
                          backgroundColor: theme.palette.background.paper,
                          border: `1px solid ${theme.palette.divider}`,
                          borderRadius: 8
                        }}
                      />
                      <Bar dataKey="momentum" radius={[4, 4, 0, 0]}>
                        {filteredMarkets.slice(0, 15).map((m, idx) => (
                          <Cell 
                            key={idx} 
                            fill={(m.momentum_score || 0) > 0 ? theme.palette.success.main : theme.palette.error.main} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>

              {/* Top Momentum Markets */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom color="success.main">
                    📈 Top Momentum Markets
                  </Typography>
                  <Stack spacing={1.5}>
                    {[...filteredMarkets]
                      .sort((a, b) => (b.momentum_score || 0) - (a.momentum_score || 0))
                      .slice(0, 8)
                      .map((market, idx) => (
                        <Box
                          key={market.market_id}
                          sx={{
                            p: 1.5,
                            borderRadius: 1,
                            border: 1,
                            borderColor: 'divider',
                            background: alpha(theme.palette.success.main, 0.05)
                          }}
                        >
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="body2" fontWeight={500} noWrap>
                                #{idx + 1} {market.title.slice(0, 40)}...
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {formatVolume(market.volume_24h)} • {formatPrice(market.yes_price)}
                              </Typography>
                            </Box>
                            <Chip
                              label={`+${(market.momentum_score || 0).toFixed(0)}`}
                              size="small"
                              color="success"
                              sx={{ fontWeight: 700 }}
                            />
                          </Stack>
                        </Box>
                      ))}
                  </Stack>
                </Paper>
              </Grid>

              {/* Markets Needing Attention */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom color="warning.main">
                    ⚠️ Low Activity Markets
                  </Typography>
                  <Stack spacing={1.5}>
                    {[...filteredMarkets]
                      .sort((a, b) => (a.momentum_score || 0) - (b.momentum_score || 0))
                      .slice(0, 8)
                      .map((market, idx) => (
                        <Box
                          key={market.market_id}
                          sx={{
                            p: 1.5,
                            borderRadius: 1,
                            border: 1,
                            borderColor: 'divider',
                            background: alpha(theme.palette.warning.main, 0.05)
                          }}
                        >
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="body2" fontWeight={500} noWrap>
                                #{idx + 1} {market.title.slice(0, 40)}...
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {formatVolume(market.volume_24h)} • {formatPrice(market.yes_price)}
                              </Typography>
                            </Box>
                            <Chip
                              label={`${(market.momentum_score || 0).toFixed(0)}`}
                              size="small"
                              color="warning"
                              sx={{ fontWeight: 700 }}
                            />
                          </Stack>
                        </Box>
                      ))}
                  </Stack>
                </Paper>
              </Grid>
            </Grid>
          </TabPanel>
        </TabPanel>

        {/* Trade History Tab - Comprehensive Analytics */}
        <TabPanel value={mainTab} index={2}>
          {/* Smart Insights Alert */}
          <Alert 
            severity={trade_flow.buy_sell_ratio > 1.2 ? 'success' : trade_flow.buy_sell_ratio < 0.8 ? 'error' : 'info'}
            icon={trade_flow.buy_sell_ratio > 1.2 ? <TrendingUp /> : trade_flow.buy_sell_ratio < 0.8 ? <TrendingDown /> : <ShowChart />}
            sx={{ mb: 3 }}
          >
            <Typography variant="subtitle2" fontWeight={700}>
              📊 Market Intelligence Summary
            </Typography>
            <Typography variant="body2">
              Last 24h: {((trade_flow.buy_count / (trade_flow.buy_count + trade_flow.sell_count)) * 100).toFixed(0)}% buys at avg {formatVolume(trade_flow.avg_trade_size)} — 
              <strong>{trade_flow.buy_sell_ratio > 1.2 ? ' Bullish momentum detected' : trade_flow.buy_sell_ratio < 0.8 ? ' Bearish pressure detected' : ' Neutral trading activity'}</strong>.
              {trade_flow.whale_trades > 0 && ` ${trade_flow.whale_trades} whale trades worth ${formatVolume(trade_flow.whale_buy_volume + trade_flow.whale_sell_volume)}.`}
            </Typography>
          </Alert>

          <Grid container spacing={3}>
            {/* Key Metrics Row */}
            <Grid item xs={6} sm={3}>
              <Card sx={{ 
                background: `linear-gradient(135deg, ${alpha('#4caf50', 0.15)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`,
                border: `1px solid ${alpha('#4caf50', 0.3)}`
              }}>
                <CardContent sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="overline" color="text.secondary">Buy Volume</Typography>
                  <Typography variant="h5" fontWeight={700} color="success.main">
                    {formatVolume(trade_flow.buy_volume)}
                  </Typography>
                  <Typography variant="caption" color="success.main">
                    {trade_flow.buy_count} orders
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card sx={{ 
                background: `linear-gradient(135deg, ${alpha('#f44336', 0.15)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`,
                border: `1px solid ${alpha('#f44336', 0.3)}`
              }}>
                <CardContent sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="overline" color="text.secondary">Sell Volume</Typography>
                  <Typography variant="h5" fontWeight={700} color="error.main">
                    {formatVolume(trade_flow.sell_volume)}
                  </Typography>
                  <Typography variant="caption" color="error.main">
                    {trade_flow.sell_count} orders
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card sx={{ 
                background: `linear-gradient(135deg, ${alpha('#ff9800', 0.15)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`,
                border: `1px solid ${alpha('#ff9800', 0.3)}`
              }}>
                <CardContent sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="overline" color="text.secondary">Whale Activity</Typography>
                  <Typography variant="h5" fontWeight={700} color="warning.main">
                    {trade_flow.whale_trades}
                  </Typography>
                  <Typography variant="caption" color="warning.main">
                    {formatVolume(trade_flow.whale_buy_volume + trade_flow.whale_sell_volume)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card sx={{ 
                background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.15)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`,
                border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`
              }}>
                <CardContent sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="overline" color="text.secondary">Sentiment</Typography>
                  <Typography variant="h5" fontWeight={700} color={trade_flow.buy_sell_ratio > 1 ? 'success.main' : 'error.main'}>
                    {trade_flow.buy_sell_ratio.toFixed(2)}x
                  </Typography>
                  <Typography variant="caption" color={trade_flow.buy_sell_ratio > 1 ? 'success.main' : 'error.main'}>
                    {trade_flow.buy_sell_ratio > 1.2 ? '🚀 Bullish' : trade_flow.buy_sell_ratio < 0.8 ? '📉 Bearish' : '➡️ Neutral'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Buy vs Sell Volume - Enhanced Pie Chart */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, height: '100%' }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ShowChart color="primary" /> Buy vs Sell Distribution
                </Typography>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Buy Volume', value: trade_flow.buy_volume },
                        { name: 'Sell Volume', value: trade_flow.sell_volume },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      dataKey="value"
                      label={({ name, percent }) => `${name.split(' ')[0]}: ${(percent * 100).toFixed(1)}%`}
                    >
                      <Cell fill={theme.palette.success.main} />
                      <Cell fill={theme.palette.error.main} />
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value: any) => formatVolume(value)}
                      contentStyle={{ 
                        backgroundColor: theme.palette.background.paper,
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: 8
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* Whale Activity - Enhanced */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, height: '100%' }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LocalFireDepartment color="warning" /> Smart Money Flow
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Whale trades (≥$1,000) — {trade_flow.whale_trades} detected
                </Typography>
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Whale Buys', value: trade_flow.whale_buy_volume || 0.01 },
                        { name: 'Whale Sells', value: trade_flow.whale_sell_volume || 0.01 },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={75}
                      dataKey="value"
                      label={({ name, percent }) => percent > 0 ? `${(percent * 100).toFixed(0)}%` : ''}
                    >
                      <Cell fill={alpha(theme.palette.success.main, 0.85)} />
                      <Cell fill={alpha(theme.palette.error.main, 0.85)} />
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value: any) => formatVolume(value)}
                      contentStyle={{ 
                        backgroundColor: theme.palette.background.paper,
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: 8
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                {trade_flow.whale_buy_volume > trade_flow.whale_sell_volume ? (
                  <Chip label="🐋 Whales accumulating" color="success" size="small" sx={{ mt: 1 }} />
                ) : trade_flow.whale_sell_volume > trade_flow.whale_buy_volume ? (
                  <Chip label="🐋 Whales distributing" color="error" size="small" sx={{ mt: 1 }} />
                ) : null}
              </Paper>
            </Grid>

            {/* Trade Activity Timeline */}
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Timeline color="primary" /> Trade Activity Timeline
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Recent trade distribution by market
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={(() => {
                      // Group recent trades by market
                      const marketTrades = new Map<string, { buys: number; sells: number; title: string }>();
                      recent_trades.forEach(trade => {
                        const key = trade.market_id;
                        if (!marketTrades.has(key)) {
                          marketTrades.set(key, { 
                            buys: 0, 
                            sells: 0, 
                            title: (trade.market_title || trade.market_id).slice(0, 25) + '...'
                          });
                        }
                        const entry = marketTrades.get(key)!;
                        if (trade.side === 'BUY') {
                          entry.buys += trade.usd_value || 0;
                        } else {
                          entry.sells += trade.usd_value || 0;
                        }
                      });
                      return Array.from(marketTrades.values())
                        .sort((a, b) => (b.buys + b.sells) - (a.buys + a.sells))
                        .slice(0, 8);
                    })()}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.1)} />
                    <XAxis dataKey="title" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={80} stroke={theme.palette.text.secondary} />
                    <YAxis tickFormatter={(v) => formatVolume(v)} stroke={theme.palette.text.secondary} />
                    <RechartsTooltip 
                      formatter={(value: any) => formatVolume(value)}
                      contentStyle={{ 
                        backgroundColor: theme.palette.background.paper,
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: 8
                      }}
                    />
                    <Legend />
                    <Bar dataKey="buys" name="Buy Volume" fill={theme.palette.success.main} stackId="stack" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="sells" name="Sell Volume" fill={theme.palette.error.main} stackId="stack" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* Trading Signals & Insights */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, height: '100%' }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  💡 Trading Signals
                </Typography>
                <Stack spacing={2}>
                  {/* Momentum Signal */}
                  <Box sx={{ p: 2, borderRadius: 1, bgcolor: alpha(trade_flow.buy_sell_ratio > 1 ? '#4caf50' : '#f44336', 0.1), border: `1px solid ${alpha(trade_flow.buy_sell_ratio > 1 ? '#4caf50' : '#f44336', 0.3)}` }}>
                    <Typography variant="subtitle2" fontWeight={600}>
                      {trade_flow.buy_sell_ratio > 1.2 ? '🔥 Strong Buy Signal' : trade_flow.buy_sell_ratio < 0.8 ? '⚠️ Sell Pressure' : '➡️ Neutral Flow'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Buy orders outpace sells {trade_flow.buy_sell_ratio.toFixed(2)}x — {trade_flow.buy_sell_ratio > 1 ? 'momentum entry opportunity' : 'consider waiting for reversal'}
                    </Typography>
                  </Box>

                  {/* Volume Signal */}
                  <Box sx={{ p: 2, borderRadius: 1, bgcolor: alpha(theme.palette.info.main, 0.1), border: `1px solid ${alpha(theme.palette.info.main, 0.3)}` }}>
                    <Typography variant="subtitle2" fontWeight={600}>
                      📊 Volume Analysis
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {trade_flow.total_trades} trades with avg size {formatVolume(trade_flow.avg_trade_size)} — 
                      {trade_flow.avg_trade_size > 100 ? ' high conviction trading' : ' retail-dominated activity'}
                    </Typography>
                  </Box>

                  {/* Whale Signal */}
                  {trade_flow.whale_trades > 0 && (
                    <Box sx={{ p: 2, borderRadius: 1, bgcolor: alpha('#ff9800', 0.1), border: `1px solid ${alpha('#ff9800', 0.3)}` }}>
                      <Typography variant="subtitle2" fontWeight={600}>
                        🐋 Whale Alert
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {trade_flow.whale_trades} large trades detected ({formatVolume(trade_flow.whale_buy_volume + trade_flow.whale_sell_volume)}) — 
                        {trade_flow.whale_buy_volume > trade_flow.whale_sell_volume ? ' smart money accumulating' : ' potential distribution'}
                      </Typography>
                    </Box>
                  )}
                </Stack>
              </Paper>
            </Grid>

            {/* Trade Size Distribution */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, height: '100%' }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AttachMoney color="success" /> Trade Size Analysis
                </Typography>
                <Stack spacing={2}>
                  {/* Size breakdown */}
                  {(() => {
                    const small = recent_trades.filter(t => (t.usd_value || 0) < 50).length;
                    const medium = recent_trades.filter(t => (t.usd_value || 0) >= 50 && (t.usd_value || 0) < 500).length;
                    const large = recent_trades.filter(t => (t.usd_value || 0) >= 500 && (t.usd_value || 0) < 1000).length;
                    const whale = recent_trades.filter(t => (t.usd_value || 0) >= 1000).length;
                    const total = recent_trades.length || 1;
                    return (
                      <>
                        <Box>
                          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                            <Typography variant="body2">Retail (&lt;$50)</Typography>
                            <Typography variant="body2" fontWeight={600}>{small} ({((small/total)*100).toFixed(0)}%)</Typography>
                          </Stack>
                          <Box sx={{ height: 8, bgcolor: alpha(theme.palette.text.primary, 0.1), borderRadius: 1, overflow: 'hidden' }}>
                            <Box sx={{ width: `${(small/total)*100}%`, height: '100%', bgcolor: theme.palette.info.main, borderRadius: 1 }} />
                          </Box>
                        </Box>
                        <Box>
                          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                            <Typography variant="body2">Medium ($50-$500)</Typography>
                            <Typography variant="body2" fontWeight={600}>{medium} ({((medium/total)*100).toFixed(0)}%)</Typography>
                          </Stack>
                          <Box sx={{ height: 8, bgcolor: alpha(theme.palette.text.primary, 0.1), borderRadius: 1, overflow: 'hidden' }}>
                            <Box sx={{ width: `${(medium/total)*100}%`, height: '100%', bgcolor: theme.palette.primary.main, borderRadius: 1 }} />
                          </Box>
                        </Box>
                        <Box>
                          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                            <Typography variant="body2">Large ($500-$1K)</Typography>
                            <Typography variant="body2" fontWeight={600}>{large} ({((large/total)*100).toFixed(0)}%)</Typography>
                          </Stack>
                          <Box sx={{ height: 8, bgcolor: alpha(theme.palette.text.primary, 0.1), borderRadius: 1, overflow: 'hidden' }}>
                            <Box sx={{ width: `${(large/total)*100}%`, height: '100%', bgcolor: theme.palette.warning.main, borderRadius: 1 }} />
                          </Box>
                        </Box>
                        <Box>
                          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                            <Typography variant="body2">Whale (≥$1K)</Typography>
                            <Typography variant="body2" fontWeight={600}>{whale} ({((whale/total)*100).toFixed(0)}%)</Typography>
                          </Stack>
                          <Box sx={{ height: 8, bgcolor: alpha(theme.palette.text.primary, 0.1), borderRadius: 1, overflow: 'hidden' }}>
                            <Box sx={{ width: `${(whale/total)*100}%`, height: '100%', bgcolor: theme.palette.error.main, borderRadius: 1 }} />
                          </Box>
                        </Box>
                      </>
                    );
                  })()}
                </Stack>
              </Paper>
            </Grid>

            {/* Largest Trade Highlight */}
            {trade_flow.largest_trade && (
              <Grid item xs={12}>
                <Alert
                  severity="warning"
                  icon={<LocalFireDepartment />}
                  sx={{ 
                    background: `linear-gradient(135deg, ${alpha('#ff9800', 0.15)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`,
                  }}
                >
                  <Typography variant="subtitle2" fontWeight={700}>
                    🏆 Largest Trade Detected
                  </Typography>
                  <Typography variant="body2">
                    <strong>{trade_flow.largest_trade.side}</strong> {trade_flow.largest_trade.token_label} @ {formatPercent(trade_flow.largest_trade.price)} — 
                    <strong> {formatVolume(trade_flow.largest_trade.usd_value)}</strong> on "{trade_flow.largest_trade.market_title}"
                    {trade_flow.largest_trade.side === 'BUY' ? ' — Bullish signal from large trader' : ' — Large position exit'}
                  </Typography>
                </Alert>
              </Grid>
            )}
          </Grid>
        </TabPanel>

        {/* Recent Trades Tab - Separate YES/NO Tables */}
        <TabPanel value={mainTab} index={3}>
          {(() => {
            // Helper to truncate wallet address
            const truncateAddress = (addr: string | null | undefined) => {
              if (!addr) return '-';
              if (addr.length <= 12) return addr;
              return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
            };

            // Helper to truncate hash
            const truncateHash = (hash: string | null | undefined) => {
              if (!hash) return '-';
              if (hash.length <= 16) return hash;
              return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
            };

            // Split trades by token label and sort by value (case-insensitive)
            const yesTrades = [...recent_trades]
              .filter(t => t.token_label?.toUpperCase() === 'YES')
              .sort((a, b) => (b.usd_value || 0) - (a.usd_value || 0))
              .slice(0, 50);
            
            const noTrades = [...recent_trades]
              .filter(t => t.token_label?.toUpperCase() === 'NO')
              .sort((a, b) => (b.usd_value || 0) - (a.usd_value || 0))
              .slice(0, 50);

            const yesTotalValue = yesTrades.reduce((sum, t) => sum + (t.usd_value || 0), 0);
            const noTotalValue = noTrades.reduce((sum, t) => sum + (t.usd_value || 0), 0);
            const yesWhales = yesTrades.filter(t => t.is_whale).length;
            const noWhales = noTrades.filter(t => t.is_whale).length;

            // Trade table component to avoid repetition
            const TradeTable = ({ trades, label, color, showRank = true }: { trades: TradeRecord[]; label: string; color: string; showRank?: boolean }) => (
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, maxHeight: 600, overflow: 'auto' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow sx={{ bgcolor: alpha(color, 0.05) }}>
                      {showRank && <TableCell sx={{ fontWeight: 700, width: 35 }}>#</TableCell>}
                      <TableCell sx={{ fontWeight: 700 }}>Time</TableCell>
                      <TableCell sx={{ fontWeight: 700, minWidth: 180 }}>Market</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Side</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Token</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Price</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Shares</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Value 💰</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Taker</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Tx Hash</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Type</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {trades.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} align="center">
                          <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                            No {label} trades found
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : trades.map((trade, idx) => (
                      <TableRow
                        key={idx}
                        hover
                        sx={{
                          backgroundColor: trade.is_whale 
                            ? alpha('#ff9800', 0.08) 
                            : trade.side === 'BUY' 
                              ? alpha('#4caf50', 0.03) 
                              : alpha('#f44336', 0.03),
                        }}
                      >
                        {showRank && (
                          <TableCell>
                            <Typography variant="body2" fontWeight={idx < 3 ? 700 : 400}>
                              {idx + 1}{idx === 0 && ' 🥇'}{idx === 1 && ' 🥈'}{idx === 2 && ' 🥉'}
                            </Typography>
                          </TableCell>
                        )}
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {trade.timestamp ? format(new Date(trade.timestamp * 1000), 'MMM d, HH:mm') : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Tooltip title={trade.market_title || trade.market_id} arrow>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>
                              {trade.market_title || trade.market_id}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={trade.side}
                            size="small"
                            color={trade.side === 'BUY' ? 'success' : 'error'}
                            sx={{ fontWeight: 600, minWidth: 50 }}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={trade.token_label}
                            size="small"
                            variant="outlined"
                            color={trade.token_label?.toUpperCase() === 'YES' ? 'success' : 'error'}
                            sx={{ fontWeight: 600, minWidth: 45 }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">{formatPercent(trade.price)}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">{trade.shares?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '-'}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700} color={trade.is_whale ? 'warning.main' : 'inherit'}>
                            {formatVolume(trade.usd_value)}
                            {trade.is_whale && ' 🐋'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {trade.taker ? (
                            <Tooltip title={`Click to copy: ${trade.taker}`} arrow>
                              <Chip
                                label={truncateAddress(trade.taker)}
                                size="small"
                                variant="outlined"
                                onClick={() => {
                                  navigator.clipboard.writeText(trade.taker || '');
                                  setSnackbar({ open: true, message: 'Address copied!' });
                                }}
                                sx={{ cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem' }}
                              />
                            </Tooltip>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          {trade.tx_hash ? (
                            <Tooltip title={`View on Polygonscan: ${trade.tx_hash}`} arrow>
                              <Chip
                                label={truncateHash(trade.tx_hash)}
                                size="small"
                                variant="outlined"
                                component="a"
                                href={`https://polygonscan.com/tx/${trade.tx_hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                clickable
                                icon={<OpenInNew sx={{ fontSize: 12 }} />}
                                sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                              />
                            </Tooltip>
                          ) : '-'}
                        </TableCell>
                        <TableCell align="center">
                          {trade.is_whale ? (
                            <Chip label="WHALE" size="small" color="warning" sx={{ fontWeight: 700 }} />
                          ) : (
                            <Chip label="Normal" size="small" variant="outlined" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            );

            // Render "All Trades" paginated view
            if (showAllTrades) {
              return (
                <>
                  {/* Header with Back Button */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                    <Button
                      variant="outlined"
                      startIcon={<ArrowBack />}
                      onClick={() => {
                        setShowAllTrades(false);
                        setAllTradesData(null);
                      }}
                    >
                      Back to Top 50
                    </Button>
                    <Typography variant="h6" fontWeight={700}>
                      📊 All Trades Explorer
                    </Typography>
                    {allTradesData && (
                      <Chip 
                        label={`${allTradesData.total_count.toLocaleString()} Total Trades`} 
                        color="primary" 
                        sx={{ fontWeight: 600 }}
                      />
                    )}
                  </Box>

                  {/* Filters */}
                  <Stack direction="row" spacing={2} sx={{ mb: 3 }} flexWrap="wrap">
                    <ToggleButtonGroup
                      value={allTradesFilter}
                      exclusive
                      onChange={(_, val) => {
                        if (val) {
                          setAllTradesFilter(val);
                          setAllTradesPage(1);
                        }
                      }}
                      size="small"
                    >
                      <ToggleButton value="all">All</ToggleButton>
                      <ToggleButton value="YES" sx={{ color: '#4caf50' }}>YES</ToggleButton>
                      <ToggleButton value="NO" sx={{ color: '#f44336' }}>NO</ToggleButton>
                    </ToggleButtonGroup>

                    <ToggleButtonGroup
                      value={allTradesSortBy}
                      exclusive
                      onChange={(_, val) => {
                        if (val) {
                          setAllTradesSortBy(val);
                          setAllTradesPage(1);
                        }
                      }}
                      size="small"
                    >
                      <ToggleButton value="value">Sort by Value 💰</ToggleButton>
                      <ToggleButton value="time">Sort by Time 🕐</ToggleButton>
                    </ToggleButtonGroup>
                  </Stack>

                  {/* Summary Stats */}
                  {allTradesData && (
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                      <Grid item xs={6} sm={3}>
                        <Tooltip title="Volume from fetched trades (API returns recent trades only, not full history)" arrow>
                          <Card variant="outlined" sx={{ textAlign: 'center' }}>
                            <CardContent sx={{ py: 1.5 }}>
                              <Typography variant="overline" color="text.secondary">Fetched Volume</Typography>
                              <Typography variant="h5" fontWeight={700} color="primary.main">
                                {formatVolume(allTradesData.total_volume)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                from {allTradesData.total_count.toLocaleString()} trades
                              </Typography>
                            </CardContent>
                          </Card>
                        </Tooltip>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Card variant="outlined" sx={{ textAlign: 'center' }}>
                          <CardContent sx={{ py: 1.5 }}>
                            <Typography variant="overline" color="text.secondary">Whale Trades</Typography>
                            <Typography variant="h5" fontWeight={700} color="warning.main">
                              {allTradesData.whale_count} 🐋
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              trades ≥$10K
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Card variant="outlined" sx={{ textAlign: 'center' }}>
                          <CardContent sx={{ py: 1.5 }}>
                            <Typography variant="overline" color="text.secondary">Buys</Typography>
                            <Typography variant="h5" fontWeight={700} color="success.main">
                              {allTradesData.buy_count.toLocaleString()}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {((allTradesData.buy_count / allTradesData.total_count) * 100).toFixed(1)}%
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Card variant="outlined" sx={{ textAlign: 'center' }}>
                          <CardContent sx={{ py: 1.5 }}>
                            <Typography variant="overline" color="text.secondary">Sells</Typography>
                            <Typography variant="h5" fontWeight={700} color="error.main">
                              {allTradesData.sell_count.toLocaleString()}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {((allTradesData.sell_count / allTradesData.total_count) * 100).toFixed(1)}%
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    </Grid>
                  )}

                  {/* Info Alert */}
                  {allTradesData && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                      <Typography variant="body2">
                        <strong>📊 Data Note:</strong> Showing {allTradesData.total_count.toLocaleString()} recent trades fetched from the API. 
                        The API returns recent trading activity (up to 1,000 trades per market). 
                        For total historical volume (${formatVolume(data?.summary?.total_volume)}), see the event summary above.
                      </Typography>
                    </Alert>
                  )}

                  {/* Loading State */}
                  {allTradesLoading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                      <CircularProgress />
                    </Box>
                  )}

                  {/* Trades Table */}
                  {!allTradesLoading && allTradesData && (
                    <>
                      <TradeTable 
                        trades={allTradesData.trades} 
                        label={allTradesFilter === 'all' ? 'trades' : allTradesFilter}
                        color={allTradesFilter === 'YES' ? '#4caf50' : allTradesFilter === 'NO' ? '#f44336' : '#1976d2'}
                        showRank={allTradesSortBy === 'value'}
                      />

                      {/* Pagination */}
                      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          Page {allTradesData.page} of {allTradesData.total_pages} 
                          ({allTradesData.total_count.toLocaleString()} trades)
                        </Typography>
                        <Pagination
                          count={allTradesData.total_pages}
                          page={allTradesData.page}
                          onChange={(_, page) => setAllTradesPage(page)}
                          color="primary"
                          showFirstButton
                          showLastButton
                        />
                      </Box>
                    </>
                  )}
                </>
              );
            }

            // Default: Show Top 50 view
            return (
              <>
                {/* View All Button */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                  <Typography variant="h6" fontWeight={700}>
                    🏆 Top 50 Trades by Value
                  </Typography>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() => setShowAllTrades(true)}
                    startIcon={<ViewList />}
                  >
                    View All {data?.total_trades_available?.toLocaleString() || trade_flow.total_trades?.toLocaleString() || ''} Trades
                  </Button>
                </Box>

                {/* Summary Cards */}
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={6} sm={3}>
                    <Card variant="outlined" sx={{ textAlign: 'center', borderColor: alpha('#4caf50', 0.4) }}>
                      <CardContent sx={{ py: 1.5 }}>
                        <Typography variant="overline" color="success.main" fontWeight={700}>YES Trades</Typography>
                        <Typography variant="h5" fontWeight={700} color="success.main">{yesTrades.length}</Typography>
                        <Typography variant="caption" color="success.main">
                          {formatVolume(yesTotalValue)} • {yesWhales} 🐋
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Card variant="outlined" sx={{ textAlign: 'center', borderColor: alpha('#f44336', 0.4) }}>
                      <CardContent sx={{ py: 1.5 }}>
                        <Typography variant="overline" color="error.main" fontWeight={700}>NO Trades</Typography>
                        <Typography variant="h5" fontWeight={700} color="error.main">{noTrades.length}</Typography>
                        <Typography variant="caption" color="error.main">
                          {formatVolume(noTotalValue)} • {noWhales} 🐋
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Card variant="outlined" sx={{ textAlign: 'center' }}>
                      <CardContent sx={{ py: 1.5 }}>
                        <Typography variant="overline" color="text.secondary">Total Volume</Typography>
                        <Typography variant="h5" fontWeight={700}>{formatVolume(yesTotalValue + noTotalValue)}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Top 100 trades
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Card variant="outlined" sx={{ textAlign: 'center' }}>
                      <CardContent sx={{ py: 1.5 }}>
                        <Typography variant="overline" color="text.secondary">Sentiment</Typography>
                        <Typography variant="h5" fontWeight={700} color={yesTotalValue > noTotalValue ? 'success.main' : 'error.main'}>
                          {yesTotalValue > noTotalValue ? '📈 YES' : '📉 NO'}
                        </Typography>
                        <Typography variant="caption" color={yesTotalValue > noTotalValue ? 'success.main' : 'error.main'}>
                          {((Math.max(yesTotalValue, noTotalValue) / (yesTotalValue + noTotalValue || 1)) * 100).toFixed(0)}% dominant
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>

                {/* Market Insight */}
                <Alert 
                  severity={yesTotalValue > noTotalValue ? 'success' : noTotalValue > yesTotalValue ? 'error' : 'info'}
                  sx={{ mb: 3 }}
                >
                  <Typography variant="body2">
                    <strong>🏆 Top Trades Analysis:</strong>{' '}
                    {yesTotalValue > noTotalValue 
                      ? `YES position dominates with ${formatVolume(yesTotalValue)} in top trades vs ${formatVolume(noTotalValue)} for NO — Smart money betting on YES outcome`
                      : noTotalValue > yesTotalValue
                        ? `NO position dominates with ${formatVolume(noTotalValue)} in top trades vs ${formatVolume(yesTotalValue)} for YES — Smart money betting on NO outcome`
                        : 'Balanced trading activity between YES and NO positions'}
                  </Typography>
                </Alert>

                {/* YES Trades Table */}
                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box component="span" sx={{ color: '#4caf50', fontWeight: 700 }}>✅ YES Position</Box>
                  <Chip label={`Top ${yesTrades.length}`} size="small" color="success" sx={{ fontWeight: 600 }} />
                  <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
                    Sorted by highest value
                  </Typography>
                </Typography>
                <TradeTable trades={yesTrades} label="YES" color="#4caf50" />

                {/* NO Trades Table */}
                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box component="span" sx={{ color: '#f44336', fontWeight: 700 }}>❌ NO Position</Box>
                  <Chip label={`Top ${noTrades.length}`} size="small" color="error" sx={{ fontWeight: 600 }} />
                  <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
                    Sorted by highest value
                  </Typography>
                </Typography>
                <TradeTable trades={noTrades} label="NO" color="#f44336" />
              </>
            );
          })()}
        </TabPanel>
      </Paper>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        message={snackbar.message}
      />
    </Box>
  );
};

export default EventAnalyticsPage;
