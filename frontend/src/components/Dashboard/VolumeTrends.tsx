import { Box, Typography, alpha, useTheme } from '@mui/material';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface VolumeTrend {
  title: string;
  platform: string;
  weekly_avg: number;
  monthly_avg: number;
  trend: string;
}

interface VolumeTrendsProps {
  trends: VolumeTrend[];
}

export const VolumeTrends = ({ trends }: VolumeTrendsProps) => {
  const theme = useTheme();

  const chartData = trends.map((trend, index) => ({
    name: trend.title.substring(0, 20) + '...',
    weekly: trend.weekly_avg,
    monthly: trend.monthly_avg,
    platform: trend.platform,
    index
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const trendData = trends[payload[0].payload.index];
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
          <Typography variant="body2" sx={{ color: theme.palette.text.primary, fontWeight: 600, mb: 0.5 }}>
            {trendData?.title}
          </Typography>
          <Typography variant="caption" sx={{ color: theme.palette.primary.light, display: 'block', mb: 0.5 }}>
            Platform: {trendData?.platform}
          </Typography>
          <Typography variant="caption" sx={{ color: theme.palette.primary.main, display: 'block' }}>
            Weekly Avg: ${payload[0].value.toFixed(2)}
          </Typography>
          <Typography variant="caption" sx={{ color: theme.palette.primary.dark, display: 'block' }}>
            Monthly Avg: ${payload[1].value.toFixed(2)}
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
        Volume Trends
      </Typography>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorWeekly" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorMonthly" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={theme.palette.primary.dark} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={theme.palette.primary.dark} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.primary.main, 0.1)} />
          <XAxis 
            dataKey="name" 
            tick={{ fill: theme.palette.text.secondary, fontSize: 10 }}
            stroke={alpha(theme.palette.primary.main, 0.2)}
            angle={-15}
            textAnchor="end"
            height={80}
          />
          <YAxis 
            tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
            stroke={alpha(theme.palette.primary.main, 0.2)}
            label={{ value: 'Volume ($)', angle: -90, position: 'insideLeft', fill: theme.palette.text.secondary }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area 
            type="monotone" 
            dataKey="weekly" 
            stroke={theme.palette.primary.main} 
            fillOpacity={1} 
            fill="url(#colorWeekly)"
            strokeWidth={2}
          />
          <Area 
            type="monotone" 
            dataKey="monthly" 
            stroke={theme.palette.primary.dark} 
            fillOpacity={1} 
            fill="url(#colorMonthly)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  );
};
