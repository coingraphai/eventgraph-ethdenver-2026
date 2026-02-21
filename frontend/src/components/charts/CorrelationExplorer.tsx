/**
 * Correlation Explorer
 * Shows related markets that move together
 */
import React, { useState } from 'react';
import { Box, Typography, useTheme, alpha, Chip, Stack, LinearProgress, Tooltip } from '@mui/material';
import { Link, TrendingUp, TrendingDown, Circle, CompareArrows } from '@mui/icons-material';
import { PLATFORM_COLORS as APP_PLATFORM_COLORS } from '../../utils/colors';

interface CorrelatedMarket {
  title: string;
  platform: string;
  price: number;
  correlation: number; // -1 to 1
  direction: 'positive' | 'negative' | 'neutral';
}

interface MarketCluster {
  baseMarket: string;
  category: string;
  correlations: CorrelatedMarket[];
}

interface CorrelationExplorerProps {
  clusters?: MarketCluster[];
}

const PLATFORM_COLORS: Record<string, string> = {
  polymarket: APP_PLATFORM_COLORS.polymarket.primary,
  kalshi: APP_PLATFORM_COLORS.kalshi.primary,
  limitless: APP_PLATFORM_COLORS.limitless.primary,
};

// Generate sample correlation data
const generateSampleClusters = (): MarketCluster[] => {
  return [
    {
      baseMarket: 'Trump Wins 2028 Election',
      category: 'Politics',
      correlations: [
        { title: 'Trump Wins GOP Primary', platform: 'kalshi', price: 0.72, correlation: 0.92, direction: 'positive' },
        { title: 'DeSantis Wins GOP', platform: 'polymarket', price: 0.15, correlation: -0.85, direction: 'negative' },
        { title: 'Republican Senate Majority', platform: 'kalshi', price: 0.55, correlation: 0.78, direction: 'positive' },
        { title: 'Harris Wins 2028', platform: 'polymarket', price: 0.38, correlation: -0.95, direction: 'negative' },
      ],
    },
    {
      baseMarket: 'Fed Rate Cut 2026',
      category: 'Economy',
      correlations: [
        { title: 'S&P 500 ATH by EOY', platform: 'polymarket', price: 0.45, correlation: 0.72, direction: 'positive' },
        { title: 'Recession in 2026', platform: 'kalshi', price: 0.22, correlation: 0.65, direction: 'positive' },
        { title: 'Inflation Above 3%', platform: 'kalshi', price: 0.35, correlation: -0.58, direction: 'negative' },
      ],
    },
    {
      baseMarket: 'Bitcoin $150K EOY',
      category: 'Crypto',
      correlations: [
        { title: 'ETH Above $10K', platform: 'limitless', price: 0.15, correlation: 0.88, direction: 'positive' },
        { title: 'Crypto Market Cap $5T', platform: 'polymarket', price: 0.32, correlation: 0.82, direction: 'positive' },
        { title: 'SEC Approves More ETFs', platform: 'polymarket', price: 0.68, correlation: 0.55, direction: 'positive' },
      ],
    },
  ];
};

