/**
 * EventGraph AI - Loading Skeleton Components
 * Professional shimmer loading states
 */

import React from 'react';
import {
  Box,
  Skeleton,
  Grid,
  Paper,
  Stack,
  alpha,
  useTheme,
} from '@mui/material';
import { keyframes } from '@mui/system';

const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

// Market Card Skeleton
export const MarketCardSkeleton: React.FC = () => {
  const theme = useTheme();
  
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 2,
        backgroundColor: alpha(theme.palette.background.paper, 0.6),
        border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
      }}
    >
      <Stack spacing={2}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="80%" height={24} />
            <Skeleton variant="text" width="60%" height={20} sx={{ mt: 0.5 }} />
          </Box>
          <Skeleton variant="circular" width={40} height={40} />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Skeleton variant="rounded" width={60} height={24} />
          <Skeleton variant="rounded" width={80} height={24} />
          <Skeleton variant="rounded" width={50} height={24} />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Skeleton variant="text" width={100} height={28} />
          <Skeleton variant="text" width={80} height={20} />
        </Box>
      </Stack>
    </Paper>
  );
};

// Market Grid Skeleton
export const MarketGridSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <Grid container spacing={2}>
      {Array.from({ length: count }).map((_, index) => (
        <Grid item xs={12} sm={6} md={4} key={index}>
          <MarketCardSkeleton />
        </Grid>
      ))}
    </Grid>
  );
};

// Arbitrage Card Skeleton
export const ArbitrageCardSkeleton: React.FC = () => {
  const theme = useTheme();
  
  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: 2,
        backgroundColor: alpha(theme.palette.background.paper, 0.6),
        border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
      }}
    >
      <Stack spacing={2}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="90%" height={28} />
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Skeleton variant="rounded" width={50} height={20} />
              <Skeleton variant="rounded" width={60} height={20} />
              <Skeleton variant="rounded" width={70} height={20} />
            </Box>
          </Box>
          <Skeleton variant="rounded" width={80} height={40} />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              variant="rounded"
              width={140}
              height={80}
              sx={{ borderRadius: 1.5 }}
            />
          ))}
        </Box>
      </Stack>
    </Paper>
  );
};

// Stats Cards Skeleton
export const StatsCardsSkeleton: React.FC = () => {
  const theme = useTheme();
  
  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {[1, 2, 3, 4].map((i) => (
        <Grid item xs={12} sm={6} md={3} key={i}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 2,
              backgroundColor: alpha(theme.palette.background.paper, 0.4),
              border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
            }}
          >
            <Skeleton variant="text" width="60%" height={16} />
            <Skeleton variant="text" width="40%" height={40} sx={{ my: 0.5 }} />
            <Skeleton variant="text" width="80%" height={14} />
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
};

// Table Skeleton
export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  const theme = useTheme();
  
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        backgroundColor: alpha(theme.palette.background.paper, 0.6),
        border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
          display: 'flex',
          gap: 2,
        }}
      >
        <Skeleton variant="text" width="25%" height={20} />
        <Skeleton variant="text" width="15%" height={20} />
        <Skeleton variant="text" width="15%" height={20} />
        <Skeleton variant="text" width="15%" height={20} />
        <Skeleton variant="text" width="15%" height={20} />
      </Box>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, index) => (
        <Box
          key={index}
          sx={{
            p: 2,
            borderBottom: index < rows - 1 ? `1px solid ${alpha(theme.palette.divider, 0.05)}` : 'none',
            display: 'flex',
            gap: 2,
            alignItems: 'center',
          }}
        >
          <Skeleton variant="text" width="25%" height={20} />
          <Skeleton variant="text" width="15%" height={20} />
          <Skeleton variant="text" width="15%" height={20} />
          <Skeleton variant="text" width="15%" height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </Box>
      ))}
    </Paper>
  );
};

// Chart Skeleton
export const ChartSkeleton: React.FC<{ height?: number }> = ({ height = 300 }) => {
  const theme = useTheme();
  
  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: 2,
        backgroundColor: alpha(theme.palette.background.paper, 0.6),
        border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Skeleton variant="text" width={150} height={24} />
        <Skeleton variant="rounded" width={100} height={32} />
      </Box>
      <Skeleton
        variant="rounded"
        width="100%"
        height={height}
        sx={{
          background: `linear-gradient(90deg, 
            ${alpha(theme.palette.action.hover, 0.3)} 25%, 
            ${alpha(theme.palette.action.hover, 0.5)} 50%, 
            ${alpha(theme.palette.action.hover, 0.3)} 75%
          )`,
          backgroundSize: '200% 100%',
          animation: `${shimmer} 1.5s infinite`,
        }}
      />
    </Paper>
  );
};

// Full Page Loading
export const PageLoadingSkeleton: React.FC = () => {
  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Box sx={{ mb: 4 }}>
        <Skeleton variant="text" width={300} height={40} sx={{ mb: 1 }} />
        <Skeleton variant="text" width={200} height={24} />
      </Box>
      <StatsCardsSkeleton />
      <MarketGridSkeleton count={6} />
    </Box>
  );
};

// Inline Loading Spinner with shimmer
export const InlineLoader: React.FC<{ text?: string }> = ({ text = 'Loading...' }) => {
  const theme = useTheme();
  
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        p: 4,
      }}
    >
      <Box
        sx={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: `2px solid ${alpha(theme.palette.primary.main, 0.2)}`,
          borderTopColor: theme.palette.primary.main,
          animation: 'spin 1s linear infinite',
          '@keyframes spin': {
            to: { transform: 'rotate(360deg)' },
          },
        }}
      />
      <Box
        sx={{
          color: 'text.secondary',
          background: `linear-gradient(90deg, 
            ${theme.palette.text.secondary} 25%, 
            ${theme.palette.text.primary} 50%, 
            ${theme.palette.text.secondary} 75%
          )`,
          backgroundSize: '200% 100%',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          animation: `${shimmer} 2s infinite`,
        }}
      >
        {text}
      </Box>
    </Box>
  );
};

export default {
  MarketCardSkeleton,
  MarketGridSkeleton,
  ArbitrageCardSkeleton,
  StatsCardsSkeleton,
  TableSkeleton,
  ChartSkeleton,
  PageLoadingSkeleton,
  InlineLoader,
};
