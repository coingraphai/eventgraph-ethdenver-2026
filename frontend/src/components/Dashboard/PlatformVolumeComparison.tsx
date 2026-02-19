import { Box, Typography, alpha, useTheme } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Market {
  title: string;
  platform: string;
  volume: number;
  volume_week?: number;
}

interface PlatformVolumeProps {
  markets: Market[];
}

export const PlatformVolumeComparison = ({ markets }: PlatformVolumeProps) => {
  const theme = useTheme();

  // Aggregate volume by platform
  const platformData = markets.reduce((acc: any, market) => {
    const platform = market.platform;
    if (!acc[platform]) {
      acc[platform] = { platform, volume: 0, count: 0 };
    }
    acc[platform].volume += market.volume || 0;
    acc[platform].count += 1;
    return acc;
  }, {});

  const chartData = Object.values(platformData).map((data: any) => ({
    platform: data.platform,
    volume: parseFloat((data.volume / 1000000).toFixed(2)), // Convert to millions
    avgVolume: parseFloat((data.volume / data.count / 1000).toFixed(1)), // Average in thousands
    count: data.count
  }));

  const COLORS = {
    Polymarket: theme.palette.primary.main,
    Kalshi: theme.palette.primary.dark,
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <Box
          sx={{
            p: 2,
            background: alpha(theme.palette.background.paper, 0.98),
            backdropFilter: 'blur(10px)',
            border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
            borderRadius: 1,
          }}
        >
          <Typography variant="body2" sx={{ color: theme.palette.text.primary, fontWeight: 600, mb: 1 }}>
            {data.platform}
          </Typography>
          <Typography variant="caption" sx={{ color: theme.palette.primary.light, display: 'block' }}>
            Total Volume: ${data.volume}M
          </Typography>
          <Typography variant="caption" sx={{ color: theme.palette.text.secondary, display: 'block' }}>
            Markets: {data.count}
          </Typography>
          <Typography variant="caption" sx={{ color: theme.palette.text.secondary, display: 'block' }}>
            Avg Volume: ${data.avgVolume}K
          </Typography>
        </Box>
      );
    }
    return null;
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
        Platform Volume Comparison
      </Typography>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.primary.main, 0.1)} />
          <XAxis 
            dataKey="platform" 
            tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
            stroke={alpha(theme.palette.primary.main, 0.2)}
          />
          <YAxis 
            tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
            stroke={alpha(theme.palette.primary.main, 0.2)}
            label={{ value: 'Volume ($M)', angle: -90, position: 'insideLeft', fill: theme.palette.text.secondary }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: alpha(theme.palette.primary.main, 0.1) }} />
          <Bar dataKey="volume" radius={[8, 8, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[entry.platform as keyof typeof COLORS] || theme.palette.primary.main} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
};
