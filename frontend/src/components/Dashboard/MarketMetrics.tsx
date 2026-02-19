import { Box, Typography, Grid, alpha, useTheme, keyframes } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import ShowChartIcon from '@mui/icons-material/ShowChart';

interface MarketMetric {
  label: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
}

interface MarketMetricsProps {
  metrics: MarketMetric[];
}

// Subtle pulse animation for trend icons
const pulseAnimation = keyframes`
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.15);
    opacity: 0.8;
  }
`;

// Fade in animation for cards
const fadeInUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

// Shimmer effect for values
const shimmer = keyframes`
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
`;

export const MarketMetrics = ({ metrics }: MarketMetricsProps) => {
  const theme = useTheme();

  const getTrendIcon = (trend?: string) => {
    if (trend === 'up') return (
      <TrendingUpIcon 
        sx={{ 
          fontSize: 18, 
          color: theme.palette.success.main,
          animation: `${pulseAnimation} 2s ease-in-out infinite`,
        }} 
      />
    );
    if (trend === 'down') return (
      <TrendingDownIcon 
        sx={{ 
          fontSize: 18, 
          color: theme.palette.error.main,
          animation: `${pulseAnimation} 2s ease-in-out infinite`,
        }} 
      />
    );
    return <ShowChartIcon sx={{ fontSize: 18, color: theme.palette.text.secondary }} />;
  };

  const getTrendColor = (trend?: string) => {
    if (trend === 'up') return theme.palette.success.main;
    if (trend === 'down') return theme.palette.error.main;
    return theme.palette.text.secondary;
  };

  return (
    <Box>
      <Typography
        variant="h6"
        sx={{
          mb: 2,
          fontWeight: 600,
        }}
      >
        Market Metrics
      </Typography>
      <Grid container spacing={2}>
        {metrics.map((metric, index) => (
          <Grid item xs={12} sm={6} md={4} key={index}>
            <Box
              sx={{
                p: 2,
                background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${alpha(theme.palette.background.paper, 0.4)} 100%)`,
                border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
                borderRadius: 2,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                animation: `${fadeInUp} 0.5s ease-out ${index * 0.1}s both`,
                cursor: 'pointer',
                '&:hover': {
                  transform: 'translateY(-4px) scale(1.02)',
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.4)}`,
                  boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.15)}`,
                  background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.12)} 0%, ${alpha(theme.palette.background.paper, 0.6)} 100%)`,
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography 
                  variant="caption" 
                  sx={{ 
                    color: theme.palette.text.secondary, 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {metric.label}
                </Typography>
                {metric.trend && getTrendIcon(metric.trend)}
              </Box>
              <Typography 
                variant="h5" 
                sx={{ 
                  color: theme.palette.text.primary, 
                  fontWeight: 700, 
                  mb: 0.5,
                  background: `linear-gradient(90deg, ${theme.palette.text.primary} 0%, ${alpha(theme.palette.primary.main, 0.8)} 50%, ${theme.palette.text.primary} 100%)`,
                  backgroundSize: '200% 100%',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  transition: 'all 0.3s ease',
                }}
              >
                {metric.value}
              </Typography>
              {metric.change !== undefined && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      color: getTrendColor(metric.trend),
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      px: 0.8,
                      py: 0.2,
                      borderRadius: 1,
                      background: alpha(getTrendColor(metric.trend), 0.1),
                    }}
                  >
                    {metric.change > 0 ? '↑' : metric.change < 0 ? '↓' : '→'} {Math.abs(metric.change).toFixed(1)}%
                  </Typography>
                </Box>
              )}
            </Box>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};
