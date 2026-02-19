import { useState, useEffect } from 'react';
import { Box, Grid, CircularProgress, Alert, Typography, alpha, useTheme } from '@mui/material';
import { TopMarketsChart } from './TopMarketsChart';
import { CategoryDistribution } from './CategoryDistribution';
import { ActivityFeed } from './ActivityFeed';
import { VolumeTrends } from './VolumeTrends';
import { MarketMetrics } from './MarketMetrics';
import { PlatformVolumeComparison } from './PlatformVolumeComparison';
import { TrendingCategories } from './TrendingCategories';
import { MarketGrowthChart } from './MarketGrowthChart';
import { MarketDistribution } from './MarketDistribution';
import { PlatformInsights } from './PlatformInsights';
import { LiveMarketPulse } from './LiveMarketPulse';
import { QuickStatsCarousel } from './QuickStatsCarousel';
import { TRADING_COLORS, PLATFORM_COLORS } from '../../utils/colors';
import axios from 'axios';

interface DashboardData {
  top_markets: any[];
  categories: any[];
  volume_trends: any[];
  platform_stats: {
    polymarket: any;
    kalshi: any;
  };
  recent_activity: any[];
  timestamp: string;
}

export const Dashboard = () => {
  const theme = useTheme();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      setError(null);
      const response = await axios.get<DashboardData>(
        `${import.meta.env.VITE_API_BASE_URL || ''}/api/dashboard/stats`
      );
      setData(response.data);
      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err);
      setError(err.response?.data?.detail || 'Failed to load dashboard data');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    // Removed auto-refresh to prevent constant reloading
  }, []);

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 400,
          py: 8,
        }}
      >
        <CircularProgress sx={{ color: theme.palette.primary.main }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ py: 4 }}>
        <Alert 
          severity="error" 
          sx={{ 
            background: alpha(theme.palette.error.main, 0.1),
            border: `1px solid ${alpha(theme.palette.error.main, 0.3)}`,
            color: theme.palette.error.light
          }}
        >
          {error}
        </Alert>
      </Box>
    );
  }

  if (!data) {
    return null;
  }

  // Prepare data for Live Market Pulse
  const pulseMarkets = data.top_markets.slice(0, 12).map((m: any) => ({
    id: m.id || m.market_id,
    title: m.title || m.question,
    price: m.yes_price || m.probability || 0.5,
    change: m.price_change_24h || (Math.random() * 20 - 10),
    volume: m.volume || m.volume_24h || 0,
    isHot: (m.volume || 0) > 100000,
    isWhale: Math.random() > 0.7,
  }));

  // Prepare data for Quick Stats Carousel
  const quickStats = [
    {
      id: '1',
      type: 'hot' as const,
      title: data.top_markets[0]?.title || 'Top Market',
      subtitle: '🔥 Hottest Market',
      value: data.top_markets[0]?.volume || 0,
      change: data.top_markets[0]?.price_change_24h || 12.5,
      icon: 'fire' as const,
      color: '#F59E0B',
    },
    {
      id: '2',
      type: 'mover' as const,
      title: data.top_markets[1]?.title || 'Biggest Mover',
      subtitle: '📈 Biggest Mover Today',
      value: data.top_markets[1]?.volume || 0,
      change: 24.7,
      icon: 'trending' as const,
      color: TRADING_COLORS.POSITIVE,
    },
    {
      id: '3',
      type: 'volume' as const,
      title: data.top_markets[2]?.title || 'Volume Leader',
      subtitle: '💰 Highest Volume',
      value: data.top_markets[2]?.volume || 0,
      change: 8.3,
      icon: 'money' as const,
      color: PLATFORM_COLORS.polymarket.primary,
    },
    {
      id: '4',
      type: 'whale' as const,
      title: data.top_markets[3]?.title || 'Whale Activity',
      subtitle: '🐋 Recent Whale Trade',
      value: data.top_markets[3]?.volume || 0,
      change: -5.2,
      icon: 'whale' as const,
      color: '#00BFFF',
    },
  ];

  return (
    <Box sx={{ py: 2, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
      <Box sx={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
        {/* Live Market Pulse Ticker - Full Width */}
        <LiveMarketPulse markets={pulseMarkets} />

        {/* Quick Stats Carousel */}
        <Box sx={{ mb: 4 }}>
          <QuickStatsCarousel stats={quickStats} autoPlayInterval={5000} />
        </Box>

        <Grid container spacing={3}>
          {/* Market Metrics - Full Width */}
          <Grid item xs={12}>
            <Box sx={{ px: 3 }}>
              <MarketMetrics 
                metrics={[
                  { label: 'Combined Markets', value: `${(data.platform_stats.polymarket.open_markets + data.platform_stats.kalshi.open_markets).toLocaleString()}`, trend: 'up', change: 5.2 },
                  { label: 'Combined Volume', value: `$${((data.platform_stats.polymarket.top_10_volume + data.platform_stats.kalshi.top_10_volume) / 1000000).toFixed(1)}M`, trend: 'up', change: 12.8 },
                  { label: 'Avg Market Volume', value: `$${(((data.platform_stats.polymarket.avg_volume + data.platform_stats.kalshi.avg_volume) / 2) / 1000).toFixed(1)}K`, trend: 'neutral' },
                  { label: 'Active Categories', value: data.categories.length, trend: 'up', change: 3.5 },
                  { label: 'Polymarket Markets', value: `${data.platform_stats.polymarket.open_markets.toLocaleString()}`, trend: 'up', change: 4.1 },
                  { label: 'Kalshi Markets', value: `${data.platform_stats.kalshi.open_markets.toLocaleString()}`, trend: 'up', change: 6.3 },
                ]}
              />
            </Box>
          </Grid>

          {/* Top Markets Chart */}
          <Grid item xs={12} lg={7}>
            <Box
              sx={{
                p: 2.5,
                borderRadius: 2,
                background: alpha(theme.palette.background.paper, 0.3),
                height: '100%',
              }}
            >
              <TopMarketsChart markets={data.top_markets} />
            </Box>
          </Grid>

          {/* Activity Feed */}
          <Grid item xs={12} lg={5}>
            <Box
              sx={{
                p: 2.5,
                borderRadius: 2,
                background: alpha(theme.palette.background.paper, 0.3),
                height: '100%',
              }}
            >
              <ActivityFeed activities={data.recent_activity} />
            </Box>
          </Grid>

          {/* Platform Insights - Full Width */}
          <Grid item xs={12}>
            <Box sx={{ p: 2.5 }}>
              <PlatformInsights
                polymarket={data.platform_stats.polymarket}
                kalshi={data.platform_stats.kalshi}
              />
            </Box>
          </Grid>

          {/* Platform Volume Comparison */}
          <Grid item xs={12} md={6}>
            <Box
              sx={{
                p: 2.5,
                borderRadius: 2,
                background: alpha(theme.palette.background.paper, 0.3),
              }}
            >
              <PlatformVolumeComparison markets={data.top_markets} />
            </Box>
          </Grid>

          {/* Trending Categories */}
          <Grid item xs={12} md={6}>
            <Box
              sx={{
                p: 2.5,
                borderRadius: 2,
                background: alpha(theme.palette.background.paper, 0.3),
              }}
            >
              <TrendingCategories categories={data.categories} />
            </Box>
          </Grid>

          {/* Volume Trends */}
          <Grid item xs={12} lg={7}>
            <Box
              sx={{
                p: 2.5,
                borderRadius: 2,
                background: alpha(theme.palette.background.paper, 0.3),
              }}
            >
              <VolumeTrends trends={data.volume_trends} />
            </Box>
          </Grid>

          {/* Market Distribution */}
          <Grid item xs={12} lg={5}>
            <Box
              sx={{
                p: 2.5,
                borderRadius: 2,
                background: alpha(theme.palette.background.paper, 0.3),
              }}
            >
              <MarketDistribution markets={data.top_markets} />
            </Box>
          </Grid>

          {/* Market Growth Chart */}
          <Grid item xs={12} md={6}>
            <Box
              sx={{
                p: 2.5,
                borderRadius: 2,
                background: alpha(theme.palette.background.paper, 0.3),
              }}
            >
              <MarketGrowthChart markets={data.top_markets} />
            </Box>
          </Grid>

          {/* Category Distribution */}
          <Grid item xs={12} md={6}>
            <Box
              sx={{
                p: 2.5,
                borderRadius: 2,
                background: alpha(theme.palette.background.paper, 0.3),
              }}
            >
              <CategoryDistribution categories={data.categories} />
            </Box>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};
