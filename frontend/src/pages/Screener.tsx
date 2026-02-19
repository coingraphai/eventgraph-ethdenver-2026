/**
 * Market Screener - Real Data Version
 * Professional filtering interface with live data from unified API
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
  alpha,
  useTheme,
  keyframes,
  Skeleton,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Pagination,
  Slider,
  Collapse,
  TableSortLabel,
  ButtonGroup,
} from '@mui/material';
import { 
  Search,
  Refresh,
  LocalFireDepartment,
  OpenInNew,
  FilterList,
  AccessTime,
  TrendingUp,
  TrendingDown,
  StarBorder,
  Star,
  Download,
  ViewModule,
  ViewList,
  ExpandMore,
  ExpandLess,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { 
  fetchUnifiedMarkets, 
  UnifiedMarket, 
  PlatformType, 
  CategoryType,
  SortType,
  formatVolume 
} from '../services/unifiedMarketsApi';

// Animations
const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
`;

// Platform colors
const PLATFORM_COLORS: Record<string, { primary: string; bg: string }> = {
  poly: { primary: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.1)' },
  kalshi: { primary: '#F97316', bg: 'rgba(249, 115, 22, 0.1)' },
  limitless: { primary: '#22C55E', bg: 'rgba(34, 197, 94, 0.1)' },
  opiniontrade: { primary: '#3B82F6', bg: 'rgba(59, 130, 246, 0.1)' },
};

// Platform display names
const PLATFORM_NAMES: Record<string, string> = {
  poly: 'Polymarket',
  kalshi: 'Kalshi',
  limitless: 'Limitless',
  opiniontrade: 'OpinionTrade',
};

// Category options
const CATEGORIES: { value: CategoryType; label: string }[] = [
  { value: 'all', label: 'All Categories' },
  { value: 'trending', label: '🔥 Trending' },
  { value: 'politics', label: '🏛️ Politics' },
  { value: 'crypto', label: '₿ Crypto' },
  { value: 'sports', label: '⚽ Sports' },
  { value: 'economy', label: '📈 Economy' },
  { value: 'entertainment', label: '🎬 Entertainment' },
];

// Volume filter options
const VOLUME_FILTERS = [
  { value: 0, label: 'All Volumes' },
  { value: 10000, label: '$10K+' },
  { value: 100000, label: '$100K+' },
  { value: 1000000, label: '$1M+' },
  { value: 10000000, label: '$10M+' },
];

// Sort options
const SORT_OPTIONS = [
  { value: 'volume_desc', label: '📊 Volume (High→Low)' },
  { value: 'volume_asc', label: '📉 Volume (Low→High)' },
  { value: 'price_desc', label: '💰 Price (High→Low)' },
  { value: 'price_asc', label: '💸 Price (Low→High)' },
  { value: 'ending_soon', label: '⏰ Ending Soon' },
  { value: 'newest', label: '🆕 Recently Added' },
  { value: 'change_desc', label: '📈 Most Moving (24h)' },
  { value: 'ann_roi_desc', label: '🎯 Best ROI' },
];

// Time filter options
const TIME_FILTERS = [
  { value: 'all', label: 'All Time' },
  { value: '24h', label: 'Ends in 24h' },
  { value: '7d', label: 'Ends in 7 days' },
  { value: '30d', label: 'Ends in 30 days' },
];

// Price range presets
const PRICE_PRESETS = [
  { label: 'All', range: [0, 100] },
  { label: 'Likely YES (>75%)', range: [75, 100] },
  { label: 'Uncertain (25-75%)', range: [25, 75] },
  { label: 'Likely NO (<25%)', range: [0, 25] },
];

export const Screener: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();

  // State
  const [markets, setMarkets] = useState<UnifiedMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalMarkets, setTotalMarkets] = useState(0);
  
  // Filters
  const [platform, setPlatform] = useState<PlatformType>('all');
  const [category, setCategory] = useState<CategoryType>('all');
  const [search, setSearch] = useState('');
  const [minVolume, setMinVolume] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  
  // Advanced filters
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sortBy, setSortBy] = useState('volume_desc');
  const [priceRange, setPriceRange] = useState<number[]>([0, 100]);
  const [timeFilter, setTimeFilter] = useState('all');
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'all' | 'watchlist'>('all');
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<'list' | 'grid'>('list');

  // Fetch markets
  const fetchMarkets = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetchUnifiedMarkets({
        platform,
        category,
        search: search || undefined,
        minVolume: minVolume || undefined,
        page,
        pageSize,
        status: 'open',
        sort: sortBy as SortType,
      });
      
      setMarkets(response.markets);
      setTotalMarkets(response.pagination.total);
    } catch (err) {
      console.error('Error fetching markets:', err);
      setError('Failed to load markets');
    } finally {
      setLoading(false);
    }
  }, [platform, category, search, minVolume, page, pageSize, sortBy]);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleMarketClick = (market: UnifiedMarket) => {
    // For Polymarket: navigate to event page using event_slug (groups related markets)
    // For Kalshi: use market_ticker or event_ticker (backend searches all markets)
    // For Limitless/OpinionTrade: use market id/slug
    let slug: string;
    if (market.platform === 'poly') {
      // Prefer event_slug for Polymarket (matches Events page behavior)
      slug = market.extra?.event_slug || market.extra?.market_slug || market.id;
    } else if (market.platform === 'kalshi') {
      slug = market.extra?.market_ticker || market.id;
    } else {
      slug = market.extra?.market_slug || market.id;
    }
    navigate(`/event/${market.platform}/${encodeURIComponent(slug)}`);
  };

  const formatPrice = (price: number | null) => {
    if (price === null) return '—';
    return `${(price * 100).toFixed(1)}¢`;
  };

  const formatTimeRemaining = (endTime: number | null) => {
    if (!endTime) return '—';
    const now = Date.now() / 1000;
    const diff = endTime - now;
    if (diff < 0) return 'Ended';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return `${Math.floor(diff / 604800)}w`;
  };

  const toggleWatchlist = (marketId: string) => {
    setWatchlist(prev => {
      const next = new Set(prev);
      if (next.has(marketId)) {
        next.delete(marketId);
      } else {
        next.add(marketId);
      }
      return next;
    });
  };

  const handleExport = () => {
    const csv = [
      ['Market', 'Event', 'Platform', 'Category', 'YES Price', 'NO Price', '24h Change %', 'Ann. ROI %', 'Total Volume', 'Vol 24h', 'End Time'].join(','),
      ...markets.map(m => [
        `"${m.title.replace(/"/g, '""')}"`,
        `"${(m.event_group_label || '').replace(/"/g, '""')}"`,
        m.platform,
        m.category || '',
        m.last_price ? (m.last_price * 100).toFixed(1) + '%' : '',
        m.no_price ? (m.no_price * 100).toFixed(1) + '%' : '',
        m.price_change_pct_24h != null ? m.price_change_pct_24h.toFixed(2) : '',
        m.ann_roi != null ? m.ann_roi.toFixed(1) : '',
        m.volume_total_usd || 0,
        m.volume_24h_usd || '',
        m.end_time ? new Date(m.end_time * 1000).toISOString() : '',
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prediction-markets-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const totalPages = Math.ceil(totalMarkets / pageSize);

  // Filter markets by price range, time, and smart presets (client-side)
  const filteredMarkets = markets.filter(m => {
    // Watchlist mode - only show starred markets
    if (viewMode === 'watchlist') {
      if (!watchlist.has(`${m.platform}-${m.id}`)) return false;
    }
    
    const price = (m.last_price || 0) * 100;
    if (price < priceRange[0] || price > priceRange[1]) return false;
    
    if (timeFilter !== 'all' && m.end_time) {
      const now = Date.now() / 1000;
      const diff = m.end_time - now;
      if (timeFilter === '24h' && diff > 86400) return false;
      if (timeFilter === '7d' && diff > 604800) return false;
      if (timeFilter === '30d' && diff > 2592000) return false;
    }

    // Smart preset filters
    if (activePreset) {
      const price01 = m.last_price || 0;
      const now = Date.now() / 1000;
      switch (activePreset) {
        case 'surging':
          if ((m.volume_24h_change_pct || 0) <= 100) return false;
          break;
        case 'moving':
          if (Math.abs(m.price_change_pct_24h || 0) <= 5) return false;
          break;
        case 'ending_soon':
          if (!m.end_time || (m.end_time - now) > 604800 || (m.end_time - now) <= 0) return false;
          break;
        case 'coin_flips':
          if (price01 < 0.40 || price01 > 0.60) return false;
          break;
        case 'longshots':
          if (price01 <= 0 || price01 >= 0.10) return false;
          break;
        case 'high_activity':
          if (!((m.unique_traders_24h || 0) > 10 || (m.trade_count_24h || 0) > 20 || (m.volume_24h_usd || 0) > 50000)) return false;
          break;
      }
    }
    
    return true;
  });

  return (
    <Box sx={{ 
      p: 3, 
      minHeight: '100vh',
      backgroundColor: 'background.default',
    }}>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
          Market Screener
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Filter and discover markets across {totalMarkets.toLocaleString()} prediction markets
        </Typography>
      </Box>

      {/* View Tabs */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_, val) => val && setViewMode(val)}
          size="small"
        >
          <ToggleButton value="all" sx={{ px: 3 }}>
            <ViewList sx={{ mr: 1, fontSize: 18 }} />
            Markets
          </ToggleButton>
          <ToggleButton value="watchlist" sx={{ px: 3 }}>
            <Star sx={{ mr: 1, fontSize: 18, color: watchlist.size > 0 ? '#FCD34D' : 'inherit' }} />
            Watchlist {watchlist.size > 0 && `(${watchlist.size})`}
          </ToggleButton>
        </ToggleButtonGroup>

        {/* Display Mode Toggle */}
        <ToggleButtonGroup
          value={displayMode}
          exclusive
          onChange={(_, val) => val && setDisplayMode(val)}
          size="small"
        >
          <ToggleButton value="list">
            <Tooltip title="List view">
              <ViewList sx={{ fontSize: 18 }} />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="grid">
            <Tooltip title="Grid view">
              <ViewModule sx={{ fontSize: 18 }} />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Filters */}
      <Paper 
        elevation={0}
        sx={{ 
          p: 2, 
          mb: 2, 
          borderRadius: 2,
          backgroundColor: alpha(theme.palette.background.paper, 0.6),
          backdropFilter: 'blur(10px)',
          border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          {/* Search */}
          <TextField
            placeholder="Search markets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            sx={{ minWidth: 250 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ color: 'text.secondary', fontSize: 20 }} />
                </InputAdornment>
              ),
            }}
          />

          {/* Platform Toggle - All platforms */}
          <ToggleButtonGroup
            value={platform}
            exclusive
            onChange={(_, val) => val && setPlatform(val)}
            size="small"
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="poly" sx={{ 
              '&.Mui-selected': { 
                backgroundColor: PLATFORM_COLORS.poly.bg,
                color: PLATFORM_COLORS.poly.primary,
              }
            }}>
              Polymarket
            </ToggleButton>
            <ToggleButton value="kalshi" sx={{ 
              '&.Mui-selected': { 
                backgroundColor: PLATFORM_COLORS.kalshi.bg,
                color: PLATFORM_COLORS.kalshi.primary,
              }
            }}>
              Kalshi
            </ToggleButton>
            <ToggleButton value="limitless" sx={{ 
              '&.Mui-selected': { 
                backgroundColor: PLATFORM_COLORS.limitless.bg,
                color: PLATFORM_COLORS.limitless.primary,
              }
            }}>
              Limitless
            </ToggleButton>
            <ToggleButton value="opiniontrade" sx={{ 
              '&.Mui-selected': { 
                backgroundColor: PLATFORM_COLORS.opiniontrade.bg,
                color: PLATFORM_COLORS.opiniontrade.primary,
              }
            }}>
              Opinion
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Category */}
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={category}
              label="Category"
              onChange={(e) => {
                setCategory(e.target.value as CategoryType);
                setPage(1);
              }}
            >
              {CATEGORIES.map(cat => (
                <MenuItem key={cat.value} value={cat.value}>{cat.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Sort */}
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Sort By</InputLabel>
            <Select
              value={sortBy}
              label="Sort By"
              onChange={(e) => setSortBy(e.target.value)}
            >
              {SORT_OPTIONS.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Advanced Filters Toggle */}
          <Button
            variant="outlined"
            size="small"
            startIcon={<FilterList />}
            endIcon={showAdvanced ? <ExpandLess /> : <ExpandMore />}
            onClick={() => setShowAdvanced(!showAdvanced)}
            sx={{ textTransform: 'none' }}
          >
            Filters
          </Button>

          {/* Export */}
          <Tooltip title="Export to CSV">
            <IconButton onClick={handleExport} size="small">
              <Download />
            </IconButton>
          </Tooltip>

          {/* Refresh */}
          <IconButton onClick={fetchMarkets} disabled={loading}>
            <Refresh sx={{ animation: loading ? `${pulse} 1s infinite` : 'none' }} />
          </IconButton>
        </Stack>

        {/* Advanced Filters Row */}
        <Collapse in={showAdvanced}>
          <Stack 
            direction="row" 
            spacing={3} 
            alignItems="center" 
            sx={{ mt: 2, pt: 2, borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}` }}
            flexWrap="wrap"
            useFlexGap
          >
            {/* Volume Filter */}
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>Min Volume</InputLabel>
              <Select
                value={minVolume}
                label="Min Volume"
                onChange={(e) => {
                  setMinVolume(e.target.value as number);
                  setPage(1);
                }}
              >
                {VOLUME_FILTERS.map(vol => (
                  <MenuItem key={vol.value} value={vol.value}>{vol.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Time Filter */}
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>End Time</InputLabel>
              <Select
                value={timeFilter}
                label="End Time"
                onChange={(e) => setTimeFilter(e.target.value)}
              >
                {TIME_FILTERS.map(t => (
                  <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Price Range */}
            <Box sx={{ minWidth: 200 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Price Range: {priceRange[0]}% - {priceRange[1]}%
              </Typography>
              <Slider
                value={priceRange}
                onChange={(_, val) => setPriceRange(val as number[])}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v}%`}
                min={0}
                max={100}
                size="small"
                sx={{ width: 180 }}
              />
            </Box>

            {/* Price Presets */}
            <ButtonGroup size="small" variant="outlined">
              {PRICE_PRESETS.map(preset => (
                <Button
                  key={preset.label}
                  onClick={() => setPriceRange(preset.range)}
                  sx={{ 
                    textTransform: 'none', 
                    fontSize: '0.7rem',
                    backgroundColor: priceRange[0] === preset.range[0] && priceRange[1] === preset.range[1] 
                      ? alpha(theme.palette.primary.main, 0.1) 
                      : 'transparent',
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </ButtonGroup>
          </Stack>
        </Collapse>
      </Paper>

      {/* Smart Preset Filter Chips */}
      <Box sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, fontWeight: 600 }}>
            QUICK FILTERS:
          </Typography>
          {[
            { id: 'surging',       label: '🚀 Surging',       tooltip: 'Volume up 100%+ in 24h' },
            { id: 'moving',        label: '📈 Moving',        tooltip: 'Price moved 5%+ in 24h' },
            { id: 'ending_soon',   label: '⏰ Ending Soon',   tooltip: 'Resolves within 7 days' },
            { id: 'coin_flips',    label: '🎲 Coin Flips',    tooltip: 'Price between 40–60¢ (genuine uncertainty)' },
            { id: 'longshots',     label: '🎯 Longshots',     tooltip: 'Price under 10¢ (potential 10x+)' },
            { id: 'high_activity', label: '🔥 High Activity', tooltip: 'High traders or volume in 24h' },
          ].map(preset => (
            <Tooltip key={preset.id} title={preset.tooltip}>
              <Chip
                label={preset.label}
                size="small"
                onClick={() => setActivePreset(activePreset === preset.id ? null : preset.id)}
                sx={{
                  cursor: 'pointer',
                  fontWeight: activePreset === preset.id ? 700 : 400,
                  backgroundColor: activePreset === preset.id
                    ? alpha(theme.palette.primary.main, 0.2)
                    : alpha(theme.palette.background.paper, 0.6),
                  border: `1px solid ${activePreset === preset.id
                    ? theme.palette.primary.main
                    : alpha(theme.palette.divider, 0.2)}`,
                  color: activePreset === preset.id ? theme.palette.primary.main : 'text.secondary',
                  '&:hover': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.12),
                  },
                }}
              />
            </Tooltip>
          ))}
          {activePreset && (
            <Chip
              label="✕ Clear"
              size="small"
              onClick={() => setActivePreset(null)}
              sx={{ cursor: 'pointer', color: 'text.disabled' }}
            />
          )}
        </Stack>
      </Box>

      {/* ── GRID VIEW ─────────────────────────────────────────────── */}
      {displayMode === 'grid' && (
        <Box>
          {loading ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
              {[...Array(12)].map((_, i) => (
                <Paper key={i} elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${alpha(theme.palette.divider, 0.1)}`, backgroundColor: alpha(theme.palette.background.paper, 0.6) }}>
                  <Skeleton variant="rectangular" height={100} sx={{ borderRadius: 1, mb: 1.5 }} animation="wave" />
                  <Skeleton animation="wave" height={20} sx={{ mb: 0.5 }} />
                  <Skeleton animation="wave" height={16} width="60%" sx={{ mb: 1.5 }} />
                  <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                    <Skeleton animation="wave" width={80} height={28} />
                    <Skeleton animation="wave" width={60} height={28} />
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Skeleton animation="wave" width={50} height={32} />
                    <Skeleton animation="wave" width={50} height={32} />
                  </Stack>
                </Paper>
              ))}
            </Box>
          ) : filteredMarkets.length === 0 ? (
            <Paper elevation={0} sx={{ p: 6, textAlign: 'center', borderRadius: 2, border: `1px solid ${alpha(theme.palette.divider, 0.1)}`, backgroundColor: alpha(theme.palette.background.paper, 0.6) }}>
              {viewMode === 'watchlist' ? (
                <Box>
                  <StarBorder sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary" sx={{ mb: 1 }}>Your watchlist is empty</Typography>
                  <Button variant="outlined" size="small" onClick={() => setViewMode('all')}>Browse Markets</Button>
                </Box>
              ) : (
                <Typography color="text.secondary">No markets found matching filters</Typography>
              )}
            </Paper>
          ) : (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
                {filteredMarkets.map((market, index) => {
                  const isWatched = watchlist.has(`${market.platform}-${market.id}`);
                  const pct = market.last_price != null ? market.last_price * 100 : null;
                  const noPct = market.no_price != null ? market.no_price * 100 : null;
                  const hasChange = market.price_change_pct_24h != null && market.price_change_pct_24h !== 0;
                  const nowSec = Date.now() / 1000;
                  const urgentEnd = market.end_time && (market.end_time - nowSec) < 86400 && (market.end_time - nowSec) > 0;
                  return (
                    <Paper
                      key={`${market.platform}-${market.id}`}
                      elevation={0}
                      onClick={() => handleMarketClick(market)}
                      sx={{
                        p: 0,
                        borderRadius: 2,
                        cursor: 'pointer',
                        overflow: 'hidden',
                        border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                        backgroundColor: alpha(theme.palette.background.paper, 0.6),
                        backdropFilter: 'blur(10px)',
                        animation: `${fadeInUp} 0.3s ease ${index * 0.015}s both`,
                        transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
                        '&:hover': {
                          transform: 'translateY(-2px)',
                          boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.12)}`,
                          borderColor: alpha(theme.palette.primary.main, 0.3),
                        },
                      }}
                    >
                      {/* Thin platform color bar — always */}
                      <Box sx={{
                        height: 5,
                        background: `linear-gradient(90deg, ${PLATFORM_COLORS[market.platform]?.primary || '#8B5CF6'}, ${alpha(PLATFORM_COLORS[market.platform]?.primary || '#8B5CF6', 0.25)})`,
                      }} />

                      {/* Card body */}
                      <Box sx={{ p: 1.5 }}>
                        {/* Header: platform chip + 24h badge + star */}
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                          <Chip
                            label={PLATFORM_NAMES[market.platform] || market.platform}
                            size="small"
                            sx={{ backgroundColor: PLATFORM_COLORS[market.platform]?.bg, color: PLATFORM_COLORS[market.platform]?.primary, fontWeight: 700, fontSize: '0.65rem', height: 18 }}
                          />
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            {hasChange && (
                              <Chip
                                icon={market.price_change_pct_24h! > 0 ? <TrendingUp sx={{ fontSize: 10 }} /> : <TrendingDown sx={{ fontSize: 10 }} />}
                                label={`${market.price_change_pct_24h! > 0 ? '+' : ''}${market.price_change_pct_24h!.toFixed(1)}%`}
                                size="small"
                                sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700, backgroundColor: market.price_change_pct_24h! > 0 ? alpha('#22C55E', 0.15) : alpha('#EF4444', 0.15), color: market.price_change_pct_24h! > 0 ? '#22C55E' : '#EF4444', '& .MuiChip-icon': { color: market.price_change_pct_24h! > 0 ? '#22C55E' : '#EF4444' } }}
                              />
                            )}
                            <IconButton
                              size="small"
                              onClick={e => { e.stopPropagation(); toggleWatchlist(`${market.platform}-${market.id}`); }}
                              sx={{ p: 0.25, color: isWatched ? '#FCD34D' : 'text.disabled', '&:hover': { color: '#FCD34D' } }}
                            >
                              {isWatched ? <Star sx={{ fontSize: 15 }} /> : <StarBorder sx={{ fontSize: 15 }} />}
                            </IconButton>
                          </Stack>
                        </Stack>

                        {/* Icon + text: event label primary, market title secondary */}
                        <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ mb: 1 }}>
                          {market.extra?.image && (
                            <Box
                              component="img"
                              src={market.extra.image}
                              sx={{ width: 42, height: 42, borderRadius: 1.5, objectFit: 'cover', flexShrink: 0, border: `1px solid ${alpha(theme.palette.divider, 0.15)}` }}
                            />
                          )}
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600, lineHeight: 1.35, mb: 0.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={market.event_group_label || market.title}
                            >
                              {market.event_group_label || market.title}
                            </Typography>
                            {market.event_group_label && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4, fontSize: '0.70rem' }}
                              >
                                {market.title}
                              </Typography>
                            )}
                          </Box>
                        </Stack>

                        {/* Category + Volume row */}
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.7rem' }}>
                            {market.category || '—'}
                          </Typography>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600, color: 'text.secondary', fontSize: '0.7rem' }}>
                            {formatVolume(market.volume_total_usd)}
                          </Typography>
                        </Stack>

                        {/* YES / NO price buttons */}
                        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                          <Box sx={{ flex: 1, py: 0.6, px: 1, borderRadius: 1.5, backgroundColor: alpha('#22C55E', 0.12), border: `1px solid ${alpha('#22C55E', 0.25)}`, textAlign: 'center' }}>
                            <Typography variant="caption" sx={{ color: '#22C55E', fontWeight: 700, fontSize: '0.75rem', fontFamily: 'monospace' }}>
                              YES {pct != null ? `${pct.toFixed(1)}¢` : '—'}
                            </Typography>
                          </Box>
                          <Box sx={{ flex: 1, py: 0.6, px: 1, borderRadius: 1.5, backgroundColor: alpha('#EF4444', 0.12), border: `1px solid ${alpha('#EF4444', 0.25)}`, textAlign: 'center' }}>
                            <Typography variant="caption" sx={{ color: '#EF4444', fontWeight: 700, fontSize: '0.75rem', fontFamily: 'monospace' }}>
                              NO {noPct != null ? `${noPct.toFixed(1)}¢` : pct != null ? `${(100 - pct).toFixed(1)}¢` : '—'}
                            </Typography>
                          </Box>
                        </Stack>

                        {/* Footer: Ends In + Ann ROI + Action */}
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Tooltip title={market.end_time ? new Date(market.end_time * 1000).toLocaleString() : 'No end date'}>
                            <Chip
                              icon={<AccessTime sx={{ fontSize: 11 }} />}
                              label={formatTimeRemaining(market.end_time)}
                              size="small"
                              sx={{ height: 20, fontSize: '0.65rem', backgroundColor: urgentEnd ? alpha('#EF4444', 0.1) : alpha(theme.palette.text.secondary, 0.1), color: urgentEnd ? '#EF4444' : 'text.secondary', '& .MuiChip-icon': { color: urgentEnd ? '#EF4444' : 'text.secondary' } }}
                            />
                          </Tooltip>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            {market.ann_roi != null && (
                              <Tooltip title="Annualized ROI if YES resolves">
                                <Chip
                                  label={`${market.ann_roi > 9999 ? '>9999' : market.ann_roi.toLocaleString()}% p.a.`}
                                  size="small"
                                  sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700, backgroundColor: market.ann_roi > 1000 ? alpha('#F97316', 0.15) : alpha('#22C55E', 0.15), color: market.ann_roi > 1000 ? '#F97316' : '#22C55E' }}
                                />
                              </Tooltip>
                            )}
                            <IconButton
                              size="small"
                              onClick={e => { e.stopPropagation(); handleMarketClick(market); }}
                              sx={{ p: 0.3 }}
                            >
                              <OpenInNew sx={{ fontSize: 15 }} />
                            </IconButton>
                          </Stack>
                        </Stack>
                      </Box>
                    </Paper>
                  );
                })}
              </Box>
              {/* Grid pagination */}
              {totalPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                  <Pagination count={totalPages} page={page} onChange={(_, p) => setPage(p)} color="primary" showFirstButton showLastButton />
                </Box>
              )}
            </>
          )}
        </Box>
      )}

      {/* ── LIST VIEW ─────────────────────────────────────────────── */}
      {displayMode === 'list' && (
      <Paper 
        elevation={0}
        sx={{ 
          borderRadius: 2,
          overflow: 'hidden',
          backgroundColor: alpha(theme.palette.background.paper, 0.6),
          backdropFilter: 'blur(10px)',
          border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        }}
      >
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: alpha(theme.palette.primary.main, 0.05) }}>
                <TableCell sx={{ fontWeight: 600, width: 40 }} align="center">★</TableCell>
                <TableCell sx={{ fontWeight: 600, width: '38%' }}>Market</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Platform</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Category</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">YES Price</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">NO Price</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">
                  <Tooltip title="Price change in the last 24 hours">
                    <span>24h Δ</span>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">
                  <Tooltip title="Annualized return if YES resolves: ((1-price)/price) × (365/days_left)">
                    <span>Ann. ROI</span>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Volume</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Ends In</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                // Loading skeletons
                [...Array(10)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton animation="wave" width={24} /></TableCell>
                    <TableCell><Skeleton animation="wave" /></TableCell>
                    <TableCell><Skeleton animation="wave" width={80} /></TableCell>
                    <TableCell><Skeleton animation="wave" width={60} /></TableCell>
                    <TableCell><Skeleton animation="wave" width={50} /></TableCell>
                    <TableCell><Skeleton animation="wave" width={50} /></TableCell>
                    <TableCell><Skeleton animation="wave" width={60} /></TableCell>
                    <TableCell><Skeleton animation="wave" width={60} /></TableCell>
                    <TableCell><Skeleton animation="wave" width={70} /></TableCell>
                    <TableCell><Skeleton animation="wave" width={40} /></TableCell>
                    <TableCell><Skeleton animation="wave" width={40} /></TableCell>
                  </TableRow>
                ))
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
                    <Typography color="error">{error}</Typography>
                    <Button onClick={fetchMarkets} sx={{ mt: 1 }}>Retry</Button>
                  </TableCell>
                </TableRow>
              ) : filteredMarkets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
                    {viewMode === 'watchlist' ? (
                      <Box>
                        <StarBorder sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                        <Typography color="text.secondary" sx={{ mb: 1 }}>
                          Your watchlist is empty
                        </Typography>
                        <Typography variant="body2" color="text.disabled">
                          Click the ★ icon on any market to add it to your watchlist
                        </Typography>
                        <Button 
                          variant="outlined" 
                          size="small" 
                          sx={{ mt: 2 }}
                          onClick={() => setViewMode('all')}
                        >
                          Browse Markets
                        </Button>
                      </Box>
                    ) : (
                      <Typography color="text.secondary">No markets found matching filters</Typography>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filteredMarkets.map((market, index) => (
                  <TableRow 
                    key={`${market.platform}-${market.id}`}
                    onClick={() => handleMarketClick(market)}
                    sx={{ 
                      cursor: 'pointer',
                      animation: `${fadeInUp} 0.3s ease ${index * 0.02}s both`,
                      '&:hover': { 
                        backgroundColor: alpha(theme.palette.primary.main, 0.05),
                      },
                      '&:last-child td': { borderBottom: 0 },
                    }}
                  >
                    {/* Watchlist Star */}
                    <TableCell align="center" sx={{ p: 0.5 }}>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleWatchlist(`${market.platform}-${market.id}`);
                        }}
                        sx={{ color: watchlist.has(`${market.platform}-${market.id}`) ? '#FCD34D' : 'text.disabled' }}
                      >
                        {watchlist.has(`${market.platform}-${market.id}`) ? <Star /> : <StarBorder />}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {market.extra?.image && (
                          <Box
                            component="img"
                            src={market.extra.image}
                            sx={{ 
                              width: 28, 
                              height: 28, 
                              borderRadius: 1,
                              objectFit: 'cover',
                            }}
                          />
                        )}
                        <Box>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontWeight: 600,
                              maxWidth: 400,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={market.event_group_label || market.title}
                          >
                            {market.event_group_label || market.title}
                          </Typography>
                          {market.event_group_label && (
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'text.secondary',
                                fontSize: '0.70rem',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: 320,
                                display: 'block',
                                mt: 0.15,
                              }}
                              title={market.title}
                            >
                              {market.title}
                            </Typography>
                          )}
                          {(market.volume_24h_usd || 0) > 100000 && (
                            <Chip
                              icon={<LocalFireDepartment sx={{ fontSize: 12 }} />}
                              label="Hot"
                              size="small"
                              sx={{ 
                                height: 18, 
                                fontSize: '0.65rem',
                                backgroundColor: alpha('#EF4444', 0.1),
                                color: '#EF4444',
                                '& .MuiChip-icon': { color: '#EF4444' },
                              }}
                            />
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={PLATFORM_NAMES[market.platform] || market.platform}
                        size="small"
                        sx={{
                          backgroundColor: PLATFORM_COLORS[market.platform]?.bg || PLATFORM_COLORS.poly.bg,
                          color: PLATFORM_COLORS[market.platform]?.primary || PLATFORM_COLORS.poly.primary,
                          fontWeight: 600,
                          fontSize: '0.7rem',
                        }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" color="text.secondary">
                        {market.category || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          color: (market.last_price || 0) > 0.5 ? '#22C55E' : '#EF4444',
                        }}
                      >
                        {formatPrice(market.last_price)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          color: (market.no_price || 0) > 0.5 ? '#EF4444' : '#94A3B8',
                        }}
                      >
                        {formatPrice(market.no_price)}
                      </Typography>
                    </TableCell>
                    {/* 24h Price Change */}
                    <TableCell align="right">
                      {market.price_change_pct_24h != null && market.price_change_pct_24h !== 0 ? (
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3 }}>
                          {market.price_change_pct_24h > 0
                            ? <TrendingUp sx={{ fontSize: 14, color: '#22C55E' }} />
                            : <TrendingDown sx={{ fontSize: 14, color: '#EF4444' }} />
                          }
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: 'monospace',
                              fontWeight: 600,
                              fontSize: '0.78rem',
                              color: market.price_change_pct_24h > 0 ? '#22C55E' : '#EF4444',
                            }}
                          >
                            {market.price_change_pct_24h > 0 ? '+' : ''}{market.price_change_pct_24h.toFixed(1)}%
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.disabled" sx={{ fontSize: '0.75rem' }}>—</Typography>
                      )}
                    </TableCell>
                    {/* Annualized ROI */}
                    <TableCell align="right">
                      {market.ann_roi != null ? (
                        <Tooltip title="Annualized return if YES resolves at $1">
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: 'monospace',
                              fontWeight: 600,
                              fontSize: '0.78rem',
                              color: market.ann_roi > 1000 ? '#F97316'
                                : market.ann_roi > 200 ? '#22C55E'
                                : '#94A3B8',
                            }}
                          >
                            {market.ann_roi > 9999 ? '>9,999' : market.ann_roi.toLocaleString()}%
                          </Typography>
                        </Tooltip>
                      ) : (
                        <Typography variant="body2" color="text.disabled" sx={{ fontSize: '0.75rem' }}>—</Typography>
                      )}
                    </TableCell>
                    {/* Volume */}
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {formatVolume(market.volume_total_usd)}
                      </Typography>
                      {(market.volume_24h_usd || 0) > 0 && (
                        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', fontSize: '0.65rem' }}>
                          {formatVolume(market.volume_24h_usd!)} 24h
                          {market.volume_24h_change_pct != null && market.volume_24h_change_pct !== 0 && (
                            <Box component="span" sx={{
                              ml: 0.5,
                              color: market.volume_24h_change_pct > 0 ? '#22C55E' : '#EF4444',
                            }}>
                              {market.volume_24h_change_pct > 0 ? '+' : ''}{market.volume_24h_change_pct.toFixed(0)}%
                            </Box>
                          )}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title={market.end_time ? new Date(market.end_time * 1000).toLocaleString() : 'No end date'}>
                        <Chip
                          icon={<AccessTime sx={{ fontSize: 12 }} />}
                          label={formatTimeRemaining(market.end_time)}
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: '0.7rem',
                            backgroundColor: 
                              market.end_time && (market.end_time - Date.now() / 1000) < 86400 
                                ? alpha('#EF4444', 0.1) 
                                : alpha(theme.palette.text.secondary, 0.1),
                            color: 
                              market.end_time && (market.end_time - Date.now() / 1000) < 86400 
                                ? '#EF4444' 
                                : 'text.secondary',
                            '& .MuiChip-icon': { 
                              color: market.end_time && (market.end_time - Date.now() / 1000) < 86400 
                                ? '#EF4444' 
                                : 'text.secondary' 
                            },
                          }}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Open Market">
                        <IconButton 
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarketClick(market);
                          }}
                        >
                          <OpenInNew sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        {totalPages > 1 && (
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            py: 2,
            borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
          }}>
            <Pagination
              count={totalPages}
              page={page}
              onChange={(_, p) => setPage(p)}
              color="primary"
              showFirstButton
              showLastButton
            />
          </Box>
        )}
      </Paper>
      )}

      {/* Stats Footer */}
      <Box sx={{ mt: 2, display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary">
          {viewMode === 'watchlist' 
            ? `${filteredMarkets.length} watched markets`
            : `Showing ${filteredMarkets.length} of ${totalMarkets.toLocaleString()} markets`
          }
        </Typography>
        <Typography variant="body2" color="text.secondary">•</Typography>
        <Typography variant="body2" color="text.secondary">
          ⭐ {watchlist.size} in watchlist
        </Typography>
        <Typography variant="body2" color="text.secondary">•</Typography>
        <Typography variant="body2" color="text.secondary">
          Data updates every 60s
        </Typography>
      </Box>
    </Box>
  );
};

export default Screener;
