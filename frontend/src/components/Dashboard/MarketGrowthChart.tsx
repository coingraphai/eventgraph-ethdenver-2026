import { Box, Typography, alpha, useTheme } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Market {
  title: string;
  volume: number;
  volume_week?: number;
  platform: string;
}

interface MarketGrowthProps {
  markets: Market[];
}

export const MarketGrowthChart = ({ markets }: MarketGrowthProps) => {
  const theme = useTheme();

  // Create time-series data simulating market growth
  const chartData = markets.slice(0, 10).map((market, index) => ({
    index: index + 1,
    volume: parseFloat((market.volume / 1000000).toFixed(2)),
    weeklyVolume: market.volume_week ? parseFloat((market.volume_week / 1000000).toFixed(2)) : 0,
    name: market.title.substring(0, 15) + '...',
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <Box
          sx={{
            p: 1.5,
            background: alpha(theme.palette.background.paper, 0.98),
            backdropFilter: 'blur(10px)',
            border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
            borderRadius: 1,
          }}
        >
          <Typography variant="caption" sx={{ color: theme.palette.text.primary, fontWeight: 600, display: 'block', mb: 0.5 }}>
            {data.name}
          </Typography>
          <Typography variant="caption" sx={{ color: theme.palette.primary.main, display: 'block' }}>
            Volume: ${data.volume}M
          </Typography>
          {data.weeklyVolume > 0 && (
            <Typography variant="caption" sx={{ color: theme.palette.primary.light, display: 'block' }}>
              Weekly: ${data.weeklyVolume}M
            </Typography>
          )}
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
        Market Growth Trajectory
      </Typography>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.primary.main, 0.1)} />
          <XAxis 
            dataKey="index" 
            tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
            stroke={alpha(theme.palette.primary.main, 0.2)}
            label={{ value: 'Market Rank', position: 'insideBottom', offset: -5, fill: theme.palette.text.secondary }}
          />
          <YAxis 
            tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
            stroke={alpha(theme.palette.primary.main, 0.2)}
            label={{ value: 'Volume ($M)', angle: -90, position: 'insideLeft', fill: theme.palette.text.secondary }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ paddingTop: '10px' }}
            formatter={(value) => (
              <span style={{ color: theme.palette.text.secondary, fontSize: '0.85rem' }}>{value}</span>
            )}
          />
          <Line 
            type="monotone" 
            dataKey="volume" 
            stroke={theme.palette.primary.main} 
            strokeWidth={3}
            dot={{ fill: theme.palette.primary.main, strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6 }}
            name="Total Volume"
          />
          <Line 
            type="monotone" 
            dataKey="weeklyVolume" 
            stroke={theme.palette.primary.light} 
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ fill: theme.palette.primary.light, strokeWidth: 2, r: 3 }}
            name="Weekly Volume"
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
};
