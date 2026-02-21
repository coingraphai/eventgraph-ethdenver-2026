/**
 * Execution & Vault Management Page
 * Smart contract execution for arbitrage opportunities and copy trading
 * Features: Vault deposits, auto-execution, execution history, wallet connection
 * STATUS: Coming Soon
 */

import React from 'react';
import {
  Box,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import {
  RocketLaunch,
  AccountBalanceWallet,
  Security,
  Speed,
} from '@mui/icons-material';

export function Execution() {
  const theme = useTheme();

  const features = [
    { icon: <AccountBalanceWallet sx={{ fontSize: 32 }} />, title: 'Vault Management', desc: 'Deposit & manage funds for automated execution' },
    { icon: <Speed sx={{ fontSize: 32 }} />, title: 'Auto-Execution', desc: 'Automatically execute arbitrage opportunities' },
    { icon: <Security sx={{ fontSize: 32 }} />, title: 'Smart Contracts', desc: 'Secure on-chain execution with full transparency' },
  ];

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '70vh',
      p: 4,
      textAlign: 'center',
    }}>
      {/* Animated Icon */}
      <Box sx={{
        width: 100,
        height: 100,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(135deg, ${alpha('#8B5CF6', 0.2)}, ${alpha('#8B5CF6', 0.05)})`,
        border: `2px solid ${alpha('#8B5CF6', 0.3)}`,
        mb: 3,
        animation: 'pulse 2s ease-in-out infinite',
        '@keyframes pulse': {
          '0%, 100%': { transform: 'scale(1)', boxShadow: `0 0 0 0 ${alpha('#8B5CF6', 0.4)}` },
          '50%': { transform: 'scale(1.05)', boxShadow: `0 0 20px 10px ${alpha('#8B5CF6', 0.1)}` },
        },
      }}>
        <RocketLaunch sx={{ fontSize: 48, color: '#8B5CF6' }} />
      </Box>

      {/* Title */}
      <Typography variant="h3" sx={{
        fontWeight: 800,
        mb: 1,
        background: 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}>
        Coming Soon
      </Typography>

      <Typography variant="h6" sx={{ color: 'text.secondary', mb: 1, fontWeight: 500 }}>
        Execution & Vault Management
      </Typography>

      <Typography variant="body1" sx={{
        color: 'text.secondary',
        maxWidth: 500,
        mb: 5,
        lineHeight: 1.7,
      }}>
        We're building a powerful on-chain execution engine that lets you automatically capture
        arbitrage opportunities across prediction markets with smart contract security.
      </Typography>

      {/* Feature Cards */}
      <Box sx={{
        display: 'flex',
        gap: 3,
        flexWrap: 'wrap',
        justifyContent: 'center',
        maxWidth: 800,
      }}>
        {features.map((feature, i) => (
          <Box key={i} sx={{
            flex: '1 1 200px',
            maxWidth: 240,
            p: 3,
            borderRadius: 3,
            background: alpha(theme.palette.background.paper, 0.6),
            border: `1px solid ${alpha('#8B5CF6', 0.15)}`,
            backdropFilter: 'blur(10px)',
            transition: 'all 0.3s ease',
            '&:hover': {
              border: `1px solid ${alpha('#8B5CF6', 0.4)}`,
              transform: 'translateY(-4px)',
              boxShadow: `0 8px 24px ${alpha('#8B5CF6', 0.15)}`,
            },
          }}>
            <Box sx={{ color: '#8B5CF6', mb: 1.5 }}>{feature.icon}</Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
              {feature.title}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
              {feature.desc}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
