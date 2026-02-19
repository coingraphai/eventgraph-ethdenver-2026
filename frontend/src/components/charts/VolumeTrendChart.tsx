/**
 * Volume Trend Line Chart
 * Shows volume trends over time (simulated with current data distribution)
 */
import React, { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { Box, Typography, useTheme, alpha, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { PLATFORM_COLORS as APP_PLATFORM_COLORS } from '../../utils/colors';

interface VolumeTrendChartProps {
  platformVolumes: {
    polymarket: number;
    kalshi: number;
    limitless: number;
    opiniontrade: number;
  };
  historicalData?: Array<{
    timestamp: string;
    polymarket: number;
    kalshi: number;
    limitless: number;
    opiniontrade: number;
  }>;
}

const PLATFORM_COLORS = {
  polymarket: APP_PLATFORM_COLORS.polymarket.primary,
  kalshi: APP_PLATFORM_COLORS.kalshi.primary,
  limitless: APP_PLATFORM_COLORS.limitless.primary,
  opiniontrade: APP_PLATFORM_COLORS.opiniontrade.primary,
};

// Generate simulated historical data based on current volumes
const generateHistoricalData = (currentVolumes: Record<string, number>, period: '24h' | '7d' | '30d') => {
  const points = period === '24h' ? 24 : period === '7d' ? 7 : 30;
  const data = [];
  
  for (let i = points - 1; i >= 0; i--) {
    const variance = () => 0.7 + Math.random() * 0.6; // 70% to 130% variance
    const trend = 1 + (points - i) * 0.02; // Slight upward trend
    
    const date = new Date();
    if (period === '24h') {
      date.setHours(date.getHours() - i);
    } else {
      date.setDate(date.getDate() - i);
    }
    
    data.push({
      timestamp: period === '24h' 
        ? date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      polymarket: Math.round(currentVolumes.polymarket * variance() / trend / points),
      kalshi: Math.round(currentVolumes.kalshi * variance() / trend / points),
      limitless: Math.round(currentVolumes.limitless * variance() / trend / points),
      opiniontrade: Math.round(currentVolumes.opiniontrade * variance() / trend / points),
      total: 0,
    });
  }
  
  // Calculate totals
  data.forEach(d => {
    d.total = d.polymarket + d.kalshi + d.limitless + d.opiniontrade;
  });
  
  return data;
};

export const VolumeTrendChart: React.FC<VolumeTrendChartProps> = ({ platformVolumes, historicalData }) => {
  const theme = useTheme();
  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('7d');
  
  const data = historicalData || generateHistoricalData(platformVolumes, period);

  const formatVolume = (val: number | undefined | null) => {
    if (val === undefined || val === null || isNaN(val)) return '$0';
    if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
    if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
    return `$${val}`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum: number, p: any) => sum + (p.value || 0), 0);
      return (
        <Box
          sx={{
            background: alpha(theme.palette.background.paper, 0.95),
            border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
            borderRadius: 1,
            p: 1.5,
            backdropFilter: 'blur(8px)',
          }}
        >
          <Typography variant="subtitle2" fontWeight={600} mb={0.5}>
            {label}
          </Typography>
          {payload.map((entry: any) => (
            <Box key={entry.dataKey} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
              <Typography variant="caption" sx={{ color: entry.color }}>
                {entry.dataKey.charAt(0).toUpperCase() + entry.dataKey.slice(1)}
              </Typography>
              <Typography variant="caption" fontFamily="'SF Mono', monospace">
                {formatVolume(entry.value)}
              </Typography>
            </Box>
          ))}
          <Box sx={{ borderTop: `1px solid ${alpha(theme.palette.divider, 0.2)}`, mt: 0.5, pt: 0.5 }}>
            <Typography variant="caption" fontWeight={600}>
              Total: {formatVolume(total)}
            </Typography>
          </Box>
        </Box>
      );
    }
    return null;
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <ToggleButtonGroup
          value={period}
          exclusive
          onChange={(_, val) => val && setPeriod(val)}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              px: 1.5,
              py: 0.25,
              fontSize: '0.7rem',
              textTransform: 'none',
              border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
              '&.Mui-selected': {
                bgcolor: alpha(theme.palette.primary.main, 0.2),
                color: theme.palette.primary.main,
              },
            },
          }}
        >
          <ToggleButton value="24h">24H</ToggleButton>
          <ToggleButton value="7d">7D</ToggleButton>
          <ToggleButton value="30d">30D</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      
      <Box sx={{ width: '100%', height: 220, minWidth: 200 }}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <defs>
              {Object.entries(PLATFORM_COLORS).map(([key, color]) => (
                <linearGradient key={key} id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke={alpha(theme.palette.divider, 0.1)}
              vertical={false}
            />
            <XAxis 
              dataKey="timestamp" 
              tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
              axisLine={{ stroke: alpha(theme.palette.divider, 0.2) }}
              tickLine={false}
            />
            <YAxis 
              tickFormatter={formatVolume}
              tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            {Object.entries(PLATFORM_COLORS).map(([key, color]) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={2}
                fill={`url(#gradient-${key})`}
                dot={false}
                activeDot={{ r: 4, fill: color }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </Box>
      
      {/* Legend */}
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 1, flexWrap: 'wrap' }}>
        {Object.entries(PLATFORM_COLORS).map(([key, color]) => (
          <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 12, height: 3, bgcolor: color, borderRadius: 1 }} />
            <Typography variant="caption" color="text.secondary" textTransform="capitalize">
              {key}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default VolumeTrendChart;
