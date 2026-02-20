/**
 * Arbitrage Scanner - Multi-Platform Version
 * Cross-venue price comparison across 4 prediction markets
 * Polymarket, Kalshi, Limitless, OpinionTrade
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  alpha,
  useTheme,
  keyframes,
  Skeleton,
  IconButton,
  Button,
  Grid,
  Tooltip,
  LinearProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
  Alert,
} from '@mui/material';
import { 
  Refresh,
  TrendingUp,
  Warning,
  OpenInNew,
  LocalFireDepartment,
  FilterList,
  Timeline,
  CompareArrows,
  ShowChart,
  NotificationsActive,
  Speed,
  CheckCircle,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { 
  UnifiedMarket,
  formatVolume 
} from '../services/unifiedMarketsApi';
import { PLATFORM_COLORS as CENTRALIZED_PLATFORM_COLORS, TRADING_COLORS, CHART_COLORS } from '../utils/colors';

// Animations
const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
`;

const glow = keyframes`
  0%, 100% { box-shadow: 0 0 5px ${TRADING_COLORS.YES_BG}; }
  50% { box-shadow: 0 0 20px rgba(34, 197, 94, 0.6); }
`;

// Map backend platform keys to centralized color keys
const PLATFORM_KEY_MAP: Record<string, keyof typeof CENTRALIZED_PLATFORM_COLORS> = {
  poly: 'polymarket',
  polymarket: 'polymarket',
  kalshi: 'kalshi',
  limitless: 'limitless',
  opiniontrade: 'opiniontrade',
};

// Helper to get platform color info from backend key
const getPlatformInfo = (platformKey: string) => {
  const colorKey = PLATFORM_KEY_MAP[platformKey] || 'polymarket';
  const colors = CENTRALIZED_PLATFORM_COLORS[colorKey];
  return {
    primary: colors.primary,
    bg: colors.bg,
    name: colors.label,
  };
};

// Helper function to generate proper trading URLs with ref parameter
const getPlatformTradeUrl = (platform: string, market: UnifiedMarket): string => {
  const marketSlug = market.extra?.market_slug || market.id;
  
  switch (platform) {
    case 'poly':
      // Polymarket: use condition_id for direct event links
      // Market IDs from arbitrage API are condition_ids (hex strings)
      if (marketSlug && marketSlug.startsWith('0x')) {
        // It's a condition_id - try to extract event slug or use search
        // Polymarket event URLs are complex, best to search by title for now
        return `https://polymarket.com/search?query=${encodeURIComponent(market.title)}&ref=eventgraph`;
      } else if (marketSlug && marketSlug.includes('-')) {
        // It's a market_slug - link to event page
        return `https://polymarket.com/event/${marketSlug}?ref=eventgraph`;
      } else {
        // Fallback to search
        return `https://polymarket.com/search?query=${encodeURIComponent(market.title)}&ref=eventgraph`;
      }
    case 'kalshi':
      // Kalshi: use market_ticker for trade page
      // Format: https://kalshi.com/trade/{market_ticker}
      // The market_ticker format is like "KXCABOUT-29DB" (short, uppercase)
      const ticker = marketSlug.toUpperCase();
      if (ticker && ticker.length < 50) {  // Market tickers are short
        return `https://kalshi.com/trade/${encodeURIComponent(ticker)}`;
      } else {
        // Fallback: search by title
        return `https://kalshi.com/browse?search=${encodeURIComponent(market.title)}`;
      }
    default:
      return '#';
  }
};

interface ArbitrageOpportunity {
  id: string;
  title: string;
  markets: Map<string, UnifiedMarket>; // platform -> market
  bestBuy: { platform: string; price: number };
  bestSell: { platform: string; price: number };
  spread: number;
  spreadPercent: number;
  profitPotential: number;
  confidence: 'high' | 'medium' | 'low';
  matchScore: number;
  avgVolume: number;
  // Execution feasibility
  feasibilityScore: number;
  feasibilityLabel: 'excellent' | 'good' | 'fair' | 'poor';
  minSideVolume: number;
  estimatedSlippage: number;
  // Strategy explanation
  strategySummary: string;
  strategySteps: string[];
}

// Advanced title similarity using word matching and normalization
function calculateSimilarity(title1: string, title2: string): number {
  const normalize = (str: string) => {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };
  
  const t1 = normalize(title1);
  const t2 = normalize(title2);
  
  // Exact match
  if (t1 === t2) return 1.0;
  
  // Word-based matching with more flexible criteria
  const words1 = t1.split(/\s+/).filter(w => w.length > 2);
  const words2 = t2.split(/\s+/).filter(w => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  let exactMatches = 0;
  let partialMatches = 0;
  let totalWords = Math.max(words1.length, words2.length);
  
  for (const word of words1) {
    const exactMatch = words2.some(w => w === word);
    const partialMatch = words2.some(w => w.includes(word) || word.includes(w));
    
    if (exactMatch) {
      exactMatches++;
    } else if (partialMatch) {
      partialMatches += 0.5; // Half credit for partial matches
    }
  }
  
  const wordScore = (exactMatches + partialMatches) / totalWords;
  
  // Substring matching boost for similar phrasing
  if (t1.includes(t2) || t2.includes(t1)) {
    return Math.max(wordScore, 0.8);
  }
  
  // Boost score if significant words match (>60% of meaningful content)
  const significantWords = Math.min(words1.length, words2.length);
  if (exactMatches >= significantWords * 0.6) {
    return Math.max(wordScore, 0.75);
  }
  
  return wordScore;
}

export const Arbitrage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  
  // State — raw data from API (fetched once, filtered/sorted client-side)
  const [rawOpportunities, setRawOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [minSpread, setMinSpread] = useState(1); // Minimum spread percentage - lowered to 1%
  const [minMatchScore, setMinMatchScore] = useState(0.20); // Minimum match confidence - 20%
  const [sortBy, setSortBy] = useState<'spread' | 'profit' | 'volume'>('spread');
  const [rawStats, setRawStats] = useState({
    totalOpportunities: 0,
    avgSpread: 0,
    totalPotential: 0,
    marketsScanned: 0,
    platformPairs: 0,
  });

  // Derived: client-side filtered + sorted opportunities (instant, no API call)
  const opportunities = useMemo(() => {
    let filtered = rawOpportunities.filter(opp => {
      if (opp.spreadPercent < minSpread) return false;
      if (opp.matchScore < minMatchScore) return false;
      return true;
    });

    // Sort by chosen criteria
    filtered.sort((a, b) => {
      if (sortBy === 'spread') return b.spreadPercent - a.spreadPercent;
      if (sortBy === 'profit') return b.profitPotential - a.profitPotential;
      return b.avgVolume - a.avgVolume;
    });

    return filtered;
  }, [rawOpportunities, minSpread, minMatchScore, sortBy]);

  // Derived stats from filtered opportunities
  const stats = useMemo(() => {
    if (opportunities.length === 0) {
      return { ...rawStats, totalOpportunities: 0, avgSpread: 0, totalPotential: 0 };
    }
    return {
      totalOpportunities: opportunities.length,
      avgSpread: opportunities.reduce((sum, o) => sum + o.spreadPercent, 0) / opportunities.length,
      totalPotential: opportunities.reduce((sum, o) => sum + o.profitPotential, 0),
      marketsScanned: rawStats.marketsScanned,
      platformPairs: rawStats.platformPairs,
    };
  }, [opportunities, rawStats]);

  // Alert dialog state
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [alertOpp, setAlertOpp] = useState<ArbitrageOpportunity | null>(null);
  const [alertEmail, setAlertEmail] = useState('');
  const [alertSpreadThreshold, setAlertSpreadThreshold] = useState(5);
  const [alertSaving, setAlertSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  // Feasibility color helper
  const getFeasibilityColor = (label: string) => {
    switch (label) {
      case 'excellent': return TRADING_COLORS.YES;
      case 'good': return CHART_COLORS.blue || '#2196f3';
      case 'fair': return CHART_COLORS.amber || '#ff9800';
      case 'poor': return TRADING_COLORS.NO;
      default: return theme.palette.text.secondary;
    }
  };

  // Create arbitrage alert
  const handleCreateAlert = async () => {
    if (!alertOpp || !alertEmail) return;
    setAlertSaving(true);
    try {
      const API_BASE = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${API_BASE}/api/alerts/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: alertEmail,
          alert_type: 'arbitrage',
          alert_name: `Arb: ${alertOpp.title.slice(0, 60)}`,
          conditions: {
            market_title: alertOpp.title,
            platforms: Array.from(alertOpp.markets.keys()),
            min_spread: alertSpreadThreshold,
            min_match_score: 0.5,
          },
          email_enabled: true,
        }),
      });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      setSnackbar({ open: true, message: '🔔 Alert created! You\'ll be notified when this spread opens up.', severity: 'success' });
      setAlertDialogOpen(false);
    } catch (err: any) {
      setSnackbar({ open: true, message: `Failed to create alert: ${err.message}`, severity: 'error' });
    } finally {
      setAlertSaving(false);
    }
  };

  // Fetch opportunities from DB — filtering/sorting is done client-side
  const findArbitrageOpportunities = useCallback(async () => {
    setLoading(true);
    setLoadingStep(0);
    setError(null);
    
    try {
      // DB endpoint: instant response, no live API calls
      const API_BASE = import.meta.env.VITE_API_URL || '';
      const response = await fetch(
        `${API_BASE}/api/arbitrage/opportunities-db?min_spread=0.5&min_match_score=0.20&limit=200`
      );
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      console.log('🔍 Arbitrage API Response:', data);
      
      // Transform API response to our format
      const transformedOpps: ArbitrageOpportunity[] = data.opportunities.map((opp: any) => {
        const platformMap = new Map<string, UnifiedMarket>();
        
        // Create UnifiedMarket objects for each platform
        for (const platform of opp.platforms) {
          const originalId = opp.market_ids?.[platform] || opp.id;
          platformMap.set(platform, {
            platform: platform as any,
            id: originalId,
            title: opp.title,
            status: 'open',
            start_time: null,
            end_time: null,
            close_time: null,
            volume_total_usd: opp.volumes[platform] || 0,
            volume_24h_usd: opp.volumes[platform] || 0,
            volume_1_week_usd: null,
            volume_1_month_usd: null,
            category: '',
            tags: [],
            last_price: opp.prices[platform] || 0,
            extra: { market_slug: originalId },
          });
        }
        
        return {
          id: opp.id,
          title: opp.title,
          markets: platformMap,
          bestBuy: {
            platform: opp.best_buy_platform,
            price: opp.best_buy_price,
          },
          bestSell: {
            platform: opp.best_sell_platform,
            price: opp.best_sell_price,
          },
          spread: opp.best_sell_price - opp.best_buy_price,
          spreadPercent: opp.spread_percent,
          profitPotential: opp.profit_potential,
          confidence: opp.confidence as 'high' | 'medium' | 'low',
          matchScore: opp.match_score,
          avgVolume: (Object.values(opp.volumes) as number[]).reduce((a, b) => a + b, 0) / opp.platforms.length,
          feasibilityScore: opp.feasibility_score || 0,
          feasibilityLabel: opp.feasibility_label || 'poor',
          minSideVolume: opp.min_side_volume || 0,
          estimatedSlippage: opp.estimated_slippage || 5,
          strategySummary: opp.strategy_summary || '',
          strategySteps: opp.strategy_steps || [],
        };
      });
      
      // Sort by chosen criteria — now done in useMemo, not here
      
      setRawOpportunities(transformedOpps);
      setRawStats({
        totalOpportunities: data.stats.total_opportunities,
        avgSpread: data.stats.avg_spread,
        totalPotential: data.stats.total_profit_potential,
        marketsScanned: data.stats.markets_scanned,
        platformPairs: data.stats.platform_pairs,
      });
      
      console.log(`✅ Fetched ${transformedOpps.length} arbitrage opportunities from DB (filtered/sorted client-side)`);
      
    } catch (err: any) {
      console.error('Error finding arbitrage:', err);
      setError(err?.message || 'Failed to load arbitrage opportunities from database.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    findArbitrageOpportunities();
    
    // Auto-refresh every 2 minutes (120s) - balance between freshness and UX
    // Set to 30000 for 30s, 60000 for 1min, 120000 for 2min, or 300000 for 5min
    const interval = setInterval(findArbitrageOpportunities, 120000);
    return () => clearInterval(interval);
  }, [findArbitrageOpportunities]);

  const openMarket = (market: UnifiedMarket) => {
    const slug = market.extra?.market_slug || market.id;
    navigate(`/event/${market.platform}/${encodeURIComponent(slug)}`);
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return TRADING_COLORS.YES;
      case 'medium': return CHART_COLORS.amber;
      case 'low': return '#6B7280';
      default: return '#6B7280';
    }
  };

  return (
    <Box sx={{ 
      p: 3, 
      minHeight: '100vh',
      backgroundColor: 'background.default',
    }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CompareArrows sx={{ color: 'primary.main', fontSize: 32 }} />
              Arbitrage Scanner
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Polymarket vs Kalshi price differences • Database-powered
              </Typography>
              <Chip
                icon={<Speed sx={{ fontSize: 12 }} />}
                label="DB-powered"
                size="small"
                sx={{ height: 18, fontSize: '0.65rem', color: TRADING_COLORS.YES, backgroundColor: alpha(TRADING_COLORS.YES, 0.1) }}
              />
            </Box>
          </Box>
          <Button
            variant="outlined"
            startIcon={<Refresh sx={{ animation: loading ? `${pulse} 1s infinite` : 'none' }} />}
            onClick={findArbitrageOpportunities}
            disabled={loading}
            size="large"
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 2,
              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.primary.main, 0.05)} 100%)`,
              border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
            }}
          >
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
              Opportunities Found
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main', my: 0.5 }}>
              {loading ? <Skeleton width={60} /> : stats.totalOpportunities}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Across {stats.platformPairs} platform pairs
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 2,
              background: `linear-gradient(135deg, ${alpha(TRADING_COLORS.YES, 0.1)} 0%, ${alpha(TRADING_COLORS.YES, 0.05)} 100%)`,
              border: `1px solid ${alpha(TRADING_COLORS.YES, 0.2)}`,
            }}
          >
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
              Avg Spread
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 700, color: TRADING_COLORS.YES, my: 0.5 }}>
              {loading ? <Skeleton width={80} /> : `${stats.avgSpread.toFixed(1)}%`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Average price difference
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 2,
              background: `linear-gradient(135deg, ${alpha(CHART_COLORS.amber, 0.1)} 0%, ${alpha(CHART_COLORS.amber, 0.05)} 100%)`,
              border: `1px solid ${alpha(CHART_COLORS.amber, 0.2)}`,
            }}
          >
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
              Est. Profit Potential
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 700, color: CHART_COLORS.amber, my: 0.5 }}>
              {loading ? <Skeleton width={100} /> : formatVolume(stats.totalPotential)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Total opportunity value
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 2,
              background: `linear-gradient(135deg, ${alpha(theme.palette.info.main, 0.1)} 0%, ${alpha(theme.palette.info.main, 0.05)} 100%)`,
              border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`,
            }}
          >
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
              Markets Scanned
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 700, color: 'info.main', my: 0.5 }}>
              {loading ? <Skeleton width={80} /> : stats.marketsScanned}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Across 4 platforms
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 3,
          borderRadius: 2,
          backgroundColor: alpha(theme.palette.background.paper, 0.6),
          backdropFilter: 'blur(10px)',
          border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <FilterList sx={{ color: 'text.secondary' }} />
          
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Sort By</InputLabel>
            <Select
              value={sortBy}
              label="Sort By"
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <MenuItem value="spread">Spread %</MenuItem>
              <MenuItem value="profit">Profit Potential</MenuItem>
              <MenuItem value="volume">Volume</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Min Spread</InputLabel>
            <Select
              value={minSpread}
              label="Min Spread"
              onChange={(e) => setMinSpread(e.target.value as number)}
            >
              <MenuItem value={1}>1%+</MenuItem>
              <MenuItem value={2}>2%+</MenuItem>
              <MenuItem value={5}>5%+</MenuItem>
              <MenuItem value={10}>10%+</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Match Confidence</InputLabel>
            <Select
              value={minMatchScore}
              label="Match Confidence"
              onChange={(e) => setMinMatchScore(e.target.value as number)}
            >
              <MenuItem value={0.35}>Low (35%+)</MenuItem>
              <MenuItem value={0.5}>Medium (50%+)</MenuItem>
              <MenuItem value={0.65}>High (65%+)</MenuItem>
              <MenuItem value={0.8}>Very High (80%+)</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ flex: 1 }} />
          
          <Chip
            label={`${opportunities.length} shown`}
            color="primary"
            variant="outlined"
            size="small"
          />
        </Stack>
      </Paper>

      {/* Loading State */}
      {loading && (
        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            mb: 3,
            borderRadius: 2,
            border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
            <CompareArrows sx={{ color: 'primary.main', fontSize: 20, animation: `${pulse} 1.5s ease-in-out infinite` }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Scanning DB for cross-venue price differences…
            </Typography>
          </Box>
          <LinearProgress sx={{ borderRadius: 1, height: 3, backgroundColor: alpha(theme.palette.primary.main, 0.08), '& .MuiLinearProgress-bar': { borderRadius: 1 } }} />
        </Paper>
      )}

      {/* Error State */}
      {error && (
        <Paper sx={{ p: 4, textAlign: 'center', mb: 3 }}>
          <Warning sx={{ fontSize: 56, color: 'error.main', mb: 2 }} />
          <Typography variant="h6" color="error" gutterBottom>{error}</Typography>
          <Button variant="outlined" onClick={findArbitrageOpportunities} sx={{ mt: 2 }}>
            Retry Scan
          </Button>
        </Paper>
      )}

      {/* Opportunities List */}
      {!loading && !error && (
        <Stack spacing={2.5}>
          {opportunities.length === 0 ? (
            <Paper sx={{ p: 5, textAlign: 'center' }}>
              <ShowChart sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No arbitrage opportunities found
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Markets are efficiently priced at current thresholds.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Try lowering the minimum spread filter or adjusting match confidence.
              </Typography>
            </Paper>
          ) : (
            opportunities.map((opp, index) => (
              <Paper
                key={opp.id}
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  backgroundColor: alpha(theme.palette.background.paper, 0.8),
                  backdropFilter: 'blur(10px)',
                  border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                  animation: `${fadeInUp} 0.3s ease ${index * 0.02}s both`,
                  transition: 'all 0.2s ease',
                  ...(opp.confidence === 'high' && {
                    border: `1px solid ${alpha(TRADING_COLORS.YES, 0.3)}`,
                  }),
                  '&:hover': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.03),
                    boxShadow: `0 4px 12px ${alpha(theme.palette.common.black, 0.08)}`,
                  },
                }}
              >
                {/* Compact Title Row */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      {opp.confidence === 'high' && (
                        <LocalFireDepartment sx={{ color: TRADING_COLORS.NO, fontSize: 16 }} />
                      )}
                      <Typography 
                        variant="subtitle2" 
                        sx={{ 
                          fontWeight: 600, 
                          lineHeight: 1.3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {opp.title}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                      <Tooltip title={`Spread: Price difference between cheapest buy and highest sell across platforms`} arrow>
                        <Chip
                          label={`${opp.spreadPercent.toFixed(1)}%`}
                          size="small"
                          sx={{
                            backgroundColor: alpha(TRADING_COLORS.YES, 0.15),
                            color: TRADING_COLORS.YES,
                            fontWeight: 700,
                            fontSize: '0.7rem',
                            height: 20,
                          }}
                        />
                      </Tooltip>
                      <Tooltip title={`Match Confidence: How closely the market titles match across platforms (${(opp.matchScore * 100).toFixed(0)}%)`} arrow>
                        <Chip
                          label={opp.confidence}
                          size="small"
                          sx={{
                            backgroundColor: alpha(getConfidenceColor(opp.confidence), 0.1),
                            color: getConfidenceColor(opp.confidence),
                            fontSize: '0.7rem',
                            height: 20,
                          }}
                        />
                      </Tooltip>
                      <Tooltip title={`This market is listed on ${opp.markets.size} prediction platforms`} arrow>
                        <Chip
                          label={`${opp.markets.size} venues`}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.7rem', height: 20 }}
                        />
                      </Tooltip>
                      <Tooltip title={`Execution Feasibility: ${opp.feasibilityScore}/100 — Est. slippage: ${opp.estimatedSlippage}% — Min side vol: ${formatVolume(opp.minSideVolume)}`} arrow>
                        <Chip
                          icon={<Speed sx={{ fontSize: 14 }} />}
                          label={opp.feasibilityLabel}
                          size="small"
                          sx={{
                            backgroundColor: alpha(getFeasibilityColor(opp.feasibilityLabel), 0.12),
                            color: getFeasibilityColor(opp.feasibilityLabel),
                            fontWeight: 600,
                            fontSize: '0.65rem',
                            height: 20,
                            '& .MuiChip-icon': { color: 'inherit' },
                          }}
                        />
                      </Tooltip>
                      <Tooltip title="Set spread alert for this market" arrow>
                        <IconButton
                          size="small"
                          onClick={() => { setAlertOpp(opp); setAlertSpreadThreshold(Math.ceil(opp.spreadPercent)); setAlertDialogOpen(true); }}
                          sx={{ p: 0.3, color: 'text.secondary', '&:hover': { color: CHART_COLORS.amber } }}
                        >
                          <NotificationsActive sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Box>
                  <Box sx={{ textAlign: 'right', ml: 2 }}>
                    <Typography 
                      variant="h6" 
                      sx={{ 
                        fontFamily: 'monospace', 
                        fontWeight: 700,
                        color: TRADING_COLORS.YES,
                        lineHeight: 1,
                      }}
                    >
                      +{formatVolume(opp.profitPotential)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                      profit
                    </Typography>
                  </Box>
                </Box>

                {/* Execution Feasibility Bar */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, px: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', minWidth: 55 }}>
                    Execution
                  </Typography>
                  <Box sx={{ flex: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={opp.feasibilityScore}
                      sx={{
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: alpha(theme.palette.divider, 0.15),
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 2,
                          backgroundColor: getFeasibilityColor(opp.feasibilityLabel),
                        },
                      }}
                    />
                  </Box>
                  <Typography variant="caption" sx={{ fontSize: '0.65rem', color: getFeasibilityColor(opp.feasibilityLabel), fontWeight: 600, minWidth: 25, textAlign: 'right' }}>
                    {opp.feasibilityScore}
                  </Typography>
                  <Tooltip title={`Estimated slippage if you trade $1K: ~${opp.estimatedSlippage}%`}>
                    <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.secondary', ml: 0.5 }}>
                      ~{opp.estimatedSlippage}% slip
                    </Typography>
                  </Tooltip>
                </Box>

                {/* Strategy Summary — How to Profit */}
                {opp.strategySummary && (
                  <Box
                    sx={{
                      mb: 1.5,
                      px: 1.5,
                      py: 1,
                      borderRadius: 1.5,
                      backgroundColor: alpha(TRADING_COLORS.YES, 0.06),
                      border: `1px solid ${alpha(TRADING_COLORS.YES, 0.15)}`,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <TrendingUp sx={{ fontSize: 14, color: TRADING_COLORS.YES }} />
                      <Typography variant="caption" sx={{ fontWeight: 700, color: TRADING_COLORS.YES, fontSize: '0.7rem' }}>
                        How to Profit
                      </Typography>
                    </Box>
                    <Typography variant="caption" sx={{ 
                      display: 'block', 
                      fontFamily: 'monospace', 
                      fontSize: '0.7rem', 
                      color: 'text.primary',
                      lineHeight: 1.4,
                      fontWeight: 600,
                    }}>
                      {opp.strategySummary}
                    </Typography>
                    {opp.strategySteps.length > 0 && (
                      <Tooltip
                        title={
                          <Box sx={{ p: 0.5 }}>
                            {opp.strategySteps.map((step, i) => (
                              <Typography key={i} variant="caption" sx={{ display: 'block', fontSize: '0.7rem', mb: 0.3, lineHeight: 1.4 }}>
                                {step}
                              </Typography>
                            ))}
                          </Box>
                        }
                        arrow
                        placement="bottom"
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            display: 'inline-block',
                            mt: 0.5,
                            fontSize: '0.6rem',
                            color: TRADING_COLORS.YES,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            textDecorationStyle: 'dotted',
                            '&:hover': { opacity: 0.8 },
                          }}
                        >
                          View full strategy steps →
                        </Typography>
                      </Tooltip>
                    )}
                  </Box>
                )}

                {/* Compact Platform Comparison - Horizontal Layout */}
                <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5 }}>
                  {Array.from(opp.markets.entries()).map(([platform, market]) => {
                    const isBestBuy = platform === opp.bestBuy.platform;
                    const isBestSell = platform === opp.bestSell.platform;
                    const price = market.last_price || 0;
                    const platInfo = getPlatformInfo(platform);
                    
                    return (
                      <Box
                        key={platform}
                        sx={{
                          minWidth: 140,
                          borderRadius: 1.5,
                          p: 1.5,
                          backgroundColor: platInfo.bg,
                          border: `2px solid ${
                            isBestBuy 
                              ? TRADING_COLORS.YES 
                              : isBestSell 
                                ? TRADING_COLORS.NO 
                                : alpha(platInfo.primary, 0.2)
                          }`,
                          position: 'relative',
                        }}
                      >
                        {/* Action Badge */}
                        {(isBestBuy || isBestSell) && (
                          <Box
                            sx={{
                              position: 'absolute',
                              top: -8,
                              right: 8,
                              backgroundColor: isBestBuy ? TRADING_COLORS.YES : TRADING_COLORS.NO,
                              color: 'white',
                              px: 0.75,
                              py: 0.25,
                              borderRadius: 0.75,
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              boxShadow: `0 2px 6px ${alpha(isBestBuy ? TRADING_COLORS.YES : TRADING_COLORS.NO, 0.3)}`,
                            }}
                          >
                            {isBestBuy ? 'BUY' : 'SELL'}
                          </Box>
                        )}
                        
                        {/* Platform Name */}
                        <Typography 
                          variant="caption" 
                          sx={{ 
                            display: 'block',
                            fontWeight: 700,
                            color: platInfo.primary,
                            fontSize: '0.7rem',
                            mb: 0.5,
                          }}
                        >
                          {platInfo.name}
                        </Typography>
                        
                        {/* Price */}
                        <Typography 
                          variant="h6" 
                          sx={{ 
                            fontFamily: 'monospace', 
                            fontWeight: 700,
                            color: platInfo.primary,
                            fontSize: '1.1rem',
                            lineHeight: 1,
                          }}
                        >
                          {(price * 100).toFixed(1)}¢
                        </Typography>
                        
                        {/* Volume */}
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', display: 'block', mt: 0.5 }}>
                          Vol: {formatVolume(market.volume_24h_usd || 0)}
                        </Typography>
                        
                        {/* Execute Trade Button */}
                        <Button
                          size="small"
                          variant="text"
                          endIcon={<OpenInNew sx={{ fontSize: 12 }} />}
                          href={getPlatformTradeUrl(platform, market)}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{
                            mt: 1,
                            fontSize: '0.6rem',
                            fontWeight: 600,
                            py: 0.25,
                            px: 0.75,
                            minWidth: 'auto',
                            color: platInfo.primary,
                            '&:hover': {
                              backgroundColor: alpha(platInfo.primary, 0.1),
                            },
                          }}
                        >
                          Trade →
                        </Button>
                      </Box>
                    );
                  })}
                </Box>
              </Paper>
            ))
          )}
        </Stack>
      )}

      {/* Disclaimer */}
      <Box sx={{ mt: 4, p: 3, textAlign: 'center', backgroundColor: alpha(theme.palette.warning.main, 0.05), borderRadius: 2 }}>
        <Warning sx={{ color: 'warning.main', mb: 1 }} />
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 800, mx: 'auto' }}>
          <strong>⚠️ Important Disclaimer:</strong> Arbitrage opportunities are based on automated title matching and may not represent identical markets. 
          Always verify market questions, terms, and resolution criteria before trading. Consider transaction fees, slippage, and timing risks. 
          Past spreads do not guarantee future opportunities. This is not financial advice.
        </Typography>
      </Box>

      {/* Spread Alert Dialog */}
      <Dialog open={alertDialogOpen} onClose={() => setAlertDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <NotificationsActive sx={{ color: CHART_COLORS.amber }} />
          Set Spread Alert
        </DialogTitle>
        <DialogContent>
          {alertOpp && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Get notified when the spread on <strong>"{alertOpp.title.slice(0, 80)}"</strong> exceeds your threshold.
              </Typography>
              <TextField
                label="Email Address"
                type="email"
                fullWidth
                value={alertEmail}
                onChange={(e) => setAlertEmail(e.target.value)}
                sx={{ mb: 2 }}
                size="small"
                placeholder="you@example.com"
              />
              <TextField
                label="Min Spread Threshold (%)"
                type="number"
                fullWidth
                value={alertSpreadThreshold}
                onChange={(e) => setAlertSpreadThreshold(Number(e.target.value))}
                size="small"
                inputProps={{ min: 1, max: 50 }}
                helperText={`Current spread: ${alertOpp.spreadPercent.toFixed(1)}% — You'll be alerted when spread ≥ ${alertSpreadThreshold}%`}
              />
              <Box sx={{ mt: 2, p: 1.5, borderRadius: 1, backgroundColor: alpha(theme.palette.info.main, 0.05) }}>
                <Typography variant="caption" color="text.secondary">
                  📊 Platforms: {Array.from(alertOpp.markets.keys()).map(p => getPlatformInfo(p).name).join(' vs ')}
                  <br />
                  ⚡ Alerts are checked periodically. Spreads can close quickly.
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAlertDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateAlert}
            disabled={!alertEmail || alertSaving}
            startIcon={alertSaving ? undefined : <CheckCircle />}
          >
            {alertSaving ? 'Creating...' : 'Create Alert'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Arbitrage;
