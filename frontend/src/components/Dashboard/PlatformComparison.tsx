import { Box, Typography, Grid, Paper, alpha, useTheme } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import BarChartIcon from '@mui/icons-material/BarChart';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';

interface PlatformStats {
  open_markets: number;
  top_10_volume: number;
  avg_volume: number;
}

interface PlatformComparisonProps {
  polymarket: PlatformStats;
  kalshi: PlatformStats;
}

export const PlatformComparison = ({ polymarket, kalshi }: PlatformComparisonProps) => {
  const theme = useTheme();
  
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
  };

  const formatCount = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const StatCard = ({
    label,
    polyValue,
    kalshiValue,
    icon: Icon,
    formatter,
    suffix = ''
  }: {
    label: string;
    polyValue: number;
    kalshiValue: number;
    icon: any;
    formatter: (n: number) => string;
    suffix?: string;
  }) => (
    <Grid item xs={6} sm={3}>
      <Box
        sx={{
          p: 2.5,
          background: alpha(theme.palette.primary.main, 0.05),
          border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
          borderRadius: 2,
          transition: 'all 0.3s ease',
          '&:hover': {
            transform: 'translateY(-4px)',
            border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
            boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.15)}`,
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: '8px',
              background: alpha(theme.palette.primary.main, 0.15),
              mr: 1.5,
            }}
          >
            <Icon sx={{ color: theme.palette.primary.light, fontSize: 18 }} />
          </Box>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontWeight: 600, fontSize: '0.85rem' }}>
            {label}
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box>
            <Typography variant="caption" sx={{ color: theme.palette.primary.main, fontSize: '0.7rem', display: 'block', mb: 0.5, fontWeight: 600 }}>
              Polymarket
            </Typography>
            <Typography variant="h6" sx={{ color: theme.palette.text.primary, fontWeight: 700, fontSize: '1.25rem', lineHeight: 1 }}>
              {formatter(polyValue)}{suffix}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: theme.palette.primary.dark, fontSize: '0.7rem', display: 'block', mb: 0.5, fontWeight: 600 }}>
              Kalshi
            </Typography>
            <Typography variant="h6" sx={{ color: theme.palette.text.primary, fontWeight: 700, fontSize: '1.25rem', lineHeight: 1 }}>
              {formatter(kalshiValue)}{suffix}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Grid>
  );

  const totalVolume = polymarket.top_10_volume + kalshi.top_10_volume;
  const totalMarkets = polymarket.open_markets + kalshi.open_markets;

  return (
    <Box>
      <Grid container spacing={2}>
        <StatCard
          label="Open Markets"
          polyValue={polymarket.open_markets}
          kalshiValue={kalshi.open_markets}
          icon={BarChartIcon}
          formatter={formatCount}
        />
        <StatCard
          label="Top 10 Volume"
          polyValue={polymarket.top_10_volume}
          kalshiValue={kalshi.top_10_volume}
          icon={TrendingUpIcon}
          formatter={formatNumber}
        />
        <StatCard
          label="Avg Volume"
          polyValue={polymarket.avg_volume}
          kalshiValue={kalshi.avg_volume}
          icon={ShowChartIcon}
          formatter={formatNumber}
        />
        <StatCard
          label="Combined"
          polyValue={totalMarkets}
          kalshiValue={totalVolume}
          icon={AttachMoneyIcon}
          formatter={(n) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : `${(n / 1000).toFixed(0)}K`}
          suffix=""
        />
      </Grid>
    </Box>
  );
};
