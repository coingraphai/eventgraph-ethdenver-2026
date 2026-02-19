/**
 * Enhanced Event Detail Page
 * Shows comprehensive event analytics with live prices, trades, and volume charts
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  Stack,
  Skeleton,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  IconButton,
  Tooltip,
  Breadcrumbs,
  Link,
  Avatar,
  LinearProgress,
  Divider,
  useTheme,
  alpha,
  Pagination,
  Select,
  MenuItem,
  FormControl,
} from '@mui/material';
import {
  ArrowBack,
  OpenInNew,
  TrendingUp,
  TrendingDown,
  Event as EventIcon,
  ShowChart,
  SwapVert,
  AttachMoney,
  Timeline,
  Refresh,
  AccessTime,
  Schedule,
  LocalOffer,
  Category as CategoryIcon,
} from '@mui/icons-material';
import {
  fetchEventDetail,
  EventDetailResponse,
  RecentTrade,
  formatVolume,
  formatEventDate,
  getPlatformName,
  getCategoryColor,
} from '../services/eventsApi';

// Format percentage
function formatPercent(value: number | null | undefined): string {
  if (value == null) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

// Format timestamp for trades
function formatTradeTime(timestamp: number): string {
  if (!timestamp) return '-';
  const date = new Date(timestamp * 1000);
  return formatDistanceToNow(date, { addSuffix: true });
}

// Format date for display
function formatExpiryDate(timestamp: number | null | undefined): string {
  if (!timestamp) return '-';
  try {
    const date = new Date(timestamp * 1000);
    return format(date, 'MMM dd, yyyy');
  } catch {
    return '-';
  }
}

// Calculate time remaining with detailed breakdown
interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isEnded: boolean;
  totalSeconds: number;
}

function calculateTimeRemaining(timestamp: number | null | undefined): TimeRemaining {
  if (!timestamp) return { days: 0, hours: 0, minutes: 0, seconds: 0, isEnded: true, totalSeconds: 0 };
  
  const now = Date.now();
  const target = timestamp * 1000;
  const diff = target - now;
  
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isEnded: true, totalSeconds: 0 };
  }
  
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  return { days, hours, minutes, seconds, isEnded: false, totalSeconds };
}

// Real-time countdown hook
function useCountdown(timestamp: number | null | undefined): TimeRemaining {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(() => 
    calculateTimeRemaining(timestamp)
  );
  
  useEffect(() => {
    if (!timestamp) return;
    
    const interval = setInterval(() => {
      setTimeRemaining(calculateTimeRemaining(timestamp));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [timestamp]);
  
  return timeRemaining;
}

// Legacy function for backward compatibility
function getTimeRemaining(timestamp: number | null | undefined): string {
  if (!timestamp) return '-';
  const date = new Date(timestamp * 1000);
  const now = new Date();
  if (date < now) return 'Ended';
  return formatDistanceToNow(date, { addSuffix: false }) + ' left';
}

type SortField = 'title' | 'yes_price' | 'volume_total' | 'volume_24h';
type SortOrder = 'asc' | 'desc';

export const EventDetailPage: React.FC = () => {
  const { platform, eventId } = useParams<{ platform: string; eventId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();

  const [data, setData] = useState<EventDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('yes_price');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  // Pagination state for markets table
  const [marketsPage, setMarketsPage] = useState(1);
  const [marketsPerPage, setMarketsPerPage] = useState(25);

  // Real-time countdown - uses end_time from event data
  const countdown = useCountdown(data?.event?.end_time);

  useEffect(() => {
    const loadEvent = async () => {
      if (!platform || !eventId) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetchEventDetail(platform, eventId);
        setData(response);
        setLastUpdated(new Date());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load event');
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
  }, [platform, eventId]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const sortedMarkets = data?.markets ? [...data.markets].sort((a, b) => {
    let aVal: any = a[sortField];
    let bVal: any = b[sortField];
    
    if (sortField === 'title') {
      aVal = aVal || '';
      bVal = bVal || '';
      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    
    aVal = aVal ?? 0;
    bVal = bVal ?? 0;
    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
  }) : [];

  // Deduplicate markets by market_id
  const uniqueMarkets = sortedMarkets.reduce((acc, market) => {
    if (!acc.find(m => m.market_id === market.market_id)) {
      acc.push(market);
    }
    return acc;
  }, [] as typeof sortedMarkets);

  // Analytics calculations
  const totalMarkets = uniqueMarkets.length;
  const marketsWithPrices = uniqueMarkets.filter(m => m.yes_price != null).length;
  const highConfidenceMarkets = uniqueMarkets.filter(m => m.yes_price && (m.yes_price > 0.7 || m.yes_price < 0.3)).length;
  const tossupMarkets = uniqueMarkets.filter(m => m.yes_price && m.yes_price >= 0.4 && m.yes_price <= 0.6).length;
  
  // Calculate 24h volume from markets
  const total24hVolume = uniqueMarkets.reduce((sum, m) => sum + (m.volume_24h || 0), 0);
  
  // Pagination calculations for markets table
  const totalPages = Math.ceil(totalMarkets / marketsPerPage);
  const startIndex = (marketsPage - 1) * marketsPerPage;
  const endIndex = startIndex + marketsPerPage;
  const paginatedMarkets = uniqueMarkets.slice(startIndex, endIndex);
  
  // Top markets by volume
  const topMarketsByVolume = [...uniqueMarkets]
    .filter(m => m.volume_total && m.volume_total > 0)
    .sort((a, b) => (b.volume_total || 0) - (a.volume_total || 0))
    .slice(0, 10);
  
  // Most competitive markets (closest to 50/50)
  const mostCompetitive = [...uniqueMarkets]
    .filter(m => m.yes_price != null)
    .sort((a, b) => Math.abs((a.yes_price || 0.5) - 0.5) - Math.abs((b.yes_price || 0.5) - 0.5))
    .slice(0, 5);
  
  // High conviction markets (>80% or <20%)
  const highConviction = [...uniqueMarkets]
    .filter(m => m.yes_price && (m.yes_price > 0.8 || m.yes_price < 0.2))
    .slice(0, 5);

  // Utility to add ref=eventgraph to any URL for affiliate tracking
  const addRefParam = (url: string): string => {
    if (!url) return url;
    return `${url}${url.includes('?') ? '&' : '?'}ref=eventgraph`;
  };

  // Get external link for a market - uses source_url if available, otherwise constructs URL
  const getExternalLink = (market?: { market_id?: string; source_url?: string | null }) => {
    // If market has source_url, use it directly (already has correct event_slug/market_slug format)
    if (market?.source_url) {
      return addRefParam(market.source_url);
    }
    
    // Fallback: construct URL (for event-level links without specific market)
    if (data?.platform === 'polymarket') {
      return `https://polymarket.com/event/${eventId}?ref=eventgraph`;
    } else if (data?.platform === 'limitless') {
      return `https://limitless.exchange/markets/${eventId}?ref=eventgraph`;
    } else if (data?.platform === 'opiniontrade') {
      return `https://app.opinion.trade/detail?topicId=${eventId}&ref=eventgraph`;
    } else {
      return `https://kalshi.com/browse?search=${eventId}&ref=eventgraph`;
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton width={200} height={32} sx={{ mb: 2 }} />
        <Skeleton width="60%" height={48} sx={{ mb: 3 }} />
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[1, 2, 3, 4].map((i) => (
            <Grid item xs={6} sm={3} key={i}>
              <Skeleton height={100} />
            </Grid>
          ))}
        </Grid>
        <Skeleton height={400} />
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box sx={{ p: 3 }}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/events')} sx={{ mb: 2 }}>
          Back to Events
        </Button>
        <Alert severity="error">{error || 'Event not found'}</Alert>
      </Box>
    );
  }

  const { event, markets, recent_trades, volume_by_market, price_summary } = data;

  // Calculate max volume for bar chart
  const maxVolume = Math.max(...(volume_by_market?.map(v => v.volume) || [1]));

  return (
    <Box sx={{ p: 3 }}>
      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link
          component="button"
          variant="body2"
          onClick={() => navigate('/events')}
          sx={{ cursor: 'pointer' }}
        >
          Events
        </Link>
        <Typography variant="body2" color="text.primary">
          {event.title}
        </Typography>
      </Breadcrumbs>

      {/* Header Row */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/events')}>
          Back to Events
        </Button>
        <Button
          variant="outlined"
          startIcon={<OpenInNew />}
          onClick={() => window.open(getExternalLink(), '_blank')}
        >
          View on {getPlatformName(event.platform)}
        </Button>
      </Stack>

      {/* Event Header Card - Improved UI/UX */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3}>
          {/* Left Section: Image + Title */}
          <Grid item xs={12} md={8}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems="flex-start">
              {event.image ? (
                <Avatar
                  src={event.image}
                  alt={event.title}
                  variant="rounded"
                  sx={{
                    width: { xs: 80, sm: 100 },
                    height: { xs: 80, sm: 100 },
                    flexShrink: 0,
                  }}
                />
              ) : (
                <Avatar
                  variant="rounded"
                  sx={{
                    width: { xs: 80, sm: 100 },
                    height: { xs: 80, sm: 100 },
                    bgcolor: getCategoryColor(event.category),
                    flexShrink: 0,
                  }}
                >
                  <EventIcon sx={{ fontSize: 48, color: 'white' }} />
                </Avatar>
              )}

              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="h4" fontWeight="bold" gutterBottom>
                  {event.title}
                </Typography>

                {/* Status Chips Row */}
                <Stack direction="row" spacing={1} mb={2} flexWrap="wrap" useFlexGap>
                  <Chip
                    label={getPlatformName(event.platform).toUpperCase()}
                    size="small"
                    sx={{ 
                      fontWeight: 700,
                      bgcolor: event.platform === 'polymarket' ? 'primary.main' : 'secondary.main',
                      color: 'white',
                    }}
                  />
                  <Chip
                    label={event.category}
                    size="small"
                    variant="outlined"
                  />
                  <Chip 
                    label={event.status} 
                    size="small" 
                    color={event.status === 'open' ? 'success' : 'default'}
                    variant="outlined" 
                  />
                  {event.tags && event.tags.length > 0 && event.tags.map((tag) => (
                    <Chip 
                      key={tag} 
                      label={tag} 
                      size="small" 
                      variant="outlined"
                      sx={{ borderColor: alpha(theme.palette.text.primary, 0.2) }}
                    />
                  ))}
                </Stack>

                {/* Real-time Countdown Timer with pulsing indicator */}
                {event.end_time && !countdown.isEnded && (
                  <Box 
                    sx={{ 
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 2,
                      py: 1,
                      borderRadius: 2,
                      bgcolor: alpha(theme.palette.success.main, 0.1),
                      border: `1px solid ${alpha(theme.palette.success.main, 0.3)}`,
                    }}
                  >
                    {/* Pulsing live indicator */}
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: 'success.main',
                        animation: 'pulse 1s ease-in-out infinite',
                        '@keyframes pulse': {
                          '0%': { opacity: 1, transform: 'scale(1)' },
                          '50%': { opacity: 0.5, transform: 'scale(0.8)' },
                          '100%': { opacity: 1, transform: 'scale(1)' },
                        },
                      }}
                    />
                    <Schedule sx={{ fontSize: 20, color: 'success.main' }} />
                    <Stack direction="row" spacing={0.5} alignItems="baseline">
                      <Typography variant="h6" fontWeight="bold" color="success.main" sx={{ fontFamily: 'monospace' }}>
                        {countdown.days}d
                      </Typography>
                      <Typography variant="h6" fontWeight="bold" color="success.main" sx={{ fontFamily: 'monospace' }}>
                        {String(countdown.hours).padStart(2, '0')}h
                      </Typography>
                      <Typography variant="h6" fontWeight="bold" color="success.main" sx={{ fontFamily: 'monospace' }}>
                        {String(countdown.minutes).padStart(2, '0')}m
                      </Typography>
                      <Typography 
                        variant="h6" 
                        fontWeight="bold" 
                        color="success.main"
                        sx={{ 
                          minWidth: 36,
                          fontFamily: 'monospace',
                          animation: 'tick 1s steps(1) infinite',
                          '@keyframes tick': {
                            '0%, 100%': { opacity: 1 },
                            '50%': { opacity: 0.6 },
                          },
                        }}
                      >
                        {String(countdown.seconds).padStart(2, '0')}s
                      </Typography>
                    </Stack>
                    <Typography variant="caption" color="success.main" sx={{ opacity: 0.8 }}>
                      LIVE
                    </Typography>
                  </Box>
                )}
                {event.end_time && countdown.isEnded && (
                  <Chip 
                    label="Event Ended" 
                    color="error" 
                    size="small"
                    icon={<AccessTime />}
                  />
                )}

                {/* Last Updated */}
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
                  Last updated: {format(lastUpdated, 'HH:mm:ss')} (auto-refresh every hour)
                </Typography>
              </Box>
            </Stack>
          </Grid>

          {/* Right Section: Key Metrics */}
          <Grid item xs={12} md={4}>
            <Box 
              sx={{ 
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
              }}
            >
              {/* Markets & Total Volume Row */}
              <Stack direction="row" spacing={2}>
                <Box sx={{ flex: 1, p: 1.5, bgcolor: alpha(theme.palette.background.default, 0.5), borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">Markets</Typography>
                  <Typography variant="h5" fontWeight="bold">{totalMarkets}</Typography>
                </Box>
                <Box sx={{ flex: 1, p: 1.5, bgcolor: alpha(theme.palette.background.default, 0.5), borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">Total Volume</Typography>
                  <Typography variant="h5" fontWeight="bold" color="success.main">
                    {formatVolume(event.total_volume)}
                  </Typography>
                </Box>
              </Stack>

              {/* 24h Volume & Avg Price Row */}
              <Stack direction="row" spacing={2}>
                <Box sx={{ flex: 1, p: 1.5, bgcolor: alpha(theme.palette.background.default, 0.5), borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">24h Volume</Typography>
                  <Typography variant="h5" fontWeight="bold" color="info.main">
                    {formatVolume(total24hVolume || event.volume_24h)}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1, p: 1.5, bgcolor: alpha(theme.palette.background.default, 0.5), borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">Avg Price</Typography>
                  <Typography variant="h5" fontWeight="bold">
                    {price_summary?.avg_price ? formatPercent(price_summary.avg_price) : '-'}
                  </Typography>
                </Box>
              </Stack>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <ShowChart color="primary" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="caption" color="text.secondary" display="block">
                Total Markets
              </Typography>
              <Typography variant="h4" fontWeight="bold">
                {totalMarkets}
              </Typography>
              <Typography variant="caption" color="success.main">
                {marketsWithPrices} with live prices
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <AttachMoney color="success" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="caption" color="text.secondary" display="block">
                Total Volume
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="success.main">
                {formatVolume(event.total_volume)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Timeline color="warning" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="caption" color="text.secondary" display="block">
                High Conviction
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="warning.main">
                {highConfidenceMarkets}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                markets &gt;70% or &lt;30%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <SwapVert color="info" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="caption" color="text.secondary" display="block">
                Toss-ups
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="info.main">
                {tossupMarkets}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                markets 40-60%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Price Summary & Volume Chart Row */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Price Summary */}
        {price_summary && price_summary.markets_with_price > 0 && (
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrendingUp /> Price Overview
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={2}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Average Price (Yes)</Typography>
                  <Typography variant="h5" fontWeight="bold">
                    {formatPercent(price_summary.avg_price)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Highest</Typography>
                    <Typography variant="h6" color="success.main" fontWeight="bold">
                      {formatPercent(price_summary.max_price)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Lowest</Typography>
                    <Typography variant="h6" color="error.main" fontWeight="bold">
                      {formatPercent(price_summary.min_price)}
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {price_summary.markets_with_price} of {markets.length} markets with live prices
                </Typography>
              </Stack>
            </Paper>
          </Grid>
        )}

        {/* Volume Distribution */}
        {volume_by_market && volume_by_market.length > 0 && (
          <Grid item xs={12} md={price_summary?.markets_with_price ? 8 : 12}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AttachMoney /> Volume Distribution (Top {volume_by_market.length})
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={1}>
                {volume_by_market.slice(0, 6).map((item, idx) => (
                  <Box key={idx}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" sx={{ maxWidth: '60%' }} noWrap>
                        {item.title}
                      </Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {formatVolume(item.volume)}
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={(item.volume / maxVolume) * 100}
                      sx={{ height: 8, borderRadius: 1, mt: 0.5 }}
                    />
                  </Box>
                ))}
              </Stack>
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* Recent Trades */}
      {recent_trades && recent_trades.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SwapVert /> Recent Trades
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>Side</TableCell>
                  <TableCell>Token</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell align="right">Shares</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recent_trades.slice(0, 10).map((trade, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {formatTradeTime(trade.timestamp)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={trade.side}
                        size="small"
                        color={trade.side === 'BUY' ? 'success' : 'error'}
                        sx={{ minWidth: 50 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={trade.token_label || 'YES'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography fontWeight="bold">
                        {formatPercent(trade.price)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography>
                        {trade.shares?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '-'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Market Intelligence Sections */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Most Competitive Markets */}
        {mostCompetitive.length > 0 && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrendingUp color="warning" /> Most Competitive (Closest to 50/50)
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={1.5}>
                {mostCompetitive.map((market, idx) => (
                  <Box key={idx}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                      <Typography variant="body2" sx={{ flex: 1, mr: 2 }} noWrap>
                        {market.title}
                      </Typography>
                      <Chip
                        label={formatPercent(market.yes_price)}
                        size="small"
                        color="warning"
                        sx={{ minWidth: 60 }}
                      />
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={(market.yes_price || 0) * 100}
                      sx={{ height: 6, borderRadius: 1 }}
                    />
                  </Box>
                ))}
              </Stack>
            </Paper>
          </Grid>
        )}

        {/* High Conviction Markets */}
        {highConviction.length > 0 && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Timeline color="success" /> High Conviction (&gt;80% or &lt;20%)
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={1.5}>
                {highConviction.map((market, idx) => (
                  <Box key={idx}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                      <Typography variant="body2" sx={{ flex: 1, mr: 2 }} noWrap>
                        {market.title}
                      </Typography>
                      <Chip
                        label={formatPercent(market.yes_price)}
                        size="small"
                        color={market.yes_price && market.yes_price > 0.5 ? 'success' : 'error'}
                        sx={{ minWidth: 60 }}
                      />
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={(market.yes_price || 0) * 100}
                      color={market.yes_price && market.yes_price > 0.5 ? 'success' : 'error'}
                      sx={{ height: 6, borderRadius: 1 }}
                    />
                  </Box>
                ))}
              </Stack>
            </Paper>
          </Grid>
        )}

        {/* Top Markets by Volume */}
        {topMarketsByVolume.length > 0 && (
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AttachMoney /> Top Markets by Volume
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Rank</TableCell>
                      <TableCell>Market</TableCell>
                      <TableCell align="right">Yes Price</TableCell>
                      <TableCell align="right">Volume</TableCell>
                      <TableCell align="right">24h Vol</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topMarketsByVolume.map((market, idx) => (
                      <TableRow key={market.market_id} hover>
                        <TableCell>
                          <Chip label={`#${idx + 1}`} size="small" color="primary" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ maxWidth: 400 }}>
                            {market.title}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            fontWeight="bold"
                            color={market.yes_price && market.yes_price > 0.5 ? 'success.main' : 'error.main'}
                          >
                            {formatPercent(market.yes_price)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography fontWeight="medium">
                            {formatVolume(market.volume_total)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography color="text.secondary">
                            {formatVolume(market.volume_24h)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* Full Markets Table - Collapsible */}
      <Paper>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6">
            All Markets ({totalMarkets})
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Full detailed list of all prediction markets in this event
          </Typography>
        </Box>
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>
                  <TableSortLabel
                    active={sortField === 'title'}
                    direction={sortField === 'title' ? sortOrder : 'asc'}
                    onClick={() => handleSort('title')}
                  >
                    Market
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={sortField === 'yes_price'}
                    direction={sortField === 'yes_price' ? sortOrder : 'desc'}
                    onClick={() => handleSort('yes_price')}
                  >
                    Yes Price
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={sortField === 'volume_total'}
                    direction={sortField === 'volume_total' ? sortOrder : 'desc'}
                    onClick={() => handleSort('volume_total')}
                  >
                    Volume
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={sortField === 'volume_24h'}
                    direction={sortField === 'volume_24h' ? sortOrder : 'desc'}
                    onClick={() => handleSort('volume_24h')}
                  >
                    24h Vol
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedMarkets.map((market) => (
                <TableRow
                  key={market.market_id}
                  hover
                  sx={{ 
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' }
                  }}
                >
                  <TableCell>
                    <Stack direction="row" spacing={2} alignItems="center">
                      {market.image && (
                        <Avatar src={market.image} variant="rounded" sx={{ width: 36, height: 36 }} />
                      )}
                      <Box>
                        <Typography variant="body2" sx={{ maxWidth: 350 }}>
                          {market.title}
                        </Typography>
                        {market.result && (
                          <Chip
                            label={`Result: ${market.result}`}
                            size="small"
                            color={market.result === 'Yes' ? 'success' : 'error'}
                            sx={{ mt: 0.5 }}
                          />
                        )}
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    {market.yes_price != null ? (
                      <Stack alignItems="flex-end">
                        <Typography
                          variant="body1"
                          fontWeight="bold"
                          color={market.yes_price > 0.5 ? 'success.main' : 'error.main'}
                        >
                          {formatPercent(market.yes_price)}
                        </Typography>
                        {market.yes_price > 0.5 ? (
                          <TrendingUp fontSize="small" color="success" />
                        ) : (
                          <TrendingDown fontSize="small" color="error" />
                        )}
                      </Stack>
                    ) : (
                      <Typography color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontWeight="medium">
                      {formatVolume(market.volume_total)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography color="text.secondary">
                      {formatVolume(market.volume_24h)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Chip
                      size="small"
                      label={market.status}
                      color={market.status === 'open' ? 'success' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={`Open on ${getPlatformName(data.platform)}`}>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(getExternalLink(market), '_blank');
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

        {/* Pagination Controls */}
        <Box sx={{ 
          mt: 3, 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2
        }}>
          <Typography variant="body2" color="text.secondary">
            Showing {startIndex + 1}-{Math.min(endIndex, totalMarkets)} of {totalMarkets} markets
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Per page:
              </Typography>
              <FormControl size="small">
                <Select
                  value={marketsPerPage}
                  onChange={(e) => {
                    setMarketsPerPage(Number(e.target.value));
                    setMarketsPage(1); // Reset to first page when changing page size
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
              page={marketsPage}
              onChange={(_, page) => setMarketsPage(page)}
              color="primary"
              showFirstButton
              showLastButton
            />
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default EventDetailPage;
