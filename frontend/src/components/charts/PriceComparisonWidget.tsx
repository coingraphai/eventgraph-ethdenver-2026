/**
 * Price Comparison Widget
 * Side-by-side price comparison across platforms for the same event
 */
import React from 'react';
import { Box, Typography, useTheme, alpha, Chip, LinearProgress, Stack, Tooltip } from '@mui/material';
import { Compare, TrendingUp, TrendingDown, SwapHoriz } from '@mui/icons-material';
import { PLATFORM_COLORS } from '../../utils/colors';

interface PlatformPrice {
  platform: string;
  price: number;
  volume: number;
  change_24h?: number;
}

interface ComparisonEvent {
  title: string;
  category: string;
  platforms: PlatformPrice[];
  bestBuy?: string;
  bestSell?: string;
  spread?: number;
}

interface PriceComparisonWidgetProps {
  events?: ComparisonEvent[];
}

const getPlatformColor = (platform: string): string => {
  const key = platform.toLowerCase() as keyof typeof PLATFORM_COLORS;
  return PLATFORM_COLORS[key]?.primary || '#87CEEB';
};

const PLATFORM_NAMES: Record<string, string> = {
  polymarket: 'Polymarket',
  kalshi: 'Kalshi',
  limitless: 'Limitless',
  opiniontrade: 'OpinionTrade',
};

// Generate sample comparison data
const generateSampleData = (): ComparisonEvent[] => {
  return [
    {
      title: 'Trump wins 2028 Election',
      category: 'Politics',
      platforms: [
        { platform: 'polymarket', price: 0.42, volume: 2500000, change_24h: 2.3 },
        { platform: 'kalshi', price: 0.39, volume: 1800000, change_24h: 1.8 },
        { platform: 'limitless', price: 0.44, volume: 450000, change_24h: 3.1 },
      ],
      bestBuy: 'kalshi',
      bestSell: 'limitless',
      spread: 5.0,
    },
    {
      title: 'Fed Rate Cut by June 2026',
      category: 'Economy',
      platforms: [
        { platform: 'polymarket', price: 0.55, volume: 1200000, change_24h: -1.5 },
        { platform: 'kalshi', price: 0.58, volume: 2100000, change_24h: -0.8 },
        { platform: 'opiniontrade', price: 0.52, volume: 320000, change_24h: -2.1 },
      ],
      bestBuy: 'opiniontrade',
      bestSell: 'kalshi',
      spread: 6.0,
    },
    {
      title: 'Bitcoin $150K by EOY 2026',
      category: 'Crypto',
      platforms: [
        { platform: 'polymarket', price: 0.28, volume: 890000, change_24h: 5.2 },
        { platform: 'limitless', price: 0.31, volume: 560000, change_24h: 6.8 },
      ],
      bestBuy: 'polymarket',
      bestSell: 'limitless',
      spread: 3.0,
    },
  ];
};

export const PriceComparisonWidget: React.FC<PriceComparisonWidgetProps> = ({ events }) => {
  const theme = useTheme();
  
  const displayEvents = events?.length ? events : generateSampleData();

  const formatVolume = (val: number | undefined | null) => {
    if (!val) return '$0';
    if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
    if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
    return `$${val}`;
  };

  return (
    <Box>
      <Stack spacing={2}>
        {displayEvents.map((event, eventIndex) => {
          const minPrice = Math.min(...event.platforms.map(p => p.price));
          const maxPrice = Math.max(...event.platforms.map(p => p.price));
          const priceRange = maxPrice - minPrice;
          
          return (
            <Box
              key={eventIndex}
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.background.paper, 0.3),
                border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
              }}
            >
              {/* Event Header */}
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
                <Box>
                  <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                    {event.title}
                  </Typography>
                  <Chip 
                    label={event.category} 
                    size="small" 
                    sx={{ 
                      height: 18, 
                      fontSize: '0.6rem',
                      bgcolor: alpha(theme.palette.primary.main, 0.1),
                      color: theme.palette.primary.main,
                    }} 
                  />
                </Box>
                {event.spread && (
                  <Tooltip title="Price spread across platforms">
                    <Chip
                      icon={<SwapHoriz sx={{ fontSize: 12 }} />}
                      label={`${event.spread.toFixed(1)}% spread`}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.65rem',
                        bgcolor: alpha(theme.palette.success.main, 0.15),
                        color: theme.palette.success.main,
                        '& .MuiChip-icon': { color: theme.palette.success.main },
                      }}
                    />
                  </Tooltip>
                )}
              </Box>

              {/* Platform Prices */}
              <Stack spacing={1}>
                {event.platforms.map((platform, pIndex) => {
                  const isBestBuy = platform.platform === event.bestBuy;
                  const isBestSell = platform.platform === event.bestSell;
                  const pricePosition = priceRange > 0 ? ((platform.price - minPrice) / priceRange) * 100 : 50;
                  
                  return (
                    <Box key={pIndex}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              bgcolor: getPlatformColor(platform.platform),
                            }}
                          />
                          <Typography variant="caption" fontWeight={500}>
                            {PLATFORM_NAMES[platform.platform]}
                          </Typography>
                          {isBestBuy && (
                            <Chip
                              label="BEST BUY"
                              size="small"
                              sx={{
                                height: 16,
                                fontSize: '0.55rem',
                                fontWeight: 700,
                                bgcolor: alpha(theme.palette.success.main, 0.2),
                                color: theme.palette.success.main,
                              }}
                            />
                          )}
                          {isBestSell && (
                            <Chip
                              label="BEST SELL"
                              size="small"
                              sx={{
                                height: 16,
                                fontSize: '0.55rem',
                                fontWeight: 700,
                                bgcolor: alpha(theme.palette.info.main, 0.2),
                                color: theme.palette.info.main,
                              }}
                            />
                          )}
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            {formatVolume(platform.volume)}
                          </Typography>
                          <Typography 
                            variant="body2" 
                            fontWeight={700}
                            fontFamily="'SF Mono', monospace"
                            sx={{ color: getPlatformColor(platform.platform) }}
                          >
                            {(platform.price * 100).toFixed(0)}¢
                          </Typography>
                          {platform.change_24h !== undefined && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                              {platform.change_24h > 0 ? (
                                <TrendingUp sx={{ fontSize: 12, color: theme.palette.success.main }} />
                              ) : (
                                <TrendingDown sx={{ fontSize: 12, color: theme.palette.error.main }} />
                              )}
                              <Typography 
                                variant="caption" 
                                sx={{ 
                                  color: platform.change_24h > 0 ? theme.palette.success.main : theme.palette.error.main,
                                  fontWeight: 600,
                                }}
                              >
                                {platform.change_24h > 0 ? '+' : ''}{platform.change_24h.toFixed(1)}%
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      </Box>
                      
                      {/* Price position bar */}
                      <Box sx={{ position: 'relative', height: 4, bgcolor: alpha(theme.palette.divider, 0.1), borderRadius: 2 }}>
                        <Box
                          sx={{
                            position: 'absolute',
                            left: `${pricePosition}%`,
                            top: -2,
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor: getPlatformColor(platform.platform),
                            transform: 'translateX(-50%)',
                          }}
                        />
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
};

export default PriceComparisonWidget;
