/**
 * Comprehensive Event Detail Page - Analytics Dashboard
 * Shows prediction market event with full analytics, charts, and market tables
 * 
 * Features:
 * 1. Header with event info, stats, countdown timer
 * 2. Overview cards with trends
 * 3. Charts section (price trends, volume distribution)
 * 4. Summary lists (competitive/high conviction markets)
 * 5. Detailed tables (markets, trades, orderbook)
 * 6. Personalized dashboard (collapsible)
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
  Alert,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  Breadcrumbs,
  Link,
  Avatar,
  LinearProgress,
  Divider,
  TextField,
  InputAdornment,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Skeleton,
  useTheme,
  alpha,
} from '@mui/material';
import {
  ArrowBack,
  OpenInNew,
  TrendingUp,
  TrendingDown,
  Event as EventIcon,
  Search,
  Refresh,
  AccessTime,
  ShowChart,
  AttachMoney,
  BarChart as BarChartIcon,
  Timeline,
  ExpandMore,
  ShoppingCart,
} from '@mui/icons-material';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

import {
  fetchEventDetail,
  EventDetailResponse,
  formatVolume,
  getPlatformName,
  fetchMarketTrades,
  Trade,
  TradesResponse,
} from '../services/eventsApi';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface Market {
  market_id: string;
  title: string;
  yes_price?: number | null;
  no_price?: number | null;
  volume_total?: number | null;
  volume_24h?: number | null;
  volume_1_week?: number | null;
  end_time?: number | null;
  status: string;
  image?: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatPercent(value: number | null | undefined): string {
  if (value == null) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

function formatTimeRemaining(timestamp: number | null | undefined): string {
  if (!timestamp) return 'No deadline';
  const date = new Date(timestamp * 1000);
  const now = new Date();
  if (date < now) return 'Ended';
  return formatDistanceToNow(date);
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

// ============================================================================
// 1. HEADER SECTION COMPONENT
// ============================================================================

interface EventHeaderProps {
  data: EventDetailResponse;
  onSearch: (query: string) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  isLoading?: boolean;
}

const EventHeader: React.FC<EventHeaderProps> = ({ data, onSearch, onRefresh, isRefreshing, isLoading }) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { event } = data;

  const totalVolume = data.markets.reduce((sum, m) => sum + (m.volume_total || 0), 0);
  const avgYesPrice = data.markets
    .filter(m => m.yes_price != null)
    .reduce((sum, m, _, arr) => sum + (m.yes_price || 0) / arr.length, 0);
  
  const volume24h = data.markets.reduce((sum, m) => sum + (m.volume_24h || 0), 0);

  // Utility to add ref=eventgraph to any URL for affiliate tracking
  const addRefParam = (url: string): string => {
    if (!url) return url;
    return `${url}${url.includes('?') ? '&' : '?'}ref=eventgraph`;
  };

  // Get external link - uses source_url if available, otherwise constructs URL
  const getExternalLink = (market?: { market_id?: string; source_url?: string | null }) => {
    // If market has source_url, use it directly (already has correct event_slug/market_slug format)
    if (market?.source_url) {
      return addRefParam(market.source_url);
    }
    
    // Fallback: construct URL (for event-level links without specific market)
    if (data.platform === 'polymarket') {
      return `https://polymarket.com/event/${event.event_id}?ref=eventgraph`;
    }
    if (data.platform === 'limitless') {
      return `https://limitless.exchange/markets/${event.event_id}?ref=eventgraph`;
    }
    if (data.platform === 'opiniontrade') {
      return `https://app.opinion.trade/detail?topicId=${event.event_id}&ref=eventgraph`;
    }
    return `https://kalshi.com/browse?search=${event.event_id}&ref=eventgraph`;
  };

  return (
    <Paper
      sx={{
        p: 4,
        mb: 3,
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`,
        borderRadius: 3,
      }}
    >
      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 2 }}>
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
        <Typography color="text.primary">{event.title}</Typography>
      </Breadcrumbs>

      {/* Main Header Content */}
      <Grid container spacing={3}>
        {/* Left: Event Info */}
        <Grid item xs={12} md={8}>
          <Stack spacing={2}>
            {/* Event Image */}
            {event.image && (
              <Avatar
                src={event.image}
                variant="rounded"
                sx={{ width: 120, height: 120, mb: 1 }}
              />
            )}

            {/* Title & Platform */}
            <Box>
              <Typography variant="h3" fontWeight={700} gutterBottom>
                {event.title}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
                <Chip
                  label={getPlatformName(data.platform)}
                  color="primary"
                  size="small"
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
                />
              </Stack>
              
              {/* Tags */}
              {event.tags && event.tags.length > 0 && (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 1 }}>
                  {event.tags.slice(0, 5).map((tag, idx) => (
                    <Chip key={idx} label={tag} size="small" variant="outlined" />
                  ))}
                </Stack>
              )}
            </Box>

            {/* Countdown Timer */}
            <Stack direction="row" spacing={1} alignItems="center">
              <AccessTime color="action" />
              <Typography variant="body1" color="text.secondary">
                {formatTimeRemaining(event.end_time)}
                {event.end_time && ` (${format(new Date(event.end_time * 1000), 'MMM dd, yyyy')})`}
              </Typography>
            </Stack>
          </Stack>
        </Grid>

        {/* Right: Stats Badges */}
        <Grid item xs={12} md={4}>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="caption" color="text.secondary">
                    Total Markets
                  </Typography>
                  <Typography variant="h5" fontWeight={600}>
                    {event.market_count || data.markets.length}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="caption" color="text.secondary">
                    Total Volume
                  </Typography>
                  <Typography variant="h5" fontWeight={600}>
                    {formatVolume(totalVolume)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="caption" color="text.secondary">
                    Avg Yes Price
                  </Typography>
                  <Typography variant="h5" fontWeight={600}>
                    {formatPercent(avgYesPrice)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="caption" color="text.secondary">
                    24h Volume
                  </Typography>
                  <Typography variant="h5" fontWeight={600}>
                    {formatVolume(volume24h)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Grid>
      </Grid>

      {/* Action Buttons & Search */}
      <Stack direction="row" spacing={2} sx={{ mt: 3 }} flexWrap="wrap">
        <TextField
          placeholder="Search markets..."
          size="small"
          onChange={(e) => onSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search />
              </InputAdornment>
            ),
          }}
          sx={{ flexGrow: 1, maxWidth: 400 }}
        />
        <Button
          variant="outlined"
          startIcon={<OpenInNew />}
          href={getExternalLink()}
          target="_blank"
        >
          View on {getPlatformName(data.platform)}
        </Button>
        <IconButton 
          onClick={onRefresh} 
          color="primary"
          disabled={isRefreshing || isLoading}
          title={isRefreshing ? "Refreshing..." : "Refresh data"}
        >
          <Refresh className={isRefreshing ? 'spin' : ''} />
        </IconButton>
      </Stack>
    </Paper>
  );
};

