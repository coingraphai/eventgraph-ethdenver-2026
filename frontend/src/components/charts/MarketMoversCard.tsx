/**
 * Market Movers Card
 * Shows top gainers and losers with price change percentages
 */
import React, { useState } from 'react';
import { Box, Typography, useTheme, alpha, ToggleButtonGroup, ToggleButton, Chip } from '@mui/material';
import { TrendingUp, TrendingDown, TrendingFlat } from '@mui/icons-material';
import { PLATFORM_COLORS } from '../../utils/colors';

interface MarketMover {
  title: string;
  platform: string;
  price: number;
  change_24h: number;
  volume: number;
}

interface MarketMoversCardProps {
  gainers?: MarketMover[];
  losers?: MarketMover[];
}

const getPlatformColor = (platform: string): string => {
  const key = platform.toLowerCase() as keyof typeof PLATFORM_COLORS;
  return PLATFORM_COLORS[key]?.primary || '#87CEEB';
};

// Generate sample data if not provided
const generateSampleData = (): { gainers: MarketMover[]; losers: MarketMover[] } => {
  return {
    gainers: [
      { title: 'Trump wins 2028 GOP Primary', platform: 'polymarket', price: 0.72, change_24h: 15.3, volume: 1250000 },
      { title: 'Fed cuts rates March 2026', platform: 'kalshi', price: 0.45, change_24h: 12.1, volume: 890000 },
      { title: 'Bitcoin above $200K EOY', platform: 'limitless', price: 0.28, change_24h: 9.8, volume: 560000 },
      { title: 'Lakers win NBA Finals', platform: 'opiniontrade', price: 0.15, change_24h: 8.5, volume: 340000 },
      { title: 'SpaceX Mars landing 2026', platform: 'polymarket', price: 0.08, change_24h: 7.2, volume: 120000 },
    ],
    losers: [
      { title: 'Biden 2028 Comeback', platform: 'kalshi', price: 0.03, change_24h: -18.5, volume: 450000 },
      { title: 'Recession by Q3 2026', platform: 'polymarket', price: 0.22, change_24h: -14.2, volume: 780000 },
      { title: 'ETH Flips BTC 2026', platform: 'limitless', price: 0.05, change_24h: -11.8, volume: 290000 },
      { title: 'TikTok Ban Upheld', platform: 'kalshi', price: 0.35, change_24h: -9.3, volume: 650000 },
      { title: 'AI Regulation Passed', platform: 'opiniontrade', price: 0.41, change_24h: -6.7, volume: 180000 },
    ],
  };
};

export const MarketMoversCard: React.FC<MarketMoversCardProps> = ({ gainers, losers }) => {
  const theme = useTheme();
  const [view, setView] = useState<'gainers' | 'losers'>('gainers');
  
  const sampleData = generateSampleData();
  const displayGainers = gainers?.length ? gainers : sampleData.gainers;
  const displayLosers = losers?.length ? losers : sampleData.losers;
  const movers = view === 'gainers' ? displayGainers : displayLosers;

  const formatVolume = (val: number | undefined | null) => {
    if (!val) return '$0';
    if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
    if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
    return `$${val}`;
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={(_, val) => val && setView(val)}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              px: 2,
              py: 0.5,
              fontSize: '0.75rem',
              textTransform: 'none',
              border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
              '&.Mui-selected': {
                bgcolor: view === 'gainers' 
                  ? alpha(theme.palette.success.main, 0.2)
                  : alpha(theme.palette.error.main, 0.2),
                color: view === 'gainers' 
                  ? theme.palette.success.main 
                  : theme.palette.error.main,
              },
            },
          }}
        >
          <ToggleButton value="gainers">
            <TrendingUp sx={{ fontSize: 14, mr: 0.5 }} /> Gainers
          </ToggleButton>
          <ToggleButton value="losers">
            <TrendingDown sx={{ fontSize: 14, mr: 0.5 }} /> Losers
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {movers.slice(0, 5).map((mover, index) => (
          <Box
            key={index}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 1.5,
              borderRadius: 1.5,
              bgcolor: alpha(theme.palette.background.paper, 0.3),
              border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
              transition: 'all 0.2s',
              cursor: 'pointer',
              '&:hover': {
                bgcolor: alpha(view === 'gainers' ? theme.palette.success.main : theme.palette.error.main, 0.05),
                borderColor: alpha(view === 'gainers' ? theme.palette.success.main : theme.palette.error.main, 0.2),
              },
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography 
                  variant="caption" 
                  sx={{ 
                    color: getPlatformColor(mover.platform),
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    fontSize: '0.6rem',
                  }}
                >
                  {mover.platform}
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
                {mover.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Vol: {formatVolume(mover.volume)}
              </Typography>
            </Box>
            
            <Box sx={{ textAlign: 'right', ml: 1 }}>
              <Typography 
                variant="body2" 
                fontWeight={700}
                fontFamily="'SF Mono', monospace"
              >
                {(mover.price * 100).toFixed(0)}¢
              </Typography>
              <Chip
                size="small"
                icon={mover.change_24h > 0 ? <TrendingUp sx={{ fontSize: 12 }} /> : <TrendingDown sx={{ fontSize: 12 }} />}
                label={`${mover.change_24h > 0 ? '+' : ''}${mover.change_24h.toFixed(1)}%`}
                sx={{
                  height: 20,
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  bgcolor: alpha(mover.change_24h > 0 ? theme.palette.success.main : theme.palette.error.main, 0.15),
                  color: mover.change_24h > 0 ? theme.palette.success.main : theme.palette.error.main,
                  '& .MuiChip-icon': {
                    color: mover.change_24h > 0 ? theme.palette.success.main : theme.palette.error.main,
                  },
                }}
              />
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default MarketMoversCard;
