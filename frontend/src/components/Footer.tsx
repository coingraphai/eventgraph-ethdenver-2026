/**
 * EventGraph AI - Footer Component
 * Professional footer with social links and legal
 */

import React from 'react';
import {
  Box,
  Typography,
  Stack,
  IconButton,
  Link,
  alpha,
  useTheme,
  Divider,
} from '@mui/material';
import { X as TwitterIcon, GitHub, LinkedIn } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';

// Discord icon (not in MUI by default)
const DiscordIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

// Telegram icon
const TelegramIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

interface FooterProps {
  compact?: boolean;
}

export const Footer: React.FC<FooterProps> = ({ compact = false }) => {
  const theme = useTheme();

  const socialLinks = [
    { name: 'Twitter', icon: <TwitterIcon />, url: 'https://twitter.com/eventgraphai' },
    { name: 'Discord', icon: <DiscordIcon />, url: 'https://discord.gg/eventgraph' },
    { name: 'Telegram', icon: <TelegramIcon />, url: 'https://t.me/eventgraph' },
    { name: 'GitHub', icon: <GitHub />, url: 'https://github.com/eventgraph' },
  ];

  const legalLinks = [
    { name: 'Terms', path: '/terms' },
    { name: 'Privacy', path: '/privacy' },
    { name: 'Pricing', path: '/pricing' },
  ];

  if (compact) {
    return (
      <Box
        sx={{
          p: 2,
          borderTop: `1px solid ${alpha(theme.palette.divider, 0.06)}`,
          backgroundColor: alpha(theme.palette.background.paper, 0.3),
        }}
      >
        <Stack 
          direction="row" 
          spacing={1} 
          justifyContent="center"
          alignItems="center"
        >
          {socialLinks.slice(0, 3).map((social) => (
            <IconButton
              key={social.name}
              size="small"
              component="a"
              href={social.url}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  color: 'primary.main',
                  backgroundColor: alpha(theme.palette.primary.main, 0.1),
                },
              }}
            >
              {social.icon}
            </IconButton>
          ))}
        </Stack>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', textAlign: 'center', mt: 1 }}
        >
          © 2026 EventGraph AI
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      component="footer"
      sx={{
        mt: 'auto',
        pt: 6,
        pb: 4,
        px: 4,
        borderTop: `1px solid ${alpha(theme.palette.divider, 0.06)}`,
        backgroundColor: alpha(theme.palette.background.paper, 0.3),
      }}
    >
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={4}
          justifyContent="space-between"
          alignItems={{ xs: 'center', md: 'flex-start' }}
        >
          {/* Brand */}
          <Box sx={{ textAlign: { xs: 'center', md: 'left' } }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, justifyContent: { xs: 'center', md: 'flex-start' } }}>
              <Box
                component="img"
                src="/assets/eventgraph.png"
                alt="EventGraph AI"
                sx={{ width: 32, height: 32 }}
              />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                EventGraph AI
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 300, mb: 2 }}>
              The Bloomberg Terminal for Prediction Markets. Aggregate intelligence across Polymarket, Kalshi, Limitless & more.
            </Typography>
            <Link
              href="mailto:info@eventgraph.ai"
              sx={{
                color: 'primary.main',
                textDecoration: 'none',
                fontSize: '0.875rem',
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              info@eventgraph.ai
            </Link>
          </Box>

          {/* Links */}
          <Stack direction="row" spacing={6}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
                Product
              </Typography>
              <Stack spacing={1}>
                <Link component={RouterLink} to="/events" color="text.secondary" sx={{ textDecoration: 'none', '&:hover': { color: 'primary.main' } }}>
                  Markets
                </Link>
                <Link component={RouterLink} to="/arbitrage" color="text.secondary" sx={{ textDecoration: 'none', '&:hover': { color: 'primary.main' } }}>
                  Arbitrage
                </Link>
                <Link component={RouterLink} to="/ask-predictions" color="text.secondary" sx={{ textDecoration: 'none', '&:hover': { color: 'primary.main' } }}>
                  AI Assistant
                </Link>
                <Link component={RouterLink} to="/alerts" color="text.secondary" sx={{ textDecoration: 'none', '&:hover': { color: 'primary.main' } }}>
                  Alerts
                </Link>
              </Stack>
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
                Company
              </Typography>
              <Stack spacing={1}>
                <Link component={RouterLink} to="/pricing" color="text.secondary" sx={{ textDecoration: 'none', '&:hover': { color: 'primary.main' } }}>
                  Pricing
                </Link>
                <Link component={RouterLink} to="/terms" color="text.secondary" sx={{ textDecoration: 'none', '&:hover': { color: 'primary.main' } }}>
                  Terms of Service
                </Link>
                <Link component={RouterLink} to="/privacy" color="text.secondary" sx={{ textDecoration: 'none', '&:hover': { color: 'primary.main' } }}>
                  Privacy Policy
                </Link>
              </Stack>
            </Box>
          </Stack>

          {/* Social Links */}
          <Box sx={{ textAlign: { xs: 'center', md: 'right' } }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
              Follow Us
            </Typography>
            <Stack direction="row" spacing={1}>
              {socialLinks.map((social) => (
                <IconButton
                  key={social.name}
                  component="a"
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    color: 'text.secondary',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      color: 'primary.main',
                      backgroundColor: alpha(theme.palette.primary.main, 0.1),
                      transform: 'translateY(-2px)',
                    },
                  }}
                >
                  {social.icon}
                </IconButton>
              ))}
            </Stack>
          </Box>
        </Stack>

        <Divider sx={{ my: 4 }} />

        {/* Bottom Bar */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography variant="caption" color="text.secondary">
            © 2026 EventGraph AI. All rights reserved.
          </Typography>
          <Stack direction="row" spacing={3}>
            {legalLinks.map((link) => (
              <Link
                key={link.name}
                component={RouterLink}
                to={link.path}
                sx={{
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  textDecoration: 'none',
                  '&:hover': { color: 'primary.main' },
                }}
              >
                {link.name}
              </Link>
            ))}
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
};

export default Footer;
