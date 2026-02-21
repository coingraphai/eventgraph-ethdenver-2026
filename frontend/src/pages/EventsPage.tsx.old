/**
 * Events Page
 * Shows aggregated prediction market events from Polymarket, Kalshi, Limitless, and OpinionTrade
 * Events group multiple related markets together
 * Table-based layout similar to MarketsUnified for analytics/intelligence focus
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
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
  ToggleButtonGroup,
  ToggleButton,
  Pagination,
  Select,
  MenuItem,
  Menu,
  FormControl,
  InputLabel,
  Avatar,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Search,
  Refresh,
  Event as EventIcon,
  TrendingUp,
  Star,
  StarBorder,
  ZoomIn,
  Code,
  Category,
  OpenInNew,
  ViewList,
  ViewModule,
} from '@mui/icons-material';
import CircularProgress from '@mui/material/CircularProgress';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  fetchEvents,
  fetchEventsStats,
  fetchEventCategories,
  Event,
  EventPlatform,
  EventCategory,
  AggregateMetrics,
  formatVolume,
  formatEventDate,
  getPlatformName,
  getPersistedEventsPlatform,
  setPersistedEventsPlatform,
} from '../services/eventsApi';
import { fetchEventAnalytics } from '../services/eventAnalyticsApi';
import {
  getCachedEvents,
  subscribeToCacheUpdates,
  setCachedEventAnalytics,
} from '../services/globalPrefetch';
import { PLATFORM_COLORS, TRADING_COLORS } from '../utils/colors';

// Track prefetched events to avoid duplicate requests
const prefetchedEvents = new Set<string>();

// Prefetch event analytics on hover (silent background fetch)
// TEMPORARILY DISABLED: Backend cache needs to be warmed up first
const prefetchEventAnalytics = (event: Event) => {
  // Disabled to avoid 503 errors from cold cache
  return;
  
  /* Original code - uncomment when cache is warm
  const cacheKey = `${event.platform}:${event.event_id}`;
  if (prefetchedEvents.has(cacheKey)) return;
  
  prefetchedEvents.add(cacheKey);
  const platformCode = getPlatformConfig(event.platform).code;
  
  // Silent fetch - don't await, don't handle errors
  fetchEventAnalytics(platformCode, event.event_id, {
    includeTrades: true,
    maxMarkets: 50, // Use smaller max for prefetch to be faster
  }).then((data) => {
    // Store in global cache for instant access
    setCachedEventAnalytics(platformCode, event.event_id, data);
  }).catch(() => {
    // Remove from set on error so it can be retried
    prefetchedEvents.delete(cacheKey);
  });
  */
};

// Kalshi placeholder image (since Kalshi API doesn't provide images)
const KALSHI_PLACEHOLDER_IMAGE = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Kalshi_logo.svg/512px-Kalshi_logo.svg.png';

// View mode storage key
const VIEW_MODE_STORAGE_KEY = 'events_view_mode';
type ViewMode = 'table' | 'grid';

const getPersistedViewMode = (): ViewMode => {
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return stored === 'grid' ? 'grid' : 'table';
  } catch {
    return 'table';
  }
};

const setPersistedViewMode = (mode: ViewMode): void => {
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // localStorage not available
  }
};

// Platform configuration
const PLATFORM_CONFIG = {
  polymarket: { 
    label: 'Polymarket', 
    color: PLATFORM_COLORS.polymarket.primary, 
    bgColor: 'primary.main', 
    code: 'poly',
    getUrl: (eventSlug: string, marketId: string) => `https://polymarket.com/event/${eventSlug || marketId}?ref=eventgraph`,
    tooltip: 'Open on Polymarket'
  },
  kalshi: { 
    label: 'Kalshi', 
    color: PLATFORM_COLORS.kalshi.primary, 
    bgColor: 'secondary.main', 
    code: 'kalshi',
    getUrl: (_: string, marketId: string) => `https://kalshi.com/browse?search=${marketId}&ref=eventgraph`,
    tooltip: 'Open on Kalshi'
  },
  limitless: { 
    label: 'Limitless', 
    color: PLATFORM_COLORS.limitless.primary, 
    bgColor: 'success.main', 
    code: 'limitless',
    getUrl: (_: string, marketId: string) => `https://limitless.exchange/markets/${marketId}?ref=eventgraph`,
    tooltip: 'Open on Limitless'
  },
  opiniontrade: { 
    label: 'OpinionTrade', 
    color: PLATFORM_COLORS.opiniontrade.primary, 
    bgColor: 'warning.main', 
    code: 'opiniontrade',
    getUrl: (_: string, marketId: string) => `https://app.opinion.trade/detail?topicId=${marketId}&ref=eventgraph`,
    tooltip: 'Open on OpinionTrade'
  },
};

const getPlatformConfig = (platform: string) => PLATFORM_CONFIG[platform as keyof typeof PLATFORM_CONFIG] || PLATFORM_CONFIG.polymarket;

// Utility to add ref=eventgraph to any URL for affiliate tracking
const addRefParam = (url: string): string => {
  if (!url) return url;
  return `${url}${url.includes('?') ? '&' : '?'}ref=eventgraph`;
};

// ============================================================================
// Event Card Component for Grid View
// ============================================================================
interface EventCardProps {
  event: Event;
  onClick: (event: Event) => void;
}

