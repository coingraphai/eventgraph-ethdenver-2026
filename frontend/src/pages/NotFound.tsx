/**
 * EventGraph AI - 404 Not Found Page
 */

import React from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Home,
  Search,
  TrendingUp,
  AutoAwesome,
} from '@mui/icons-material';
import { keyframes } from '@mui/system';
import { useNavigate } from 'react-router-dom';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const float = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-20px); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

export const NotFound: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        minHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        p: 4,
        animation: `${fadeIn} 0.5s ease`,
      }}
    >
      {/* 404 Number */}
      <Typography
        variant="h1"
        sx={{
          fontSize: { xs: '8rem', md: '12rem' },
          fontWeight: 900,
          lineHeight: 1,
          mb: 2,
          animation: `${float} 3s ease-in-out infinite`,
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.3)} 0%, ${alpha(theme.palette.primary.dark, 0.1)} 100%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textShadow: `0 0 40px ${alpha(theme.palette.primary.main, 0.2)}`,
        }}
      >
        404
      </Typography>

      {/* Message */}
      <Typography
        variant="h4"
        sx={{
          fontWeight: 700,
          mb: 2,
          textAlign: 'center',
        }}
      >
        Market Not Found
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{
          mb: 4,
          textAlign: 'center',
          maxWidth: 500,
        }}
      >
        Looks like this market has resolved or moved to a different venue. 
        Don't worry, there are plenty of opportunities waiting for you.
      </Typography>

      {/* Quick Actions */}
      <Stack 
        direction={{ xs: 'column', sm: 'row' }} 
        spacing={2}
        sx={{ mb: 6 }}
      >
        <Button
          variant="contained"
          size="large"
          startIcon={<Home />}
          onClick={() => navigate('/')}
          sx={{
            px: 4,
            py: 1.5,
            borderRadius: 2,
            fontWeight: 600,
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          }}
        >
          Go Home
        </Button>
        <Button
          variant="outlined"
          size="large"
          startIcon={<Search />}
          onClick={() => navigate('/events')}
          sx={{
            px: 4,
            py: 1.5,
            borderRadius: 2,
            fontWeight: 600,
          }}
        >
          Browse Markets
        </Button>
      </Stack>

      {/* Suggestions */}
      <Box
        sx={{
          p: 4,
          borderRadius: 4,
          backgroundColor: alpha(theme.palette.background.paper, 0.5),
          backdropFilter: 'blur(10px)',
          border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
          maxWidth: 600,
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 3, textAlign: 'center' }}>
          Popular Destinations
        </Typography>
        <Stack spacing={2}>
          <Button
            fullWidth
            variant="text"
            startIcon={<TrendingUp sx={{ color: '#22C55E' }} />}
            onClick={() => navigate('/arbitrage')}
            sx={{
              justifyContent: 'flex-start',
              py: 1.5,
              px: 2,
              borderRadius: 2,
              '&:hover': {
                backgroundColor: alpha(theme.palette.primary.main, 0.05),
              },
            }}
          >
            <Box sx={{ textAlign: 'left' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Arbitrage Scanner
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Find price differences across platforms
              </Typography>
            </Box>
          </Button>
          <Button
            fullWidth
            variant="text"
            startIcon={<AutoAwesome sx={{ color: theme.palette.primary.main }} />}
            onClick={() => navigate('/ask-predictions')}
            sx={{
              justifyContent: 'flex-start',
              py: 1.5,
              px: 2,
              borderRadius: 2,
              '&:hover': {
                backgroundColor: alpha(theme.palette.primary.main, 0.05),
              },
            }}
          >
            <Box sx={{ textAlign: 'left' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Ask AI
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Get AI-powered market analysis
              </Typography>
            </Box>
          </Button>
        </Stack>
      </Box>

      {/* Fun animation */}
      <Box
        sx={{
          position: 'absolute',
          top: '20%',
          left: '10%',
          width: 20,
          height: 20,
          borderRadius: '50%',
          backgroundColor: alpha(theme.palette.primary.main, 0.3),
          animation: `${pulse} 2s ease-in-out infinite`,
          display: { xs: 'none', md: 'block' },
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: '30%',
          right: '15%',
          width: 30,
          height: 30,
          borderRadius: '50%',
          backgroundColor: alpha('#22C55E', 0.2),
          animation: `${pulse} 2.5s ease-in-out infinite 0.5s`,
          display: { xs: 'none', md: 'block' },
        }}
      />
    </Box>
  );
};

export default NotFound;
