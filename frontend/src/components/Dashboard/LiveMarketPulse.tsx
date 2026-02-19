/**
 * Live Market Pulse Ticker
 * Real-time scrolling ticker showing latest market movements
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Chip, alpha, useTheme, keyframes } from '@mui/material';
import { TrendingUp, TrendingDown, LocalFireDepartment, Bolt } from '@mui/icons-material';

interface MarketPulseItem {
  id: string;
  title: string;
  price: number;
  change: number;
  volume: number;
  isHot?: boolean;
  isWhale?: boolean;
}

interface LiveMarketPulseProps {
  markets: MarketPulseItem[];
}

// Infinite scroll animation
const scrollAnimation = keyframes`
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
`;

// Pulse animation for hot items
const pulseAnimation = keyframes`
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
`;

// Glow animation
const glowAnimation = keyframes`
  0%, 100% {
    box-shadow: 0 0 5px rgba(135, 206, 235, 0.3);
  }
  50% {
    box-shadow: 0 0 15px rgba(135, 206, 235, 0.6);
  }
`;

export const LiveMarketPulse: React.FC<LiveMarketPulseProps> = ({ markets }) => {
  const theme = useTheme();
  const [isPaused, setIsPaused] = useState(false);

  // Duplicate markets for seamless infinite scroll
  const duplicatedMarkets = [...markets, ...markets];

  const formatVolume = (vol: number) => {
    if (vol >= 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
    if (vol >= 1000) return `$${(vol / 1000).toFixed(0)}K`;
    return `$${vol.toFixed(0)}`;
  };

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        maxWidth: '100%',
        overflow: 'hidden',
        background: alpha(theme.palette.background.paper, 0.4),
        backdropFilter: 'blur(10px)',
        border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
        borderRadius: 2,
        py: 1.5,
        mb: 3,
        // Ensure clipping works
        isolation: 'isolate',
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Header */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 140,
          background: `linear-gradient(90deg, ${theme.palette.background.paper} 70%, transparent 100%)`,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          pl: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: theme.palette.success.main,
              animation: `${pulseAnimation} 1.5s ease-in-out infinite`,
            }}
          />
          <Typography variant="caption" fontWeight={700} color="primary.main">
            LIVE PULSE
          </Typography>
        </Box>
      </Box>

      {/* Ticker Content - Wrapper for proper clipping */}
      <Box sx={{ overflow: 'hidden', width: '100%' }}>
        <Box
          sx={{
            display: 'flex',
            width: 'fit-content',
            animation: `${scrollAnimation} ${markets.length * 4}s linear infinite`,
            animationPlayState: isPaused ? 'paused' : 'running',
          pl: 18,
          '&:hover': {
            animationPlayState: 'paused',
          },
        }}
      >
        {duplicatedMarkets.map((market, idx) => (
          <Box
            key={`${market.id}-${idx}`}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 2,
              py: 0.5,
              mx: 1,
              borderRadius: 1.5,
              background: market.isHot
                ? alpha(theme.palette.warning.main, 0.1)
                : alpha(theme.palette.background.paper, 0.3),
              border: `1px solid ${
                market.isHot
                  ? alpha(theme.palette.warning.main, 0.3)
                  : alpha(theme.palette.divider, 0.1)
              }`,
              whiteSpace: 'nowrap',
              transition: 'all 0.2s ease',
              cursor: 'pointer',
              animation: market.isHot ? `${glowAnimation} 2s ease-in-out infinite` : 'none',
              '&:hover': {
                transform: 'scale(1.02)',
                background: alpha(theme.palette.primary.main, 0.1),
                border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
              },
            }}
          >
            {/* Hot/Whale Badge */}
            {market.isHot && (
              <LocalFireDepartment
                sx={{ fontSize: 14, color: 'warning.main' }}
              />
            )}
            {market.isWhale && (
              <Bolt sx={{ fontSize: 14, color: 'info.main' }} />
            )}

            {/* Market Title */}
            <Typography
              variant="caption"
              fontWeight={600}
              sx={{
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {market.title}
            </Typography>

            {/* Price */}
            <Chip
              label={`${(market.price * 100).toFixed(1)}¢`}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.7rem',
                fontWeight: 700,
                background: alpha(theme.palette.primary.main, 0.15),
                color: theme.palette.primary.main,
              }}
            />

            {/* Change */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              {market.change >= 0 ? (
                <TrendingUp sx={{ fontSize: 12, color: 'success.main' }} />
              ) : (
                <TrendingDown sx={{ fontSize: 12, color: 'error.main' }} />
              )}
              <Typography
                variant="caption"
                fontWeight={600}
                color={market.change >= 0 ? 'success.main' : 'error.main'}
              >
                {market.change >= 0 ? '+' : ''}{market.change.toFixed(1)}%
              </Typography>
            </Box>

            {/* Volume */}
            <Typography variant="caption" color="text.secondary">
              {formatVolume(market.volume)}
            </Typography>
          </Box>
        ))}
        </Box>
      </Box>

      {/* Right fade */}
      <Box
        sx={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 60,
          background: `linear-gradient(270deg, ${theme.palette.background.paper} 30%, transparent 100%)`,
          zIndex: 2,
        }}
      />
    </Box>
  );
};
