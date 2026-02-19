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
        sort: 'volume_desc',
      });
      
      setMarkets(response.markets);
      setTotalMarkets(response.pagination.total);
    } catch (err) {
      console.error('Error fetching markets:', err);
      setError('Failed to load markets');
    } finally {
      setLoading(false);
    }
  }, [platform, category, search, minVolume, page, pageSize]);

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
      ['Market', 'Platform', 'Category', 'YES Price', 'Total Volume', 'End Time'].join(','),
      ...markets.map(m => [
        `"${m.title.replace(/"/g, '""')}"`,
        m.platform,
        m.category || '',
        m.last_price ? (m.last_price * 100).toFixed(1) + '%' : '',
        m.volume_total_usd || 0,
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

  // Filter markets by price range and time (client-side)
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
      <Box sx={{ mb: 2 }}>
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

      {/* Results Table */}
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
                <TableCell sx={{ fontWeight: 600, width: '40%' }}>Market</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Platform</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Category</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">YES Price</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Total Volume</TableCell>
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
                    <TableCell><Skeleton animation="wave" width={70} /></TableCell>
                    <TableCell><Skeleton animation="wave" width={40} /></TableCell>
                    <TableCell><Skeleton animation="wave" width={40} /></TableCell>
                  </TableRow>
                ))
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography color="error">{error}</Typography>
                    <Button onClick={fetchMarkets} sx={{ mt: 1 }}>Retry</Button>
                  </TableCell>
                </TableRow>
              ) : filteredMarkets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
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
                              fontWeight: 500,
                              maxWidth: 400,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {market.title}
                          </Typography>
                          {market.event_group_label && (
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'text.secondary',
                                fontSize: '0.65rem',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: 220,
                                display: 'block',
                                mt: 0.2,
                              }}
                              title={market.event_group_label}
                            >
                              📂 {market.event_group_label}
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
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {formatVolume(market.volume_total_usd)}
                      </Typography>
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
