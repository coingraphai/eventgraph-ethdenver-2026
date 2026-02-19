import { Box, Typography, Grid, Paper, alpha, useTheme } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import CategoryIcon from '@mui/icons-material/Category';

interface PlatformStats {
  open_markets: number;
  top_10_volume: number;
  avg_volume: number;
}

interface PlatformInsightsProps {
  polymarket: PlatformStats;
  kalshi: PlatformStats;
}

export const PlatformInsights = ({ polymarket, kalshi }: PlatformInsightsProps) => {
  const theme = useTheme();

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) return `$${(volume / 1000000).toFixed(2)}M`;
    if (volume >= 1000) return `$${(volume / 1000).toFixed(1)}K`;
    return `$${volume.toFixed(0)}`;
  };

  const platformData = [
    {
      name: 'Polymarket',
      color: theme.palette.primary.main,
      stats: polymarket,
      insights: [
        {
          icon: <CategoryIcon />,
          label: 'Open Markets',
          value: polymarket.open_markets.toLocaleString(),
        },
        {
          icon: <TrendingUpIcon />,
          label: 'Top 10 Vol (24h)',
          value: formatVolume(polymarket.top_10_volume),
        },
        {
          icon: <ShowChartIcon />,
          label: 'Avg Vol (24h)',
          value: formatVolume(polymarket.avg_volume),
        },
      ],
    },
    {
      name: 'Kalshi',
      color: theme.palette.primary.dark,
      stats: kalshi,
      insights: [
        {
          icon: <CategoryIcon />,
          label: 'Open Markets',
          value: kalshi.open_markets.toLocaleString(),
        },
        {
          icon: <TrendingUpIcon />,
          label: 'Top 10 Vol (24h)',
          value: formatVolume(kalshi.top_10_volume),
        },
        {
          icon: <ShowChartIcon />,
          label: 'Avg Vol (24h)',
          value: formatVolume(kalshi.avg_volume),
        },
      ],
    },
  ];

  return (
    <Box>
      <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mb: 2 }}>
        Platform-Specific Insights
      </Typography>
      <Grid container spacing={2}>
        {platformData.map((platform) => (
          <Grid item xs={12} md={6} key={platform.name}>
            <Paper
              sx={{
                p: 2.5,
                background: alpha(platform.color, 0.05),
                border: `1px solid ${alpha(platform.color, 0.2)}`,
                borderRadius: 2,
                height: '100%',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 28,
                    background: platform.color,
                    borderRadius: 1,
                    mr: 1.5,
                  }}
                />
                <Typography variant="h6" fontWeight={700} sx={{ color: platform.color }}>
                  {platform.name}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {platform.insights.map((insight, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      p: 1.5,
                      background: alpha(theme.palette.background.paper, 0.5),
                      borderRadius: 1,
                      border: `1px solid ${alpha(platform.color, 0.1)}`,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          color: platform.color,
                          display: 'flex',
                          alignItems: 'center',
                          '& svg': { fontSize: 18 },
                        }}
                      >
                        {insight.icon}
                      </Box>
                      <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                        {insight.label}
                      </Typography>
                    </Box>
                    <Typography variant="body1" fontWeight={700} sx={{ color: platform.color }}>
                      {insight.value}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};
