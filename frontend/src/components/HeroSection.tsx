/**
 * EventGraph AI - Hero Section Component
 * Bold value prop with clear CTAs
 */

import React from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  alpha,
  useTheme,
  Chip,
} from '@mui/material';
import {
  ShowChart,
  AutoAwesome,
  LocalFireDepartment,
  TrendingUp,
  Speed,
} from '@mui/icons-material';
import { keyframes } from '@mui/system';
import { useNavigate } from 'react-router-dom';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const glow = keyframes`
  0%, 100% { box-shadow: 0 0 20px rgba(99, 102, 241, 0.2); }
  50% { box-shadow: 0 0 40px rgba(99, 102, 241, 0.4); }
`;

const float = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
`;

interface HeroSectionProps {
  compact?: boolean;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ compact = false }) => {
  const theme = useTheme();
  const navigate = useNavigate();

  const stats = [
    { label: 'Markets', value: '10,000+', icon: <ShowChart fontSize="small" /> },
    { label: 'Platforms', value: '4', icon: <TrendingUp fontSize="small" /> },
    { label: 'Updates', value: 'Real-time', icon: <Speed fontSize="small" /> },
  ];

  if (compact) {
    return (
      <Box
        sx={{
          p: 3,
          borderRadius: 3,
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${alpha(theme.palette.primary.dark, 0.03)} 100%)`,
          border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
          mb: 3,
        }}
      >
        <Stack direction="row" spacing={2} justifyContent="center">
          <Button
            variant="contained"
            startIcon={<ShowChart />}
            onClick={() => navigate('/events')}
            sx={{ borderRadius: 2, fontWeight: 600 }}
          >
            Browse Markets
          </Button>
          <Button
            variant="outlined"
            startIcon={<AutoAwesome />}
            onClick={() => navigate('/ask-predictions')}
            sx={{ borderRadius: 2, fontWeight: 600 }}
          >
            Ask AI
          </Button>
          <Button
            variant="outlined"
            startIcon={<LocalFireDepartment sx={{ color: '#22C55E' }} />}
            onClick={() => navigate('/arbitrage')}
            sx={{ borderRadius: 2, fontWeight: 600, borderColor: alpha('#22C55E', 0.5), color: '#22C55E' }}
          >
            View Arbitrage
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        p: { xs: 4, md: 6 },
        borderRadius: 4,
        overflow: 'hidden',
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.primary.dark, 0.05)} 100%)`,
        border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
        mb: 4,
        animation: `${fadeIn} 0.6s ease`,
      }}
    >
      {/* Background decoration */}
      <Box
        sx={{
          position: 'absolute',
          top: -100,
          right: -100,
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.15)} 0%, transparent 70%)`,
          animation: `${float} 6s ease-in-out infinite`,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: -50,
          left: -50,
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha('#22C55E', 0.1)} 0%, transparent 70%)`,
          animation: `${float} 5s ease-in-out infinite 1s`,
        }}
      />

      <Box sx={{ position: 'relative', zIndex: 1 }}>
        {/* Badge */}
        <Chip
          label="Prediction Market Intelligence"
          size="small"
          sx={{
            mb: 2,
            backgroundColor: alpha(theme.palette.primary.main, 0.15),
            color: 'primary.main',
            fontWeight: 600,
          }}
        />

        {/* Headline */}
        <Typography
          variant="h3"
          sx={{
            fontWeight: 800,
            mb: 2,
            lineHeight: 1.2,
            maxWidth: 600,
            background: `linear-gradient(135deg, ${theme.palette.text.primary} 0%, ${theme.palette.primary.main} 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          The Bloomberg Terminal for Prediction Markets
        </Typography>

        {/* Subheadline */}
        <Typography
          variant="h6"
          color="text.secondary"
          sx={{
            mb: 4,
            maxWidth: 500,
            fontWeight: 400,
            lineHeight: 1.6,
          }}
        >
          Aggregate intelligence across Polymarket, Kalshi, Limitless & more.
          AI-powered analysis. Cross-venue arbitrage. Smart alerts.
        </Typography>

        {/* CTA Buttons - Ordered: Browse Markets, Ask AI, View Arbitrage */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ mb: 4 }}
        >
          <Button
            variant="contained"
            size="large"
            startIcon={<ShowChart />}
            onClick={() => navigate('/events')}
            sx={{
              px: 4,
              py: 1.5,
              borderRadius: 2,
              fontWeight: 600,
              fontSize: '1rem',
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
              animation: `${glow} 3s ease-in-out infinite`,
              '&:hover': {
                transform: 'translateY(-2px)',
              },
            }}
          >
            📊 Browse Markets
          </Button>
          <Button
            variant="outlined"
            size="large"
            startIcon={<AutoAwesome />}
            onClick={() => navigate('/ask-predictions')}
            sx={{
              px: 4,
              py: 1.5,
              borderRadius: 2,
              fontWeight: 600,
              fontSize: '1rem',
              borderWidth: 2,
              '&:hover': {
                borderWidth: 2,
                transform: 'translateY(-2px)',
              },
            }}
          >
            🤖 Ask AI
          </Button>
          <Button
            variant="outlined"
            size="large"
            startIcon={<LocalFireDepartment />}
            onClick={() => navigate('/arbitrage')}
            sx={{
              px: 4,
              py: 1.5,
              borderRadius: 2,
              fontWeight: 600,
              fontSize: '1rem',
              borderWidth: 2,
              borderColor: alpha('#22C55E', 0.6),
              color: '#22C55E',
              '&:hover': {
                borderWidth: 2,
                borderColor: '#22C55E',
                backgroundColor: alpha('#22C55E', 0.05),
                transform: 'translateY(-2px)',
              },
            }}
          >
            🔥 View Arbitrage
          </Button>
        </Stack>

        {/* Stats */}
        <Stack
          direction="row"
          spacing={4}
          divider={
            <Box
              sx={{
                width: 1,
                backgroundColor: alpha(theme.palette.divider, 0.2),
              }}
            />
          }
        >
          {stats.map((stat) => (
            <Box key={stat.label}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={{ color: 'primary.main' }}>{stat.icon}</Box>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {stat.value}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {stat.label}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
};

export default HeroSection;
