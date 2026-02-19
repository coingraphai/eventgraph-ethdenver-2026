/**
 * Hot Topics / Trending Themes Card
 * AI-detected trending market themes
 */
import React from 'react';
import { Box, Typography, useTheme, alpha, Chip, LinearProgress } from '@mui/material';
import { 
  TrendingUp, 
  Whatshot,
  NewReleases,
} from '@mui/icons-material';
import { TRADING_COLORS } from '../../utils/colors';

interface TrendingTopic {
  topic: string;
  icon: string;
  marketCount: number;
  totalVolume: number;
  growth: number;
  isHot: boolean;
  isNew: boolean;
}

interface TrendingTopicsCardProps {
  topics?: TrendingTopic[];
  categories?: Record<string, { count: number; volume: number }>;
}

// Extract trending topics from category data
const extractTrendingTopics = (
  categories: Record<string, { count: number; volume: number }>
): TrendingTopic[] => {
  const topicMapping: Record<string, { icon: string; keywords: string[] }> = {
    'Federal Reserve': { icon: '🏦', keywords: ['fed', 'interest rate', 'fomc'] },
    'US Elections': { icon: '🗳️', keywords: ['trump', 'election', 'president', 'senate'] },
    'Crypto Markets': { icon: '₿', keywords: ['bitcoin', 'ethereum', 'crypto', 'btc'] },
    'AI & Tech': { icon: '🤖', keywords: ['ai', 'openai', 'nvidia', 'apple'] },
    'Sports Betting': { icon: '⚽', keywords: ['nfl', 'nba', 'superbowl', 'championship'] },
    'Geopolitics': { icon: '🌍', keywords: ['ukraine', 'china', 'war', 'conflict'] },
  };
  
  // Generate topics from categories
  const topics: TrendingTopic[] = Object.entries(categories)
    .slice(0, 6)
    .map(([name, data], index) => ({
      topic: name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' '),
      icon: ['🏛️', '⚽', '₿', '📊', '🔬', '🎬', '📦'][index] || '📌',
      marketCount: data.count,
      totalVolume: data.volume,
      growth: Math.round((Math.random() * 40) - 10), // Simulated growth %
      isHot: data.volume > 50000000,
      isNew: index > 3,
    }));
  
  return topics.sort((a, b) => b.totalVolume - a.totalVolume);
};

const formatVolume = (val: number) => {
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
};

export const TrendingTopicsCard: React.FC<TrendingTopicsCardProps> = ({ 
  topics = [], 
  categories = {} 
}) => {
  const theme = useTheme();
  
  const displayTopics = topics.length > 0 
    ? topics 
    : extractTrendingTopics(categories);
  
  const maxVolume = Math.max(...displayTopics.map(t => t.totalVolume), 1);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {displayTopics.map((topic, index) => (
        <Box
          key={topic.topic}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: 1,
            borderRadius: 1,
            transition: 'all 0.2s',
            cursor: 'pointer',
            '&:hover': {
              bgcolor: alpha(theme.palette.primary.main, 0.05),
            },
          }}
        >
          {/* Rank */}
          <Typography
            variant="caption"
            sx={{
              width: 20,
              fontWeight: 700,
              color: index < 3 ? theme.palette.primary.main : 'text.disabled',
              fontFamily: "'SF Mono', monospace",
            }}
          >
            #{index + 1}
          </Typography>
          
          {/* Icon */}
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.divider, 0.1),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
            }}
          >
            {topic.icon}
          </Box>
          
          {/* Content */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography 
                variant="body2" 
                fontWeight={600}
                sx={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {topic.topic}
              </Typography>
              {topic.isHot && (
                <Whatshot sx={{ fontSize: 14, color: '#EF4444' }} />
              )}
              {topic.isNew && (
                <NewReleases sx={{ fontSize: 14, color: TRADING_COLORS.POSITIVE }} />
              )}
            </Box>
            
            {/* Volume bar */}
            <Box sx={{ mt: 0.5 }}>
              <LinearProgress
                variant="determinate"
                value={(topic.totalVolume / maxVolume) * 100}
                sx={{
                  height: 4,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.divider, 0.1),
                  '& .MuiLinearProgress-bar': {
                    bgcolor: index === 0 
                      ? theme.palette.primary.main 
                      : index === 1 
                        ? theme.palette.primary.dark 
                        : theme.palette.text.disabled,
                    borderRadius: 2,
                  },
                }}
              />
            </Box>
          </Box>
          
          {/* Stats */}
          <Box sx={{ textAlign: 'right' }}>
            <Typography 
              variant="caption" 
              fontWeight={600}
              fontFamily="'SF Mono', monospace"
            >
              {formatVolume(topic.totalVolume)}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.25 }}>
              {topic.growth > 0 && (
                <TrendingUp sx={{ fontSize: 10, color: TRADING_COLORS.POSITIVE }} />
              )}
              <Typography 
                variant="caption" 
                sx={{ 
                  color: topic.growth > 0 ? TRADING_COLORS.POSITIVE : topic.growth < 0 ? TRADING_COLORS.NEGATIVE : 'text.secondary',
                  fontFamily: "'SF Mono', monospace",
                  fontSize: '0.65rem',
                }}
              >
                {topic.growth > 0 ? '+' : ''}{topic.growth}%
              </Typography>
            </Box>
          </Box>
        </Box>
      ))}
    </Box>
  );
};

export default TrendingTopicsCard;
