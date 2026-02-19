import { Box, Typography, Chip, alpha, useTheme } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { formatDistanceToNow } from 'date-fns';

interface Activity {
  type: string;
  title: string;
  platform: string;
  volume_week?: number;
  timestamp: string;
}

interface ActivityFeedProps {
  activities: Activity[];
}

export const ActivityFeed = ({ activities }: ActivityFeedProps) => {
  const theme = useTheme();
  
  const formatVolume = (volume?: number): string => {
    if (!volume) return 'N/A';
    if (volume >= 1000000) return `$${(volume / 1000000).toFixed(2)}M`;
    if (volume >= 1000) return `$${(volume / 1000).toFixed(1)}K`;
    return `$${volume.toFixed(0)}`;
  };

  const PLATFORM_COLORS = {
    Polymarket: theme.palette.primary.main,
    Kalshi: theme.palette.primary.dark,
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
        High Volume Markets
      </Typography>
      <Box 
        sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 1.5,
          maxHeight: 320,
          overflowY: 'auto',
          pr: 1,
          '&::-webkit-scrollbar': {
            width: '6px',
          },
          '&::-webkit-scrollbar-track': {
            background: alpha(theme.palette.primary.main, 0.05),
            borderRadius: '3px',
          },
          '&::-webkit-scrollbar-thumb': {
            background: alpha(theme.palette.primary.main, 0.3),
            borderRadius: '3px',
            '&:hover': {
              background: alpha(theme.palette.primary.main, 0.5),
            },
          },
        }}
      >
        {activities.map((activity, index) => (
          <Box
            key={index}
            sx={{
              p: 2,
              background: alpha(theme.palette.primary.main, 0.05),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
              borderRadius: 1.5,
              transition: 'all 0.2s ease',
              '&:hover': {
                transform: 'translateX(4px)',
                border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                background: alpha(theme.palette.primary.main, 0.08),
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Box
                sx={{
                  mt: 0.3,
                  p: 0.8,
                  borderRadius: '8px',
                  background: alpha(theme.palette.primary.main, 0.15),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <TrendingUpIcon sx={{ fontSize: 16, color: theme.palette.primary.light }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{
                    color: theme.palette.text.primary,
                    fontWeight: 600,
                    mb: 1,
                    lineHeight: 1.4,
                    fontSize: '0.875rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {activity.title}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Chip
                    label={activity.platform}
                    size="small"
                    sx={{
                      fontSize: '0.7rem',
                      height: 20,
                      background: `${PLATFORM_COLORS[activity.platform as keyof typeof PLATFORM_COLORS]}30`,
                      color: PLATFORM_COLORS[activity.platform as keyof typeof PLATFORM_COLORS],
                      border: 'none',
                      fontWeight: 600,
                    }}
                  />
                  {activity.volume_week && (
                    <Typography variant="caption" sx={{ color: theme.palette.primary.light, fontWeight: 700, fontSize: '0.75rem' }}>
                      {formatVolume(activity.volume_week)}/wk
                    </Typography>
                  )}
                  <Typography variant="caption" sx={{ color: theme.palette.text.disabled, ml: 'auto', fontSize: '0.7rem' }}>
                    {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
};
