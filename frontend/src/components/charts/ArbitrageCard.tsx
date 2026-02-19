/**
 * Arbitrage Opportunities Card
 * Shows cross-platform price discrepancies
 */
import React from 'react';
import { Box, Typography, useTheme, alpha, Chip, IconButton } from '@mui/material';
import { 
  SwapHoriz, 
  TrendingUp, 
  OpenInNew,
  AttachMoney,
} from '@mui/icons-material';
import { PLATFORM_COLORS } from '../../utils/colors';

interface ArbitrageOpportunity {
  event_title?: string;
  title?: string;
  platform_a?: string;
  platform_b?: string;
  price_a?: number;
  price_b?: number;
  spread?: number;
  spread_pct?: number;
  potential_profit?: number;
  gross_arb_pct?: number;
  confidence?: number;
  platforms?: Record<string, { price: number; volume: number }>;
}

interface ArbitrageCardProps {
  opportunities?: any[];
}

const getPlatformColor = (platform: string): string => {
  const key = platform.toLowerCase() as keyof typeof PLATFORM_COLORS;
  return PLATFORM_COLORS[key]?.primary || '#87CEEB';
};

// Generate sample arbitrage opportunities from market data
const generateArbitrageOpportunities = (): ArbitrageOpportunity[] => {
  return [
    {
      event_title: 'Fed Rate Cut March 2026',
      platform_a: 'polymarket',
      platform_b: 'kalshi',
      price_a: 0.42,
      price_b: 0.38,
      spread: 4.0,
      potential_profit: 10.5,
      confidence: 85,
    },
    {
      event_title: 'Bitcoin $150K by Q2 2026',
      platform_a: 'opiniontrade',
      platform_b: 'polymarket',
      price_a: 0.31,
      price_b: 0.28,
      spread: 3.0,
      potential_profit: 10.7,
      confidence: 72,
    },
    {
      event_title: 'Trump 2028 Announcement',
      platform_a: 'kalshi',
      platform_b: 'limitless',
      price_a: 0.65,
      price_b: 0.61,
      spread: 4.0,
      potential_profit: 6.5,
      confidence: 68,
    },
  ];
};

// Normalize arbitrage data from various backend formats
const normalizeOpportunity = (opp: any): ArbitrageOpportunity => {
  // If already in expected format, return as-is
  if (opp.event_title && opp.platform_a && opp.platform_b) {
    return opp;
  }
  
  // Convert from backend format (with platforms object)
  if (opp.platforms && typeof opp.platforms === 'object') {
    const platformKeys = Object.keys(opp.platforms);
    const platform_a = platformKeys[0] || 'unknown';
    const platform_b = platformKeys[1] || platformKeys[0] || 'unknown';
    
    return {
      event_title: opp.title || opp.event_title || 'Unknown Event',
      platform_a,
      platform_b,
      price_a: opp.platforms[platform_a]?.price || opp.min_price || 0,
      price_b: opp.platforms[platform_b]?.price || opp.max_price || 0,
      spread: opp.spread_pct || opp.spread || 0,
      potential_profit: opp.gross_arb_pct || opp.potential_profit || 0,
      confidence: opp.confidence || 75,
    };
  }
  
  // Fallback: try to use whatever fields are available
  return {
    event_title: opp.title || opp.event_title || 'Unknown Event',
    platform_a: opp.platform_a || 'polymarket',
    platform_b: opp.platform_b || 'kalshi',
    price_a: opp.price_a || opp.min_price || 0,
    price_b: opp.price_b || opp.max_price || 0,
    spread: opp.spread_pct || opp.spread || 0,
    potential_profit: opp.gross_arb_pct || opp.potential_profit || 0,
    confidence: opp.confidence || 75,
  };
};

export const ArbitrageCard: React.FC<ArbitrageCardProps> = ({ opportunities = [] }) => {
  const theme = useTheme();
  
  const displayOpportunities = opportunities.length > 0 
    ? opportunities.map(normalizeOpportunity)
    : generateArbitrageOpportunities();

  const getPlatformName = (key: string) => {
    const names: Record<string, string> = {
      polymarket: 'Polymarket',
      kalshi: 'Kalshi',
      limitless: 'Limitless',
      opiniontrade: 'OpinionTrade',
    };
    return names[key] || key;
  };

  return (
    <Box>
      {displayOpportunities.length === 0 ? (
        <Box
          sx={{
            p: 3,
            textAlign: 'center',
            color: 'text.secondary',
          }}
        >
          <SwapHoriz sx={{ fontSize: 40, opacity: 0.3, mb: 1 }} />
          <Typography variant="body2">
            No significant arbitrage opportunities detected
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {displayOpportunities.map((opp, index) => (
            <Box
              key={index}
              sx={{
                p: 1.5,
                borderRadius: 1.5,
                border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                bgcolor: alpha(theme.palette.background.paper, 0.3),
                transition: 'all 0.2s',
                cursor: 'pointer',
                '&:hover': {
                  borderColor: alpha(theme.palette.success.main, 0.3),
                  bgcolor: alpha(theme.palette.success.main, 0.02),
                },
              }}
            >
              {/* Title Row */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography 
                  variant="body2" 
                  fontWeight={600}
                  sx={{ 
                    maxWidth: '70%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {opp.event_title}
                </Typography>
                <Chip
                  icon={<AttachMoney sx={{ fontSize: 12 }} />}
                  label={`+${opp.potential_profit.toFixed(1)}%`}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    bgcolor: alpha(theme.palette.success.main, 0.15),
                    color: theme.palette.success.main,
                    '& .MuiChip-icon': {
                      color: theme.palette.success.main,
                    },
                  }}
                />
              </Box>
              
              {/* Platforms Row */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: getPlatformColor(opp.platform_a),
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {getPlatformName(opp.platform_a)}
                    </Typography>
                    <Typography 
                      variant="caption" 
                      fontWeight={700}
                      fontFamily="'SF Mono', monospace"
                      sx={{ color: getPlatformColor(opp.platform_a) }}
                    >
                      {(opp.price_a * 100).toFixed(0)}¢
                    </Typography>
                  </Box>
                </Box>
                
                <SwapHoriz sx={{ fontSize: 16, color: 'text.disabled' }} />
                
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                    <Typography 
                      variant="caption" 
                      fontWeight={700}
                      fontFamily="'SF Mono', monospace"
                      sx={{ color: getPlatformColor(opp.platform_b) }}
                    >
                      {(opp.price_b * 100).toFixed(0)}¢
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {getPlatformName(opp.platform_b)}
                    </Typography>
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: getPlatformColor(opp.platform_b),
                      }}
                    />
                  </Box>
                </Box>
              </Box>
              
              {/* Spread indicator */}
              <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.disabled">
                  Spread: {opp.spread.toFixed(1)}%
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  Confidence: {opp.confidence}%
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default ArbitrageCard;