export const CorrelationExplorer: React.FC<CorrelationExplorerProps> = ({ clusters }) => {
  const theme = useTheme();
  const [expandedCluster, setExpandedCluster] = useState<number>(0);
  
  const displayClusters = clusters?.length ? clusters : generateSampleClusters();

  const getCorrelationColor = (correlation: number) => {
    const absCorr = Math.abs(correlation);
    if (correlation > 0) {
      return alpha(theme.palette.success.main, 0.3 + absCorr * 0.7);
    } else {
      return alpha(theme.palette.error.main, 0.3 + absCorr * 0.7);
    }
  };

  const getCorrelationLabel = (correlation: number) => {
    const absCorr = Math.abs(correlation);
    if (absCorr >= 0.8) return 'Very Strong';
    if (absCorr >= 0.6) return 'Strong';
    if (absCorr >= 0.4) return 'Moderate';
    return 'Weak';
  };

  return (
    <Box>
      {/* Cluster tabs */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 2, flexWrap: 'wrap' }}>
        {displayClusters.map((cluster, index) => (
          <Chip
            key={index}
            label={cluster.category}
            size="small"
            onClick={() => setExpandedCluster(index)}
            sx={{
              height: 24,
              fontSize: '0.7rem',
              bgcolor: expandedCluster === index 
                ? alpha(theme.palette.primary.main, 0.2)
                : alpha(theme.palette.background.paper, 0.5),
              color: expandedCluster === index 
                ? theme.palette.primary.main 
                : theme.palette.text.secondary,
              border: `1px solid ${expandedCluster === index 
                ? alpha(theme.palette.primary.main, 0.3)
                : 'transparent'}`,
              '&:hover': {
                bgcolor: alpha(theme.palette.primary.main, 0.15),
              },
            }}
          />
        ))}
      </Box>

      {/* Selected cluster */}
      {displayClusters[expandedCluster] && (
        <Box>
          {/* Base market */}
          <Box
            sx={{
              p: 1.5,
              mb: 1.5,
              borderRadius: 1.5,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Link sx={{ fontSize: 16, color: theme.palette.primary.main }} />
              <Typography variant="caption" color="primary" fontWeight={600}>
                BASE MARKET
              </Typography>
            </Box>
            <Typography variant="body2" fontWeight={600}>
              {displayClusters[expandedCluster].baseMarket}
            </Typography>
          </Box>

          {/* Correlated markets */}
          <Stack spacing={1}>
            {displayClusters[expandedCluster].correlations.map((market, index) => (
              <Box
                key={index}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: alpha(theme.palette.background.paper, 0.3),
                  border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: alpha(
                      market.correlation > 0 ? theme.palette.success.main : theme.palette.error.main,
                      0.3
                    ),
                  },
                }}
              >
                {/* Correlation indicator */}
                <Box sx={{ mr: 1.5 }}>
                  <Tooltip title={`${market.correlation > 0 ? 'Positive' : 'Negative'} correlation: ${(market.correlation * 100).toFixed(0)}%`}>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: getCorrelationColor(market.correlation),
                      }}
                    >
                      {market.correlation > 0 ? (
                        <TrendingUp sx={{ fontSize: 16, color: theme.palette.success.main }} />
                      ) : (
                        <TrendingDown sx={{ fontSize: 16, color: theme.palette.error.main }} />
                      )}
                    </Box>
                  </Tooltip>
                </Box>

                {/* Market info */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: PLATFORM_COLORS[market.platform],
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" fontSize="0.6rem">
                      {market.platform.toUpperCase()}
                    </Typography>
                  </Box>
                  <Typography 
                    variant="body2" 
                    fontWeight={500}
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {market.title}
                  </Typography>
                  
                  {/* Correlation bar */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <Box sx={{ flex: 1, height: 4, bgcolor: alpha(theme.palette.divider, 0.1), borderRadius: 2, overflow: 'hidden' }}>
                      <Box
                        sx={{
                          width: `${Math.abs(market.correlation) * 100}%`,
                          height: '100%',
                          bgcolor: market.correlation > 0 ? theme.palette.success.main : theme.palette.error.main,
                          borderRadius: 2,
                        }}
                      />
                    </Box>
                    <Typography 
                      variant="caption" 
                      fontWeight={600}
                      sx={{ 
                        color: market.correlation > 0 ? theme.palette.success.main : theme.palette.error.main,
                        minWidth: 45,
                      }}
                    >
                      {market.correlation > 0 ? '+' : ''}{(market.correlation * 100).toFixed(0)}%
                    </Typography>
                  </Box>
                </Box>

                {/* Price */}
                <Box sx={{ textAlign: 'right', ml: 1 }}>
                  <Typography 
                    variant="body2" 
                    fontWeight={700}
                    fontFamily="'SF Mono', monospace"
                    sx={{ color: PLATFORM_COLORS[market.platform] }}
                  >
                    {(market.price * 100).toFixed(0)}¢
                  </Typography>
                  <Typography variant="caption" color="text.secondary" fontSize="0.6rem">
                    {getCorrelationLabel(market.correlation)}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Stack>

          {/* Legend */}
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TrendingUp sx={{ fontSize: 12, color: theme.palette.success.main }} />
              <Typography variant="caption" color="text.secondary" fontSize="0.6rem">
                Positive correlation (move together)
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TrendingDown sx={{ fontSize: 12, color: theme.palette.error.main }} />
              <Typography variant="caption" color="text.secondary" fontSize="0.6rem">
                Negative correlation (move opposite)
              </Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default CorrelationExplorer;
