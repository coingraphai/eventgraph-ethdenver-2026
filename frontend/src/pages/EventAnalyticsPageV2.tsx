/**
 * Event Analytics Page V2 - Streamlined Dashboard
 * 
 * Tab 1: MARKETS - Clean table with Yes/No prices (red/green)
 * Tab 2: ANALYTICS - All charts and visualizations
 * 
 * Event-level: Data from database (fast)
 * Market-level: On-demand from Dome API (when user clicks)
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
  Skeleton,
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
  TablePagination,
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
  EmojiEvents,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
  FormatListBulleted as ListIcon,
  Timeline as TimelineIcon,
  Speed as SpeedIcon,
  SwapHoriz as SwapHorizIcon,
  AccountBalance as OrderbookIcon,
  Savings as WhaleIcon,
  Leaderboard as LeaderboardIcon,
  AutoAwesome as AutoAwesomeIcon,
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
// Market intelligence is now shown inline in Market Detail tab
// import MarketIntelligenceModal from '../components/MarketIntelligenceModal';

// ============================================================================
// Types
// ============================================================================

interface Market {
  market_id: string;
  source_market_id?: string;
  title: string;
  description?: string;
  yes_price: number | null;
  no_price: number | null;
  volume_total: number | null;
  volume_24h: number | null;
  volume_1_week: number | null;
  volume_change_pct?: number | null;
  liquidity?: number | null;
  liquidity_score?: number | null;
  open_interest?: number | null;
  trade_count_24h?: number | null;
  unique_traders?: number | null;
  end_time?: number | null;
  end_date?: number | null;
  image?: string | null;
  image_url?: string | null;
  source_url?: string | null;
  status: string;
  momentum_score?: number | null;
  is_whale_active?: boolean | null;
  price_volatility?: number | null;
  price_change_24h?: number | null;
  // Token IDs for Polymarket
  token_id_yes?: string | null;
  token_id_no?: string | null;
  // Limitless-specific fields
  creator_name?: string | null;
  creator_image?: string | null;
  market_type?: string | null;
  trade_type?: string | null;
  expiration_date?: string | null;
}

interface Trade {
  trade_id: string;
  timestamp: string;
  side: 'BUY' | 'SELL';
  outcome: 'YES' | 'NO';
  price: number;
  quantity: number;
  total_value: number;
}

interface OrderbookLevel {
  price: string;
  size: string;
}

interface Orderbook {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  spread: number;
  mid_price: number;
  best_bid: number;
  best_ask: number;
  timestamp: string;
}

interface EventData {
  event_id: string;
  platform: string;
  title: string;
  description?: string | null;
  event_description?: string | null;
  category: string;
  market_count: number;
  total_volume: number;
  volume_24h: number;
  status: string;
  start_time?: number | null;
  end_time?: number | null;
  image?: string | null;
  tags: string[];
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

// Intelligence API response types
interface IntelligenceSignals {
  flow_score: number;
  flow_label: string;
  whale_count: number;
  whale_volume: number;
  whale_share: number;
  total_trades: number;
  total_volume: number;
  trades_per_hour: number;
  avg_trade_size: number;
  buy_count: number;
  sell_count: number;
}

interface IntelligenceInsight {
  type: 'whale' | 'momentum' | 'activity' | 'flow' | 'smart_money' | 'velocity' | 'orderbook';
  level: 'high' | 'medium' | 'low';
  text: string;
  timestamp: string;
}

interface MomentumMover {
  market_slug: string;
  market_question?: string;  // Alias for title
  title: string;
  change: number;
  change_pct: number;
  current: number;
  previous: number;
}

interface WhaleTrade {
  timestamp: number;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  size_usd?: number;  // USD value of trade
  value: number;
  market_slug: string;
  market_question?: string;  // Alias for title
  title: string;
}

interface MarketSignals {
  heat: 'hot' | 'warm' | 'cold';
  flow: number;
  whale_active: boolean;
  delta_1h: number;
  risk: 'safe' | 'risky' | 'unknown';
}

interface IntelligenceMarket {
  market_slug: string;
  title: string;
  volume_total: number;
  signals: MarketSignals;
  flow: number;
  trades_count: number;
  whale_count: number;
  liquidity_score: number;
  spread_bps: number;
  delta_1h: number;
  // Advanced signals
  smart_money?: string;
  velocity_trend?: string;
  momentum_score?: number;
  pressure_signal?: string;
  support_level?: number;
  resistance_level?: number;
  // Fallback data from different API response shapes
  price_change_1h?: { change_pct?: number };
  trades?: { flow_score?: number; whale_count?: number };
}

interface TradeFeedItem {
  timestamp: number;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  value: number;
  market_slug: string;
  title: string;
}

interface AdvancedSignals {
  smart_money_consensus: string;
  avg_momentum_score: number;
  orderbook_pressure: string;
  accumulation_count: number;
  distribution_count: number;
  accelerating_count: number;
  decelerating_count: number;
}

interface EventIntelligence {
  status: string;
  event_id: string;
  platform: string;
  analyzed_at: string;
  hours_analyzed: number;
  markets_analyzed: number;
  total_markets: number;
  signals: IntelligenceSignals;
  advanced_signals?: AdvancedSignals;
  insights: IntelligenceInsight[];
  momentum_movers: MomentumMover[];
  whale_trades: WhaleTrade[];
  large_trades?: WhaleTrade[];  // All trades >= $500 for filterable table
  markets: IntelligenceMarket[];
  trade_feed: TradeFeedItem[];
}

// ============================================================================
// Utility Functions
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

function formatVolume(value: number | null | undefined): string {
  if (value == null || value === 0) return '$0';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

function formatPrice(value: number | null | undefined): string {
  if (value == null) return '-';
  return `${(value * 100).toFixed(1)}¢`;
}

// Utility to add ref=eventgraph to any URL for affiliate tracking
function addRefParam(url: string): string {
  if (!url) return url;
  return `${url}${url.includes('?') ? '&' : '?'}ref=eventgraph`;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ p: 2 }}>{children}</Box>}
    </div>
  );
}

// Chart colors
const COLORS = ['#4caf50', '#f44336', '#2196f3', '#ff9800', '#9c27b0', '#00bcd4', '#e91e63', '#8bc34a'];
const YES_COLOR = '#4caf50';
const NO_COLOR = '#f44336';

// Sidebar navigation items
const SIDEBAR_WIDTH = 56;
interface SidebarItem {
  id: string;
  label: string;
  icon: React.ElementType;
  available: boolean;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const EventAnalyticsPageV2: React.FC = () => {
  const { platform, eventId } = useParams<{ platform: string; eventId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [activeSection, setActiveSection] = useState('markets'); // Sidebar section
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'volume' | 'price' | 'name'>('price');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  
  // Whale filter state
  const [whaleMinSize, setWhaleMinSize] = useState<number>(500);
  const [whaleTimeframe, setWhaleTimeframe] = useState<number>(168); // Default 7 days (168 hours)
  
  // Intelligence state (live signals from trades/orderbooks)
  const [intelligence, setIntelligence] = useState<EventIntelligence | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null);
  
  // Sidebar navigation
  const sidebarItems: SidebarItem[] = [
    { id: 'markets', label: 'Markets', icon: ListIcon, available: true },
    { id: 'rankings', label: 'Rankings', icon: LeaderboardIcon, available: true },
    { id: 'charts', label: 'Charts', icon: TimelineIcon, available: true },
    { id: 'activity', label: 'Activity', icon: SpeedIcon, available: platform === 'polymarket' || platform === 'poly' || platform === 'kalshi' },
    { id: 'whales', label: 'Whales', icon: WhaleIcon, available: platform === 'polymarket' || platform === 'poly' || platform === 'kalshi' },
  ];
  
  // Pagination state for Markets table
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  
  // Trades state (used in sortedTrades/paginatedTrades computed values - NOT displayed on this page)
  // These are kept for backwards compatibility but the modal handles its own trades now
  const [marketTrades] = useState<any[]>([]);
  const [tradesSortBy, setTradesSortBy] = useState<'time' | 'price' | 'value'>('time');
  const [tradesSortDir, setTradesSortDir] = useState<'asc' | 'desc'>('desc');
  const [tradesPage, setTradesPage] = useState(0);
  const [tradesRowsPerPage, setTradesRowsPerPage] = useState(25);

  // ============================================================================
  // Data Fetching
  // ============================================================================

  const loadEventData = useCallback(async () => {
    if (!platform || !eventId) return;

    setLoading(true);
    setError(null);

    try {
      // Use the database-backed endpoint (fast)
      const response = await fetch(
        `${API_BASE_URL}/api/db/events/${platform}/${encodeURIComponent(eventId)}`
      );

      if (!response.ok) {
        throw new Error(`Failed to load event: ${response.status}`);
      }

      const data = await response.json();
      
      // Get description from event, or fallback to first market's description, or event_title (question)
      const eventDescription = data.event.description || data.event.event_description || 
        (data.markets?.[0]?.description) || 
        // For Polymarket, event_title is often a question that can serve as description
        (data.event.event_title && data.event.event_title !== data.event.title ? data.event.event_title : '') || 
        '';
      
      setEvent({
        event_id: data.event.event_id,
        platform: data.event.platform || platform,
        title: data.event.title,
        description: eventDescription,
        event_description: data.event.event_description,
        category: data.event.category,
        market_count: data.event.market_count,
        total_volume: data.event.total_volume,
        volume_24h: data.event.volume_24h,
        status: data.event.status,
        start_time: data.event.start_time,
        end_time: data.event.end_time,
        image: data.event.image,
        tags: data.event.tags || [],
      });

      setMarkets(
        data.markets.map((m: any) => ({
          market_id: m.market_id || m.source_market_id,
          source_market_id: m.source_market_id,
          title: m.title,
          description: m.description,
          yes_price: m.yes_price,
          no_price: m.no_price ?? (m.yes_price != null ? 1 - m.yes_price : null),
          volume_total: m.volume_total,
          volume_24h: m.volume_24h,
          volume_1_week: m.volume_1_week || m.volume_7d,
          liquidity: m.liquidity,
          trade_count_24h: m.trade_count_24h,
          volume_change_pct: m.volume_change_pct,
          liquidity_score: m.liquidity_score,
          momentum_score: m.momentum_score,
          is_whale_active: m.is_whale_active,
          price_volatility: m.price_volatility,
          end_time: m.end_time,
          status: m.status,
          image: m.image,
          image_url: m.image || m.image_url,
          source_url: m.source_url,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load event');
    } finally {
      setLoading(false);
    }
  }, [platform, eventId]);

  // Load intelligence data (trades, orderbooks, signals) for Polymarket and Kalshi events
  const loadIntelligenceData = useCallback(async () => {
    if (!platform || !eventId) return;
    
    // Normalize platform names for API
    let normalizedPlatform = platform;
    if (platform === 'polymarket') {
      normalizedPlatform = 'poly';
    }
    
    // Only fetch intelligence for supported platforms (Polymarket and Kalshi via Dome API)
    if (normalizedPlatform !== 'poly' && normalizedPlatform !== 'kalshi') return;

    setIntelligenceLoading(true);
    setIntelligenceError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/event-intelligence/${normalizedPlatform}/${encodeURIComponent(eventId)}?hours=${whaleTimeframe}&top_markets=50`
      );

      if (!response.ok) {
        throw new Error(`Failed to load intelligence: ${response.status}`);
      }

      const data: EventIntelligence = await response.json();
      setIntelligence(data);
    } catch (err) {
      console.error('Intelligence fetch error:', err);
      setIntelligenceError(err instanceof Error ? err.message : 'Failed to load intelligence');
    } finally {
      setIntelligenceLoading(false);
    }
  }, [platform, eventId, whaleTimeframe]);

  useEffect(() => {
    loadEventData();
  }, [loadEventData]);

  // Load intelligence after event data is loaded
  useEffect(() => {
    if (event && !loading) {
      loadIntelligenceData();
    }
  }, [event, loading, loadIntelligenceData]);

  // ============================================================================
  // Computed Values
  // ============================================================================

  const sortedTrades = useMemo(() => {
    if (!marketTrades.length) return [];
    
    const sorted = [...marketTrades].sort((a, b) => {
      let cmp = 0;
      if (tradesSortBy === 'time') {
        cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      } else if (tradesSortBy === 'price') {
        cmp = a.price - b.price;
      } else if (tradesSortBy === 'value') {
        cmp = a.total_value - b.total_value;
      }
      return tradesSortDir === 'asc' ? cmp : -cmp;
    });
    
    return sorted;
  }, [marketTrades, tradesSortBy, tradesSortDir]);

  const handleTradesSort = (field: 'time' | 'price' | 'value') => {
    if (tradesSortBy === field) {
      setTradesSortDir(tradesSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setTradesSortBy(field);
      setTradesSortDir('desc');
    }
  };

  // Pagination handlers for trades
  const handleTradesChangePage = (_event: unknown, newPage: number) => {
    setTradesPage(newPage);
  };

  const handleTradesChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTradesRowsPerPage(parseInt(event.target.value, 10));
    setTradesPage(0);
  };

  // Paginated trades for display
  const paginatedTrades = useMemo(() => {
    const startIndex = tradesPage * tradesRowsPerPage;
    return sortedTrades.slice(startIndex, startIndex + tradesRowsPerPage);
  }, [sortedTrades, tradesPage, tradesRowsPerPage]);

  const filteredMarkets = useMemo(() => {
    let result = markets.filter(
      (m) => !searchQuery || m.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'volume') {
        cmp = (b.volume_total || 0) - (a.volume_total || 0);
      } else if (sortBy === 'price') {
        cmp = (b.yes_price || 0) - (a.yes_price || 0);
      } else {
        cmp = a.title.localeCompare(b.title);
      }
      return sortDir === 'desc' ? cmp : -cmp;
    });

    return result;
  }, [markets, searchQuery, sortBy, sortDir]);

  // All filtered markets for display (no pagination)
  const paginatedMarkets = useMemo(() => {
    return filteredMarkets;
  }, [filteredMarkets]);

  // Calculate totals for share percentages
  const total7dVolume = useMemo(() => {
    return filteredMarkets.reduce((sum, m) => sum + (m.volume_1_week || 0), 0);
  }, [filteredMarkets]);

  // Map intelligence signals to markets by slug for quick lookup
  // Also create a title-based map as fallback
  const marketSignalsMap = useMemo(() => {
    if (!intelligence?.markets) return new Map<string, IntelligenceMarket>();
    const map = new Map<string, IntelligenceMarket>();
    intelligence.markets.forEach((m) => {
      // Primary key: market_slug
      map.set(m.market_slug, m);
      // Fallback: normalized title for matching
      const normalizedTitle = m.title.toLowerCase().trim();
      if (!map.has(normalizedTitle)) {
        map.set(normalizedTitle, m);
      }
    });
    return map;
  }, [intelligence]);
  
  // Helper function to find market intelligence
  const getMarketIntel = (market: Market): IntelligenceMarket | undefined => {
    // Try by market_id first (for Kalshi this is the ticker like KXSB-26-PHI)
    let intel = marketSignalsMap.get(market.market_id);
    if (!intel && market.source_market_id) {
      // Try by source_market_id
      intel = marketSignalsMap.get(market.source_market_id);
    }
    if (!intel) {
      // Try by normalized title
      const normalizedTitle = market.title.toLowerCase().trim();
      intel = marketSignalsMap.get(normalizedTitle);
    }
    return intel;
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Analytics data
  const analytics = useMemo(() => {
    if (markets.length === 0) return null;

    // Leaderboard (top 10 by yes price)
    const leaderboard = [...markets]
      .filter((m) => m.yes_price != null)
      .sort((a, b) => (b.yes_price || 0) - (a.yes_price || 0))
      .slice(0, 10);

    // Volume distribution (top 8 + others)
    const sortedByVolume = [...markets].sort((a, b) => (b.volume_total || 0) - (a.volume_total || 0));
    const top8Volume = sortedByVolume.slice(0, 8);
    const othersVolume = sortedByVolume.slice(8).reduce((sum, m) => sum + (m.volume_total || 0), 0);
    const volumePieData = [
      ...top8Volume.map((m) => ({
        name: m.title.length > 25 ? m.title.substring(0, 25) + '...' : m.title,
        value: m.volume_total || 0,
      })),
      ...(othersVolume > 0 ? [{ name: 'Others', value: othersVolume }] : []),
    ];

    // Conviction breakdown
    const highConviction = markets.filter((m) => {
      const p = m.yes_price;
      return p != null && (p >= 0.8 || p <= 0.2);
    }).length;
    const tossUps = markets.filter((m) => {
      const p = m.yes_price;
      return p != null && p >= 0.4 && p <= 0.6;
    }).length;

    // Price distribution histogram
    const priceRanges = [
      { range: '0-10%', min: 0, max: 0.1, count: 0 },
      { range: '10-20%', min: 0.1, max: 0.2, count: 0 },
      { range: '20-30%', min: 0.2, max: 0.3, count: 0 },
      { range: '30-40%', min: 0.3, max: 0.4, count: 0 },
      { range: '40-50%', min: 0.4, max: 0.5, count: 0 },
      { range: '50-60%', min: 0.5, max: 0.6, count: 0 },
      { range: '60-70%', min: 0.6, max: 0.7, count: 0 },
      { range: '70-80%', min: 0.7, max: 0.8, count: 0 },
      { range: '80-90%', min: 0.8, max: 0.9, count: 0 },
      { range: '90-100%', min: 0.9, max: 1.0, count: 0 },
    ];
    markets.forEach((m) => {
      if (m.yes_price != null) {
        const range = priceRanges.find((r) => m.yes_price! >= r.min && m.yes_price! < r.max);
        if (range) range.count++;
      }
    });

    // Volume by market (bar chart)
    const volumeBarData = sortedByVolume.slice(0, 10).map((m) => ({
      name: m.title.length > 20 ? m.title.substring(0, 20) + '...' : m.title,
      volume: m.volume_total || 0,
      volume24h: m.volume_24h || 0,
    }));

    return {
      leaderboard,
      volumePieData,
      highConviction,
      tossUps,
      priceRanges,
      volumeBarData,
    };
  }, [markets]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleSort = (field: 'volume' | 'price' | 'name') => {
    if (sortBy === field) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const getExternalLink = (market?: { market_id?: string; source_url?: string | null }) => {
    // If market has source_url, use it directly (already has correct event_slug/market_slug format)
    if (market?.source_url) {
      return addRefParam(market.source_url);
    }
    
    // Fallback: construct URL (for event-level links without specific market)
    if (platform === 'polymarket' || platform === 'poly') {
      return `https://polymarket.com/event/${eventId}?ref=eventgraph`;
    }
    if (platform === 'limitless') {
      return `https://limitless.exchange/markets/${eventId}?ref=eventgraph`;
    }
    return `https://kalshi.com/browse?search=${eventId}&ref=eventgraph`;
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton variant="rectangular" height={200} sx={{ mb: 2, borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={400} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  if (error || !event) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || 'Event not found'}
        </Alert>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/events')}>
          Back to Events
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* ================================================================== */}
      {/* LEFT SIDEBAR - Icon Navigation */}
      {/* ================================================================== */}
      <Box
        sx={{
          width: SIDEBAR_WIDTH,
          minWidth: SIDEBAR_WIDTH,
          backgroundColor: alpha(theme.palette.background.paper, 0.5),
          borderRight: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
          display: 'flex',
          flexDirection: 'column',
          py: 1,
        }}
      >
        {/* Back Button */}
        <Tooltip title="Back to Events" placement="right">
          <IconButton
            onClick={() => navigate('/events')}
            sx={{
              mx: 'auto',
              mb: 1,
              color: 'text.secondary',
              '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.1) },
            }}
          >
            <ArrowBack fontSize="small" />
          </IconButton>
        </Tooltip>

        <Divider sx={{ mx: 1, mb: 1, opacity: 0.2 }} />

        {/* Nav Items */}
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <Tooltip 
              key={item.id} 
              title={item.available ? item.label : `${item.label} (Coming Soon)`} 
              placement="right"
            >
              <Box
                onClick={() => item.available && setActiveSection(item.id)}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  py: 1,
                  mx: 0.5,
                  mb: 0.5,
                  borderRadius: 1.5,
                  cursor: item.available ? 'pointer' : 'not-allowed',
                  opacity: item.available ? 1 : 0.4,
                  backgroundColor: isActive ? alpha(theme.palette.primary.main, 0.15) : 'transparent',
                  color: isActive ? 'primary.main' : 'text.secondary',
                  transition: 'all 0.15s ease',
                  '&:hover': item.available ? {
                    backgroundColor: isActive 
                      ? alpha(theme.palette.primary.main, 0.2)
                      : alpha(theme.palette.text.primary, 0.05),
                  } : {},
                }}
              >
                <Icon sx={{ fontSize: 20 }} />
                <Typography
                  sx={{
                    fontSize: '0.55rem',
                    fontWeight: isActive ? 600 : 500,
                    mt: 0.25,
                  }}
                >
                  {item.label}
                </Typography>
              </Box>
            </Tooltip>
          );
        })}

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Refresh Button */}
        <Tooltip title="Refresh Data" placement="right">
          <IconButton
            onClick={loadEventData}
            sx={{
              mx: 'auto',
              mb: 1,
              color: 'text.secondary',
              '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.1) },
            }}
          >
            <Refresh fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* ================================================================== */}
      {/* MAIN CONTENT AREA */}
      {/* ================================================================== */}
      <Box sx={{ flex: 1, p: { xs: 2, md: 3 }, maxWidth: 1600, overflowY: 'auto' }}>
        {/* HEADER */}
        <Paper sx={{ p: 2.5, mb: 3, borderRadius: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={8}>
              <Stack direction="row" spacing={2} alignItems="flex-start">
                {event.image && (
                  <Avatar
                    src={event.image}
                    variant="rounded"
                    sx={{ width: 64, height: 64 }}
                  />
                )}
                <Box>
                  <Typography variant="h5" fontWeight={700} gutterBottom>
                    {event.title}
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Chip label={platform?.toUpperCase()} color="primary" size="small" />
                    <Chip label={event.category} variant="outlined" size="small" />
                    <Chip
                      label={event.status}
                      color={event.status === 'open' ? 'success' : 'default'}
                      size="small"
                    />
                    {event.end_time && (
                      <Chip
                        icon={<AccessTime sx={{ fontSize: 14 }} />}
                        label={`Ends ${format(new Date(event.end_time * 1000), 'MMM d')}`}
                        size="small"
                        variant="outlined"
                        color="warning"
                      />
                    )}
                  </Stack>
                  {/* Event Description - Short preview with full text on hover */}
                  {(() => {
                    const desc = (event.description || event.event_description || '').trim();
                    if (!desc) return null;
                    // Strip HTML tags and decode HTML entities for cleaner display
                    let stripped = desc.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                    // Decode common HTML entities
                    stripped = stripped
                      .replace(/&nbsp;/g, ' ')
                      .replace(/&amp;/g, '&')
                      .replace(/&lt;/g, '<')
                      .replace(/&gt;/g, '>')
                      .replace(/&quot;/g, '"')
                      .replace(/&#39;/g, "'")
                      .replace(/&mdash;/g, '—')
                      .replace(/&ndash;/g, '–')
                      .replace(/\s+/g, ' ')
                      .trim();
                    if (!stripped) return null;
                    // Show ~3-4 lines (approximately 280 characters)
                    const shortText = stripped.length > 280 ? stripped.substring(0, 280) + '...' : stripped;
                    const needsTooltip = stripped.length > 280;
                    return (
                      <Tooltip 
                        title={needsTooltip ? stripped : ''} 
                        arrow 
                        placement="bottom-start"
                        enterDelay={300}
                        slotProps={{
                          tooltip: {
                            sx: {
                              maxWidth: 500,
                              fontSize: '0.8rem',
                              lineHeight: 1.5,
                              p: 1.5,
                            },
                          },
                        }}
                      >
                        <Typography 
                          variant="body2" 
                          color="text.secondary"
                          sx={{ 
                            mt: 1.5,
                            maxWidth: 600,
                            lineHeight: 1.6,
                            cursor: needsTooltip ? 'help' : 'default',
                          }}
                        >
                          {shortText}
                        </Typography>
                      </Tooltip>
                    );
                  })()}
                </Box>
              </Stack>
            </Grid>

            <Grid item xs={12} md={4}>
              <Stack direction="row" spacing={2} justifyContent="flex-end">
                <Card variant="outlined" sx={{ minWidth: 90, textAlign: 'center' }}>
                  <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                      Markets
                    </Typography>
                    <Typography variant="h6" fontWeight={600}>
                      {event.market_count}
                    </Typography>
                  </CardContent>
                </Card>
                <Card variant="outlined" sx={{ minWidth: 90, textAlign: 'center' }}>
                  <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                      Volume
                    </Typography>
                    <Typography variant="h6" fontWeight={600}>
                      {formatVolume(event.total_volume)}
                    </Typography>
                  </CardContent>
                </Card>
                <IconButton
                  onClick={() => window.open(getExternalLink(), '_blank')}
                  color="primary"
                  size="small"
                >
                  <OpenInNew />
                </IconButton>
              </Stack>
            </Grid>
          </Grid>
        </Paper>

        {/* ================================================================== */}
        {/* LIVE SIGNALS BANNER - YC-Level Design */}
        {/* ================================================================== */}
        {(platform === 'polymarket' || platform === 'poly' || platform === 'kalshi') && (
          <Box sx={{ mb: 2 }}>
            {intelligenceLoading ? (
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.background.paper, 0.5),
                  border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                }}
              >
                <Stack direction="row" alignItems="center" spacing={2} justifyContent="center">
                  <CircularProgress size={20} />
                  <Typography variant="body2" color="text.secondary">
                    Analyzing live order flow...
                  </Typography>
                </Stack>
              </Paper>
            ) : intelligence ? (
              <>
              <Grid container spacing={1.5}>
                {/* Card 1: Market Pulse (Flow + Activity) */}
                <Grid item xs={12} sm={6} md={3}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      height: '100%',
                      bgcolor: alpha(
                        intelligence.signals.flow_score > 5 ? '#4caf50' :
                        intelligence.signals.flow_score < -5 ? '#f44336' :
                        theme.palette.primary.main,
                        0.06
                      ),
                      border: `1px solid ${alpha(
                        intelligence.signals.flow_score > 5 ? '#4caf50' :
                        intelligence.signals.flow_score < -5 ? '#f44336' :
                        theme.palette.divider,
                        0.2
                      )}`,
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                      {intelligence.signals.flow_score > 5 ? (
                        <TrendingUp sx={{ color: '#4caf50', fontSize: 18 }} />
                      ) : intelligence.signals.flow_score < -5 ? (
                        <TrendingDown sx={{ color: '#f44336', fontSize: 18 }} />
                      ) : (
                        <SwapHorizIcon sx={{ color: theme.palette.text.secondary, fontSize: 18 }} />
                      )}
                      <Typography variant="caption" color="text.secondary" fontWeight={500}>
                        MARKET PULSE
                      </Typography>
                    </Stack>
                    <Typography 
                      variant="h5" 
                      fontWeight={700}
                      sx={{ 
                        color: intelligence.signals.flow_label === 'Bullish' ? '#4caf50' :
                               intelligence.signals.flow_label === 'Bearish' ? '#f44336' :
                               theme.palette.text.primary,
                        mb: 0.5,
                      }}
                    >
                      {intelligence.signals.flow_label}
                    </Typography>
                    <Stack direction="row" spacing={2}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Buys</Typography>
                        <Typography variant="body2" fontWeight={600} sx={{ color: '#4caf50' }}>
                          {intelligence.signals.buy_count.toLocaleString()}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Sells</Typography>
                        <Typography variant="body2" fontWeight={600} sx={{ color: '#f44336' }}>
                          {intelligence.signals.sell_count.toLocaleString()}
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>
                </Grid>

                {/* Card 2: Whale Activity */}
                <Grid item xs={12} sm={6} md={3}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      height: '100%',
                      bgcolor: intelligence.signals.whale_count > 50 
                        ? alpha('#ff9800', 0.08) 
                        : alpha(theme.palette.background.paper, 0.5),
                      border: `1px solid ${alpha(
                        intelligence.signals.whale_count > 50 ? '#ff9800' : theme.palette.divider,
                        0.2
                      )}`,
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                      <Typography sx={{ fontSize: 16 }}>🐳</Typography>
                      <Typography variant="caption" color="text.secondary" fontWeight={500}>
                        WHALE ACTIVITY
                      </Typography>
                    </Stack>
                    <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
                      {intelligence.signals.whale_count}
                      <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                        trades
                      </Typography>
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatVolume(intelligence.signals.whale_volume)} volume
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {intelligence.signals.whale_share.toFixed(0)}% of total
                    </Typography>
                  </Paper>
                </Grid>

                {/* Card 3: Trading Activity */}
                <Grid item xs={12} sm={6} md={3}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      height: '100%',
                      bgcolor: intelligence.signals.trades_per_hour > 100 
                        ? alpha('#2196f3', 0.08) 
                        : alpha(theme.palette.background.paper, 0.5),
                      border: `1px solid ${alpha(
                        intelligence.signals.trades_per_hour > 100 ? '#2196f3' : theme.palette.divider,
                        0.2
                      )}`,
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                      <SpeedIcon sx={{ fontSize: 18, color: '#2196f3' }} />
                      <Typography variant="caption" color="text.secondary" fontWeight={500}>
                        ACTIVITY (24H)
                      </Typography>
                    </Stack>
                    <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
                      {formatVolume(intelligence.signals.total_volume)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {intelligence.signals.total_trades.toLocaleString()} trades • {intelligence.signals.trades_per_hour.toFixed(0)}/hr
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Avg: ${intelligence.signals.avg_trade_size.toFixed(0)}/trade
                    </Typography>
                  </Paper>
                </Grid>

                {/* Card 4: Momentum Movers */}
                <Grid item xs={12} sm={6} md={3}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      height: '100%',
                      bgcolor: alpha('#9c27b0', 0.06),
                      border: `1px solid ${alpha('#9c27b0', 0.15)}`,
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                      <Typography sx={{ fontSize: 14 }}>⚡</Typography>
                      <Typography variant="caption" color="text.secondary" fontWeight={500}>
                        MOVERS (1H)
                      </Typography>
                    </Stack>
                    <Stack spacing={0.75}>
                      {intelligence.momentum_movers.slice(0, 3).map((m, i) => {
                        // Display change in cents (m.change is decimal, multiply by 100)
                        const changeCents = Math.abs(m.change * 100);
                        const displayChange = changeCents >= 1 
                          ? `${changeCents.toFixed(0)}¢`
                          : `${changeCents.toFixed(1)}¢`;
                        const isUp = m.change > 0;
                        const currentCents = (m.current * 100).toFixed(1);
                        return (
                          <Stack key={i} direction="row" alignItems="center" justifyContent="space-between">
                            <Stack direction="row" alignItems="center" spacing={0.5}>
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  maxWidth: 80, 
                                  overflow: 'hidden', 
                                  textOverflow: 'ellipsis', 
                                  whiteSpace: 'nowrap',
                                  fontWeight: i === 0 ? 600 : 400,
                                }}
                              >
                                {m.title.replace(/^Will\s+/i, '').replace(/\s+win.*$/i, '').replace(/\s+be.*$/i, '')}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                @{currentCents}¢
                              </Typography>
                            </Stack>
                            <Chip
                              size="small"
                              label={`${isUp ? '↑' : '↓'}${displayChange}`}
                              sx={{
                                height: 20,
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                bgcolor: isUp ? alpha('#4caf50', 0.15) : alpha('#f44336', 0.15),
                                color: isUp ? '#4caf50' : '#f44336',
                              }}
                            />
                          </Stack>
                        );
                      })}
                      {intelligence.momentum_movers.length === 0 && (
                        <Typography variant="caption" color="text.secondary">
                          No significant moves
                        </Typography>
                      )}
                    </Stack>
                  </Paper>
                </Grid>
              </Grid>

              {/* AI Insights Row - Show rich insights from API */}
              {intelligence.insights && intelligence.insights.length > 0 && (
                <Paper
                  elevation={0}
                  sx={{
                    mt: 1.5,
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: alpha(theme.palette.background.paper, 0.5),
                    border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                  }}
                >
                  <Stack direction="row" spacing={2} sx={{ overflowX: 'auto', pb: 0.5 }}>
                    {intelligence.insights.slice(0, 4).map((insight, i) => (
                      <Chip
                        key={i}
                        label={insight.text}
                        size="small"
                        sx={{
                          height: 'auto',
                          py: 0.5,
                          px: 0.5,
                          fontSize: '0.75rem',
                          whiteSpace: 'nowrap',
                          bgcolor: insight.level === 'high' 
                            ? alpha('#ff9800', 0.1) 
                            : alpha(theme.palette.divider, 0.1),
                          color: insight.level === 'high' 
                            ? '#ff9800' 
                            : 'text.secondary',
                          border: 'none',
                          '& .MuiChip-label': {
                            px: 1,
                          },
                        }}
                      />
                    ))}
                  </Stack>
                </Paper>
              )}
            </>
            ) : intelligenceError ? (
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.error.main, 0.05),
                  border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`,
                }}
              >
                <Typography variant="body2" color="error">
                  Failed to load live signals
                </Typography>
              </Paper>
            ) : null}
          </Box>
        )}

        {/* ================================================================== */}
        {/* MARKETS SECTION */}
        {/* ================================================================== */}
        {activeSection === 'markets' && (
        <Paper sx={{ borderRadius: 2 }}>
          {/* Search */}
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <TextField
            placeholder="Search markets..."
            size="small"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ width: 300 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />
          </Box>

          {/* Markets Table */}
          <TableContainer>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 200 }}>
                    <TableSortLabel
                      active={sortBy === 'name'}
                      direction={sortBy === 'name' ? sortDir : 'asc'}
                      onClick={() => handleSort('name')}
                    >
                      Market
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="center" sx={{ width: 70 }}>
                    <TableSortLabel
                      active={sortBy === 'price'}
                      direction={sortBy === 'price' ? sortDir : 'desc'}
                      onClick={() => handleSort('price')}
                    >
                      Prob
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="center" sx={{ width: 160 }}>
                    Trade
                  </TableCell>
                  <TableCell align="center" sx={{ width: 70 }}>
                    <TableSortLabel
                      active={sortBy === 'volume'}
                      direction={sortBy === 'volume' ? sortDir : 'desc'}
                      onClick={() => handleSort('volume')}
                    >
                      Volume
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="center" sx={{ width: 70, whiteSpace: 'nowrap' }}>
                    <Tooltip 
                      title={platform === 'limitless' 
                        ? "Available liquidity for trading" 
                        : "Money traded in last 7 days"
                      } 
                      arrow 
                      placement="top"
                    >
                      <span style={{ cursor: 'help' }}>
                        {platform === 'limitless' ? 'Liquidity' : '7D Vol'}
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="center" sx={{ width: 50, whiteSpace: 'nowrap' }}>
                    <Tooltip title="Number of trades in last 24 hours" arrow placement="top">
                      <span style={{ cursor: 'help' }}>Trades</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="center" sx={{ width: 50, whiteSpace: 'nowrap' }}>
                    <Tooltip title="Bid-ask spread percentage. Lower = better liquidity" arrow placement="top">
                      <span style={{ cursor: 'help' }}>Spread</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="center" sx={{ width: 45, whiteSpace: 'nowrap' }}>
                    <Tooltip title="Price check. ✓ = Yes+No = 100%. ⚠️ = pricing error" arrow placement="top">
                      <span style={{ cursor: 'help' }}>Fair</span>
                    </Tooltip>
                  </TableCell>
                  {/* Intelligence columns - shown for Polymarket and Kalshi when data available */}
                  {(platform === 'polymarket' || platform === 'poly' || platform === 'kalshi') && intelligence && (
                    <>
                      <TableCell align="center" sx={{ width: 40, whiteSpace: 'nowrap' }}>
                        <Tooltip title="Trading heat: 🔥 = hot (500+ trades), 🌡️ = warm (100+), ❄️ = cold" arrow placement="top">
                          <span style={{ cursor: 'help' }}>Heat</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="center" sx={{ width: 40, whiteSpace: 'nowrap' }}>
                        <Tooltip title="Money flow: + = more buys, - = more sells" arrow placement="top">
                          <span style={{ cursor: 'help' }}>Flow</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="center" sx={{ width: 35, whiteSpace: 'nowrap' }}>
                        <Tooltip title="Whale activity ($1K+ trades)" arrow placement="top">
                          <span style={{ cursor: 'help' }}>🐳</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="center" sx={{ width: 50, whiteSpace: 'nowrap' }}>
                        <Tooltip title="Price change in last 1 hour" arrow placement="top">
                          <span style={{ cursor: 'help' }}>Δ1h</span>
                        </Tooltip>
                      </TableCell>
                    </>
                  )}
                  <TableCell align="center" sx={{ width: 35, whiteSpace: 'nowrap' }}>
                    Link
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedMarkets.map((market) => {
                  const yesPrice = market.yes_price || 0;
                  const noPrice = market.no_price || 1 - yesPrice;
                  const yesPctRaw = yesPrice * 100;
                  // Show 1 decimal for values < 10%, round for larger values
                  const yesPct = yesPctRaw < 10 
                    ? yesPctRaw.toFixed(1).replace(/\.0$/, '') 
                    : Math.round(yesPctRaw);
                  const yesCents = (yesPrice * 100).toFixed(1);
                  // For multi-outcome markets, show 0.0¢ for No when Yes is ≤0.1¢ (like Polymarket)
                  const noCents = noPrice >= 0.999 ? '0.0' : (noPrice * 100).toFixed(1);
                  
                  // Simulate price change (would come from API in real implementation)
                  const priceChange = market.price_change_24h || 0;
                  const changeUp = priceChange >= 0;
                  
                  return (
                    <TableRow
                      key={market.market_id}
                      hover
                      sx={{ 
                        '&:hover': { 
                          backgroundColor: alpha(theme.palette.background.paper, 0.6),
                        },
                        borderBottom: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
                      }}
                    >
                      {/* Market Info - Avatar, Name, Volume */}
                      <TableCell sx={{ py: 1, px: 1.5 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Avatar
                            src={market.image_url || undefined}
                            alt={market.title}
                            sx={{ 
                              width: 36, 
                              height: 36,
                              bgcolor: alpha(theme.palette.primary.main, 0.2),
                              border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                            }}
                          >
                            <Typography variant="body2" fontWeight={700}>
                              {market.title.charAt(0).toUpperCase()}
                            </Typography>
                          </Avatar>
                          <Box>
                            <Tooltip 
                              title={market.title.length > 30 ? market.title : ''} 
                              arrow 
                              placement="top-start"
                              enterDelay={300}
                            >
                              <Typography 
                                variant="body2" 
                                fontWeight={600}
                                sx={{
                                  maxWidth: 200,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  mb: 0.25,
                                  cursor: market.title.length > 30 ? 'help' : 'pointer',
                                }}
                              >
                                {market.title.replace(/^Will\s+/i, '').replace(/\s+win.*$/i, '')}
                              </Typography>
                            </Tooltip>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                              {formatVolume(market.volume_total)} Vol.
                            </Typography>
                          </Box>
                        </Stack>
                      </TableCell>
                      
                      {/* Probability */}
                      <TableCell align="center" sx={{ py: 1, px: 1 }}>
                        <Typography 
                          variant="h6" 
                          fontWeight={700}
                          sx={{ 
                            color: theme.palette.text.primary,
                            lineHeight: 1,
                          }}
                        >
                          {yesPct}%
                        </Typography>
                      </TableCell>
                      
                      {/* Yes / No Buttons */}
                      <TableCell align="center" sx={{ py: 1, px: 0.5 }}>
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Button
                            variant="contained"
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (market.source_url) window.open(addRefParam(market.source_url), '_blank');
                            }}
                            sx={{
                              bgcolor: YES_COLOR,
                              color: '#fff',
                              fontWeight: 600,
                              width: 75,
                              minWidth: 75,
                              py: 0.5,
                              px: 1,
                              borderRadius: 1,
                              textTransform: 'none',
                              fontSize: '0.75rem',
                              '&:hover': {
                                bgcolor: alpha(YES_COLOR, 0.85),
                              },
                            }}
                          >
                            Yes {yesCents}¢
                          </Button>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (market.source_url) window.open(addRefParam(market.source_url), '_blank');
                            }}
                            sx={{
                              bgcolor: NO_COLOR,
                              color: '#fff',
                              fontWeight: 600,
                              width: 75,
                              minWidth: 75,
                              py: 0.5,
                              px: 1,
                              borderRadius: 1,
                              textTransform: 'none',
                              fontSize: '0.75rem',
                              '&:hover': {
                                bgcolor: alpha(NO_COLOR, 0.85),
                              },
                            }}
                          >
                            No {noCents}¢
                          </Button>
                        </Stack>
                      </TableCell>
                      
                      {/* Total Volume */}
                      <TableCell align="center" sx={{ py: 1, px: 0.5 }}>
                        <Typography variant="caption" fontWeight={600}>
                          {formatVolume(market.volume_total)}
                        </Typography>
                      </TableCell>
                      
                      {/* 7d Volume / Liquidity (for Limitless) */}
                      <TableCell align="center" sx={{ py: 1, px: 0.5 }}>
                        <Typography variant="caption" fontWeight={600}>
                          {platform === 'limitless' 
                            ? (market.liquidity && market.liquidity > 0 ? formatVolume(market.liquidity) : '-')
                            : (market.volume_1_week && market.volume_1_week > 0 ? formatVolume(market.volume_1_week) : '-')}
                        </Typography>
                      </TableCell>
                      
                      {/* Trades 24h - from intelligence API (real count via pagination) or DB fallback */}
                      <TableCell align="center" sx={{ py: 1, px: 0.5 }}>
                        {(() => {
                          const marketIntel = getMarketIntel(market);
                          const count = marketIntel?.trades_count || market.trade_count_24h || 0;
                          if (count > 0) {
                            return (
                              <Typography variant="caption" fontWeight={600}>
                                {count.toLocaleString()}
                              </Typography>
                            );
                          }
                          return <Typography variant="caption" color="text.secondary">-</Typography>;
                        })()}
                      </TableCell>
                      
                      {/* Spread % - from intelligence data */}
                      <TableCell align="center" sx={{ py: 1, px: 0.5 }}>
                        {(() => {
                          const marketIntel = getMarketIntel(market);
                          if (marketIntel && marketIntel.spread_bps > 0) {
                            const spreadPct = (marketIntel.spread_bps / 100).toFixed(1);
                            const spreadColor = marketIntel.spread_bps <= 100 
                              ? '#4caf50' 
                              : marketIntel.spread_bps <= 300 
                              ? '#ff9800' 
                              : '#f44336';
                            return (
                              <Typography variant="caption" fontWeight={600} sx={{ color: spreadColor }}>
                                {spreadPct}%
                              </Typography>
                            );
                          }
                          return <Typography variant="caption" color="text.secondary">-</Typography>;
                        })()}
                      </TableCell>
                      
                      {/* Skew (Edge) */}
                      <TableCell align="center" sx={{ py: 1, px: 0.5 }}>
                        {(() => {
                          const skew = (market.yes_price || 0) - (1 - (market.no_price || (1 - (market.yes_price || 0))));
                          const absSkew = Math.abs(skew * 100);
                          const showWarning = absSkew > 1; // More than 1% skew
                          if (absSkew <= 0.1) {
                            return (
                              <Typography 
                                variant="caption" 
                                sx={{ color: theme.palette.success.main }}
                              >
                                ✓
                              </Typography>
                            );
                          }
                          return (
                            <Typography 
                              variant="caption" 
                              fontWeight={600} 
                              sx={{ color: showWarning ? theme.palette.warning.main : theme.palette.text.secondary }}
                            >
                              {skew > 0 ? '+' : ''}{(skew * 100).toFixed(1)}
                              {showWarning && ' ⚠️'}
                            </Typography>
                          );
                        })()}
                      </TableCell>
                      
                      {/* Intelligence columns - for Polymarket and Kalshi when data available */}
                      {(platform === 'polymarket' || platform === 'poly' || platform === 'kalshi') && intelligence && (() => {
                        // Find market intelligence using helper function
                        const marketIntel = getMarketIntel(market);
                        
                        return (
                          <>
                            {/* Heat Indicator */}
                            <TableCell align="center" sx={{ py: 1, px: 0.5 }}>
                              {marketIntel ? (
                                <Tooltip 
                                  title={`${market.trade_count_24h?.toLocaleString() || marketIntel.trades_count} trades in 24h`} 
                                  arrow 
                                  placement="top"
                                >
                                  <Typography variant="caption">
                                    {marketIntel.signals.heat === 'hot' ? '🔥' : 
                                     marketIntel.signals.heat === 'warm' ? '🌡️' : '❄️'}
                                  </Typography>
                                </Tooltip>
                              ) : (
                                <Typography variant="caption" color="text.secondary">-</Typography>
                              )}
                            </TableCell>
                            
                            {/* Flow Indicator */}
                            <TableCell align="center" sx={{ py: 1, px: 0.5 }}>
                              {marketIntel ? (
                                <Typography
                                  variant="caption"
                                  fontWeight={600}
                                  sx={{
                                    color: marketIntel.flow > 0 ? '#4caf50' : 
                                           marketIntel.flow < 0 ? '#f44336' : 
                                           theme.palette.text.secondary,
                                  }}
                                >
                                  {marketIntel.flow > 0 ? '+' : ''}{marketIntel.flow}
                                </Typography>
                              ) : (
                                <Typography variant="caption" color="text.secondary">-</Typography>
                              )}
                            </TableCell>
                            
                            {/* Whale Count */}
                            <TableCell align="center" sx={{ py: 1, px: 0.5 }}>
                              {marketIntel ? (
                                <Tooltip 
                                  title={`${marketIntel.whale_count} whale trades ($1K+)`} 
                                  arrow 
                                  placement="top"
                                >
                                  <Typography
                                    variant="caption"
                                    fontWeight={600}
                                    sx={{
                                      color: marketIntel.whale_count > 0 ? '#ff9800' : theme.palette.text.secondary,
                                    }}
                                  >
                                    {marketIntel.whale_count > 0 ? marketIntel.whale_count : '-'}
                                  </Typography>
                                </Tooltip>
                              ) : (
                                <Typography variant="caption" color="text.secondary">-</Typography>
                              )}
                            </TableCell>
                            
                            {/* Delta 1h - Show cents change for better UX */}
                            <TableCell align="center" sx={{ py: 1, px: 0.5 }}>
                              {marketIntel && marketIntel.delta_1h !== 0 ? (() => {
                                // For very large % changes (common with low-prob markets),
                                // show absolute cents change instead
                                const absPct = Math.abs(marketIntel.delta_1h);
                                const isUp = marketIntel.delta_1h > 0;
                                // If over 100% change, show in a more reasonable format
                                const displayLabel = absPct > 100 
                                  ? `${isUp ? '↑' : '↓'}${(absPct / 100).toFixed(0)}¢`
                                  : `${isUp ? '+' : ''}${marketIntel.delta_1h.toFixed(0)}%`;
                                return (
                                  <Chip
                                    size="small"
                                    label={displayLabel}
                                    sx={{
                                      height: 18,
                                      fontSize: '0.65rem',
                                      bgcolor: isUp ? alpha('#4caf50', 0.15) : alpha('#f44336', 0.15),
                                      color: isUp ? '#4caf50' : '#f44336',
                                    }}
                                  />
                                );
                              })() : (
                                <Typography variant="caption" color="text.secondary">-</Typography>
                              )}
                            </TableCell>
                          </>
                        );
                      })()}
                      
                      {/* Link */}
                      <TableCell align="center" sx={{ py: 1, px: 0.5 }}>
                        {market.source_url && (
                          <IconButton
                            size="small"
                            href={`${market.source_url}${market.source_url.includes('?') ? '&' : '?'}ref=eventgraph`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            sx={{ 
                              opacity: 0.6,
                              '&:hover': { opacity: 1 },
                            }}
                          >
                            <OpenInNew fontSize="small" />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
        )}

        {/* ================================================================== */}
        {/* CHARTS SECTION - Clean 2x2 Grid */}
        {/* ================================================================== */}
        {activeSection === 'charts' && analytics && (
          <Box>
            <Grid container spacing={2}>
              {/* Row 1: Volume Distribution + Volume Leaders */}
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2, height: 380 }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <PieChartIcon fontSize="small" color="primary" />
                    <Typography variant="subtitle1" fontWeight={600}>
                      Volume Distribution
                    </Typography>
                  </Stack>
                  <Box sx={{ height: 320 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analytics.volumePieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="45%"
                          outerRadius={90}
                          innerRadius={50}
                          label={({ percent }) =>
                            percent > 0.08 ? `${(percent * 100).toFixed(0)}%` : ''
                          }
                          labelLine={false}
                        >
                          {analytics.volumePieData.map((_, idx) => (
                            <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                          ))}n                        </Pie>
                        <RechartsTooltip
                          formatter={(value: number) => formatVolume(value)}
                          contentStyle={{ 
                            backgroundColor: theme.palette.background.paper, 
                            border: `1px solid ${theme.palette.divider}`,
                            borderRadius: 8,
                            color: theme.palette.text.primary 
                          }}
                        />
                        <Legend 
                          wrapperStyle={{ fontSize: '11px', color: theme.palette.text.secondary }}
                          layout="horizontal"
                          verticalAlign="bottom"
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                </Paper>
              </Grid>

              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2, height: 380 }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <BarChartIcon fontSize="small" color="primary" />
                    <Typography variant="subtitle1" fontWeight={600}>
                      Volume by Market (Top 10)
                    </Typography>
                  </Stack>
                  <Box sx={{ height: 320 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.volumeBarData} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.divider, 0.5)} />
                        <XAxis 
                          type="number" 
                          tickFormatter={(v) => formatVolume(v)} 
                          tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={120}
                          tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                        />
                        <RechartsTooltip 
                          formatter={(value: number) => formatVolume(value)} 
                          contentStyle={{ 
                            backgroundColor: theme.palette.background.paper, 
                            border: `1px solid ${theme.palette.divider}`,
                            borderRadius: 8,
                            color: theme.palette.text.primary 
                          }}
                        />
                        <Bar 
                          dataKey="volume" 
                          fill={theme.palette.primary.main} 
                          name="Volume"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </Paper>
              </Grid>

              {/* Row 2: Price Distribution + Heat/Flow Analysis */}
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2, height: 380 }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <ShowChart fontSize="small" color="primary" />
                    <Typography variant="subtitle1" fontWeight={600}>
                      Price Distribution
                    </Typography>
                    <Chip 
                      size="small" 
                      label={`${markets.length} markets`}
                      sx={{ ml: 'auto', height: 18, fontSize: '0.7rem' }}
                    />
                  </Stack>
                  <Box sx={{ height: 320 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.priceRanges} margin={{ bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.divider, 0.5)} />
                        <XAxis 
                          dataKey="range" 
                          tick={{ fontSize: 9, fill: theme.palette.text.secondary }}
                          angle={-45}
                          textAnchor="end"
                          height={50}
                        />
                        <YAxis tick={{ fontSize: 10, fill: theme.palette.text.secondary }} />
                        <RechartsTooltip 
                          formatter={(value: number) => [`${value} markets`, 'Count']}
                          contentStyle={{ 
                            backgroundColor: theme.palette.background.paper, 
                            border: `1px solid ${theme.palette.divider}`,
                            borderRadius: 8,
                            color: theme.palette.text.primary 
                          }}
                        />
                        <Bar 
                          dataKey="count" 
                          name="Markets"
                          radius={[4, 4, 0, 0]}
                        >
                          {analytics.priceRanges.map((entry, idx) => (
                            <Cell 
                              key={idx} 
                              fill={
                                entry.min >= 0.5 
                                  ? alpha('#4caf50', 0.7 + (entry.min - 0.5) * 0.6) 
                                  : alpha('#f44336', 0.7 + (0.5 - entry.min) * 0.6)
                              } 
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </Paper>
              </Grid>

              {/* Heat & Flow Summary - Intelligence Based */}
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2, height: 380 }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <SpeedIcon fontSize="small" color="primary" />
                    <Typography variant="subtitle1" fontWeight={600}>
                      Market Activity
                    </Typography>
                    {intelligence && (
                      <Chip 
                        size="small" 
                        label="Live"
                        color="success"
                        sx={{ ml: 'auto', height: 18, fontSize: '0.65rem' }}
                      />
                    )}
                  </Stack>
                  
                  {intelligence ? (
                    <Box sx={{ height: 320 }}>
                      {/* Heat Distribution */}
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                          Market Heat Distribution
                        </Typography>
                        <Stack direction="row" spacing={1}>
                          {(() => {
                            const hotCount = intelligence.markets?.filter(m => m.signals?.heat === 'hot').length || 0;
                            const warmCount = intelligence.markets?.filter(m => m.signals?.heat === 'warm').length || 0;
                            const coldCount = intelligence.markets?.filter(m => m.signals?.heat === 'cold').length || 0;
                            const total = hotCount + warmCount + coldCount || 1;
                            return (
                              <>
                                <Box sx={{ flex: Math.max(hotCount, 1) / total, minWidth: 60 }}>
                                  <Box sx={{ 
                                    bgcolor: alpha('#f44336', hotCount > 0 ? 0.2 : 0.05), 
                                    borderRadius: 1, 
                                    p: 1, 
                                    textAlign: 'center',
                                    border: `1px solid ${alpha('#f44336', hotCount > 0 ? 0.3 : 0.1)}`
                                  }}>
                                    <Typography variant="h6" fontWeight={700} color={hotCount > 0 ? '#f44336' : 'text.disabled'}>
                                      {hotCount}
                                    </Typography>
                                    <Typography variant="caption" color={hotCount > 0 ? 'text.primary' : 'text.disabled'}>🔥 Hot</Typography>
                                  </Box>
                                </Box>
                                <Box sx={{ flex: Math.max(warmCount, 1) / total, minWidth: 60 }}>
                                  <Box sx={{ 
                                    bgcolor: alpha('#ff9800', warmCount > 0 ? 0.2 : 0.05), 
                                    borderRadius: 1, 
                                    p: 1, 
                                    textAlign: 'center',
                                    border: `1px solid ${alpha('#ff9800', warmCount > 0 ? 0.3 : 0.1)}`
                                  }}>
                                    <Typography variant="h6" fontWeight={700} color={warmCount > 0 ? '#ff9800' : 'text.disabled'}>
                                      {warmCount}
                                    </Typography>
                                    <Typography variant="caption" color={warmCount > 0 ? 'text.primary' : 'text.disabled'}>🌡️ Warm</Typography>
                                  </Box>
                                </Box>
                                <Box sx={{ flex: Math.max(coldCount, 1) / total, minWidth: 60 }}>
                                  <Box sx={{ 
                                    bgcolor: alpha(theme.palette.info.main, coldCount > 0 ? 0.1 : 0.03), 
                                    borderRadius: 1, 
                                    p: 1, 
                                    textAlign: 'center',
                                    border: `1px solid ${alpha(theme.palette.info.main, coldCount > 0 ? 0.2 : 0.1)}`
                                  }}>
                                    <Typography variant="h6" fontWeight={700} color={coldCount > 0 ? 'info.main' : 'text.disabled'}>
                                      {coldCount}
                                    </Typography>
                                    <Typography variant="caption" color={coldCount > 0 ? 'text.primary' : 'text.disabled'}>❄️ Cold</Typography>
                                  </Box>
                                </Box>
                              </>
                            );
                          })()}
                        </Stack>
                      </Box>

                      {/* Event-level Stats */}
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                          24h Trading Activity
                        </Typography>
                        <Grid container spacing={1}>
                          <Grid item xs={6}>
                            <Box sx={{ bgcolor: alpha(theme.palette.primary.main, 0.08), borderRadius: 1, p: 1.5 }}>
                              <Typography variant="h5" fontWeight={700} color="primary.main">
                                {intelligence.signals?.total_trades?.toLocaleString() || '—'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">Total Trades</Typography>
                            </Box>
                          </Grid>
                          <Grid item xs={6}>
                            <Box sx={{ bgcolor: alpha('#4caf50', 0.08), borderRadius: 1, p: 1.5 }}>
                              <Typography variant="h5" fontWeight={700} color="success.main">
                                {formatVolume(intelligence.signals?.total_volume || 0)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">Total Volume</Typography>
                            </Box>
                          </Grid>
                          <Grid item xs={6}>
                            <Box sx={{ bgcolor: alpha('#ff9800', 0.08), borderRadius: 1, p: 1.5 }}>
                              <Typography variant="h5" fontWeight={700} color="warning.main">
                                {intelligence.signals?.whale_count || 0}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">🐳 Whale Trades</Typography>
                            </Box>
                          </Grid>
                          <Grid item xs={6}>
                            <Box sx={{ 
                              bgcolor: alpha(
                                (intelligence.signals?.flow_score || 0) > 0 ? '#4caf50' : '#f44336', 
                                0.08
                              ), 
                              borderRadius: 1, 
                              p: 1.5 
                            }}>
                              <Typography 
                                variant="h5" 
                                fontWeight={700} 
                                sx={{ 
                                  color: (intelligence.signals?.flow_score || 0) > 0 ? '#4caf50' : '#f44336' 
                                }}
                              >
                                {(intelligence.signals?.flow_score || 0) > 0 ? '📈' : '📉'} {intelligence.signals?.flow_label || 'Neutral'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">Flow Signal</Typography>
                            </Box>
                          </Grid>
                        </Grid>
                      </Box>
                    </Box>
                  ) : (
                    <Box sx={{ 
                      height: 320, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      flexDirection: 'column',
                      gap: 1
                    }}>
                      {intelligenceLoading ? (
                        <>
                          <CircularProgress size={24} />
                          <Typography variant="caption" color="text.secondary">
                            Loading activity data...
                          </Typography>
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Activity data available for Polymarket and Kalshi events
                        </Typography>
                      )}
                    </Box>
                  )}
                </Paper>
              </Grid>
            </Grid>
          </Box>
        )}

        {/* ================================================================== */}
        {/* ACTIVITY SECTION - 2x2 Grid: Movers, Recent Trades, Insights, Summary */}
        {/* ================================================================== */}
        {activeSection === 'activity' && (
          <Box>
            {intelligenceLoading ? (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
                <CircularProgress size={32} sx={{ mb: 2 }} />
                <Typography variant="body2" color="text.secondary">
                  Loading live activity data...
                </Typography>
              </Paper>
            ) : intelligence?.trade_feed && intelligence.trade_feed.length > 0 ? (
              <Grid container spacing={2}>
                {/* Panel 1: Top Movers (1h) */}
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2, borderRadius: 2, height: 380 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                      <TrendingUp fontSize="small" color="success" />
                      <Typography variant="subtitle1" fontWeight={600}>
                        Top Movers (1h)
                      </Typography>
                      <Chip 
                        size="small" 
                        label="LIVE"
                        sx={{ ml: 'auto', height: 18, fontSize: '0.65rem', bgcolor: alpha('#4caf50', 0.15), color: '#4caf50' }}
                      />
                    </Stack>
                    <Box sx={{ height: 310, overflow: 'auto' }}>
                      {intelligence.momentum_movers?.length > 0 ? (
                        intelligence.momentum_movers.slice(0, 10).map((mover, i) => {
                          const changePct = mover.change_pct || 0;
                          const isUp = changePct >= 0;
                          const currentPrice = (mover.current || 0) * 100;
                          return (
                            <Box
                              key={i}
                              sx={{
                                p: 1.5,
                                mb: 1,
                                borderRadius: 1,
                                bgcolor: alpha(isUp ? '#4caf50' : '#f44336', 0.06),
                                border: `1px solid ${alpha(isUp ? '#4caf50' : '#f44336', 0.15)}`,
                              }}
                            >
                              <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Typography
                                    variant="body2"
                                    fontWeight={500}
                                    sx={{ 
                                      overflow: 'hidden', 
                                      textOverflow: 'ellipsis', 
                                      whiteSpace: 'nowrap',
                                      maxWidth: 200
                                    }}
                                  >
                                    {(mover.title || mover.market_question || '').replace(/^Will\s+/i, '').replace(/\s+win.*$/i, '')}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {currentPrice.toFixed(1)}¢
                                  </Typography>
                                </Box>
                                <Chip
                                  size="small"
                                  icon={isUp ? <TrendingUp sx={{ fontSize: 14 }} /> : <TrendingDown sx={{ fontSize: 14 }} />}
                                  label={`${isUp ? '+' : ''}${changePct.toFixed(1)}%`}
                                  sx={{
                                    height: 24,
                                    fontWeight: 700,
                                    bgcolor: alpha(isUp ? '#4caf50' : '#f44336', 0.15),
                                    color: isUp ? '#4caf50' : '#f44336',
                                    '& .MuiChip-icon': { color: 'inherit' }
                                  }}
                                />
                              </Stack>
                            </Box>
                          );
                        })
                      ) : (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                          <Typography variant="body2" color="text.secondary">
                            No significant price movements
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Paper>
                </Grid>

                {/* Panel 2: Big Trades $50+ (24h) */}
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2, borderRadius: 2, height: 380 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                      <SwapHorizIcon color="primary" fontSize="small" />
                      <Typography variant="subtitle1" fontWeight={600}>
                        Recent Trades (24h)
                      </Typography>
                      <Chip 
                        size="small" 
                        label={`≥$50`}
                        sx={{ ml: 'auto', height: 18, fontSize: '0.7rem', bgcolor: alpha('#2196f3', 0.15), color: '#2196f3' }}
                      />
                    </Stack>
                    <TableContainer sx={{ height: 310 }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ width: 65, py: 1 }}>Time</TableCell>
                            <TableCell sx={{ width: 50, py: 1 }}>Side</TableCell>
                            <TableCell sx={{ py: 1 }}>Market</TableCell>
                            <TableCell align="right" sx={{ width: 55, py: 1 }}>Price</TableCell>
                            <TableCell align="right" sx={{ width: 70, py: 1 }}>Value</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {intelligence.trade_feed
                            .filter(t => (t.value || 0) >= 50)
                            .slice(0, 30)
                            .map((trade, i) => (
                            <TableRow key={i} hover sx={{ '& td': { py: 0.6 } }}>
                              <TableCell>
                                <Typography variant="caption" color="text.secondary">
                                  {trade.timestamp ? format(new Date(trade.timestamp * 1000), 'HH:mm') : '—'}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  label={trade.side}
                                  sx={{
                                    height: 18,
                                    fontSize: '0.6rem',
                                    fontWeight: 600,
                                    bgcolor: alpha(trade.side === 'BUY' ? '#4caf50' : '#f44336', 0.15),
                                    color: trade.side === 'BUY' ? '#4caf50' : '#f44336',
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                <Tooltip title={trade.title || ''} arrow placement="top">
                                  <Typography
                                    variant="caption"
                                    sx={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', cursor: 'help' }}
                                  >
                                    {(trade.title || '').replace(/^Will\s+/i, '').substring(0, 25)}
                                  </Typography>
                                </Tooltip>
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="caption" fontWeight={600}>
                                  {((trade.price || 0) * 100).toFixed(0)}¢
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <Typography
                                  variant="caption"
                                  fontWeight={700}
                                  sx={{ color: (trade.value || 0) >= 500 ? '#ff9800' : (trade.value || 0) >= 100 ? '#4caf50' : 'inherit' }}
                                >
                                  ${(trade.value || 0).toFixed(0)}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                          {intelligence.trade_feed.filter(t => (t.value || 0) >= 50).length === 0 && (
                            <TableRow>
                              <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                                <Typography variant="body2" color="text.secondary">
                                  No trades ≥$50 in recent feed
                                </Typography>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                </Grid>

                {/* Panel 3: AI Insights */}
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2, borderRadius: 2, height: 280 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                      <AutoAwesomeIcon fontSize="small" sx={{ color: '#9c27b0' }} />
                      <Typography variant="subtitle1" fontWeight={600}>
                        AI Insights
                      </Typography>
                      <Chip 
                        size="small" 
                        label="LIVE"
                        sx={{ ml: 'auto', height: 18, fontSize: '0.65rem', bgcolor: alpha('#9c27b0', 0.15), color: '#9c27b0' }}
                      />
                    </Stack>
                    <Box sx={{ height: 210, overflow: 'auto' }}>
                      {intelligence.insights?.length > 0 ? (
                        intelligence.insights.map((insight: { type?: string; level?: string; text?: string }, i: number) => {
                          const levelColors: Record<string, string> = { high: '#f44336', medium: '#ff9800', low: '#4caf50' };
                          const bgColor = levelColors[insight.level || ''] || '#2196f3';
                          return (
                            <Box
                              key={i}
                              sx={{
                                p: 1.5,
                                mb: 1,
                                borderRadius: 1,
                                bgcolor: alpha(bgColor, 0.08),
                                borderLeft: `3px solid ${bgColor}`,
                              }}
                            >
                              <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                                {insight.text}
                              </Typography>
                            </Box>
                          );
                        })
                      ) : (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                          <Typography variant="body2" color="text.secondary">
                            No insights available
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Paper>
                </Grid>

                {/* Panel 4: 24h Trading Summary */}
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2, borderRadius: 2, height: 280 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                      <TimelineIcon fontSize="small" color="primary" />
                      <Typography variant="subtitle1" fontWeight={600}>
                        24h Trading Summary
                      </Typography>
                    </Stack>
                    <Grid container spacing={1}>
                      {/* Row 1: Volume & Trades */}
                      <Grid item xs={6}>
                        <Box sx={{ p: 1.25, borderRadius: 1, bgcolor: alpha('#2196f3', 0.08), textAlign: 'center' }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.65rem' }}>Volume</Typography>
                          <Typography variant="h6" fontWeight={700} color="primary.main">
                            {formatVolume(intelligence.signals?.total_volume || 0)}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={6}>
                        <Box sx={{ p: 1.25, borderRadius: 1, bgcolor: alpha('#9c27b0', 0.08), textAlign: 'center' }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.65rem' }}>Trades</Typography>
                          <Typography variant="h6" fontWeight={700} sx={{ color: '#9c27b0' }}>
                            {(intelligence.signals?.total_trades || 0).toLocaleString()}
                          </Typography>
                        </Box>
                      </Grid>
                      {/* Row 2: Whale & Buy/Sell */}
                      <Grid item xs={6}>
                        <Box sx={{ p: 1.25, borderRadius: 1, bgcolor: alpha('#ff9800', 0.08), textAlign: 'center' }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.65rem' }}>🐳 Whales ({intelligence.signals?.whale_share || 0}%)</Typography>
                          <Typography variant="h6" fontWeight={700} sx={{ color: '#ff9800' }}>
                            {formatVolume(intelligence.signals?.whale_volume || 0)}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={6}>
                        <Box sx={{ p: 1.25, borderRadius: 1, bgcolor: alpha('#4caf50', 0.08), textAlign: 'center' }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.65rem' }}>Buy / Sell</Typography>
                          <Stack direction="row" justifyContent="center" spacing={0.5} alignItems="baseline">
                            <Typography variant="h6" fontWeight={700} color="success.main">
                              {(intelligence.signals?.buy_count || 0).toLocaleString()}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">/</Typography>
                            <Typography variant="h6" fontWeight={700} color="error.main">
                              {(intelligence.signals?.sell_count || 0).toLocaleString()}
                            </Typography>
                          </Stack>
                        </Box>
                      </Grid>
                      {/* Row 3: Stats */}
                      <Grid item xs={4}>
                        <Box sx={{ p: 1.25, borderRadius: 1, bgcolor: alpha('#607d8b', 0.06), textAlign: 'center' }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.6rem' }}>Trades/hr</Typography>
                          <Typography variant="body1" fontWeight={700}>
                            {Math.round(intelligence.signals?.trades_per_hour || 0)}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={4}>
                        <Box sx={{ p: 1.25, borderRadius: 1, bgcolor: alpha('#607d8b', 0.06), textAlign: 'center' }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.6rem' }}>Avg Trade</Typography>
                          <Typography variant="body1" fontWeight={700}>
                            ${Math.round(intelligence.signals?.avg_trade_size || 0)}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={4}>
                        <Box sx={{ p: 1.25, borderRadius: 1, bgcolor: alpha('#607d8b', 0.06), textAlign: 'center' }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.6rem' }}>Flow</Typography>
                          <Typography variant="body1" fontWeight={700} sx={{ 
                            color: (intelligence.signals?.flow_score || 0) > 0 ? '#4caf50' : 
                                   (intelligence.signals?.flow_score || 0) < 0 ? '#f44336' : 'inherit'
                          }}>
                            {intelligence.signals?.flow_label || 'Balanced'}
                          </Typography>
                        </Box>
                      </Grid>
                    </Grid>
                  </Paper>
                </Grid>
              </Grid>
            ) : (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
                <Box sx={{ opacity: 0.5, mb: 2 }}>
                  <SpeedIcon sx={{ fontSize: 48 }} />
                </Box>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No Activity Data
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {intelligenceError 
                    ? `Error: ${intelligenceError}` 
                    : 'Trade activity data is only available for Polymarket and Kalshi events'}
                </Typography>
              </Paper>
            )}
          </Box>
        )}

        {/* ================================================================== */}
        {/* RANKINGS SECTION - Top Markets Ranked */}
        {/* ================================================================== */}
        {activeSection === 'rankings' && (
          <Box>
            <Paper sx={{ p: 2, borderRadius: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <EmojiEvents color="warning" />
                <Typography variant="h6" fontWeight={600}>
                  Top Predictions
                </Typography>
                <Chip 
                  size="small" 
                  label={`${markets.length} markets`}
                  sx={{ ml: 'auto', height: 20 }}
                />
              </Stack>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 50 }}>#</TableCell>
                      <TableCell>Outcome</TableCell>
                      <TableCell align="center" sx={{ width: 100 }}>Probability</TableCell>
                      <TableCell align="center" sx={{ width: 60 }}>1h Δ</TableCell>
                      <TableCell align="center" sx={{ width: 50 }}>Heat</TableCell>
                      <TableCell align="center" sx={{ width: 50 }}>Flow</TableCell>
                      <TableCell align="right" sx={{ width: 90 }}>Volume</TableCell>
                      <TableCell align="center" sx={{ width: 100 }}>Trade</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[...markets]
                      .sort((a, b) => (b.yes_price || 0) - (a.yes_price || 0))
                      .map((m, idx) => {
                        // Get intelligence data for this market using helper
                        const intelMarket = getMarketIntel(m);
                        const heat = intelMarket?.signals?.heat || 'cold';
                        const delta1h = intelMarket?.signals?.delta_1h ?? intelMarket?.price_change_1h?.change_pct ?? 0;
                        const flow = intelMarket?.signals?.flow ?? intelMarket?.trades?.flow_score ?? 0;
                        const whaleActive = intelMarket?.signals?.whale_active || (intelMarket?.trades?.whale_count ?? 0) > 0;
                        return (
                      <TableRow 
                        key={m.market_id} 
                        hover 
                        sx={{ 
                          bgcolor: heat === 'hot' 
                            ? alpha('#f44336', 0.05) 
                            : heat === 'warm' 
                            ? alpha('#ff9800', 0.03) 
                            : idx < 3 ? alpha('#ffc107', 0.03) : 'transparent',
                        }}
                      >
                        <TableCell>
                          <Typography
                            variant="body2"
                            fontWeight={idx < 3 ? 700 : 400}
                            sx={{
                              color: idx === 0 ? '#ffc107' : idx === 1 ? '#9e9e9e' : idx === 2 ? '#cd7f32' : 'text.primary',
                              fontSize: idx < 3 ? '1rem' : '0.875rem',
                            }}
                          >
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Typography variant="body2" fontWeight={500}>
                              {m.title}
                            </Typography>
                            {whaleActive && (
                              <Tooltip title="Whale activity detected">
                                <span style={{ fontSize: '0.75rem' }}>🐳</span>
                              </Tooltip>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={formatPercent(m.yes_price)}
                            size="small"
                            sx={{
                              bgcolor: (m.yes_price || 0) > 0.5 
                                ? alpha('#4caf50', 0.15) 
                                : alpha('#f44336', 0.15),
                              color: (m.yes_price || 0) > 0.5 ? '#4caf50' : '#f44336',
                              fontWeight: 600,
                            }}
                          />
                        </TableCell>
                        <TableCell align="center">
                          {delta1h !== 0 ? (
                            <Typography 
                              variant="caption" 
                              fontWeight={600}
                              sx={{ color: delta1h > 0 ? '#4caf50' : '#f44336' }}
                            >
                              {delta1h > 0 ? '↑' : '↓'}{Math.abs(delta1h).toFixed(1)}%
                            </Typography>
                          ) : (
                            <Typography variant="caption" color="text.secondary">—</Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            size="small"
                            label={heat === 'hot' ? '🔥' : heat === 'warm' ? '🌡️' : '❄️'}
                            sx={{
                              height: 20,
                              fontSize: '0.7rem',
                              bgcolor: heat === 'hot' 
                                ? alpha('#f44336', 0.1) 
                                : heat === 'warm' 
                                ? alpha('#ff9800', 0.1) 
                                : alpha(theme.palette.divider, 0.1),
                            }}
                          />
                        </TableCell>
                        <TableCell align="center">
                          {flow !== 0 ? (
                            <Tooltip title={`Flow: ${flow > 0 ? 'Bullish' : 'Bearish'} (${flow > 0 ? '+' : ''}${flow})`}>
                              <Typography
                                variant="body2"
                                fontWeight={600}
                                sx={{ 
                                  color: flow > 0 ? '#4caf50' : '#f44336',
                                  fontSize: '0.85rem',
                                }}
                              >
                                {flow > 5 ? '📈' : flow < -5 ? '📉' : flow > 0 ? '↗' : '↘'}
                              </Typography>
                            </Tooltip>
                          ) : (
                            <Typography variant="caption" color="text.secondary">—</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {formatVolume(m.volume_total)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Stack direction="row" spacing={0.5} justifyContent="center">
                            <Button
                              size="small"
                              variant="contained"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (m.source_url) window.open(addRefParam(m.source_url), '_blank');
                              }}
                              sx={{
                                bgcolor: '#4caf50',
                                minWidth: 40,
                                py: 0.25,
                                fontSize: '0.65rem',
                                '&:hover': { bgcolor: alpha('#4caf50', 0.85) },
                              }}
                            >
                              Yes
                            </Button>
                            <Button
                              size="small"
                              variant="contained"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (m.source_url) window.open(addRefParam(m.source_url), '_blank');
                              }}
                              sx={{
                                bgcolor: '#f44336',
                                minWidth: 40,
                                py: 0.25,
                                fontSize: '0.65rem',
                                '&:hover': { bgcolor: alpha('#f44336', 0.85) },
                              }}
                            >
                              No
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Box>
        )}

        {/* ================================================================== */}
        {/* WHALES SECTION - Large Trades Tracking */}
        {/* ================================================================== */}
        {activeSection === 'whales' && (
          <Box>
            {intelligenceLoading ? (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
                <CircularProgress size={32} sx={{ mb: 2 }} />
                <Typography variant="body2" color="text.secondary">
                  Loading whale data...
                </Typography>
              </Paper>
            ) : intelligence?.signals ? (
              <Stack spacing={2}>
                {/* Row 1: Top Whale Markets + Large Trades Table (Main Content First) */}
                <Grid container spacing={2}>
                  {/* Top Whale Markets by whale_count from markets array */}
                  <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 2, borderRadius: 2, height: 420 }}>
                      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                        🔥 Top Whale Markets
                      </Typography>
                      <Box sx={{ height: 350, overflow: 'auto' }}>
                        {(() => {
                          // Use markets array which has whale_count per market
                          const whaleMarkets = (intelligence.markets || [])
                            .filter(m => (m.whale_count || 0) > 0)
                            .sort((a, b) => (b.whale_count || 0) - (a.whale_count || 0))
                            .slice(0, 15);
                          
                          if (whaleMarkets.length === 0) {
                            return (
                              <Box sx={{ textAlign: 'center', py: 4 }}>
                                <Typography variant="body2" color="text.secondary">No whale activity data</Typography>
                              </Box>
                            );
                          }
                          
                          return whaleMarkets.map((market, i) => {
                            const flow = market.flow || 0;
                            const flowLabel = flow > 0 ? 'Bullish' : flow < 0 ? 'Bearish' : 'Neutral';
                            const flowColor = flow > 0 ? '#4caf50' : flow < 0 ? '#f44336' : '#607d8b';
                            return (
                              <Box 
                                key={market.market_slug}
                                sx={{ 
                                  p: 1.5, 
                                  mb: 1, 
                                  borderRadius: 1, 
                                  bgcolor: alpha('#ff9800', 0.04 + (i === 0 ? 0.06 : 0)),
                                  border: i === 0 ? `1px solid ${alpha('#ff9800', 0.2)}` : 'none'
                                }}
                              >
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="body2" fontWeight={i === 0 ? 600 : 500} sx={{ 
                                      overflow: 'hidden', 
                                      textOverflow: 'ellipsis', 
                                      whiteSpace: 'nowrap' 
                                    }}>
                                      {i + 1}. {(market.title || '').replace(/^Will\s+/i, '').replace(/\s+win.*$/i, '').substring(0, 22)}
                                    </Typography>
                                    <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                                      <Typography variant="caption" sx={{ color: flowColor }}>
                                        {flowLabel} (Flow: {flow > 0 ? '+' : ''}{flow})
                                      </Typography>
                                    </Stack>
                                  </Box>
                                  <Box sx={{ textAlign: 'right' }}>
                                    <Chip 
                                      size="small" 
                                      label={`${market.whale_count} 🐳`}
                                      sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700, bgcolor: alpha('#ff9800', 0.15), color: '#ff9800' }}
                                    />
                                    {market.signals?.heat && (
                                      <Typography variant="caption" display="block" sx={{ mt: 0.5, color: market.signals.heat === 'hot' ? '#f44336' : market.signals.heat === 'warm' ? '#ff9800' : 'text.secondary' }}>
                                        {market.signals.heat === 'hot' ? '🔥 Hot' : market.signals.heat === 'warm' ? '🌡 Warm' : '❄️ Cold'}
                                      </Typography>
                                    )}
                                  </Box>
                                </Stack>
                              </Box>
                            );
                          });
                        })()}
                      </Box>
                    </Paper>
                  </Grid>

                  {/* Large Trades Table with Filters */}
                  <Grid item xs={12} md={8}>
                    <Paper sx={{ p: 2, borderRadius: 2, height: 420 }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Typography variant="h5">🐳</Typography>
                          <Typography variant="subtitle1" fontWeight={600}>
                            Large Trades
                          </Typography>
                        </Stack>
                        <Stack direction="row" spacing={0.5}>
                          {[500, 1000, 5000, 10000].map((size) => (
                            <Chip
                              key={size}
                              label={`>${size >= 1000 ? `$${size/1000}K` : `$${size}`}`}
                              size="small"
                              onClick={() => setWhaleMinSize(size)}
                              sx={{
                                height: 22,
                                fontSize: '0.7rem',
                                cursor: 'pointer',
                                bgcolor: whaleMinSize === size ? alpha('#ff9800', 0.2) : alpha(theme.palette.divider, 0.1),
                                color: whaleMinSize === size ? '#ff9800' : 'text.secondary',
                                fontWeight: whaleMinSize === size ? 600 : 400,
                                '&:hover': { bgcolor: alpha('#ff9800', 0.15) },
                              }}
                            />
                          ))}
                        </Stack>
                      </Stack>
                      <TableContainer sx={{ height: 340 }}>
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ width: 100, py: 1 }}>Time</TableCell>
                              <TableCell sx={{ width: 60, py: 1 }}>Side</TableCell>
                              <TableCell sx={{ py: 1 }}>Market</TableCell>
                              <TableCell align="right" sx={{ width: 60, py: 1 }}>Price</TableCell>
                              <TableCell align="right" sx={{ width: 80, py: 1 }}>Value</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {(intelligence.large_trades || intelligence.whale_trades || [])
                              .filter(t => (t.size_usd || t.value || 0) >= whaleMinSize)
                              .sort((a, b) => b.timestamp - a.timestamp)
                              .slice(0, 50)
                              .map((trade, i) => (
                              <TableRow 
                                key={i} 
                                hover
                                sx={{ bgcolor: alpha(trade.side === 'BUY' ? '#4caf50' : '#f44336', 0.03) }}
                              >
                                <TableCell>
                                  <Typography variant="caption">
                                    {format(new Date(trade.timestamp * 1000), 'MMM d, HH:mm')}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Chip
                                    size="small"
                                    label={trade.side}
                                    sx={{
                                      height: 20,
                                      fontSize: '0.65rem',
                                      fontWeight: 600,
                                      bgcolor: alpha(trade.side === 'BUY' ? '#4caf50' : '#f44336', 0.15),
                                      color: trade.side === 'BUY' ? '#4caf50' : '#f44336',
                                    }}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Tooltip title={trade.market_question || trade.title} arrow placement="top">
                                    <Typography variant="caption" sx={{ 
                                      display: 'block',
                                      maxWidth: 200, 
                                      overflow: 'hidden', 
                                      textOverflow: 'ellipsis', 
                                      whiteSpace: 'nowrap',
                                      cursor: 'help'
                                    }}>
                                      {(trade.market_question || trade.title || '').replace(/^Will\s+/i, '')}
                                    </Typography>
                                  </Tooltip>
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="caption" fontWeight={600}>
                                    {((trade.price || 0) * 100).toFixed(1)}¢
                                  </Typography>
                                </TableCell>
                                <TableCell align="right">
                                  <Typography 
                                    variant="caption" 
                                    fontWeight={700}
                                    sx={{ color: (trade.size_usd || trade.value || 0) >= 10000 ? '#ff9800' : '#4caf50' }}
                                  >
                                    {formatVolume(trade.size_usd || trade.value || 0)}
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ))}
                            {(intelligence.large_trades || intelligence.whale_trades || []).filter(t => (t.size_usd || t.value || 0) >= whaleMinSize).length === 0 && (
                              <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                                  <Typography variant="body2" color="text.secondary">
                                    No trades ≥${whaleMinSize.toLocaleString()} found
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Paper>
                  </Grid>
                </Grid>

                {/* Row 2: Whale Insight Cards - Summary stats below */}
                <Grid container spacing={2}>
                  {/* Smart Money Consensus */}
                  <Grid item xs={6} sm={3}>
                    <Paper sx={{ 
                      p: 2, 
                      borderRadius: 2, 
                      bgcolor: alpha(
                        intelligence.advanced_signals?.smart_money_consensus?.includes('bullish') ? '#4caf50' :
                        intelligence.advanced_signals?.smart_money_consensus?.includes('bearish') ? '#f44336' : '#2196f3',
                        0.08
                      ),
                      textAlign: 'center',
                      height: '100%'
                    }}>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', mb: 0.5 }}>
                        Smart Money Signal
                      </Typography>
                      <Typography variant="h5" fontWeight={700} sx={{ 
                        color: intelligence.advanced_signals?.smart_money_consensus?.includes('bullish') ? '#4caf50' :
                               intelligence.advanced_signals?.smart_money_consensus?.includes('bearish') ? '#f44336' : '#2196f3',
                        textTransform: 'capitalize'
                      }}>
                        {intelligence.advanced_signals?.smart_money_consensus?.replace('_', ' ') || 'Neutral'}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>
                        Large trade consensus
                      </Typography>
                    </Paper>
                  </Grid>
                  {/* Accumulation vs Distribution */}
                  <Grid item xs={6} sm={3}>
                    <Paper sx={{ p: 2, borderRadius: 2, bgcolor: alpha('#ff9800', 0.08), textAlign: 'center', height: '100%' }}>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', mb: 0.5 }}>
                        Whale Behavior
                      </Typography>
                      <Typography variant="h5" fontWeight={700} sx={{ color: '#ff9800' }}>
                        {(intelligence.advanced_signals?.accumulation_count || 0) > (intelligence.advanced_signals?.distribution_count || 0) 
                          ? 'Accumulating' 
                          : (intelligence.advanced_signals?.distribution_count || 0) > 0 ? 'Distributing' : 'Neutral'}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>
                        {intelligence.advanced_signals?.accumulation_count || 0} accum / {intelligence.advanced_signals?.distribution_count || 0} distrib
                      </Typography>
                    </Paper>
                  </Grid>
                  {/* Markets with Whale Activity */}
                  <Grid item xs={6} sm={3}>
                    <Paper sx={{ p: 2, borderRadius: 2, bgcolor: alpha('#9c27b0', 0.08), textAlign: 'center', height: '100%' }}>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', mb: 0.5 }}>
                        Whale-Active Markets
                      </Typography>
                      <Typography variant="h5" fontWeight={700} sx={{ color: '#9c27b0' }}>
                        {intelligence.markets?.filter(m => m.whale_count > 0 || m.signals?.whale_active).length || 0}
                        <Typography component="span" variant="body2" color="text.secondary"> / {intelligence.markets?.length || 0}</Typography>
                      </Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>
                        Markets with 🐳 trades
                      </Typography>
                    </Paper>
                  </Grid>
                  {/* Avg Whale Trade Size */}
                  <Grid item xs={6} sm={3}>
                    <Paper sx={{ p: 2, borderRadius: 2, bgcolor: alpha('#607d8b', 0.08), textAlign: 'center', height: '100%' }}>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', mb: 0.5 }}>
                        Avg Whale Trade
                      </Typography>
                      <Typography variant="h5" fontWeight={700}>
                        {intelligence.signals.whale_count > 0 
                          ? formatVolume((intelligence.signals.whale_volume || 0) / intelligence.signals.whale_count)
                          : '$0'}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>
                        Per whale transaction
                      </Typography>
                    </Paper>
                  </Grid>
                </Grid>
              </Stack>
            ) : (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
                <Box sx={{ opacity: 0.5, mb: 2 }}>
                  <Typography variant="h2">🐳</Typography>
                </Box>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No Whale Activity
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {intelligenceError 
                    ? `Error: ${intelligenceError}` 
                    : `No large trades detected in the last ${whaleTimeframe === 24 ? '24 hours' : whaleTimeframe === 72 ? '3 days' : '7 days'}`}
                </Typography>
              </Paper>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default EventAnalyticsPageV2;
