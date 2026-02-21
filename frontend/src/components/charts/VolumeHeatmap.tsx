/**
 * Volume Heatmap
 * Day/hour heatmap showing trading activity patterns
 */
import React, { useState } from 'react';
import { Box, Typography, useTheme, alpha, Tooltip, ToggleButtonGroup, ToggleButton } from '@mui/material';

interface VolumeHeatmapProps {
  data?: number[][];  // 7 days x 24 hours matrix
  platform?: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = ['12a', '3a', '6a', '9a', '12p', '3p', '6p', '9p'];

// Generate sample heatmap data (7 days x 24 hours)
const generateSampleData = (): number[][] => {
  const data: number[][] = [];
  
  for (let day = 0; day < 7; day++) {
    const dayData: number[] = [];
    for (let hour = 0; hour < 24; hour++) {
      // Simulate higher volume during market hours (9am-5pm) and weekdays
      let baseVolume = Math.random() * 50;
      
      // Boost during market hours
      if (hour >= 9 && hour <= 17) {
        baseVolume += 30 + Math.random() * 40;
      }
      
      // Boost on weekdays
      if (day >= 1 && day <= 5) {
        baseVolume += 20;
      }
      
      // Peak around US market open (9-11am) and close (3-4pm)
      if ((hour >= 9 && hour <= 11) || (hour >= 15 && hour <= 16)) {
        baseVolume += 25;
      }
      
      dayData.push(Math.round(baseVolume));
    }
    data.push(dayData);
  }
  
  return data;
};

export const VolumeHeatmap: React.FC<VolumeHeatmapProps> = ({ data, platform = 'all' }) => {
  const theme = useTheme();
  const [selectedPlatform, setSelectedPlatform] = useState(platform);
  
  const heatmapData = data || generateSampleData();
  
  // Find min and max for color scaling
  const allValues = heatmapData.flat();
  const maxValue = Math.max(...allValues);
  const minValue = Math.min(...allValues);

  // Red color shades for heatmap
  const HEATMAP_RED = '#EF4444';

  const getColor = (value: number) => {
    const normalized = maxValue > minValue ? (value - minValue) / (maxValue - minValue) : 0;
    
    if (normalized < 0.2) return alpha(HEATMAP_RED, 0.08);
    if (normalized < 0.4) return alpha(HEATMAP_RED, 0.25);
    if (normalized < 0.6) return alpha(HEATMAP_RED, 0.45);
    if (normalized < 0.8) return alpha(HEATMAP_RED, 0.7);
    return HEATMAP_RED;
  };

  const formatVolume = (val: number) => {
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
    return `$${val}`;
  };

  return (
    <Box>
      {/* Platform selector */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
        <ToggleButtonGroup
          value={selectedPlatform}
          exclusive
          onChange={(_, val) => val && setSelectedPlatform(val)}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              px: 1,
              py: 0.25,
              fontSize: '0.65rem',
              textTransform: 'none',
              border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
              '&.Mui-selected': {
                bgcolor: alpha(HEATMAP_RED, 0.15),
                color: HEATMAP_RED,
              },
            },
          }}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="polymarket">PM</ToggleButton>
          <ToggleButton value="kalshi">KL</ToggleButton>
          <ToggleButton value="limitless">LM</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Heatmap grid */}
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {/* Day labels */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px', pt: 2 }}>
          {DAYS.map((day, i) => (
            <Box
              key={day}
              sx={{
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                pr: 0.5,
              }}
            >
              <Typography variant="caption" color="text.secondary" fontSize="0.6rem">
                {day}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Heatmap cells */}
        <Box sx={{ flex: 1 }}>
          {/* Hour labels */}
          <Box sx={{ display: 'flex', mb: 0.5, pl: 0.5 }}>
            {HOURS.map((hour, i) => (
              <Box
                key={hour}
                sx={{
                  flex: 1,
                  textAlign: 'center',
                }}
              >
                <Typography variant="caption" color="text.secondary" fontSize="0.55rem">
                  {hour}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* Grid */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {heatmapData.map((dayData, dayIndex) => (
              <Box key={dayIndex} sx={{ display: 'flex', gap: '2px' }}>
                {dayData.map((value, hourIndex) => (
                  <Tooltip
                    key={hourIndex}
                    title={
                      <Box>
                        <Typography variant="caption" fontWeight={600}>
                          {DAYS[dayIndex]} {hourIndex}:00
                        </Typography>
                        <br />
                        <Typography variant="caption">
                          Volume: {formatVolume(value * 1000)}
                        </Typography>
                      </Box>
                    }
                    arrow
                  >
                    <Box
                      sx={{
                        flex: 1,
                        height: 20,
                        bgcolor: getColor(value),
                        borderRadius: 0.5,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        '&:hover': {
                          transform: 'scale(1.1)',
                          boxShadow: `0 0 8px ${alpha(HEATMAP_RED, 0.5)}`,
                          zIndex: 1,
                        },
                      }}
                    />
                  </Tooltip>
                ))}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Legend */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mt: 1.5 }}>
        <Typography variant="caption" color="text.secondary" fontSize="0.6rem">
          Low
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {[0.08, 0.25, 0.45, 0.7, 1].map((opacity, i) => (
            <Box
              key={i}
              sx={{
                width: 16,
                height: 8,
                bgcolor: alpha(HEATMAP_RED, opacity),
                borderRadius: 0.5,
              }}
            />
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" fontSize="0.6rem">
          High
        </Typography>
      </Box>
    </Box>
  );
};

export default VolumeHeatmap;
