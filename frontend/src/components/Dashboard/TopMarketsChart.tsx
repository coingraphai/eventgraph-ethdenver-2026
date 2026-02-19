import { Box, Typography, Chip, alpha, useTheme } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Market {
  title: string;
  volume: number;
  platform: string;
  image?: string;
  tags?: string[];
}

interface TopMarketsChartProps {
  markets: Market[];
}

export const TopMarketsChart = ({ markets }: TopMarketsChartProps) => {
  const theme = useTheme();
  
  const PLATFORM_COLORS: { [key: string]: string } = {
    Polymarket: theme.palette.primary.main,
    Kalshi: theme.palette.primary.dark,
  };
  
  // Prepare data for the chart
  const chartData = markets.slice(0, 10).map(market => ({
    name: market.title.length > 35 ? market.title.substring(0, 35) + '...' : market.title,
    volume: Number((market.volume / 1000000).toFixed(2)), // Convert to millions
    platform: market.platform,
    fullTitle: market.title,
    tags: market.tags,
  }));

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
            borderRadius: 1.5,
            maxWidth: 320,
            boxShadow: `0 8px 32px ${alpha('#000', 0.5)}`,
          }}
        >
          <Typography variant="subtitle2" sx={{ color: theme.palette.text.primary, mb: 1.5, fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.3 }}>
            {data.fullTitle}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontSize: '0.85rem' }}>
              Platform:
            </Typography>
            <Chip
              label={data.platform}
              size="small"
              sx={{
                fontSize: '0.75rem',
                height: 22,
                background: `${PLATFORM_COLORS[data.platform as keyof typeof PLATFORM_COLORS]}30`,
                color: PLATFORM_COLORS[data.platform as keyof typeof PLATFORM_COLORS],
                border: 'none',
                fontWeight: 600,
              }}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontSize: '0.85rem' }}>
              Volume:
            </Typography>
            <Typography variant="body2" sx={{ color: theme.palette.primary.light, fontWeight: 700, fontSize: '0.9rem' }}>
              ${data.volume}M
            </Typography>
          </Box>
          {data.tags && data.tags.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {data.tags.slice(0, 4).map((tag: string, idx: number) => (
                <Chip
                  key={idx}
                  label={tag}
                  size="small"
                  sx={{
                    fontSize: '0.7rem',
                    height: 20,
                    background: alpha(theme.palette.primary.main, 0.2),
                    color: theme.palette.primary.light,
                    border: 'none',
                  }}
                />
              ))}
            </Box>
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
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontWeight: 700,
        }}
      >
        Top Markets (All Platforms)
      </Typography>
      <ResponsiveContainer width="100%" height={340}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.primary.main, 0.1)} horizontal={true} vertical={false} />
          <XAxis
            type="number"
            tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
            stroke={alpha(theme.palette.primary.main, 0.2)}
            label={{ value: 'Volume ($M)', position: 'insideBottom', offset: -5, fill: theme.palette.text.secondary, fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
            stroke={alpha(theme.palette.primary.main, 0.2)}
            width={140}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: alpha(theme.palette.primary.main, 0.1) }} />
          <Bar dataKey="volume" radius={[0, 8, 8, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={PLATFORM_COLORS[entry.platform as keyof typeof PLATFORM_COLORS]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
};