// ============================================================================
// 2. OVERVIEW CARDS ROW
// ============================================================================

interface OverviewCardsProps {
  markets: Market[];
}

const OverviewCards: React.FC<OverviewCardsProps> = ({ markets }) => {
  const marketsWithPrice = markets.filter(m => m.yes_price != null);
  
  const avgYesPrice = marketsWithPrice.length > 0
    ? marketsWithPrice.reduce((sum, m) => sum + (m.yes_price || 0), 0) / marketsWithPrice.length
    : 0;
  
  const maxYesPrice = Math.max(...marketsWithPrice.map(m => m.yes_price || 0));
  const minYesPrice = Math.min(...marketsWithPrice.map(m => m.yes_price || 1));
  
  const highConviction = markets.filter(m => m.yes_price && (m.yes_price > 0.8 || m.yes_price < 0.2)).length;
  const tossups = markets.filter(m => m.yes_price && m.yes_price >= 0.4 && m.yes_price <= 0.6).length;
  
  const totalVolume24h = markets.reduce((sum, m) => sum + (m.volume_24h || 0), 0);

  const cards = [
    {
      title: 'Average Yes Price',
      value: formatPercent(avgYesPrice),
      icon: <ShowChart />,
      color: '#2196f3',
    },
    {
      title: 'Highest Yes Price',
      value: formatPercent(maxYesPrice),
      icon: <TrendingUp />,
      color: '#4caf50',
    },
    {
      title: 'Lowest Yes Price',
      value: formatPercent(minYesPrice),
      icon: <TrendingDown />,
      color: '#f44336',
    },
    {
      title: 'High Conviction',
      value: `${highConviction}`,
      subtitle: '>80% or <20%',
      icon: <Timeline />,
      color: '#ff9800',
    },
    {
      title: 'Toss-Ups',
      value: `${tossups}`,
      subtitle: '40-60%',
      icon: <BarChartIcon />,
      color: '#9c27b0',
    },
    {
      title: '24h Volume',
      value: formatVolume(totalVolume24h),
      icon: <AttachMoney />,
      color: '#00bcd4',
    },
  ];

  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {cards.map((card, idx) => (
        <Grid item xs={12} sm={6} md={4} lg={2} key={idx}>
          <Card
            variant="outlined"
            sx={{
              height: '100%',
              borderLeft: `4px solid ${card.color}`,
              transition: 'transform 0.2s, box-shadow 0.2s',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: 4,
              },
            }}
          >
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="caption" color="text.secondary" gutterBottom>
                    {card.title}
                  </Typography>
                  <Typography variant="h5" fontWeight={600}>
                    {card.value}
                  </Typography>
                  {card.subtitle && (
                    <Typography variant="caption" color="text.secondary">
                      {card.subtitle}
                    </Typography>
                  )}
                </Box>
                <Box sx={{ color: card.color, opacity: 0.7 }}>
                  {card.icon}
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};

// ============================================================================
// 3. CHARTS SECTION
// ============================================================================

interface ChartsSectionProps {
  markets: Market[];
}

const ChartsSection: React.FC<ChartsSectionProps> = ({ markets }) => {
  const [chartTab, setChartTab] = useState(0);
  const theme = useTheme();

  // Volume Distribution Data (Top 10)
  const volumeData = [...markets]
    .filter(m => m.volume_total && m.volume_total > 0)
    .sort((a, b) => (b.volume_total || 0) - (a.volume_total || 0))
    .slice(0, 10)
    .map(m => ({
      name: m.title.length > 40 ? m.title.substring(0, 37) + '...' : m.title,
      volume: m.volume_total || 0,
    }));

  // Price Distribution Data
  const priceDistribution = [
    { range: '0-20%', count: markets.filter(m => m.yes_price && m.yes_price <= 0.2).length },
    { range: '20-40%', count: markets.filter(m => m.yes_price && m.yes_price > 0.2 && m.yes_price <= 0.4).length },
    { range: '40-60%', count: markets.filter(m => m.yes_price && m.yes_price > 0.4 && m.yes_price <= 0.6).length },
    { range: '60-80%', count: markets.filter(m => m.yes_price && m.yes_price > 0.6 && m.yes_price <= 0.8).length },
    { range: '80-100%', count: markets.filter(m => m.yes_price && m.yes_price > 0.8).length },
  ];

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" fontWeight={600} gutterBottom>
        Analytics & Charts
      </Typography>
      
      <Tabs value={chartTab} onChange={(_, v) => setChartTab(v)} sx={{ mb: 2 }}>
        <Tab label="Volume Distribution" />
        <Tab label="Price Distribution" />
      </Tabs>

      <TabPanel value={chartTab} index={0}>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={volumeData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tickFormatter={(value) => formatVolume(value)} />
            <YAxis type="category" dataKey="name" width={200} />
            <RechartsTooltip
              formatter={(value: any) => formatVolume(value)}
              contentStyle={{
                backgroundColor: theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
              }}
            />
            <Bar dataKey="volume" fill={theme.palette.primary.main}>
              {volumeData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={theme.palette.primary.main} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </TabPanel>

      <TabPanel value={chartTab} index={1}>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={priceDistribution}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="range" />
            <YAxis />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
              }}
            />
            <Bar dataKey="count" fill={theme.palette.secondary.main}>
              {priceDistribution.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    index === 0 || index === 4
                      ? '#f44336'
                      : index === 2
                      ? '#ff9800'
                      : theme.palette.secondary.main
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </TabPanel>
    </Paper>
  );
};

// ============================================================================
// 4. SUMMARY LISTS
// ============================================================================

interface SummaryListsProps {
  markets: Market[];
}

const SummaryLists: React.FC<SummaryListsProps> = ({ markets }) => {
  const mostCompetitive = [...markets]
    .filter(m => m.yes_price != null)
    .sort((a, b) => Math.abs((a.yes_price || 0.5) - 0.5) - Math.abs((b.yes_price || 0.5) - 0.5))
    .slice(0, 5);
  
  const highConviction = [...markets]
    .filter(m => m.yes_price && (m.yes_price > 0.75 || m.yes_price < 0.25))
    .sort((a, b) => {
      const aDist = Math.abs((a.yes_price || 0.5) - 0.5);
      const bDist = Math.abs((b.yes_price || 0.5) - 0.5);
      return bDist - aDist;
    })
    .slice(0, 5);

  return (
    <Grid container spacing={3} sx={{ mb: 3 }}>
      {/* Most Competitive */}
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Most Competitive Markets
          </Typography>
          <Typography variant="caption" color="text.secondary" gutterBottom display="block">
            Closest to 50/50 split
          </Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            {mostCompetitive.map((market) => (
              <Card key={market.market_id} variant="outlined">
                <CardContent>
                  <Typography variant="body2" fontWeight={500} gutterBottom>
                    {market.title}
                  </Typography>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Box sx={{ flexGrow: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={(market.yes_price || 0) * 100}
                        sx={{
                          height: 8,
                          borderRadius: 1,
                          backgroundColor: alpha('#f44336', 0.2),
                          '& .MuiLinearProgress-bar': {
                            backgroundColor: '#4caf50',
                          },
                        }}
                      />
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Chip
                        label={`Yes: ${formatPercent(market.yes_price)}`}
                        size="small"
                        color="success"
                      />
                      <Chip
                        label={`No: ${formatPercent(market.no_price)}`}
                        size="small"
                        color="error"
                      />
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </Paper>
      </Grid>

      {/* High Conviction */}
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            High Conviction Markets
          </Typography>
          <Typography variant="caption" color="text.secondary" gutterBottom display="block">
            Strong Yes (&gt;75%) or No (&lt;25%) sentiment
          </Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            {highConviction.map((market) => {
              const isHighYes = (market.yes_price || 0) > 0.75;
              return (
                <Card key={market.market_id} variant="outlined">
                  <CardContent>
                    <Typography variant="body2" fontWeight={500} gutterBottom>
                      {market.title}
                    </Typography>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Box sx={{ flexGrow: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={(market.yes_price || 0) * 100}
                          sx={{
                            height: 8,
                            borderRadius: 1,
                            backgroundColor: alpha(isHighYes ? '#f44336' : '#4caf50', 0.2),
                            '& .MuiLinearProgress-bar': {
                              backgroundColor: isHighYes ? '#4caf50' : '#f44336',
                            },
                          }}
                        />
                      </Box>
                      <Stack direction="row" spacing={1}>
                        <Chip
                          label={`Yes: ${formatPercent(market.yes_price)}`}
                          size="small"
                          color={isHighYes ? 'success' : 'default'}
                          variant={isHighYes ? 'filled' : 'outlined'}
                        />
                        <Chip
                          label={`No: ${formatPercent(market.no_price)}`}
                          size="small"
                          color={!isHighYes ? 'error' : 'default'}
                          variant={!isHighYes ? 'filled' : 'outlined'}
                        />
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        </Paper>
      </Grid>
    </Grid>
  );
};

// ============================================================================
// 5. DETAILED TABLES (Markets, Trades, Orderbook)
// ============================================================================

interface DetailedTablesProps {
  data: EventDetailResponse;
  searchQuery: string;
  trades: Trade[];
  tradesLoading: boolean;
  tradesError: string | null;
}

const DetailedTables: React.FC<DetailedTablesProps> = ({ 
  data, 
  searchQuery, 
  trades, 
  tradesLoading, 
  tradesError 
}) => {
  const [tableTab, setTableTab] = useState(0);
  const theme = useTheme();

  // Filter and deduplicate markets
  const filteredMarkets = data.markets
    .filter((m, idx, self) => self.findIndex(m2 => m2.market_id === m.market_id) === idx)
    .filter(m => 
      !searchQuery || 
      m.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => (b.volume_total || 0) - (a.volume_total || 0));

  return (
    <Paper sx={{ mb: 3 }}>
      <Tabs value={tableTab} onChange={(_, v) => setTableTab(v)}>
        <Tab label={`All Markets (${filteredMarkets.length})`} />
        <Tab label={`Recent Trades (${tradesLoading ? '...' : trades.length})`} />
        <Tab label="Orderbook" />
      </Tabs>

      {/* Markets Table */}
      <TabPanel value={tableTab} index={0}>
        <Box sx={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${theme.palette.divider}` }}>
                <th style={{ padding: '12px', textAlign: 'left' }}>Market</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Yes Price</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>No Price</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Volume</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>24h Volume</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMarkets.slice(0, 50).map((market) => (
                <tr
                  key={market.market_id}
                  style={{
                    borderBottom: `1px solid ${theme.palette.divider}`,
                  }}
                >
                  <td style={{ padding: '12px' }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      {market.image && (
                        <Avatar
                          src={market.image}
                          variant="rounded"
                          sx={{ width: 32, height: 32 }}
                        />
                      )}
                      <Typography variant="body2" sx={{ maxWidth: 400 }}>
                        {market.title}
                      </Typography>
                    </Stack>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    <Chip
                      label={formatPercent(market.yes_price)}
                      size="small"
                      color="success"
                      variant="outlined"
                    />
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    <Chip
                      label={formatPercent(market.no_price)}
                      size="small"
                      color="error"
                      variant="outlined"
                    />
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    <Typography variant="body2">
                      {formatVolume(market.volume_total)}
                    </Typography>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    <Typography variant="body2">
                      {formatVolume(market.volume_24h)}
                    </Typography>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <Stack direction="row" spacing={1} justifyContent="center">
                      <Tooltip title="Trading coming soon">
                        <span>
                          <Button
                            size="small"
                            variant="outlined"
                            color="success"
                            disabled
                            startIcon={<ShoppingCart />}
                          >
                            Buy Yes
                          </Button>
                        </span>
                      </Tooltip>
                      <Tooltip title="Trading coming soon">
                        <span>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            disabled
                            startIcon={<ShoppingCart />}
                          >
                            Buy No
                          </Button>
                        </span>
                      </Tooltip>
                    </Stack>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      </TabPanel>

      {/* Recent Trades */}
      <TabPanel value={tableTab} index={1}>
        <Box sx={{ overflowX: 'auto' }}>
          {tradesLoading && (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <LinearProgress />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Loading trades from Dome API...
              </Typography>
            </Box>
          )}
          
          {tradesError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {tradesError}
            </Alert>
          )}
          
          {!tradesLoading && trades.length === 0 && (
            <Alert severity="info">
              No trades found in the last 24 hours (min $1,000)
            </Alert>
          )}
          
          {!tradesLoading && trades.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${theme.palette.divider}` }}>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Time</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>Side</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>Outcome</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>Price</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>Shares</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(0, 50).map((trade, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: `1px solid ${theme.palette.divider}`,
                    }}
                  >
                    <td style={{ padding: '12px' }}>
                      <Typography variant="caption" color="text.secondary">
                        {formatDistanceToNow(new Date(trade.timestamp), { addSuffix: true })}
                      </Typography>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <Chip
                        label={trade.side}
                        size="small"
                        color={trade.side === 'BUY' ? 'success' : 'error'}
                        sx={{ minWidth: 60 }}
                      />
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <Typography variant="body2">{trade.outcome || '-'}</Typography>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <Typography variant="body2">${trade.price.toFixed(2)}</Typography>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <Typography variant="body2">{trade.shares.toLocaleString()}</Typography>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <Typography variant="body2" fontWeight={600}>
                        ${trade.total_value.toLocaleString()}
                      </Typography>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Box>
      </TabPanel>

      {/* Orderbook */}
      <TabPanel value={tableTab} index={2}>
        <Alert severity="info">
          Orderbook data coming soon. This will show real-time bids and asks with depth visualization.
        </Alert>
      </TabPanel>
    </Paper>
  );
};

// ============================================================================
// 6. PERSONALIZED DASHBOARD (Collapsible)
// ============================================================================

const PersonalizedDashboard: React.FC = () => {
  return (
    <Accordion sx={{ mb: 3 }}>
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Typography variant="h6" fontWeight={600}>
          My Dashboard
        </Typography>
        <Chip label="Coming Soon" size="small" sx={{ ml: 2 }} />
      </AccordionSummary>
      <AccordionDetails>
        <Alert severity="info">
          Connect your wallet to see your positions, P&L, and trading history for this event.
        </Alert>
        <Grid container spacing={2} sx={{ mt: 2 }}>
          <Grid item xs={12} sm={4}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                  My Positions
                </Typography>
                <Typography variant="h6">0</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                  Total Value
                </Typography>
                <Typography variant="h6">$0.00</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                  Unrealized P&L
                </Typography>
                <Typography variant="h6" color="text.secondary">
                  $0.00
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </AccordionDetails>
    </Accordion>
  );
};

// ============================================================================
// MAIN EVENT DETAIL PAGE COMPONENT
// ============================================================================

export const EventDetailPageNew: React.FC = () => {
  const { platform, eventId } = useParams<{ platform: string; eventId: string }>();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [data, setData] = useState<EventDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // On-demand trades state
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesError, setTradesError] = useState<string | null>(null);

  // Fetch event data
  const loadData = useCallback(async (forceRefresh: boolean = false) => {
    if (!platform || !eventId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetchEventDetail(platform, decodeURIComponent(eventId), forceRefresh);
      setData(response);
      
      // Auto-fetch trades for ALL markets in the event (polymarket only)
      if (response.markets && response.markets.length > 0 && platform === 'polymarket') {
        loadAllMarketTrades(response.markets);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load event details');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [platform, eventId]);

  // Fetch on-demand trades for ALL markets in the event
  const loadAllMarketTrades = useCallback(async (markets: Market[]) => {
    if (!platform || markets.length === 0) return;
    
    setTradesLoading(true);
    setTradesError(null);
    
    try {
      // Fetch trades for all markets (up to 100) in parallel
      const tradePromises = markets.slice(0, 100).map(async (market) => {
        try {
          const response: TradesResponse = await fetchMarketTrades(
            platform,
            market.market_id,
            24,  // last 24 hours
            1000,  // min $1000
            100   // max 100 trades per market
          );
          return response.trades;
        } catch (err) {
          console.error(`Failed to fetch trades for market ${market.market_id}:`, err);
          return [];
        }
      });
      
      const allTradesArrays = await Promise.all(tradePromises);
      const allTrades = allTradesArrays.flat();
      
      // Sort by timestamp descending and take top 100
      allTrades.sort((a, b) => b.timestamp - a.timestamp);
      setTrades(allTrades.slice(0, 100));
    } catch (err) {
      setTradesError(err instanceof Error ? err.message : 'Failed to load trades');
      setTrades([]);
    } finally {
      setTradesLoading(false);
    }
  }, [platform]);

  // Fetch on-demand trades for a specific market (when user clicks)
  const loadMarketTrades = useCallback(async (marketId: string) => {
    if (!platform || !marketId) return;
    
    setTradesLoading(true);
    setTradesError(null);
    
    try {
      const response: TradesResponse = await fetchMarketTrades(
        platform,
        marketId,
        24,  // last 24 hours
        1000,  // min $1000
        500   // max 500 trades
      );
      setTrades(response.trades);
    } catch (err) {
      setTradesError(err instanceof Error ? err.message : 'Failed to load trades');
      setTrades([]);
    } finally {
      setTradesLoading(false);
    }
  }, [platform]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleRefresh = () => {
    // Prevent multiple simultaneous refreshes
    if (isRefreshing || isLoading) {
      console.log('⏸️ Refresh already in progress, ignoring...');
      return;
    }
    
    console.log('🔄 Force refresh requested');
    setIsRefreshing(true);
    loadData(true); // Pass forceRefresh=true
  };

  // Loading State
  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton variant="rectangular" height={200} sx={{ mb: 2, borderRadius: 2 }} />
        <Grid container spacing={2}>
          {[...Array(6)].map((_, idx) => (
            <Grid item xs={12} sm={6} md={4} lg={2} key={idx}>
              <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rectangular" height={400} sx={{ mt: 2, borderRadius: 2 }} />
      </Box>
    );
  }

  // Error State
  if (error || !data) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || 'Failed to load event details'}
        </Alert>
        <Button variant="outlined" startIcon={<ArrowBack />} onClick={() => navigate('/events')}>
          Back to Events
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto' }}>
      {/* 1. Header Section */}
      <EventHeader 
        data={data} 
        onSearch={handleSearch} 
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        isLoading={isLoading}
      />

      {/* 2. Overview Cards Row */}
      <OverviewCards markets={data.markets} />

      {/* 3. Charts Section */}
      <ChartsSection markets={data.markets} />

      {/* 4. Summary Lists */}
      <SummaryLists markets={data.markets} />

      {/* 5. Detailed Tables */}
      <DetailedTables 
        data={data} 
        searchQuery={searchQuery} 
        trades={trades}
        tradesLoading={tradesLoading}
        tradesError={tradesError}
      />

      {/* 6. Personalized Dashboard */}
      <PersonalizedDashboard />
    </Box>
  );
};

export default EventDetailPageNew;
