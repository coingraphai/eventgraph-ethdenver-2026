/**
 * EventGraph - Prediction Market Intelligence Terminal
 * World-class trading dashboard with premium UI design
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  alpha,
  useTheme,
  Chip,
  Paper,
  Grid,
  Skeleton,
  IconButton,
  Tooltip,
  Divider,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  AutoAwesome,
  Event as EventIcon,
  ArrowForward,
  ShowChart,
  AccountBalance,
  Speed,
  Bolt,
  BarChart,
  LocalFireDepartment,
  Refresh,
  SwapHoriz,
  Insights,
  CompareArrows,
} from '@mui/icons-material';
import { keyframes } from '@mui/system';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { TRADING_COLORS, PLATFORM_COLORS } from '../utils/colors';
import {
  PlatformDonutChart,
  CategoryTreemap,
  VolumeTrendChart,
  ArbitrageCard,
  MarketMoversCard,
  PriceComparisonWidget,
  SmartSearchPreview,
} from '../components/charts';

// Animations
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

const glow = keyframes`
  0%, 100% { box-shadow: 0 0 20px rgba(135, 206, 235, 0.15); }
  50% { box-shadow: 0 0 40px rgba(135, 206, 235, 0.3); }
`;

interface DashboardData {
  top_markets: any[];
  categories: any[];
  volume_trends: any[];
  platform_stats: {
    polymarket: any;
    kalshi: any;
    limitless: any;
  };
  recent_activity: any[];
  timestamp: string;
}

// Intelligence Dashboard data from /api/intelligence/intelligence
interface IntelligenceData {
  global_metrics: {
    total_markets: number;
    active_events: number;
    open_markets: number;
    sample_count: number;
    sample_volume: number;
    estimated_total_volume: number;
    total_tvl: number;
    platform_volumes: Record<string, number>;
    platform_estimated_volumes: Record<string, number>;
    platform_counts: Record<string, number>;
    categories: Record<string, { count: number; volume: number }>;
    platforms_active: number;
  };
  trending_markets: Array<{
    id: string;
    slug: string;
    title: string;
    platform: string;
    probability: number;
    volume: number;
    category: string;
    image: string;
    attention_score: number;
    tags: string[];
    end_date: string;
  }>;
  arbitrage_opportunities: Array<{
    title: string;
    platforms: Record<string, { price: number; volume: number }>;
    min_price: number;
    max_price: number;
    spread_pct: number;
    gross_arb_pct: number;
    total_volume: number;
    platform_count: number;
  }>;
  category_intelligence: Array<{
    category: string;
    display_name: string;
    total_volume: number;
    market_count: number;
    volume_share: number;
    market_share: number;
    platform_count: number;
    platforms: string[];
    top_event: string;
    top_event_platform: string;
  }>;
  platform_comparison: Array<{
    platform: string;
    display_name: string;
    total_markets: number;
    sample_markets?: number;
    sample_volume: number;
    estimated_volume: number;
    tvl: number;
    total_liquidity: number;
    avg_volume: number;
    avg_price: number;
    categories_count: number;
    liquidity_score: number;
  }>;
  timestamp: string;
  data_sources: Record<string, number>;
  sample_sizes?: Record<string, number>;
}

// Premium Stat Card Component
const StatCard: React.FC<{
  label: string;
  value: string;
  subtitle: string;
  color: string;
  delay?: number;
}> = ({ label, value, subtitle, color, delay = 0 }) => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        textAlign: 'center',
        px: 3,
        py: 2,
        animation: `${fadeIn} 0.6s ease-out ${delay}s both`,
        position: 'relative',
        '&:not(:last-child)::after': {
          content: '""',
          position: 'absolute',
          right: 0,
          top: '20%',
          height: '60%',
          width: 1,
          background: `linear-gradient(180deg, transparent, ${alpha(theme.palette.divider, 0.3)}, transparent)`,
        },
      }}
    >
      <Typography
        variant="h3"
        fontWeight={800}
        sx={{
          color,
          fontFamily: '"SF Mono", "Monaco", monospace',
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
          textShadow: `0 0 30px ${alpha(color, 0.4)}`,
        }}
      >
        {value}
      </Typography>
      <Typography
        variant="body2"
        fontWeight={600}
        sx={{ color: theme.palette.text.primary, mt: 0.5 }}
      >
        {label}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: theme.palette.text.secondary, fontSize: '0.7rem' }}
      >
        {subtitle}
      </Typography>
    </Box>
  );
};

// Premium Market Card Component
const MarketCard: React.FC<{
  title: string;
  price: number;
  change: number;
  volume: number;
  platform: string;
  slug?: string;
  isHot?: boolean;
  delay?: number;
  onClick?: () => void;
}> = ({ title, price, change, volume, platform, slug, isHot, delay = 0, onClick }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const isPositive = change >= 0;
  const platformColor = PLATFORM_COLORS[platform as keyof typeof PLATFORM_COLORS]?.primary || theme.palette.primary.main;

  const formatVolume = (vol: number) => {
    if (vol >= 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
    if (vol >= 1000) return `$${(vol / 1000).toFixed(0)}K`;
    return `$${vol.toFixed(0)}`;
  };

  return (
    <Paper
      elevation={0}
      onClick={() => {
        if (onClick) {
          onClick();
        } else if (slug && platform) {
          navigate(`/events/${platform}/${slug}`);
        }
      }}
      sx={{
        p: 2,
        borderRadius: 2,
        background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.8)} 0%, ${alpha(theme.palette.background.paper, 0.4)} 100%)`,
        border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        backdropFilter: 'blur(10px)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        animation: `${fadeIn} 0.5s ease-out ${delay}s both`,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        '&:hover': {
          transform: 'translateY(-4px)',
          border: `1px solid ${alpha(platformColor, 0.4)}`,
          boxShadow: `0 12px 40px ${alpha(platformColor, 0.15)}`,
          '& .market-arrow': {
            transform: 'translateX(4px)',
            opacity: 1,
          },
        },
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, ${platformColor}, ${alpha(platformColor, 0.3)})`,
        },
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
        <Box sx={{ flex: 1, pr: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <Chip
              size="small"
              label={platform}
              sx={{
                height: 18,
                fontSize: '0.6rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                backgroundColor: alpha(platformColor, 0.15),
                color: platformColor,
                border: `1px solid ${alpha(platformColor, 0.3)}`,
              }}
            />
            {isHot && (
              <LocalFireDepartment sx={{ fontSize: 14, color: theme.palette.warning.main }} />
            )}
          </Stack>
          <Typography
            variant="body2"
            fontWeight={600}
            sx={{
              color: theme.palette.text.primary,
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title}
          </Typography>
        </Box>
        <ArrowForward
          className="market-arrow"
          sx={{
            fontSize: 16,
            color: theme.palette.text.secondary,
            opacity: 0.5,
            transition: 'all 0.3s ease',
          }}
        />
      </Stack>

      <Stack direction="row" justifyContent="space-between" alignItems="flex-end">
        <Box>
          <Typography
            variant="h5"
            fontWeight={700}
            sx={{
              fontFamily: '"SF Mono", monospace',
              color: price > 0.5 ? TRADING_COLORS.YES : TRADING_COLORS.NO,
            }}
          >
            {(price * 100).toFixed(0)}¢
          </Typography>
          <Typography variant="caption" color="text.secondary">
            YES Price
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Stack direction="row" alignItems="center" spacing={0.5} justifyContent="flex-end">
            {isPositive ? (
              <TrendingUp sx={{ fontSize: 14, color: TRADING_COLORS.POSITIVE }} />
            ) : (
              <TrendingDown sx={{ fontSize: 14, color: TRADING_COLORS.NEGATIVE }} />
            )}
            <Typography
              variant="body2"
              fontWeight={600}
              sx={{
                color: isPositive ? TRADING_COLORS.POSITIVE : TRADING_COLORS.NEGATIVE,
                fontFamily: '"SF Mono", monospace',
              }}
            >
              {isPositive ? '+' : ''}{change.toFixed(1)}%
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {formatVolume(volume)} vol
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
};

// Metric Tile Component
const MetricTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  change?: number;
  color: string;
  delay?: number;
}> = ({ icon, label, value, change, color, delay = 0 }) => {
  const theme = useTheme();
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 2,
        background: `linear-gradient(145deg, ${alpha(color, 0.08)} 0%, ${alpha(theme.palette.background.paper, 0.6)} 100%)`,
        border: `1px solid ${alpha(color, 0.15)}`,
        transition: 'all 0.3s ease',
        animation: `${fadeIn} 0.5s ease-out ${delay}s both`,
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: `0 8px 24px ${alpha(color, 0.12)}`,
          border: `1px solid ${alpha(color, 0.3)}`,
        },
      }}
    >
      <Stack direction="row" spacing={2} alignItems="center">
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 2,
            background: `linear-gradient(135deg, ${alpha(color, 0.2)} 0%, ${alpha(color, 0.1)} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.65rem' }}>
            {label}
          </Typography>
          <Stack direction="row" alignItems="baseline" spacing={1}>
            <Typography variant="h5" fontWeight={700} sx={{ fontFamily: '"SF Mono", monospace', color: theme.palette.text.primary }}>
              {value}
            </Typography>
            {change !== undefined && (
              <Typography
                variant="caption"
                fontWeight={600}
                sx={{
                  color: change >= 0 ? TRADING_COLORS.POSITIVE : TRADING_COLORS.NEGATIVE,
                  fontFamily: '"SF Mono", monospace',
                }}
              >
                {change >= 0 ? '+' : ''}{change.toFixed(1)}%
              </Typography>
            )}
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
};

// Activity Item Component
const ActivityItem: React.FC<{
  title: string;
  platform: string;
  action: string;
  value: string;
  time: string;
  delay?: number;
}> = ({ title, platform, action, value, time, delay = 0 }) => {
  const theme = useTheme();
  const platformColor = PLATFORM_COLORS[platform as keyof typeof PLATFORM_COLORS]?.primary || theme.palette.primary.main;
  const isPositive = action === 'BUY' || action === 'YES';

  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 1.5,
        background: alpha(theme.palette.background.paper, 0.4),
        border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
        transition: 'all 0.2s ease',
        animation: `${fadeIn} 0.4s ease-out ${delay}s both`,
        '&:hover': {
          background: alpha(theme.palette.background.paper, 0.6),
          borderColor: alpha(platformColor, 0.2),
        },
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 1,
            background: isPositive ? alpha(TRADING_COLORS.YES, 0.15) : alpha(TRADING_COLORS.NO, 0.15),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isPositive ? (
            <TrendingUp sx={{ fontSize: 16, color: TRADING_COLORS.YES }} />
          ) : (
            <TrendingDown sx={{ fontSize: 16, color: TRADING_COLORS.NO }} />
          )}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            fontWeight={500}
            sx={{
              color: theme.palette.text.primary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontSize: '0.8rem',
            }}
          >
            {title}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              size="small"
              label={platform}
              sx={{
                height: 14,
                fontSize: '0.55rem',
                fontWeight: 600,
                backgroundColor: alpha(platformColor, 0.12),
                color: platformColor,
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {time}
            </Typography>
          </Stack>
        </Box>
        <Typography
          variant="body2"
          fontWeight={600}
          sx={{
            fontFamily: '"SF Mono", monospace',
            color: isPositive ? TRADING_COLORS.YES : TRADING_COLORS.NO,
          }}
        >
          {value}
        </Typography>
      </Stack>
    </Box>
  );
};

// ============================================================================
// Module-level cache so Home data persists across navigations
// ============================================================================
const HOME_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let homeCache: {
  intelligence: IntelligenceData | null;
  eventsStats: Record<string, any> | null;
  dashboard: DashboardData | null;
  timestamp: number;
} = { intelligence: null, eventsStats: null, dashboard: null, timestamp: 0 };

function isHomeCacheFresh(): boolean {
  return Date.now() - homeCache.timestamp < HOME_CACHE_TTL && (homeCache.intelligence !== null || homeCache.eventsStats !== null);
}

interface DataFreshness {
  last_updated: string | null;
  platforms: Record<string, { updated_at: string; item_count: number; status: string }>;
  server_time: string;
}

export const Home: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(homeCache.dashboard);
  const [intelligence, setIntelligence] = useState<IntelligenceData | null>(homeCache.intelligence);
  const [eventsStats, setEventsStats] = useState<Record<string, any> | null>(homeCache.eventsStats);
  const [dataFreshness, setDataFreshness] = useState<DataFreshness | null>(null);
  const [loading, setLoading] = useState(!isHomeCacheFresh());
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (force = false) => {
    // Use cached data if fresh and not forced
    if (!force && isHomeCacheFresh()) {
      setIntelligence(homeCache.intelligence);
      setEventsStats(homeCache.eventsStats);
      setData(homeCache.dashboard);
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      
      // Fetch intelligence, events stats, and data freshness in parallel
      const [intelligenceRes, eventsStatsRes, freshnessRes] = await Promise.allSettled([
        axios.get<IntelligenceData>(`${apiBase}/intelligence/intelligence`),
        axios.get(`${apiBase}/db/events/stats`),
        axios.get<DataFreshness>(`${apiBase}/dashboard/data-freshness`),
      ]);
      
      let newIntelligence: IntelligenceData | null = null;
      let newEventsStats: Record<string, any> | null = null;

      if (intelligenceRes.status === 'fulfilled') {
        newIntelligence = intelligenceRes.value.data;
        setIntelligence(newIntelligence);
      }
      if (eventsStatsRes.status === 'fulfilled') {
        newEventsStats = eventsStatsRes.value.data;
        setEventsStats(newEventsStats);
      }
      if (freshnessRes.status === 'fulfilled') {
        setDataFreshness(freshnessRes.value.data);
      }

      // Update module-level cache
      homeCache = {
        intelligence: newIntelligence,
        eventsStats: newEventsStats,
        dashboard: homeCache.dashboard,
        timestamp: Date.now(),
      };

      setLoading(false);
      
      // Then fetch dashboard data in background (optional, for legacy support)
      axios.get<DashboardData>(`${apiBase}/api/dashboard/stats`)
        .then(res => {
          if (res.data) {
            setData(res.data);
            homeCache.dashboard = res.data;
          }
        })
        .catch(() => {});
      
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.response?.data?.detail || 'Failed to load data');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatNumber = (num: number) => {
    if (num >= 1000000000) return `${(num / 1000000000).toFixed(1)}B`;  // Billions
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;       // Millions
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toLocaleString();
  };

  // Use intelligence data for platform counts, with events stats as fallback
  // This ensures Limitless shows correct counts even if intelligence API is slow
  const polymarketMarkets = intelligence?.data_sources?.polymarket || eventsStats?.platform_counts?.polymarket || data?.platform_stats?.polymarket?.total_markets || 0;
  const kalshiMarkets = intelligence?.data_sources?.kalshi || eventsStats?.platform_counts?.kalshi || data?.platform_stats?.kalshi?.total_markets || 0;
  const limitlessMarkets = intelligence?.data_sources?.limitless || eventsStats?.platform_counts?.limitless || 0;
  const totalMarkets = intelligence?.global_metrics?.total_markets || (polymarketMarkets + kalshiMarkets + limitlessMarkets);
  const totalVolume = intelligence?.global_metrics?.estimated_total_volume || (data?.platform_stats?.polymarket?.top_10_volume || 0) + (data?.platform_stats?.kalshi?.top_10_volume || 0);

  // True when counts are still being fetched (neither intelligence nor eventsStats loaded yet)
  const countsLoading = !intelligence && !eventsStats;

  return (
    <Box sx={{ 
      minHeight: 'calc(100vh - 56px)', 
      width: '100%', 
      overflowX: 'hidden',
    }}>
      {/* Hero Section with Stats */}
      <Box
        sx={{
          position: 'relative',
          minHeight: 'calc(100vh - 56px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          pt: { xs: 6, md: 8 },
          pb: { xs: 6, md: 8 },
          px: { xs: 2, sm: 3, md: 4 },
          textAlign: 'center',
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
        }}
      >
        {/* Background Effects */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse 80% 60% at 50% -20%, ${alpha(theme.palette.primary.main, 0.12)} 0%, transparent 60%)`,
            pointerEvents: 'none',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: { xs: 450, sm: 600, md: 750 },
            height: { xs: 450, sm: 600, md: 750 },
            borderRadius: '50%',
            background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.03)} 0%, transparent 70%)`,
            animation: `${glow} 4s ease-in-out infinite`,
            pointerEvents: 'none',
          }}
        />

        {/* Logo & Title */}
        <Box sx={{ position: 'relative', zIndex: 1, animation: `${fadeIn} 0.6s ease-out`, mb: 4 }}>
          <Box
            component="img"
            src={theme.palette.mode === 'dark' ? '/assets/EG logo white.png' : '/assets/EGlogo black.png'}
            alt="EventGraph"
            sx={{
              height: { xs: 80, sm: 120 },
              width: 'auto',
              objectFit: 'contain',
              mx: 'auto',
              display: 'block',
            }}
          />
        </Box>

        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Typography
            variant="h4"
            fontWeight={700}
            sx={{ 
              color: theme.palette.text.primary, 
              mb: 1.5,
              maxWidth: 800,
              mx: 'auto',
              fontSize: { xs: '1.4rem', sm: '1.75rem' },
            }}
          >
            One Interface for All Prediction Markets
          </Typography>
          
          <Typography
            variant="h6"
            sx={{ 
              color: theme.palette.primary.main, 
              mb: 2.5,
              maxWidth: 700,
              mx: 'auto',
              fontWeight: 600,
              fontSize: { xs: '1rem', sm: '1.15rem' },
            }}
          >
            Unified odds, analytics, and market intelligence across 3 platforms.
          </Typography>

          <Typography
            variant="body1"
            sx={{ 
              color: theme.palette.text.secondary, 
              mb: 4.5,
              maxWidth: 720,
              mx: 'auto',
              lineHeight: 1.7,
              fontSize: { xs: '0.95rem', sm: '1.05rem' },
            }}
          >
            A unified terminal aggregating Polymarket, Kalshi, and Limitless — with cross-venue analysis, arbitrage detection, and AI-powered market insights.
          </Typography>

          {/* CTA Buttons - Order: Browse Markets, Ask AI, View Arbitrage */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" sx={{ mb: 5, alignItems: 'center' }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<BarChart />}
              endIcon={<ArrowForward />}
              onClick={() => navigate('/events')}
              sx={{
                px: 4,
                py: 1.5,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '1rem',
                background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                boxShadow: `0 4px 20px ${alpha(theme.palette.primary.main, 0.4)}`,
                '&:hover': {
                  boxShadow: `0 6px 28px ${alpha(theme.palette.primary.main, 0.5)}`,
                },
              }}
            >
              Browse Markets
            </Button>
            <Button
              variant="outlined"
              size="large"
              startIcon={<AutoAwesome />}
              onClick={() => navigate('/ask-predictions')}
              sx={{
                px: 4,
                py: 1.5,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '1rem',
                borderColor: alpha(theme.palette.divider, 0.3),
                '&:hover': {
                  borderColor: theme.palette.primary.main,
                  backgroundColor: alpha(theme.palette.primary.main, 0.04),
                },
              }}
            >
              Ask AI
            </Button>
            <Button
              variant="outlined"
              size="large"
              startIcon={<LocalFireDepartment />}
              onClick={() => navigate('/arbitrage')}
              sx={{
                px: 4,
                py: 1.5,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '1rem',
                borderColor: alpha(TRADING_COLORS.POSITIVE, 0.5),
                color: TRADING_COLORS.POSITIVE,
                '&:hover': {
                  borderColor: TRADING_COLORS.POSITIVE,
                  backgroundColor: alpha(TRADING_COLORS.POSITIVE, 0.04),
                },
              }}
            >
              View Arbitrage
            </Button>
          </Stack>

          {/* Key Stats */}
          {loading ? (
            <Stack direction="row" justifyContent="center" spacing={4}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} variant="rectangular" width={140} height={90} sx={{ borderRadius: 2 }} />
              ))}
            </Stack>
          ) : (
            <Paper
              sx={{
                maxWidth: 1000,
                mx: 'auto',
                background: alpha(theme.palette.background.paper, 0.4),
                backdropFilter: 'blur(10px)',
                borderRadius: 3,
                border: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
                p: 3,
              }}
            >
              <Stack 
                direction={{ xs: 'column', sm: 'row' }} 
                spacing={3}
                divider={<Divider orientation="vertical" flexItem sx={{ opacity: 0.2 }} />}
                justifyContent="space-around"
                alignItems="center"
              >
                {/* Total Markets */}
                <Box sx={{ textAlign: 'center', minWidth: 140 }}>
                  {countsLoading ? (
                    <Skeleton variant="text" width={100} height={48} sx={{ mx: 'auto' }} />
                  ) : (
                    <Typography variant="h3" fontWeight={800} sx={{ color: TRADING_COLORS.POSITIVE, mb: 0.5 }}>
                      {formatNumber(totalMarkets)}+
                    </Typography>
                  )}
                  <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                    Total Markets
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    3 platforms
                  </Typography>
                </Box>

                {/* Polymarket */}
                <Box sx={{ textAlign: 'center', minWidth: 120 }}>
                  <Typography variant="body2" fontWeight={700} sx={{ color: PLATFORM_COLORS.polymarket.primary, mb: 1 }}>
                    Polymarket
                  </Typography>
                  {countsLoading ? (
                    <Skeleton variant="text" width={60} height={40} sx={{ mx: 'auto' }} />
                  ) : (
                    <Typography variant="h4" fontWeight={700} color={PLATFORM_COLORS.polymarket.primary}>
                      {formatNumber(polymarketMarkets)}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">markets</Typography>
                </Box>

                {/* Kalshi */}
                <Box sx={{ textAlign: 'center', minWidth: 100 }}>
                  <Typography variant="body2" fontWeight={700} sx={{ color: PLATFORM_COLORS.kalshi.primary, mb: 1 }}>
                    Kalshi
                  </Typography>
                  {countsLoading ? (
                    <Skeleton variant="text" width={60} height={40} sx={{ mx: 'auto' }} />
                  ) : (
                    <Typography variant="h4" fontWeight={700} color={PLATFORM_COLORS.kalshi.primary}>
                      {formatNumber(kalshiMarkets)}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">markets</Typography>
                </Box>

                {/* Limitless */}
                <Box sx={{ textAlign: 'center', minWidth: 100 }}>
                  <Typography variant="body2" fontWeight={700} sx={{ color: PLATFORM_COLORS.limitless.primary, mb: 1 }}>
                    Limitless
                  </Typography>
                  {countsLoading ? (
                    <Skeleton variant="text" width={50} height={40} sx={{ mx: 'auto' }} />
                  ) : (
                    <Typography variant="h4" fontWeight={700} color={PLATFORM_COLORS.limitless.primary}>
                      {formatNumber(limitlessMarkets)}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">markets</Typography>
                </Box>
              </Stack>
              
              {/* Last Updated Indicator */}
              {dataFreshness?.last_updated && (
                <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}`, textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                    <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: TRADING_COLORS.POSITIVE, display: 'inline-block' }} />
                    Data last updated: {new Date(dataFreshness.last_updated).toLocaleString()}
                  </Typography>
                </Box>
              )}
            </Paper>
          )}
        </Box>
      </Box>

      {/* Intelligence Dashboard Section */}
      <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: 4 }}>
        {/* Section Header */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Market Intelligence Dashboard
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Real-time analytics from 3 prediction platforms
            </Typography>
          </Box>
          <Tooltip title="Refresh data">
            <IconButton onClick={() => fetchData(true)} sx={{ color: theme.palette.text.secondary }}>
              <Refresh />
            </IconButton>
          </Tooltip>
        </Stack>

        {loading ? (
          <Grid container spacing={3}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
              </Grid>
            ))}
          </Grid>
        ) : (
          <>
            {/* Global Intelligence Metrics */}
            <Grid container spacing={2} sx={{ mb: 4 }}>
              <Grid item xs={12} sm={6} md={3}>
                <MetricTile
                  icon={<ShowChart sx={{ fontSize: 24 }} />}
                  label="Total Markets"
                  value={formatNumber(intelligence?.global_metrics?.total_markets || totalMarkets)}
                  color={theme.palette.primary.main}
                  delay={0.1}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <MetricTile
                  icon={<AccountBalance sx={{ fontSize: 24 }} />}
                  label="Est. Total Volume"
                  value={`$${formatNumber(intelligence?.global_metrics?.estimated_total_volume || totalVolume)}`}
                  color={TRADING_COLORS.POSITIVE}
                  delay={0.15}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <MetricTile
                  icon={<Speed sx={{ fontSize: 24 }} />}
                  label="Categories"
                  value={String(intelligence?.category_intelligence?.length || Object.keys(intelligence?.global_metrics?.categories || {}).length || 0)}
                  color={PLATFORM_COLORS.kalshi.primary}
                  delay={0.2}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <MetricTile
                  icon={<Bolt sx={{ fontSize: 24 }} />}
                  label="Platforms"
                  value="3"
                  color={PLATFORM_COLORS.polymarket.primary}
                  delay={0.25}
                />
              </Grid>
            </Grid>

            {/* Main Content Grid */}
            <Grid container spacing={3}>
              {/* Trending Markets */}
              <Grid item xs={12} lg={8}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    borderRadius: 3,
                    background: alpha(theme.palette.background.paper, 0.5),
                    border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2.5 }}>
                    <Stack direction="row" alignItems="center" spacing={1.5}>
                      <LocalFireDepartment sx={{ color: theme.palette.warning.main, fontSize: 22 }} />
                      <Typography variant="h6" fontWeight={600}>
                        Markets Moving Right Now
                      </Typography>
                      <Chip
                        size="small"
                        label="LIVE"
                        sx={{
                          height: 20,
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          backgroundColor: alpha(TRADING_COLORS.POSITIVE, 0.15),
                          color: TRADING_COLORS.POSITIVE,
                          animation: `${pulse} 2s ease-in-out infinite`,
                        }}
                      />
                    </Stack>
                    <Button
                      size="small"
                      endIcon={<ArrowForward sx={{ fontSize: 14 }} />}
                      onClick={() => navigate('/events')}
                      sx={{ textTransform: 'none', fontWeight: 500 }}
                    >
                      View All
                    </Button>
                  </Stack>
                  <Grid container spacing={2}>
                    {(intelligence?.trending_markets || data?.top_markets)?.slice(0, 6).map((market: any, index: number) => (
                      <Grid item xs={12} sm={6} key={market.id || market.slug || index}>
                        <MarketCard
                          title={market.title || market.question}
                          price={market.probability || market.yes_price || 0.5}
                          change={market.price_change_24h || 0}
                          volume={market.volume || market.volume_24h || 0}
                          platform={market.platform || 'polymarket'}
                          slug={market.slug || market.id}
                          isHot={index < 2}
                          delay={0.1 * index}
                        />
                      </Grid>
                    ))}
                  </Grid>
                </Paper>
              </Grid>

              {/* Category Intelligence */}
              <Grid item xs={12} lg={4}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    borderRadius: 3,
                    background: alpha(theme.palette.background.paper, 0.5),
                    border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
                    backdropFilter: 'blur(10px)',
                    height: '100%',
                  }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2.5 }}>
                    <Stack direction="row" alignItems="center" spacing={1.5}>
                      <BarChart sx={{ color: theme.palette.primary.main, fontSize: 22 }} />
                      <Typography variant="h6" fontWeight={600}>
                        Category Intelligence
                      </Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Top {intelligence?.global_metrics?.sample_count || 449} markets
                    </Typography>
                  </Stack>
                  <Stack spacing={1.5}>
                    {intelligence?.category_intelligence?.slice(0, 8).map((cat, index) => (
                      <Box 
                        key={cat.category}
                        onClick={() => navigate(`/events?category=${cat.category}`)}
                        sx={{
                          p: 1.5,
                          borderRadius: 1.5,
                          background: alpha(theme.palette.primary.main, 0.03),
                          border: `1px solid ${alpha(theme.palette.divider, 0.05)}`,
                          animation: `${fadeIn} 0.4s ease-out ${0.05 * index}s both`,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            background: alpha(theme.palette.primary.main, 0.08),
                            transform: 'translateX(4px)',
                          },
                        }}
                      >
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2" fontWeight={500}>
                            {cat.display_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: '"SF Mono", monospace' }}>
                            {cat.market_count} markets
                          </Typography>
                        </Stack>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }}>
                          <Box sx={{ flex: 1, height: 4, borderRadius: 2, bgcolor: alpha(theme.palette.divider, 0.2) }}>
                            <Box 
                              sx={{ 
                                height: '100%', 
                                borderRadius: 2, 
                                bgcolor: theme.palette.primary.main,
                                width: `${Math.min(cat.volume_share, 100)}%`,
                              }} 
                            />
                          </Box>
                          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 45, textAlign: 'right' }}>
                            {cat.volume_share.toFixed(1)}%
                          </Typography>
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                </Paper>
              </Grid>

              {/* Platform Comparison */}
              <Grid item xs={12}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    borderRadius: 3,
                    background: alpha(theme.palette.background.paper, 0.5),
                    border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <Typography variant="h6" fontWeight={600} sx={{ mb: 2.5 }}>
                    Platform Comparison
                  </Typography>
                  <Grid container spacing={2}>
                    {intelligence?.platform_comparison?.map((platform, index) => {
                      const platformKey = platform.platform as keyof typeof PLATFORM_COLORS;
                      const colors = PLATFORM_COLORS[platformKey] || { primary: theme.palette.primary.main };
                      
                      return (
                        <Grid item xs={12} sm={6} md={3} key={platform.platform}>
                          <Box
                            sx={{
                              p: 2,
                              borderRadius: 2,
                              background: `linear-gradient(135deg, ${alpha(colors.primary, 0.1)} 0%, transparent 100%)`,
                              border: `1px solid ${alpha(colors.primary, 0.2)}`,
                              animation: `${fadeIn} 0.4s ease-out ${0.1 * index}s both`,
                            }}
                          >
                            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
                              <Box
                                sx={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 1.5,
                                  background: alpha(colors.primary, 0.2),
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Typography fontWeight={700} sx={{ color: colors.primary, fontSize: '0.9rem' }}>
                                  {platform.display_name.charAt(0)}
                                </Typography>
                              </Box>
                              <Typography variant="subtitle2" fontWeight={600}>{platform.display_name}</Typography>
                            </Stack>
                            <Grid container spacing={1}>
                              <Grid item xs={6}>
                                <Typography variant="caption" color="text.secondary">Total Markets</Typography>
                                <Typography variant="body1" fontWeight={600} sx={{ fontFamily: '"SF Mono", monospace' }}>
                                  {formatNumber(platform.total_markets)}
                                </Typography>
                              </Grid>
                              <Grid item xs={6}>
                                <Typography variant="caption" color="text.secondary">Est. Volume</Typography>
                                <Typography variant="body1" fontWeight={600} sx={{ fontFamily: '"SF Mono", monospace' }}>
                                  ${formatNumber(platform.estimated_volume || platform.sample_volume)}
                                </Typography>
                              </Grid>
                              <Grid item xs={12}>
                                <Typography variant="caption" color="text.secondary">Liquidity Score</Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Box sx={{ flex: 1, height: 4, borderRadius: 2, bgcolor: alpha(colors.primary, 0.2) }}>
                                    <Box 
                                      sx={{ 
                                        height: '100%', 
                                        borderRadius: 2, 
                                        bgcolor: colors.primary,
                                        width: `${Math.min(platform.liquidity_score, 100)}%`,
                                      }} 
                                    />
                                  </Box>
                                  <Typography variant="caption" fontWeight={600} sx={{ color: colors.primary }}>
                                    {platform.liquidity_score.toFixed(0)}
                                  </Typography>
                                </Box>
                              </Grid>
                            </Grid>
                          </Box>
                        </Grid>
                      );
                    })}
                  </Grid>
                </Paper>
              </Grid>

              {/* Analytics Section - Charts & Insights */}
              <Grid item xs={12}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    borderRadius: 3,
                    background: alpha(theme.palette.background.paper, 0.5),
                    border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
                    <Insights sx={{ color: theme.palette.primary.main, fontSize: 24 }} />
                    <Typography variant="h6" fontWeight={600}>
                      Cross-Platform Analytics
                    </Typography>
                  </Stack>
                  
                  <Grid container spacing={2} alignItems="stretch">
                    {/* Row 1: Market Movers + Cross-Platform Prices */}
                    <Grid item xs={12} md={6}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2.5,
                          borderRadius: 2,
                          background: alpha(theme.palette.background.paper, 0.3),
                          border: `1px solid ${alpha(theme.palette.divider, 0.06)}`,
                          height: '100%',
                        }}
                      >
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                          <TrendingUp sx={{ fontSize: 18, color: theme.palette.success.main }} />
                          <Typography variant="subtitle2" fontWeight={600}>
                            Market Movers
                          </Typography>
                          <Chip 
                            label="24H" 
                            size="small" 
                            sx={{ 
                              height: 18, 
                              fontSize: '0.6rem',
                              bgcolor: alpha(theme.palette.primary.main, 0.15),
                              color: theme.palette.primary.main,
                            }} 
                          />
                        </Stack>
                        <MarketMoversCard />
                      </Paper>
                    </Grid>

                    <Grid item xs={12} md={6}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2.5,
                          borderRadius: 2,
                          background: alpha(theme.palette.background.paper, 0.3),
                          border: `1px solid ${alpha(theme.palette.divider, 0.06)}`,
                          height: '100%',
                        }}
                      >
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                          <CompareArrows sx={{ fontSize: 18, color: theme.palette.info.main }} />
                          <Typography variant="subtitle2" fontWeight={600}>
                            Cross-Platform Prices
                          </Typography>
                        </Stack>
                        <PriceComparisonWidget />
                      </Paper>
                    </Grid>

                    {/* Row 2: Volume Trends (wide) + Donut */}
                    <Grid item xs={12} md={8}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2.5,
                          borderRadius: 2,
                          background: alpha(theme.palette.background.paper, 0.3),
                          border: `1px solid ${alpha(theme.palette.divider, 0.06)}`,
                          height: '100%',
                        }}
                      >
                        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                          📈 Volume Trends
                        </Typography>
                        <VolumeTrendChart
                          platformVolumes={{
                            polymarket: intelligence?.global_metrics?.platform_estimated_volumes?.polymarket || 0,
                            kalshi: intelligence?.global_metrics?.platform_estimated_volumes?.kalshi || 0,
                            limitless: intelligence?.global_metrics?.platform_volumes?.limitless || 0,
                          }}
                        />
                      </Paper>
                    </Grid>

                    <Grid item xs={12} md={4}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2.5,
                          borderRadius: 2,
                          background: alpha(theme.palette.background.paper, 0.3),
                          border: `1px solid ${alpha(theme.palette.divider, 0.06)}`,
                          height: '100%',
                        }}
                      >
                        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                          🥧 Market Distribution
                        </Typography>
                        <PlatformDonutChart
                          data={{
                            polymarket: intelligence?.global_metrics?.platform_counts?.polymarket || eventsStats?.platform_counts?.polymarket || 0,
                            kalshi: intelligence?.global_metrics?.platform_counts?.kalshi || eventsStats?.platform_counts?.kalshi || 0,
                            limitless: intelligence?.global_metrics?.platform_counts?.limitless || eventsStats?.platform_counts?.limitless || 0,
                          }}
                          type="markets"
                        />
                      </Paper>
                    </Grid>

                    {/* Row 3: Category Volume Map + Arbitrage Opportunities */}
                    <Grid item xs={12} md={6}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2.5,
                          borderRadius: 2,
                          background: alpha(theme.palette.background.paper, 0.3),
                          border: `1px solid ${alpha(theme.palette.divider, 0.06)}`,
                          height: '100%',
                        }}
                      >
                        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                          📊 Category Volume Map
                        </Typography>
                        <CategoryTreemap
                          categories={intelligence?.global_metrics?.categories || {}}
                        />
                      </Paper>
                    </Grid>

                    <Grid item xs={12} md={6}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2.5,
                          borderRadius: 2,
                          background: alpha(theme.palette.background.paper, 0.3),
                          border: `1px solid ${alpha(theme.palette.divider, 0.06)}`,
                          height: '100%',
                        }}
                      >
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                          <SwapHoriz sx={{ fontSize: 18, color: theme.palette.success.main }} />
                          <Typography variant="subtitle2" fontWeight={600}>
                            Arbitrage Opportunities
                          </Typography>
                          <Chip 
                            label="LIVE" 
                            size="small" 
                            sx={{ 
                              height: 18, 
                              fontSize: '0.6rem',
                              bgcolor: alpha(theme.palette.success.main, 0.15),
                              color: theme.palette.success.main,
                            }} 
                          />
                        </Stack>
                        <ArbitrageCard opportunities={intelligence?.arbitrage_opportunities || []} />
                      </Paper>
                    </Grid>

                    {/* Row 4: AI-Powered Search */}
                    <Grid item xs={12}>
                      <Paper
                        elevation={0}
                        onClick={() => navigate('/ask-predictions')}
                        sx={{
                          p: 2.5,
                          borderRadius: 2,
                          background: alpha(theme.palette.background.paper, 0.3),
                          border: `1px solid ${alpha(theme.palette.divider, 0.06)}`,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                            boxShadow: `0 4px 20px ${alpha(theme.palette.primary.main, 0.1)}`,
                          },
                        }}
                      >
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                          <AutoAwesome sx={{ fontSize: 18, color: theme.palette.warning.main }} />
                          <Typography variant="subtitle2" fontWeight={600}>
                            AI-Powered Search
                          </Typography>
                          <Chip 
                            label="TRY IT" 
                            size="small" 
                            sx={{ 
                              height: 18, 
                              fontSize: '0.6rem',
                              bgcolor: alpha(theme.palette.warning.main, 0.15),
                              color: theme.palette.warning.main,
                            }} 
                          />
                        </Stack>
                        <SmartSearchPreview />
                      </Paper>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            </Grid>
          </>
        )}
      </Box>
    </Box>
  );
};
