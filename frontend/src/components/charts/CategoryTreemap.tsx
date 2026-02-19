/**
 * Category Volume Treemap
 * Hierarchical visualization of category volumes
 */
import React from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { Box, Typography, useTheme, alpha } from '@mui/material';

interface CategoryData {
  name: string;
  count: number;
  volume: number;
}

interface CategoryTreemapProps {
  categories: Record<string, { count: number; volume: number }>;
}

const CATEGORY_COLORS: Record<string, string> = {
  politics: '#A78BFA',
  sports: '#22C55E',
  crypto: '#F59E0B',
  economy: '#00BFFF',
  science: '#CE93D8',
  entertainment: '#14B8A6',
  other: '#94A3B8',
};

const CATEGORY_ICONS: Record<string, string> = {
  politics: '🏛️',
  sports: '⚽',
  crypto: '₿',
  economy: '📊',
  science: '🔬',
  entertainment: '🎬',
  tech: '💻',
  finance: '💰',
  news: '📰',
  business: '💼',
  other: '📦',
};

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  politics: 'Politics',
  sports: 'Sports',
  crypto: 'Crypto',
  economy: 'Economy',
  science: 'Science',
  entertainment: 'Entertainment',
  tech: 'Tech',
  finance: 'Finance',
  news: 'News',
  business: 'Business',
  other: 'Other',
};

export const CategoryTreemap: React.FC<CategoryTreemapProps> = ({ categories }) => {
  const theme = useTheme();

  const data = Object.entries(categories)
    .map(([name, { count, volume }]) => {
      const key = name.toLowerCase();
      return {
        name: CATEGORY_DISPLAY_NAMES[key] || name.charAt(0).toUpperCase() + name.slice(1),
        size: volume,
        count,
        volume,
        color: CATEGORY_COLORS[key] || CATEGORY_COLORS.other,
        icon: CATEGORY_ICONS[key] || '📌',
      };
    })
    .filter(d => d.volume > 0)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 8); // Top 8 categories

  const formatVolume = (val: number | undefined | null) => {
    if (val === undefined || val === null || isNaN(val)) return '$0';
    if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
    if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
    return `$${val.toFixed(0)}`;
  };

  const CustomContent = (props: any) => {
    const { x, y, width, height, name, color, icon, volume } = props;
    
    if (width < 35 || height < 28) return null;

    // Truncate long names to fit cell width (roughly 7px per char)
    const maxChars = Math.floor(width / 7.5) - 2;
    const truncatedName = name && name.length > maxChars ? name.slice(0, maxChars) + '…' : name;

    const showVolume = height > 45 && width > 65;
    const fontSize = Math.min(16, Math.max(11, Math.floor(width / 9)));
    const volumeFontSize = Math.min(14, Math.max(10, Math.floor(width / 10)));
    const showIcon = width > 55;
    const labelText = showIcon ? `${icon} ${truncatedName}` : truncatedName;

    // Round positions to whole pixels for crisp rendering
    const cx = Math.round(x + width / 2);
    const nameY = Math.round(showVolume ? y + height / 2 - 8 : y + height / 2);
    const volY = Math.round(y + height / 2 + fontSize - 1);

    return (
      <g>
        {/* Background cell */}
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={color}
          stroke={theme.palette.background.paper}
          strokeWidth={2}
          rx={6}
        />
        {/* Dark overlay for text contrast */}
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="rgba(0,0,0,0.28)"
          rx={6}
        />
        {/* Category name */}
        <text
          x={cx}
          y={nameY}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#FFFFFF"
          fontSize={fontSize}
          fontWeight={700}
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          paintOrder="stroke"
          stroke="rgba(0,0,0,0.4)"
          strokeWidth={2}
          strokeLinejoin="round"
        >
          {labelText}
        </text>
        {/* Volume label */}
        {showVolume && (
          <text
            x={cx}
            y={volY}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#FFFFFF"
            fillOpacity={0.9}
            fontSize={volumeFontSize}
            fontWeight={600}
            fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            paintOrder="stroke"
            stroke="rgba(0,0,0,0.35)"
            strokeWidth={2}
            strokeLinejoin="round"
          >
            {formatVolume(volume)}
          </text>
        )}
      </g>
    );
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
            {data.icon} {data.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Volume: {formatVolume(data.volume)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Markets: {data.count}
          </Typography>
        </Box>
      );
    }
    return null;
  };

  // Return placeholder if no data
  if (data.length === 0) {
    return (
      <Box sx={{ width: '100%', height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No category data available
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: 280, minWidth: 200 }}>
      <ResponsiveContainer width="100%" height={280}>
        <Treemap
          data={data}
          dataKey="size"
          aspectRatio={4 / 3}
          stroke={theme.palette.background.paper}
          content={<CustomContent />}
        >
          <Tooltip content={<CustomTooltip />} />
        </Treemap>
      </ResponsiveContainer>
    </Box>
  );
};

export default CategoryTreemap;
