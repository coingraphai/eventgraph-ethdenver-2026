/**
 * Platform Market Share Donut Chart
 * Visual breakdown of markets across platforms
 */
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Box, Typography, useTheme, alpha } from '@mui/material';
import { PLATFORM_COLORS as APP_PLATFORM_COLORS } from '../../utils/colors';

interface PlatformData {
  name: string;
  value: number;
  color: string;
  percentage: number;
  [key: string]: string | number; // Index signature for recharts compatibility
}

interface PlatformDonutChartProps {
  data: {
    polymarket: number;
    kalshi: number;
    limitless: number;
    opiniontrade: number;
  };
  type?: 'markets' | 'volume';
}

const PLATFORM_COLORS = {
  polymarket: APP_PLATFORM_COLORS.polymarket.primary,
  kalshi: APP_PLATFORM_COLORS.kalshi.primary,
  limitless: APP_PLATFORM_COLORS.limitless.primary,
  opiniontrade: APP_PLATFORM_COLORS.opiniontrade.primary,
};

const PLATFORM_NAMES = {
  polymarket: 'Polymarket',
  kalshi: 'Kalshi',
  limitless: 'Limitless',
  opiniontrade: 'OpinionTrade',
};

export const PlatformDonutChart: React.FC<PlatformDonutChartProps> = ({ data, type = 'markets' }) => {
  const theme = useTheme();
  
  const total = Object.values(data).reduce((sum, val) => sum + val, 0);
  
  const chartData: PlatformData[] = Object.entries(data)
    .map(([key, value]) => ({
      name: PLATFORM_NAMES[key as keyof typeof PLATFORM_NAMES],
      value,
      color: PLATFORM_COLORS[key as keyof typeof PLATFORM_COLORS],
      percentage: total > 0 ? (value / total) * 100 : 0,
    }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);

  const formatValue = (val: number | undefined | null) => {
    if (val === undefined || val === null || isNaN(val)) return type === 'volume' ? '$0' : '0';
    if (type === 'volume') {
      if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
      if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
      if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
      return `$${val.toFixed(0)}`;
    }
    if (val >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
    if (val >= 1e3) return `${(val / 1e3).toFixed(0)}K`;
    return val.toLocaleString();
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
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
          <Typography variant="subtitle2" fontWeight={600}>
            {data.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {formatValue(data.value)} ({(data.percentage ?? 0).toFixed(1)}%)
          </Typography>
        </Box>
      );
    }
    return null;
  };

  const renderCustomLabel = ({ cx, cy }: any) => {
    return (
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
        <tspan
          x={cx}
          y={cy - 8}
          fill={theme.palette.text.primary}
          fontSize="20"
          fontWeight="700"
          fontFamily="'SF Mono', monospace"
        >
          {formatValue(total)}
        </tspan>
        <tspan
          x={cx}
          y={cy + 12}
          fill={theme.palette.text.secondary}
          fontSize="11"
        >
          {type === 'markets' ? 'Total Markets' : 'Total Volume'}
        </tspan>
      </text>
    );
  };

  // Return placeholder if no data
  if (chartData.length === 0) {
    return (
      <Box sx={{ width: '100%', height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No {type === 'markets' ? 'market' : 'volume'} data available
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: 280, minWidth: 200 }}>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={65}
            outerRadius={95}
            paddingAngle={2}
            dataKey="value"
            labelLine={false}
            label={renderCustomLabel}
          >
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.color}
                stroke={theme.palette.background.paper}
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      
      {/* Legend */}
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: -2, flexWrap: 'wrap' }}>
        {chartData.map((entry) => (
          <Box key={entry.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: entry.color,
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {entry.name}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default PlatformDonutChart;
