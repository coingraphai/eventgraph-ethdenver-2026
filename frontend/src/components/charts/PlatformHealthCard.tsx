/**
 * Platform Health Score Card
 * Composite health metrics for each platform
 */
import React from 'react';
import { Box, Typography, useTheme, alpha, LinearProgress, Tooltip } from '@mui/material';
import { 
  TrendingUp, 
  ShowChart, 
  Speed, 
  Security,
  CheckCircle,
  Warning,
} from '@mui/icons-material';
import { PLATFORM_COLORS, TRADING_COLORS } from '../../utils/colors';

interface PlatformHealthProps {
  platform: string;
  displayName: string;
  totalMarkets: number;
  volume: number;
  liquidity: number;
  avgPrice: number;
  categoriesCount: number;
}

interface HealthScore {
  overall: number;
  volumeScore: number;
  liquidityScore: number;
  diversityScore: number;
  marketDepthScore: number;
}

const calculateHealthScore = (props: PlatformHealthProps): HealthScore => {
  // Volume Score (0-100) — log scale so smaller platforms still show meaningful scores
  // $10B+ → 100, $1B → ~80, $100M → ~60, $10M → ~40, $1M → ~20
  const volLog = props.volume > 0 ? Math.log10(props.volume) : 0;
  const volumeScore = Math.min(100, Math.max(0, (volLog - 4) * 16.7)); // log10(10K)=4 → 0, log10(10B)=10 → 100
  
  // Liquidity Score (0-100) — based on liquidity / volume ratio (higher = healthier)
  // If no liquidity data, infer from volume (higher volume platforms tend to be more liquid)
  const liquidityRatio = props.liquidity > 0 ? (props.liquidity / Math.max(props.volume, 1)) : 0;
  const liquidityScore = props.liquidity > 0 
    ? Math.min(100, liquidityRatio * 300)  // 0.33 ratio = 100
    : Math.min(80, volumeScore * 0.8);     // Fallback: derive from volume
  
  // Diversity Score (0-100) — based on category count
  const diversityScore = Math.min(100, (props.categoriesCount / 6) * 100);
  
  // Market Depth Score (0-100) — based on market count
  // 2000+ markets → 100, 500 → ~50, 100 → ~25
  const mktLog = props.totalMarkets > 0 ? Math.log10(props.totalMarkets) : 0;
  const marketDepthScore = Math.min(100, Math.max(0, (mktLog - 1) * 40)); // log10(10)=1 → 0, log10(3162)=3.5 → 100
  
  // Overall score - weighted average
  const overall = (
    volumeScore * 0.35 +
    liquidityScore * 0.25 +
    diversityScore * 0.2 +
    marketDepthScore * 0.2
  );
  
  return {
    overall: Math.round(overall),
    volumeScore: Math.round(volumeScore),
    liquidityScore: Math.round(liquidityScore),
    diversityScore: Math.round(diversityScore),
    marketDepthScore: Math.round(marketDepthScore),
  };
};

const getScoreColor = (score: number, theme: any) => {
  if (score >= 80) return TRADING_COLORS.POSITIVE;
  if (score >= 60) return theme.palette.primary.main;
  if (score >= 40) return theme.palette.warning.main;
  return TRADING_COLORS.NEGATIVE;
};

const getScoreLabel = (score: number) => {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Low';
};

const getPlatformColor = (platform: string): string => {
  const key = platform.toLowerCase() as keyof typeof PLATFORM_COLORS;
  return PLATFORM_COLORS[key]?.primary || '#87CEEB';
};

interface MetricRowProps {
  icon: React.ReactNode;
  label: string;
  score: number;
  theme: any;
}

const MetricRow: React.FC<MetricRowProps> = ({ icon, label, score, theme }) => (
  <Box sx={{ mb: 1 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {icon}
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </Box>
      <Typography 
        variant="caption" 
        fontWeight={600}
        sx={{ color: getScoreColor(score, theme) }}
      >
        {score}
      </Typography>
    </Box>
    <LinearProgress
      variant="determinate"
      value={score}
      sx={{
        height: 4,
        borderRadius: 2,
        bgcolor: alpha(theme.palette.divider, 0.1),
        '& .MuiLinearProgress-bar': {
          bgcolor: getScoreColor(score, theme),
          borderRadius: 2,
        },
      }}
    />
  </Box>
);

export const PlatformHealthCard: React.FC<PlatformHealthProps> = (props) => {
  const theme = useTheme();
  const health = calculateHealthScore(props);
  const platformColor = getPlatformColor(props.platform);
  
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        bgcolor: alpha(theme.palette.background.paper, 0.5),
        transition: 'all 0.2s',
        '&:hover': {
          borderColor: alpha(platformColor, 0.3),
          bgcolor: alpha(platformColor, 0.02),
        },
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1,
              bgcolor: alpha(platformColor, 0.15),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: platformColor,
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {props.displayName[0]}
          </Box>
          <Typography variant="subtitle2" fontWeight={600}>
            {props.displayName}
          </Typography>
        </Box>
        
        <Tooltip title={`Health Score: ${getScoreLabel(health.overall)}`}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1,
              py: 0.25,
              borderRadius: 1,
              bgcolor: alpha(getScoreColor(health.overall, theme), 0.15),
            }}
          >
            {health.overall >= 60 ? (
              <CheckCircle sx={{ fontSize: 14, color: getScoreColor(health.overall, theme) }} />
            ) : (
              <Warning sx={{ fontSize: 14, color: getScoreColor(health.overall, theme) }} />
            )}
            <Typography
              variant="caption"
              fontWeight={700}
              sx={{ color: getScoreColor(health.overall, theme) }}
            >
              {health.overall}
            </Typography>
          </Box>
        </Tooltip>
      </Box>
      
      {/* Metrics */}
      <MetricRow
        icon={<TrendingUp sx={{ fontSize: 12, color: 'text.secondary' }} />}
        label="Volume"
        score={health.volumeScore}
        theme={theme}
      />
      <MetricRow
        icon={<ShowChart sx={{ fontSize: 12, color: 'text.secondary' }} />}
        label="Liquidity"
        score={health.liquidityScore}
        theme={theme}
      />
      <MetricRow
        icon={<Speed sx={{ fontSize: 12, color: 'text.secondary' }} />}
        label="Diversity"
        score={health.diversityScore}
        theme={theme}
      />
      <MetricRow
        icon={<Security sx={{ fontSize: 12, color: 'text.secondary' }} />}
        label="Market Depth"
        score={health.marketDepthScore}
        theme={theme}
      />
    </Box>
  );
};

export default PlatformHealthCard;
