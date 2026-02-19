import { Box, Typography, LinearProgress, alpha, useTheme } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Market {
  title: string;
  volume: number;
  platform: string;
}

interface MarketDistributionProps {
  markets: Market[];
}

export const MarketDistribution = ({ markets }: MarketDistributionProps) => {
  const theme = useTheme();

  // Group markets by volume ranges
  const ranges = [
    { label: '0-100K', min: 0, max: 100000, count: 0 },
    { label: '100K-500K', min: 100000, max: 500000, count: 0 },
    { label: '500K-1M', min: 500000, max: 1000000, count: 0 },
    { label: '1M-5M', min: 1000000, max: 5000000, count: 0 },
    { label: '5M+', min: 5000000, max: Infinity, count: 0 },
  ];

  markets.forEach(market => {
    const volume = market.volume || 0;
    const range = ranges.find(r => volume >= r.min && volume < r.max);
    if (range) range.count++;
  });

  const totalMarkets = markets.length;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percentage = ((data.count / totalMarkets) * 100).toFixed(1);
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
          <Typography variant="body2" sx={{ color: theme.palette.text.primary, fontWeight: 600 }}>
            {data.label}
          </Typography>
          <Typography variant="caption" sx={{ color: theme.palette.primary.light }}>
            {data.count} markets ({percentage}%)
          </Typography>
        </Box>
      );
    }
    return null;
  };

  return (
    <Box sx={{ height: 380, display: 'flex', flexDirection: 'column' }}>
      <Typography
        variant="h6"
        sx={{
          mb: 2,
          fontWeight: 600,
        }}
      >
        Volume Distribution
      </Typography>
      
      {/* Bar Chart */}
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={ranges}>
          <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.primary.main, 0.1)} />
          <XAxis 
            dataKey="label" 
            tick={{ fill: theme.palette.text.secondary, fontSize: 10 }}
            stroke={alpha(theme.palette.primary.main, 0.2)}
          />
          <YAxis 
            tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
            stroke={alpha(theme.palette.primary.main, 0.2)}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: alpha(theme.palette.primary.main, 0.1) }} />
          <Bar 
            dataKey="count" 
            fill={theme.palette.primary.main}
            radius={[6, 6, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>

      {/* Linear Progress Bars */}
      <Box sx={{ mt: 2, flex: 1, overflow: 'auto' }}>
        {ranges.map((range, index) => {
          const percentage = totalMarkets > 0 ? (range.count / totalMarkets) * 100 : 0;
          return (
            <Box key={index} sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontSize: '0.75rem' }}>
                  {range.label}
                </Typography>
                <Typography variant="caption" sx={{ color: theme.palette.primary.light, fontWeight: 600, fontSize: '0.75rem' }}>
                  {range.count} ({percentage.toFixed(1)}%)
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={percentage}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: alpha(theme.palette.primary.main, 0.1),
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 3,
                    backgroundColor: theme.palette.primary.main,
                  },
                }}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
