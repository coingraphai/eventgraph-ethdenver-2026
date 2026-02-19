/**
 * Quick Stats Carousel
 * Auto-rotating cards showing hot markets and key stats
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  Chip,
  IconButton,
  alpha,
  useTheme,
  keyframes,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  LocalFireDepartment,
  Bolt,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  Whatshot,
  ShowChart,
  AttachMoney,
} from '@mui/icons-material';
import { AnimatedCounter, formatters } from './AnimatedCounter';

interface QuickStat {
  id: string;
  type: 'hot' | 'mover' | 'whale' | 'volume';
  title: string;
  subtitle: string;
  value: number | string;
  change?: number;
  icon: 'fire' | 'trending' | 'whale' | 'money';
  color: string;
}

interface QuickStatsCarouselProps {
  stats: QuickStat[];
  autoPlayInterval?: number;
}

// Slide animations
const slideInRight = keyframes`
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
`;

const slideInLeft = keyframes`
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
`;

const pulseGlow = keyframes`
  0%, 100% {
    box-shadow: 0 0 20px rgba(135, 206, 235, 0.2);
  }
  50% {
    box-shadow: 0 0 40px rgba(135, 206, 235, 0.4);
  }
`;

const iconMap = {
  fire: LocalFireDepartment,
  trending: TrendingUp,
  whale: Bolt,
  money: AttachMoney,
};

export const QuickStatsCarousel: React.FC<QuickStatsCarouselProps> = ({
  stats,
  autoPlayInterval = 4000,
}) => {
  const theme = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [isHovered, setIsHovered] = useState(false);

  // Auto-play
  useEffect(() => {
    if (isHovered || stats.length <= 1) return;

    const timer = setInterval(() => {
      setDirection('right');
      setCurrentIndex((prev) => (prev + 1) % stats.length);
    }, autoPlayInterval);

    return () => clearInterval(timer);
  }, [autoPlayInterval, stats.length, isHovered]);

  const goToNext = () => {
    setDirection('right');
    setCurrentIndex((prev) => (prev + 1) % stats.length);
  };

  const goToPrev = () => {
    setDirection('left');
    setCurrentIndex((prev) => (prev - 1 + stats.length) % stats.length);
  };

  if (stats.length === 0) return null;

  const currentStat = stats[currentIndex];
  const IconComponent = iconMap[currentStat.icon];

  return (
    <Box
      sx={{ position: 'relative' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Card
        sx={{
          background: `linear-gradient(135deg, ${alpha(currentStat.color, 0.15)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`,
          backdropFilter: 'blur(10px)',
          border: `1px solid ${alpha(currentStat.color, 0.3)}`,
          borderRadius: 2,
          overflow: 'hidden',
          animation: `${direction === 'right' ? slideInRight : slideInLeft} 0.4s ease-out, ${pulseGlow} 3s ease-in-out infinite`,
          transition: 'all 0.3s ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            border: `1px solid ${alpha(currentStat.color, 0.5)}`,
          },
        }}
      >
        <CardContent sx={{ p: 2.5 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            {/* Left: Icon and Content */}
            <Stack direction="row" spacing={2} alignItems="center">
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  background: `linear-gradient(135deg, ${alpha(currentStat.color, 0.3)} 0%, ${alpha(currentStat.color, 0.1)} 100%)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconComponent sx={{ fontSize: 28, color: currentStat.color }} />
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={500}>
                  {currentStat.subtitle}
                </Typography>
                <Typography
                  variant="body1"
                  fontWeight={700}
                  sx={{
                    maxWidth: 250,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {currentStat.title}
                </Typography>
              </Box>
            </Stack>

            {/* Right: Value and Change */}
            <Stack alignItems="flex-end" spacing={0.5}>
              <Typography variant="h5" fontWeight={700} color={currentStat.color}>
                {typeof currentStat.value === 'number'
                  ? formatters.currency(currentStat.value)
                  : currentStat.value}
              </Typography>
              {currentStat.change !== undefined && (
                <Chip
                  size="small"
                  icon={
                    currentStat.change >= 0 ? (
                      <TrendingUp sx={{ fontSize: 14 }} />
                    ) : (
                      <TrendingDown sx={{ fontSize: 14 }} />
                    )
                  }
                  label={`${currentStat.change >= 0 ? '+' : ''}${currentStat.change.toFixed(1)}%`}
                  sx={{
                    height: 22,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    background: alpha(
                      currentStat.change >= 0
                        ? theme.palette.success.main
                        : theme.palette.error.main,
                      0.15
                    ),
                    color:
                      currentStat.change >= 0
                        ? theme.palette.success.main
                        : theme.palette.error.main,
                    '& .MuiChip-icon': {
                      color: 'inherit',
                    },
                  }}
                />
              )}
            </Stack>
          </Stack>
        </CardContent>

        {/* Progress Indicator */}
        <Box
          sx={{
            height: 3,
            background: alpha(theme.palette.divider, 0.1),
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${((currentIndex + 1) / stats.length) * 100}%`,
              background: `linear-gradient(90deg, ${currentStat.color}, ${alpha(currentStat.color, 0.5)})`,
              transition: 'width 0.3s ease',
            }}
          />
        </Box>
      </Card>

      {/* Navigation Arrows */}
      {stats.length > 1 && (
        <>
          <IconButton
            onClick={goToPrev}
            sx={{
              position: 'absolute',
              left: -16,
              top: '50%',
              transform: 'translateY(-50%)',
              background: alpha(theme.palette.background.paper, 0.9),
              border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
              opacity: isHovered ? 1 : 0,
              transition: 'opacity 0.2s ease',
              '&:hover': {
                background: theme.palette.background.paper,
              },
            }}
            size="small"
          >
            <KeyboardArrowLeft />
          </IconButton>
          <IconButton
            onClick={goToNext}
            sx={{
              position: 'absolute',
              right: -16,
              top: '50%',
              transform: 'translateY(-50%)',
              background: alpha(theme.palette.background.paper, 0.9),
              border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
              opacity: isHovered ? 1 : 0,
              transition: 'opacity 0.2s ease',
              '&:hover': {
                background: theme.palette.background.paper,
              },
            }}
            size="small"
          >
            <KeyboardArrowRight />
          </IconButton>
        </>
      )}

      {/* Dots Indicator */}
      {stats.length > 1 && (
        <Stack
          direction="row"
          spacing={0.5}
          justifyContent="center"
          sx={{ mt: 1.5 }}
        >
          {stats.map((_, idx) => (
            <Box
              key={idx}
              onClick={() => {
                setDirection(idx > currentIndex ? 'right' : 'left');
                setCurrentIndex(idx);
              }}
              sx={{
                width: idx === currentIndex ? 20 : 6,
                height: 6,
                borderRadius: 3,
                background:
                  idx === currentIndex
                    ? currentStat.color
                    : alpha(theme.palette.text.secondary, 0.3),
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                '&:hover': {
                  background:
                    idx === currentIndex
                      ? currentStat.color
                      : alpha(theme.palette.text.secondary, 0.5),
                },
              }}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
};
