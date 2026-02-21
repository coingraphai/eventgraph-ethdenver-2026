/**
 * Live Pulse Indicator
 * Shows real-time data freshness with animated pulse
 */
import React, { useState, useEffect } from 'react';
import { Box, Typography, useTheme, alpha, Tooltip, Stack } from '@mui/material';
import { Circle, CloudDone, CloudOff, Update, Speed } from '@mui/icons-material';
import { keyframes } from '@mui/system';
import { PLATFORM_COLORS as APP_PLATFORM_COLORS } from '../../utils/colors';

interface PlatformStatus {
  name: string;
  lastUpdate: Date;
  status: 'live' | 'stale' | 'offline';
  latency?: number;
}

interface LivePulseIndicatorProps {
  platforms?: PlatformStatus[];
  compact?: boolean;
}

const pulse = keyframes`
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.5); opacity: 0.5; }
  100% { transform: scale(1); opacity: 1; }
`;

const ripple = keyframes`
  0% { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(2.5); opacity: 0; }
`;

const PLATFORM_COLORS: Record<string, string> = {
  Polymarket: APP_PLATFORM_COLORS.polymarket.primary,
  Kalshi: APP_PLATFORM_COLORS.kalshi.primary,
  Limitless: APP_PLATFORM_COLORS.limitless.primary,
};

// Generate sample platform statuses
const generateSampleStatuses = (): PlatformStatus[] => {
  const now = new Date();
  return [
    { name: 'Polymarket', lastUpdate: new Date(now.getTime() - 5000), status: 'live', latency: 45 },
    { name: 'Kalshi', lastUpdate: new Date(now.getTime() - 12000), status: 'live', latency: 78 },
    { name: 'Limitless', lastUpdate: new Date(now.getTime() - 8000), status: 'live', latency: 120 },
  ];
};

export const LivePulseIndicator: React.FC<LivePulseIndicatorProps> = ({ platforms, compact = false }) => {
  const theme = useTheme();
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Update time every second for "ago" calculations
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  
  const displayPlatforms = platforms?.length ? platforms : generateSampleStatuses();
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'live': return theme.palette.success.main;
      case 'stale': return theme.palette.warning.main;
      case 'offline': return theme.palette.error.main;
      default: return theme.palette.grey[500];
    }
  };

  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((currentTime.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const allLive = displayPlatforms.every(p => p.status === 'live');
  const avgLatency = Math.round(displayPlatforms.reduce((sum, p) => sum + (p.latency || 0), 0) / displayPlatforms.length);

  if (compact) {
    return (
      <Tooltip title={`All systems ${allLive ? 'operational' : 'degraded'} • Avg latency: ${avgLatency}ms`}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: allLive ? theme.palette.success.main : theme.palette.warning.main,
                animation: `${pulse} 2s ease-in-out infinite`,
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: allLive ? theme.palette.success.main : theme.palette.warning.main,
                animation: `${ripple} 2s ease-out infinite`,
              }}
            />
          </Box>
          <Typography variant="caption" sx={{ color: allLive ? theme.palette.success.main : theme.palette.warning.main, fontWeight: 600 }}>
            LIVE
          </Typography>
        </Box>
      </Tooltip>
    );
  }

  return (
    <Box>
      {/* Header with overall status */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                bgcolor: allLive ? theme.palette.success.main : theme.palette.warning.main,
                animation: `${pulse} 2s ease-in-out infinite`,
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                width: 12,
                height: 12,
                borderRadius: '50%',
                bgcolor: allLive ? theme.palette.success.main : theme.palette.warning.main,
                animation: `${ripple} 2s ease-out infinite`,
              }}
            />
          </Box>
          <Typography variant="subtitle2" fontWeight={700} sx={{ color: allLive ? theme.palette.success.main : theme.palette.warning.main }}>
            {allLive ? 'ALL SYSTEMS LIVE' : 'PARTIAL OUTAGE'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Speed sx={{ fontSize: 14, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary">
            {avgLatency}ms avg
          </Typography>
        </Box>
      </Box>

      {/* Platform status list */}
      <Stack spacing={1}>
        {displayPlatforms.map((platform) => (
          <Box
            key={platform.name}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 1,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.background.paper, 0.3),
              border: `1px solid ${alpha(getStatusColor(platform.status), 0.2)}`,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: PLATFORM_COLORS[platform.name] || theme.palette.grey[500],
                }}
              />
              <Typography variant="body2" fontWeight={500}>
                {platform.name}
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="caption" color="text.secondary" fontFamily="'SF Mono', monospace">
                {platform.latency}ms
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {platform.status === 'live' ? (
                  <CloudDone sx={{ fontSize: 14, color: theme.palette.success.main }} />
                ) : platform.status === 'stale' ? (
                  <Update sx={{ fontSize: 14, color: theme.palette.warning.main }} />
                ) : (
                  <CloudOff sx={{ fontSize: 14, color: theme.palette.error.main }} />
                )}
                <Typography 
                  variant="caption" 
                  sx={{ 
                    color: getStatusColor(platform.status),
                    fontWeight: 600,
                  }}
                >
                  {getTimeAgo(platform.lastUpdate)}
                </Typography>
              </Box>
            </Box>
          </Box>
        ))}
      </Stack>
    </Box>
  );
};

export default LivePulseIndicator;