const EventCard: React.FC<EventCardProps> = ({ event, onClick }) => {
  const theme = useTheme();
  const platformConfig = getPlatformConfig(event.platform);
  
  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        transition: 'all 0.2s ease-in-out',
        border: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
        borderRadius: 2,
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: `0 4px 16px ${alpha(theme.palette.common.black, 0.12)}`,
          borderColor: alpha(platformConfig.color, 0.4),
        },
      }}
      onClick={() => onClick(event)}
    >
      {/* Header with Icon and Title */}
      <Box sx={{ p: 2, pb: 1.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          {/* Event Icon */}
          <Box
            sx={{
              width: 52,
              height: 52,
              minWidth: 52,
              borderRadius: 1.5,
              background: event.image 
                ? `url(${event.image}) center/cover no-repeat`
                : `linear-gradient(135deg, ${alpha(platformConfig.color, 0.4)} 0%, ${alpha(platformConfig.color, 0.2)} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
            }}
          >
            {!event.image && (
              <Typography variant="h5" sx={{ color: platformConfig.color, fontWeight: 700 }}>
                {event.title?.charAt(0) || '?'}
              </Typography>
            )}
          </Box>
          
          {/* Title and Platform */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body1"
              fontWeight={600}
              sx={{
                lineHeight: 1.35,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {event.title}
            </Typography>
          </Box>
        </Stack>
      </Box>

      {/* Markets & Category Row - highlighted design */}
      <Box sx={{ px: 2, pb: 1.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          {/* Markets Count - highlighted */}
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              px: 1,
              py: 0.25,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.primary.main, 0.08),
            }}
          >
            <Typography 
              variant="caption" 
              sx={{ 
                fontWeight: 700, 
                color: theme.palette.primary.main,
              }}
            >
              {event.market_count} Markets
            </Typography>
          </Box>
          
          {/* Category - right aligned, subtle highlight */}
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              px: 1,
              py: 0.25,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.text.secondary, 0.08),
            }}
          >
            <Typography 
              variant="caption" 
              sx={{ 
                fontWeight: 500, 
                color: theme.palette.text.secondary,
              }}
            >
              {event.category}
            </Typography>
          </Box>
        </Stack>
      </Box>

      {/* Volume Stats */}
      <Box sx={{ px: 2, pb: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Total Volume
          </Typography>
          <Typography variant="body2" fontWeight={700} color="primary.main">
            {formatVolume(event.total_volume)}
          </Typography>
        </Stack>
      </Box>

      {/* Top Market - Polymarket style */}
      {event.top_market && (
        <Box 
          sx={{ 
            px: 2, 
            pb: 1.5,
            pt: 0.5,
            mx: 1.5,
            mb: 1,
            borderRadius: 1.5,
            bgcolor: alpha(theme.palette.background.default, 0.5),
            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
          }}
        >
          <Typography 
            variant="caption" 
            sx={{ 
              display: 'block',
              mb: 0.75,
              color: 'text.secondary',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {event.top_market.title?.replace(/^Will\s+/i, '').replace(/\s+win.*\?$/i, '') || 'Top Market'}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Typography variant="h6" fontWeight={700} sx={{ color: 'text.primary' }}>
              {event.top_market.yes_price ? `${Math.round(event.top_market.yes_price * 100)}%` : '—'}
            </Typography>
            <Stack direction="row" spacing={0.5}>
              <Button
                size="small"
                variant="contained"
                onClick={(e) => {
                  e.stopPropagation();
                  if (event.top_market?.source_url) window.open(addRefParam(event.top_market.source_url), '_blank');
                }}
                sx={{
                  bgcolor: TRADING_COLORS.YES,
                  color: '#fff',
                  fontWeight: 600,
                  minWidth: 55,
                  py: 0.25,
                  px: 1,
                  fontSize: '0.7rem',
                  borderRadius: 1,
                  textTransform: 'none',
                  '&:hover': { bgcolor: alpha(TRADING_COLORS.YES, 0.85) },
                }}
              >
                Yes {event.top_market.yes_price ? `${(event.top_market.yes_price * 100).toFixed(0)}¢` : ''}
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={(e) => {
                  e.stopPropagation();
                  if (event.top_market?.source_url) window.open(addRefParam(event.top_market.source_url), '_blank');
                }}
                sx={{
                  bgcolor: TRADING_COLORS.NO,
                  color: '#fff',
                  fontWeight: 600,
                  minWidth: 55,
                  py: 0.25,
                  px: 1,
                  fontSize: '0.7rem',
                  borderRadius: 1,
                  textTransform: 'none',
                  '&:hover': { bgcolor: alpha(TRADING_COLORS.NO, 0.85) },
                }}
              >
                No {event.top_market.yes_price ? `${(100 - event.top_market.yes_price * 100).toFixed(0)}¢` : ''}
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}

      {/* Date Info - End only */}
      <Box sx={{ px: 2, pb: 1.5 }}>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Typography variant="caption" color="text.secondary">Ends:</Typography>
          <Typography 
            variant="caption" 
            fontWeight={500}
            sx={{
              color: isWithin7Days(event.end_time) ? 'warning.main' : 'text.primary',
            }}
          >
            {formatExpiryDate(event.end_time)}
          </Typography>
        </Stack>
      </Box>

      {/* Footer - Platform & Link */}
      <Box 
        sx={{ 
          mt: 'auto',
          px: 2, 
          py: 1, 
          borderTop: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          bgcolor: alpha(theme.palette.background.default, 0.3),
        }}
      >
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
          Click to view details
        </Typography>
        
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Typography 
            variant="caption" 
            sx={{ 
              color: platformConfig.color, 
              fontWeight: 600,
              fontSize: '0.7rem',
            }}
          >
            {platformConfig.label}
          </Typography>
          {event.link && (
            <Tooltip title={`View on ${platformConfig.label}`}>
              <IconButton
                size="small"
                component="a"
                href={addRefParam(event.link)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                sx={{ 
                  p: 0.5,
                  color: platformConfig.color,
                  '&:hover': { bgcolor: alpha(platformConfig.color, 0.1) },
                }}
              >
                <OpenInNew sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Box>
    </Card>
  );
};


// Format date for display - matches MarketsUnified format
function formatExpiryDate(timestamp: number | null | undefined): string {
  if (!timestamp) return '—';
  try {
    const date = new Date(timestamp * 1000);
    return format(date, 'dd MMM yy');
  } catch {
    return '—';
  }
}

// Check if date is within 7 days
function isWithin7Days(timestamp: number | null | undefined): boolean {
  if (!timestamp) return false;
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffDays = (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 7;
}

export const EventsPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();

  // Get initial values from URL or localStorage
  const initialPlatform = (searchParams.get('platform') as EventPlatform) || getPersistedEventsPlatform();
  const initialCategory = searchParams.get('category') || 'all';
  const initialPage = parseInt(searchParams.get('page') || '1', 10);
  const initialSearch = searchParams.get('search') || '';

  // State
  const [platform, setPlatform] = useState<EventPlatform>(initialPlatform);
  const [category, setCategory] = useState<string>(initialCategory);
  const [page, setPage] = useState(initialPage);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEvents, setTotalEvents] = useState(0);
  const [polyCount, setPolyCount] = useState(0);
  const [kalshiCount, setKalshiCount] = useState(0);
  const [limitlessCount, setLimitlessCount] = useState(0);
  const [opiniontradeCount, setOpiniontradeCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  
  // Dynamic categories state
  const [availableCategories, setAvailableCategories] = useState<Array<{ label: string; value: string; count: number }>>([
    { label: 'All', value: 'all', count: 0 }
  ]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  
  // Aggregate metrics
  const [aggregateMetrics, setAggregateMetrics] = useState<AggregateMetrics | null>(null);

  // Raw data dialog
  const [rawDataDialogOpen, setRawDataDialogOpen] = useState(false);
  const [selectedRawData, setSelectedRawData] = useState<Event | null>(null);

  // Page size with selector - default 100 for better overview
  const [pageSize, setPageSize] = useState(100);
  const PAGE_SIZE_OPTIONS = [100, 500, 1000];

  // View mode (table or grid)
  const [viewMode, setViewMode] = useState<ViewMode>(getPersistedViewMode());

  // More categories menu anchor
  const [moreCategoriesAnchor, setMoreCategoriesAnchor] = useState<null | HTMLElement>(null);

  // Ref to track whether we're updating the URL ourselves (to prevent circular loop)
  const isUpdatingUrl = useRef(false);

  // Handle view mode change
  const handleViewModeChange = (_: React.MouseEvent<HTMLElement>, newMode: ViewMode | null) => {
    if (newMode) {
      setViewMode(newMode);
      setPersistedViewMode(newMode);
    }
  };

  // Sync URL search param → local state (handles navigation from header search bar)
  useEffect(() => {
    // Skip if we ourselves just updated the URL
    if (isUpdatingUrl.current) {
      isUpdatingUrl.current = false;
      return;
    }
    const urlSearch = searchParams.get('search') || '';
    if (urlSearch !== searchQuery) {
      setSearchQuery(urlSearch);
      setDebouncedSearch(urlSearch);
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Debounce search (for typing in the page's own search input)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (platform !== 'all') params.set('platform', platform);
    if (category !== 'all') params.set('category', category);
    if (page > 1) params.set('page', String(page));
    if (debouncedSearch) params.set('search', debouncedSearch);
    isUpdatingUrl.current = true;
    setSearchParams(params, { replace: true });
  }, [platform, category, page, debouncedSearch, setSearchParams]);

  // Persist platform preference
  useEffect(() => {
    setPersistedEventsPlatform(platform);
  }, [platform]);

  // Fetch available categories when platform changes
  useEffect(() => {
    const loadCategories = async () => {
      setCategoriesLoading(true);
      try {
        const response = await fetchEventCategories(platform);
        // Calculate total count from all categories (sum of individual counts)
        const totalCount = response.categories.reduce((sum, cat) => sum + cat.count, 0);
        const categories = [
          { label: 'All', value: 'all', count: totalCount },
          ...response.categories.map(cat => ({
            label: cat.label,
            value: cat.name,
            count: cat.count
          }))
        ];
        setAvailableCategories(categories);
        
        // If current category doesn't exist in new categories, reset to 'all'
        if (category !== 'all' && !categories.find(c => c.value === category)) {
          setCategory('all');
        }
      } catch (error) {
        console.error('Failed to fetch categories:', error);
        // Fallback to just 'All' if fetch fails
        setAvailableCategories([{ label: 'All', value: 'all', count: 0 }]);
      } finally {
        setCategoriesLoading(false);
      }
    };
    
    loadCategories();
  }, [platform]);

  // Subscribe to global cache updates
  useEffect(() => {
    const unsubscribe = subscribeToCacheUpdates(() => {
      // When global cache updates, check if we can use it
      const cachedData = getCachedEvents('all');
      if (cachedData && loading && !debouncedSearch && page === 1 && category === 'all' && platform === 'all') {
        // Use cached data for initial load
        setEvents(cachedData.events);
        setTotalEvents(cachedData.total);
        setTotalPages(cachedData.total_pages);
        setPolyCount(cachedData.platform_counts?.polymarket || 0);
        setKalshiCount(cachedData.platform_counts?.kalshi || 0);
        setLimitlessCount(cachedData.platform_counts?.limitless || 0);
        setOpiniontradeCount(cachedData.platform_counts?.opiniontrade || 0);
        setAggregateMetrics(cachedData.aggregate_metrics || null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, [loading, debouncedSearch, page, category, platform]);

  // Load overview stats independently (instant from backend cache)
  const loadStats = useCallback(async (forceRefresh: boolean = false) => {
    try {
      console.log(`📊 [EventsPage] Loading stats... (forceRefresh=${forceRefresh})`);
      const stats = await fetchEventsStats(forceRefresh);
      console.log(`📊 [EventsPage] Stats loaded in ${stats.response_time_ms}ms (${stats.cache_status})`, stats);
      
      // Update overview card data from stats
      setTotalEvents(stats.total_events);
      setPolyCount(stats.platform_counts?.polymarket || 0);
      setKalshiCount(stats.platform_counts?.kalshi || 0);
      setLimitlessCount(stats.platform_counts?.limitless || 0);
      setOpiniontradeCount(stats.platform_counts?.opiniontrade || 0);
      
      // Build aggregateMetrics from stats response
      const am = stats.aggregate_metrics || {};
      setAggregateMetrics({
        total_events: stats.total_events,
        total_markets: stats.total_markets,
        total_volume: stats.total_volume,
        volume_24h: am.volume_24h || 0,
        volume_1_week: am.volume_1_week || 0,
        avg_markets_per_event: stats.total_events > 0 ? stats.total_markets / stats.total_events : 0,
        avg_volume_per_event: stats.avg_per_event || 0,
        polymarket_markets: am.polymarket_markets || 0,
        polymarket_volume: am.polymarket_volume || 0,
        kalshi_markets: am.kalshi_markets || 0,
        kalshi_volume: am.kalshi_volume || 0,
        limitless_markets: am.limitless_markets || 0,
        limitless_volume: am.limitless_volume || 0,
        opiniontrade_markets: am.opiniontrade_markets || 0,
        opiniontrade_volume: am.opiniontrade_volume || 0,
      });
      
      if (stats.force_refresh_rejected) {
        const mins = Math.ceil((stats.force_refresh_available_in_seconds || 0) / 60);
        console.log(`🛡️ Force refresh rejected - try again in ${mins} min`);
      }
      
      return stats;
    } catch (err) {
      console.error('📊 [EventsPage] Stats load failed:', err);
      return null;
    }
  }, []);

  // Load stats on mount (instant from backend merged cache)
  useEffect(() => {
    if (platform === 'all') {
      loadStats();
    }
  }, [loadStats, platform]);

  // Fetch events - check global cache first for instant load
  const loadEvents = useCallback(async () => {
    // Check global cache first for instant load (only for default filters)
    if (!debouncedSearch && page === 1 && category === 'all' && platform === 'all') {
      const cachedData = getCachedEvents('all');
      if (cachedData) {
        console.log('⚡ [EventsPage] Instant load from global cache!');
        setEvents(cachedData.events);
        setTotalEvents(cachedData.total);
        setTotalPages(cachedData.total_pages);
        setPolyCount(cachedData.platform_counts?.polymarket || 0);
        setKalshiCount(cachedData.platform_counts?.kalshi || 0);
        setLimitlessCount(cachedData.platform_counts?.limitless || 0);
        setOpiniontradeCount(cachedData.platform_counts?.opiniontrade || 0);
        setAggregateMetrics(cachedData.aggregate_metrics || null);
        setLoading(false);
        return; // Use cached data, no need to fetch
      }
    }

    // Always proceed with loading - don't wait indefinitely for global prefetch
    setLoading(true);
    setError(null);

    try {
      const response = await fetchEvents({
        platform,
        category,
        search: debouncedSearch || undefined,
        page,
        pageSize,
        status: 'open',
      });

      setEvents(response.events);
      setTotalEvents(response.total);
      setTotalPages(response.total_pages);
      setPolyCount(response.platform_counts?.polymarket || 0);
      setKalshiCount(response.platform_counts?.kalshi || 0);
      setLimitlessCount(response.platform_counts?.limitless || 0);
      setOpiniontradeCount(response.platform_counts?.opiniontrade || 0);
      setAggregateMetrics(response.aggregate_metrics || null);
      setLoading(false);
      setRefreshing(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load events';
      
      // If cache is warming up or server temporarily unavailable, silently retry with skeleton
      if (errorMessage.includes('warming up') || errorMessage.includes('503') || errorMessage.includes('unavailable')) {
        // Keep loading state true (skeleton will show), retry silently after 3 seconds
        setTimeout(() => loadEvents(), 3000);
        return; // Don't set error or setLoading(false), keep skeleton showing
      } else {
        setError(errorMessage);
        setEvents([]);
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [platform, category, page, pageSize, debouncedSearch]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Handlers
  const handlePlatformChange = (_: React.MouseEvent<HTMLElement>, newPlatform: EventPlatform | null) => {
    if (newPlatform) {
      setPlatform(newPlatform);
      setPage(1);
    }
  };

  const handleCategoryChange = (_: React.SyntheticEvent, newValue: number) => {
    setCategory(availableCategories[newValue].value);
    setPage(1);
  };

  const handleEventClick = (event: Event) => {
    const platformCode = getPlatformConfig(event.platform).code;
    navigate(`/event/${platformCode}/${encodeURIComponent(event.event_id)}`);
  };

  const handlePageChange = (_: React.ChangeEvent<unknown>, newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRefresh = async () => {
    if (refreshing) return; // Debounce
    setRefreshing(true);
    
    try {
      // Force refresh stats (backend rejects if <15 min old)
      const stats = await loadStats(true);
      
      if (stats?.force_refresh_rejected) {
        const mins = Math.ceil((stats.force_refresh_available_in_seconds || 0) / 60);
        console.log(`🛡️ [EventsPage] Refresh rejected - data is fresh. Try again in ${mins} min`);
        // Data is already showing from cache, just notify user
      }
      
      // Also reload table data
      await loadEvents();
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const selectedTabIndex = availableCategories.findIndex((t) => t.value === category);

  return (
    <Box sx={{ minHeight: 'calc(100vh - 56px)' }}>
      {/* ============================================ */}
      {/* HERO METRICS SECTION */}
      {/* ============================================ */}
      <Box
        sx={{
          px: { xs: 2, sm: 3 },
          py: 3,
          background: `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.03)} 0%, transparent 100%)`,
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.06)}`,
        }}
      >
        {/* Hero Stats - Dynamic based on selected platform */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {(() => {
            // Get platform-specific data
            const getPlatformStats = () => {
              const platformIcons: Record<string, { icon: string; name: string; color: string }> = {
                polymarket: { icon: '🔮', name: 'Polymarket', color: '#87CEEB' },
                kalshi: { icon: '📊', name: 'Kalshi', color: '#CE93D8' },
                limitless: { icon: '∞', name: 'Limitless', color: '#4ADE80' },
                opiniontrade: { icon: '💬', name: 'OpinionTrade', color: '#FB923C' },
              };

              if (platform === 'all') {
                // Aggregate stats for ALL platforms
                return [
                  { 
                    label: 'Total Events', 
                    value: aggregateMetrics?.total_events || totalEvents,
                    format: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toString(),
                    color: theme.palette.primary.main,
                    subtitle: 'Across all platforms'
                  },
                  { 
                    label: 'Total Markets', 
                    value: aggregateMetrics?.total_markets || 0,
                    format: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toString(),
                    color: '#60A5FA',
                    subtitle: 'Trading contracts'
                  },
                  { 
                    label: 'Combined Volume', 
                    value: aggregateMetrics?.total_volume || 0,
                    format: (v: number) => v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${(v / 1000).toFixed(0)}K`,
                    color: '#22C55E',
                    subtitle: 'All-time volume'
                  },
                  { 
                    label: 'Avg per Event', 
                    value: aggregateMetrics?.total_events ? (aggregateMetrics?.total_volume || 0) / aggregateMetrics.total_events : 0,
                    format: (v: number) => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1000).toFixed(0)}K` : `$${v.toFixed(0)}`,
                    color: '#F59E0B',
                    subtitle: 'Average volume'
                  },
                ];
              } else {
                // Platform-specific stats - use aggregateMetrics directly from API
                const p = platformIcons[platform] || platformIcons.polymarket;
                const platformEvents = aggregateMetrics?.total_events || totalEvents;
                const platformMarkets = aggregateMetrics?.total_markets || totalEvents;
                const platformVolume = aggregateMetrics?.total_volume || 0;
                const avgPerEvent = platformEvents > 0 ? platformVolume / platformEvents : 0;
                
                return [
                  { 
                    label: `${p.icon} ${p.name} Events`, 
                    value: platformEvents,
                    format: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toLocaleString(),
                    color: p.color,
                    subtitle: 'Active events'
                  },
                  { 
                    label: 'Total Markets', 
                    value: platformMarkets,
                    format: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toLocaleString(),
                    color: '#60A5FA',
                    subtitle: 'Trading contracts'
                  },
                  { 
                    label: 'Total Volume', 
                    value: platformVolume,
                    format: (v: number) => v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}K`,
                    color: '#22C55E',
                    subtitle: 'All-time volume'
                  },
                  { 
                    label: 'Avg per Event', 
                    value: avgPerEvent,
                    format: (v: number) => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1000).toFixed(0)}K` : `$${v.toFixed(0)}`,
                    color: '#F59E0B',
                    subtitle: 'Average volume'
                  },
                ];
              }
            };

            return getPlatformStats().map((stat) => (
              <Grid item xs={6} md={3} key={stat.label}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    borderRadius: 2,
                    background: alpha(theme.palette.background.paper, 0.5),
                    border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
                    backdropFilter: 'blur(10px)',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      borderColor: alpha(stat.color, 0.3),
                      transform: 'translateY(-2px)',
                    },
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {stat.label}
                  </Typography>
                  <Typography
                    variant="h4"
                    sx={{
                      fontWeight: 800,
                      color: stat.color,
                      fontFamily: '"SF Mono", monospace',
                      letterSpacing: '-0.02em',
                      my: 0.5,
                    }}
                  >
                    {loading ? '—' : stat.format(stat.value)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                    {stat.subtitle}
                  </Typography>
                </Paper>
              </Grid>
            ));
          })()}
        </Grid>

        {/* Unified Filter Bar */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: 2,
            background: alpha(theme.palette.background.paper, 0.6),
            border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
            backdropFilter: 'blur(10px)',
          }}
        >
          <Stack 
            direction={{ xs: 'column', md: 'row' }} 
            spacing={2} 
            alignItems={{ xs: 'stretch', md: 'center' }}
            justifyContent="space-between"
          >
            {/* Left: Platform Pills */}
            <Stack direction="row" spacing={0.75} flexWrap="wrap">
              {[
                { value: 'all', label: 'All Platforms', count: totalEvents },
                { value: 'polymarket', label: 'Polymarket', count: polyCount, color: '#87CEEB' },
                { value: 'kalshi', label: 'Kalshi', count: kalshiCount, color: '#CE93D8' },
                { value: 'limitless', label: 'Limitless', count: limitlessCount, color: '#90EE90' },
                { value: 'opiniontrade', label: 'OpinionTrade', count: opiniontradeCount, color: '#FFA500' },
              ].map((p) => (
                <Chip
                  key={p.value}
                  label={p.label}
                  size="small"
                  onClick={() => { setPlatform(p.value as EventPlatform); setPage(1); }}
                  sx={{
                    height: 32,
                    fontSize: '0.8rem',
                    fontWeight: platform === p.value ? 600 : 500,
                    bgcolor: platform === p.value 
                      ? alpha(p.color || theme.palette.primary.main, 0.2)
                      : 'transparent',
                    color: platform === p.value 
                      ? (p.color || 'primary.main')
                      : 'text.secondary',
                    border: `1px solid ${platform === p.value 
                      ? alpha(p.color || theme.palette.primary.main, 0.5)
                      : alpha(theme.palette.divider, 0.2)}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      bgcolor: alpha(p.color || theme.palette.primary.main, 0.1),
                      borderColor: alpha(p.color || theme.palette.primary.main, 0.4),
                    },
                  }}
                />
              ))}
            </Stack>

            {/* Right: View Toggle + Refresh */}
            <Stack direction="row" spacing={1.5} alignItems="center">
              {/* View Mode Toggle */}
              <ToggleButtonGroup
                value={viewMode}
                exclusive
                onChange={handleViewModeChange}
                size="small"
                sx={{
                  '& .MuiToggleButton-root': {
                    border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
                    px: 1.5,
                    '&.Mui-selected': {
                      bgcolor: alpha(theme.palette.primary.main, 0.15),
                      color: 'primary.main',
                      borderColor: alpha(theme.palette.primary.main, 0.3),
                    },
                  },
                }}
              >
                <ToggleButton value="table"><ViewList sx={{ fontSize: 18 }} /></ToggleButton>
                <ToggleButton value="grid"><ViewModule sx={{ fontSize: 18 }} /></ToggleButton>
              </ToggleButtonGroup>

              {/* Refresh */}
              <Tooltip title="Refresh data">
                <IconButton 
                  onClick={handleRefresh} 
                  disabled={refreshing}
                  size="small"
                  sx={{
                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.15) },
                  }}
                >
                  <Refresh sx={{ fontSize: 18, animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
        </Paper>
      </Box>

      {/* Main Content */}
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 2 }}>
        {/* Category Tabs - Above the table like reference design */}
        <Box 
          sx={{ 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 2,
            gap: 2,
          }}
        >
          {/* Scrollable Category Tabs */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              overflowX: 'auto',
              flex: 1,
              pb: 1,
              '&::-webkit-scrollbar': { height: 0 },
            }}
          >
            {availableCategories.slice(0, 11).map((cat) => (
              <Box
                key={cat.value}
                onClick={() => { setCategory(cat.value); setPage(1); }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  px: 1.5,
                  py: 0.75,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  borderBottom: category === cat.value 
                    ? `2px solid ${theme.palette.primary.main}` 
                    : '2px solid transparent',
                  color: category === cat.value ? 'text.primary' : 'text.secondary',
                  fontWeight: category === cat.value ? 600 : 400,
                  fontSize: '0.875rem',
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    color: 'text.primary',
                  },
                }}
              >
                <span>{cat.label}</span>
                {cat.count > 0 && (
                  <Box
                    component="span"
                    sx={{
                      px: 0.75,
                      py: 0.25,
                      fontSize: '0.7rem',
                      fontWeight: 500,
                      borderRadius: 1,
                      bgcolor: category === cat.value 
                        ? alpha(theme.palette.primary.main, 0.15)
                        : alpha(theme.palette.divider, 0.15),
                      color: category === cat.value 
                        ? 'primary.main'
                        : 'text.secondary',
                    }}
                  >
                    {cat.count >= 1000 ? `${(cat.count / 1000).toFixed(0)}K` : cat.count}
                  </Box>
                )}
              </Box>
            ))}
            {availableCategories.length > 11 && (
              <>
                <Box
                  onClick={(e) => setMoreCategoriesAnchor(e.currentTarget)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 1.5,
                    py: 0.75,
                    ml: 1,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    borderRadius: 2,
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                    color: 'primary.main',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      bgcolor: alpha(theme.palette.primary.main, 0.2),
                      borderColor: alpha(theme.palette.primary.main, 0.5),
                    },
                  }}
                >
                  <span>More</span>
                  <Box
                    component="span"
                    sx={{
                      px: 0.6,
                      py: 0.15,
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      borderRadius: 0.75,
                      bgcolor: 'primary.main',
                      color: 'white',
                    }}
                  >
                    +{availableCategories.length - 11}
                  </Box>
                </Box>
                <Menu
                  anchorEl={moreCategoriesAnchor}
                  open={Boolean(moreCategoriesAnchor)}
                  onClose={() => setMoreCategoriesAnchor(null)}
                  PaperProps={{
                    sx: {
                      maxHeight: 300,
                      minWidth: 200,
                    }
                  }}
                >
                  {availableCategories.slice(11).map((cat) => (
                    <MenuItem
                      key={cat.value}
                      onClick={() => {
                        setCategory(cat.value);
                        setPage(1);
                        setMoreCategoriesAnchor(null);
                      }}
                      selected={category === cat.value}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                        <span>{cat.label}</span>
                        {cat.count > 0 && (
                          <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                            {cat.count}
                          </Typography>
                        )}
                      </Box>
                    </MenuItem>
                  ))}
                </Menu>
              </>
            )}
          </Box>
        </Box>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {/* Events Content */}
        <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2, border: `1px solid ${alpha(theme.palette.divider, 0.08)}` }}>

        {/* Conditional View: Grid or Table */}
        {viewMode === 'grid' ? (
          /* Grid View */
          <Box sx={{ p: 2 }}>
            {loading && !refreshing ? (
              <Grid container spacing={2}>
                {Array.from({ length: 12 }).map((_, index) => (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={index}>
                    <Card sx={{ height: 340 }}>
                      <Skeleton variant="rectangular" height={140} />
                      <CardContent>
                        <Skeleton variant="text" width="80%" height={28} />
                        <Skeleton variant="text" width="40%" height={20} sx={{ mt: 1 }} />
                        <Skeleton variant="text" width="60%" height={20} sx={{ mt: 2 }} />
                        <Skeleton variant="text" width="50%" height={20} />
                        <Skeleton variant="text" width="70%" height={20} />
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            ) : events.length === 0 ? (
              <Box sx={{ py: 8, textAlign: 'center' }}>
                <Category sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h6" color="text.secondary">
                  No events found matching your criteria
                </Typography>
              </Box>
            ) : (
              <Grid container spacing={2}>
                {events.map((event) => (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={`${event.platform}-${event.event_id}`}>
                    <EventCard
                      event={event}
                      onClick={handleEventClick}
                    />
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        ) : (
          /* Table View */
          <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Title</TableCell>
                <TableCell align="center" width={80}>Platform</TableCell>
                <TableCell align="center" width={100}>Category</TableCell>
                <TableCell align="center" width={80}>Markets</TableCell>
                <TableCell align="right" width={140}>
                  <Typography variant="subtitle2" fontWeight={700}>Volume</Typography>
                </TableCell>
                <TableCell align="center" width={100} sx={{ whiteSpace: 'nowrap' }}>Start</TableCell>
                <TableCell align="center" width={100} sx={{ whiteSpace: 'nowrap' }}>End</TableCell>
                <TableCell align="center" width={70}>Status</TableCell>
                <TableCell align="center" width={60}>Link</TableCell>
                <TableCell align="center" width={70}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && !refreshing ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell><Skeleton variant="text" width="80%" /></TableCell>
                    <TableCell><Skeleton variant="text" width={60} /></TableCell>
                    <TableCell><Skeleton variant="text" width={80} /></TableCell>
                    <TableCell><Skeleton variant="text" width={40} /></TableCell>
                    <TableCell><Skeleton variant="text" width={100} /></TableCell>
                    <TableCell><Skeleton variant="text" width={80} /></TableCell>
                    <TableCell><Skeleton variant="text" width={80} /></TableCell>
                    <TableCell><Skeleton variant="text" width={50} /></TableCell>
                    <TableCell><Skeleton variant="circular" width={24} height={24} /></TableCell>
                    <TableCell><Skeleton variant="text" width={50} /></TableCell>
                  </TableRow>
                ))
              ) : events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    <Category sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      No events found matching your criteria
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                events.map((event) => (
                  <TableRow
                    key={`${event.platform}-${event.event_id}`}
                    hover
                    sx={{
                      cursor: 'pointer',
                      '&:hover': {
                        backgroundColor: 'action.hover',
                      },
                    }}
                    onClick={() => handleEventClick(event)}
                    onMouseEnter={() => prefetchEventAnalytics(event)}
                  >
                    <TableCell sx={{ py: 0.75, px: 1.5 }}>
                      <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Avatar
                          src={event.image || (event.platform === 'kalshi' ? KALSHI_PLACEHOLDER_IMAGE : undefined)}
                          alt={event.title}
                          variant="rounded"
                          sx={{ 
                            width: 32, 
                            height: 32,
                            bgcolor: getPlatformConfig(event.platform).bgColor,
                          }}
                        >
                          {event.title.charAt(0).toUpperCase()}
                        </Avatar>
                        <Tooltip
                          title={
                            <Box sx={{ p: 1, maxWidth: 400 }}>
                              <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5, lineHeight: 1.4 }}>
                                {event.title}
                              </Typography>
                              <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
                                <Chip
                                  label={getPlatformConfig(event.platform).label}
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '0.65rem',
                                    bgcolor: alpha(getPlatformConfig(event.platform).color, 0.2),
                                    color: getPlatformConfig(event.platform).color,
                                  }}
                                />
                                <Chip
                                  label={event.category}
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '0.65rem',
                                    bgcolor: alpha(theme.palette.text.primary, 0.1),
                                    color: theme.palette.text.secondary,
                                  }}
                                />
                                <Chip
                                  label={`${event.market_count} markets`}
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '0.65rem',
                                    bgcolor: 'rgba(76, 175, 80, 0.2)',
                                    color: '#81c784',
                                  }}
                                />
                              </Stack>
                              <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'grey.400' }}>
                                Volume: {formatVolume(event.total_volume)}
                              </Typography>
                            </Box>
                          }
                          arrow
                          placement="right"
                          enterDelay={200}
                          leaveDelay={100}
                          slotProps={{
                            tooltip: {
                              sx: {
                                bgcolor: alpha(theme.palette.background.paper, 0.98),
                                border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                                boxShadow: `0 4px 20px ${alpha(theme.palette.common.black, 0.2)}`,
                                borderRadius: 2,
                                '& .MuiTooltip-arrow': {
                                  color: alpha(theme.palette.background.paper, 0.98),
                                },
                              },
                            },
                          }}
                        >
                          <Typography variant="body2" fontWeight={600} sx={{ 
                            maxWidth: 350,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                            '&:hover': {
                              color: theme.palette.primary.main,
                            },
                          }}>
                            {event.title.length > 55 ? `${event.title.substring(0, 55)}...` : event.title}
                          </Typography>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                    <TableCell align="center" sx={{ py: 0.75, px: 1 }}>
                      <Chip
                        label={getPlatformConfig(event.platform).label}
                        size="small"
                        sx={{
                          bgcolor: alpha(getPlatformConfig(event.platform).color, 0.2),
                          color: getPlatformConfig(event.platform).color,
                          height: 22,
                        }}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ py: 0.75, px: 1 }}>
                      <Chip
                        label={event.category}
                        size="small"
                        variant="outlined"
                        sx={{ height: 22 }}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ py: 0.75, px: 1 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {event.market_count}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.75, px: 1.5 }}>
                      <Typography 
                        variant="body2" 
                        fontWeight={700}
                        sx={{ 
                          fontSize: '0.9rem',
                          color: 'primary.main',
                        }}
                      >
                        {formatVolume(event.total_volume)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ py: 0.75, px: 1, whiteSpace: 'nowrap' }}>
                      <Typography 
                        variant="body2"
                        sx={{
                          fontSize: '0.85rem',
                          ...(isWithin7Days(event.start_time) && {
                            color: 'warning.main',
                            fontWeight: 600,
                          }),
                        }}
                      >
                        {formatExpiryDate(event.start_time)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ py: 0.75, px: 1, whiteSpace: 'nowrap' }}>
                      <Typography 
                        variant="body2"
                        sx={{
                          fontSize: '0.85rem',
                          ...(isWithin7Days(event.end_time) && {
                            color: 'warning.main',
                            fontWeight: 600,
                          }),
                        }}
                      >
                        {formatExpiryDate(event.end_time)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ py: 0.75, px: 1 }}>
                      <Chip
                        label={event.status}
                        size="small"
                        color={event.status === 'open' ? 'success' : 'default'}
                        variant="outlined"
                        sx={{ height: 22 }}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ py: 0.75, px: 1 }} onClick={(e) => e.stopPropagation()}>
                      {event.link ? (
                        <Tooltip title={getPlatformConfig(event.platform).tooltip}>
                          <IconButton
                            size="small"
                            component="a"
                            href={addRefParam(event.link)}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ color: getPlatformConfig(event.platform).bgColor }}
                          >
                            <OpenInNew fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Typography variant="body2" color="text.secondary">—</Typography>
                      )}
                    </TableCell>
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      <Stack direction="row" spacing={0} justifyContent="center">
                        <Tooltip title="View JSON data">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setSelectedRawData(event);
                              setRawDataDialogOpen(true);
                            }}
                          >
                            <Code fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Analyze event">
                          <IconButton
                            size="small"
                            onClick={() => handleEventClick(event)}
                          >
                            <ZoomIn fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        )}

        {/* Pagination */}
        {!loading && events.length > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 3, borderTop: 1, borderColor: 'divider' }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="body2" color="text.secondary">
                Page {page} of {totalPages} ({totalEvents} events)
              </Typography>
              <FormControl size="small" sx={{ minWidth: 80 }}>
                <Select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  sx={{ height: 32, fontSize: '0.875rem' }}
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <MenuItem key={size} value={size}>
                      {size}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography variant="body2" color="text.secondary">
                per page
              </Typography>
            </Stack>
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
      </Box>

      {/* Raw Data Dialog */}
      <Dialog
        open={rawDataDialogOpen}
        onClose={() => setRawDataDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Raw Event Data
          {selectedRawData && (
            <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
              {getPlatformName(selectedRawData.platform)} - {selectedRawData.title}
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
              if (selectedRawData) {
                navigator.clipboard.writeText(JSON.stringify(selectedRawData, null, 2));
              }
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

export default EventsPage;
