import { Box, Typography, alpha, useTheme } from '@mui/material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface Category {
  name: string;
  count: number;
}

interface CategoryDistributionProps {
  categories: Category[];
}

export const CategoryDistribution = ({ categories }: CategoryDistributionProps) => {
  const theme = useTheme();
  
  // Use theme-based color palette for consistency
  const COLORS = [
    theme.palette.primary.main,    // #BBD977
    theme.palette.primary.dark,    // #9BC255
    theme.palette.primary.light,   // #D4E89E
    alpha(theme.palette.primary.main, 0.8),
    alpha(theme.palette.primary.dark, 0.8),
    alpha(theme.palette.primary.light, 0.7),
    alpha(theme.palette.primary.main, 0.6),
    alpha(theme.palette.primary.dark, 0.6),
    alpha(theme.palette.primary.light, 0.5),
    alpha(theme.palette.primary.main, 0.4),
  ];
  // Prepare data for the chart
  const chartData = categories.map((cat, idx) => ({
    name: cat.name,
    value: cat.count,
    color: COLORS[idx % COLORS.length],
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <Box
          sx={{
            p: 1.5,
            background: alpha(theme.palette.background.paper, 0.98),
            backdropFilter: 'blur(10px)',
            border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
            borderRadius: 1,
            boxShadow: `0 4px 16px ${alpha('#000', 0.4)}`,
          }}
        >
          <Typography variant="body2" sx={{ color: theme.palette.text.primary, fontWeight: 600, fontSize: '0.85rem', mb: 0.5 }}>
            {data.name}
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.primary.light, fontWeight: 700, fontSize: '0.85rem' }}>
            {data.value} markets
          </Typography>
        </Box>
      );
    }
    return null;
  };

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    if (percent < 0.05) return null; // Don't show label for small slices

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize={13}
        fontWeight={700}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
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
        Markets by Category
      </Typography>
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="45%"
            labelLine={false}
            label={renderCustomLabel}
            outerRadius={130}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} stroke={alpha(entry.color, 0.3)} strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => (
              <span style={{ color: theme.palette.text.secondary, fontSize: '0.85rem', fontWeight: 500 }}>{value}</span>
            )}
            wrapperStyle={{
              paddingTop: '20px',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </Box>
  );
};
