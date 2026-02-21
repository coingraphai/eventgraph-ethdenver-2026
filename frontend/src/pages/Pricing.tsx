/**
 * EventGraph AI - Pricing Page
 * Professional pricing with 2 tiers: Free & Pro
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  Paper,
  Grid,
  alpha,
  useTheme,
  Chip,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Check,
  Close,
  Bolt,
  Star,
  ExpandMore,
  Rocket,
  AutoAwesome,
  TrendingUp,
  Speed,
  Notifications,
  Api,
  Support,
} from '@mui/icons-material';
import { keyframes } from '@mui/system';

// Animations
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const glow = keyframes`
  0%, 100% { box-shadow: 0 0 20px rgba(99, 102, 241, 0.3); }
  50% { box-shadow: 0 0 40px rgba(99, 102, 241, 0.5); }
`;

interface PricingFeature {
  name: string;
  free: string | boolean;
  pro: string | boolean;
  icon?: React.ReactNode;
}

const features: PricingFeature[] = [
  { name: 'AI Queries', free: '5/day', pro: 'Unlimited', icon: <AutoAwesome fontSize="small" /> },
  { name: 'Arbitrage Opportunities', free: 'Top 3', pro: 'All opportunities', icon: <TrendingUp fontSize="small" /> },
  { name: 'Data Refresh Rate', free: '15-min delay', pro: 'Real-time', icon: <Speed fontSize="small" /> },
  { name: 'Active Alerts', free: '1', pro: 'Unlimited', icon: <Notifications fontSize="small" /> },
  { name: 'Markets Access', free: 'All', pro: 'All + Premium', icon: <Star fontSize="small" /> },
  { name: 'Data Export', free: false, pro: true },
  { name: 'API Access', free: false, pro: true, icon: <Api fontSize="small" /> },
  { name: 'Priority Support', free: false, pro: true, icon: <Support fontSize="small" /> },
  { name: 'Early Feature Access', free: false, pro: true, icon: <Rocket fontSize="small" /> },
];

const faqs = [
  {
    question: 'What prediction market platforms do you aggregate?',
    answer: 'EventGraph AI aggregates data from Polymarket, Kalshi, and Limitless - providing a unified view across major prediction market platforms.',
  },
  {
    question: 'How does the arbitrage scanner work?',
    answer: 'Our AI-powered matching engine identifies identical or similar markets across platforms and calculates price discrepancies. Free users see the top 3 opportunities, while Pro users get access to all detected opportunities in real-time.',
  },
  {
    question: 'Can I cancel my Pro subscription anytime?',
    answer: 'Absolutely! You can cancel your Pro subscription at any time. You\'ll continue to have access until the end of your billing period.',
  },
  {
    question: 'What AI capabilities are included?',
    answer: 'Our AI assistant can analyze market trends, explain complex prediction markets, provide research summaries, and help you make informed decisions. Pro users get unlimited queries.',
  },
  {
    question: 'Do you execute trades for me?',
    answer: 'EventGraph AI is an intelligence and research tool. We provide links to execute trades on native platforms (Polymarket, Kalshi, etc.) but do not execute trades directly.',
  },
  {
    question: 'Is my data secure?',
    answer: 'Yes. We use industry-standard encryption and never store sensitive trading information. Your alert preferences are stored securely in our database.',
  },
];

export const Pricing: React.FC = () => {
  const theme = useTheme();
  const [annual, setAnnual] = useState(false);

  const monthlyPrice = 49;
  const annualPrice = 39; // $39/mo when billed annually
  const currentPrice = annual ? annualPrice : monthlyPrice;
  const savings = annual ? (monthlyPrice - annualPrice) * 12 : 0;

  return (
    <Box
      sx={{
        minHeight: '100%',
        p: { xs: 2, md: 4 },
        animation: `${fadeIn} 0.5s ease`,
      }}
    >
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 6 }}>
        <Chip
          icon={<Bolt />}
          label="Simple Pricing"
          sx={{
            mb: 2,
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
            color: 'primary.main',
          }}
        />
        <Typography
          variant="h3"
          sx={{
            fontWeight: 800,
            mb: 2,
            background: `linear-gradient(135deg, ${theme.palette.text.primary} 0%, ${theme.palette.primary.main} 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Choose Your Plan
        </Typography>
        <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto', mb: 3 }}>
          Start free, upgrade when you need more power
        </Typography>

        {/* Annual Toggle */}
        <FormControlLabel
          control={
            <Switch
              checked={annual}
              onChange={(e) => setAnnual(e.target.checked)}
              color="primary"
            />
          }
          label={
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography>Annual billing</Typography>
              <Chip
                label="Save 20%"
                size="small"
                sx={{
                  backgroundColor: alpha('#22C55E', 0.15),
                  color: '#22C55E',
                  fontWeight: 600,
                }}
              />
            </Stack>
          }
        />
      </Box>

      {/* Pricing Cards */}
      <Grid container spacing={4} justifyContent="center" sx={{ mb: 8 }}>
        {/* Free Tier */}
        <Grid item xs={12} md={5} lg={4}>
          <Paper
            elevation={0}
            sx={{
              p: 4,
              borderRadius: 4,
              height: '100%',
              border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
              backgroundColor: alpha(theme.palette.background.paper, 0.6),
              backdropFilter: 'blur(10px)',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: `0 12px 40px ${alpha(theme.palette.common.black, 0.1)}`,
              },
            }}
          >
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
              Free
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Perfect for getting started
            </Typography>
            
            <Box sx={{ mb: 3 }}>
              <Typography variant="h2" sx={{ fontWeight: 800 }}>
                $0
              </Typography>
              <Typography color="text.secondary">
                forever
              </Typography>
            </Box>

            <Button
              variant="outlined"
              fullWidth
              size="large"
              sx={{
                mb: 4,
                py: 1.5,
                borderRadius: 2,
                fontWeight: 600,
              }}
            >
              Current Plan
            </Button>

            <Divider sx={{ mb: 3 }} />

            <Stack spacing={2}>
              {features.map((feature) => (
                <Stack key={feature.name} direction="row" spacing={2} alignItems="center">
                  {feature.free ? (
                    <Check sx={{ color: '#22C55E', fontSize: 20 }} />
                  ) : (
                    <Close sx={{ color: 'text.disabled', fontSize: 20 }} />
                  )}
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2">
                      {feature.name}
                    </Typography>
                    {typeof feature.free === 'string' && (
                      <Typography variant="caption" color="text.secondary">
                        {feature.free}
                      </Typography>
                    )}
                  </Box>
                </Stack>
              ))}
            </Stack>
          </Paper>
        </Grid>

        {/* Pro Tier */}
        <Grid item xs={12} md={5} lg={4}>
          <Paper
            elevation={0}
            sx={{
              p: 4,
              borderRadius: 4,
              height: '100%',
              position: 'relative',
              overflow: 'hidden',
              border: `2px solid ${theme.palette.primary.main}`,
              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, ${alpha(theme.palette.primary.dark, 0.1)} 100%)`,
              animation: `${glow} 3s ease-in-out infinite`,
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-4px)',
              },
            }}
          >
            {/* Coming Soon Badge */}
            <Chip
              label="LAUNCHING SOON"
              size="small"
              sx={{
                position: 'absolute',
                top: 16,
                right: 16,
                backgroundColor: alpha(theme.palette.warning.main, 0.9),
                color: 'white',
                fontWeight: 700,
                fontSize: '0.65rem',
              }}
            />

            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: 'primary.main' }}>
              Pro
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              For serious traders • Launching Q2 2026
            </Typography>
            
            <Box sx={{ mb: 3 }}>
              <Stack direction="row" alignItems="baseline" spacing={1}>
                <Typography variant="h2" sx={{ fontWeight: 800 }}>
                  ${currentPrice}
                </Typography>
                <Typography color="text.secondary">
                  /month
                </Typography>
              </Stack>
              {annual && (
                <Typography variant="caption" sx={{ color: '#22C55E' }}>
                  Save ${savings}/year
                </Typography>
              )}
            </Box>

            <Button
              variant="contained"
              fullWidth
              size="large"
              disabled
              startIcon={<Rocket />}
              sx={{
                mb: 4,
                py: 1.5,
                borderRadius: 2,
                fontWeight: 600,
                background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.6)} 0%, ${alpha(theme.palette.primary.dark, 0.6)} 100%)`,
                '&.Mui-disabled': {
                  color: 'white',
                  opacity: 0.9,
                },
              }}
            >
              Coming Soon
            </Button>

            <Divider sx={{ mb: 3 }} />

            <Stack spacing={2}>
              {features.map((feature) => (
                <Stack key={feature.name} direction="row" spacing={2} alignItems="center">
                  <Check sx={{ color: '#22C55E', fontSize: 20 }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: feature.pro !== feature.free ? 600 : 400 }}>
                      {feature.name}
                    </Typography>
                    {typeof feature.pro === 'string' && (
                      <Typography variant="caption" color="primary.main" sx={{ fontWeight: 600 }}>
                        {feature.pro}
                      </Typography>
                    )}
                  </Box>
                </Stack>
              ))}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* FAQ Section */}
      <Box sx={{ maxWidth: 800, mx: 'auto' }}>
        <Typography
          variant="h4"
          sx={{ fontWeight: 700, textAlign: 'center', mb: 4 }}
        >
          Frequently Asked Questions
        </Typography>

        {faqs.map((faq, index) => (
          <Accordion
            key={index}
            elevation={0}
            sx={{
              mb: 1,
              borderRadius: 2,
              border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
              backgroundColor: alpha(theme.palette.background.paper, 0.6),
              '&:before': { display: 'none' },
              '&.Mui-expanded': {
                mb: 1,
              },
            }}
          >
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography sx={{ fontWeight: 600 }}>{faq.question}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography color="text.secondary">{faq.answer}</Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>

      {/* CTA */}
      <Box
        sx={{
          mt: 8,
          p: 6,
          borderRadius: 4,
          textAlign: 'center',
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.primary.dark, 0.05)} 100%)`,
          border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
        }}
      >
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>
          Ready to level up your trading?
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 500, mx: 'auto' }}>
          Join thousands of traders using EventGraph AI for prediction market intelligence
        </Typography>
        <Stack direction="row" spacing={2} justifyContent="center">
          <Button
            variant="contained"
            size="large"
            sx={{
              px: 4,
              py: 1.5,
              borderRadius: 2,
              fontWeight: 600,
            }}
          >
            Get Started Free
          </Button>
          <Button
            variant="outlined"
            size="large"
            href="mailto:info@eventgraph.ai"
            sx={{
              px: 4,
              py: 1.5,
              borderRadius: 2,
              fontWeight: 600,
            }}
          >
            Contact Sales
          </Button>
        </Stack>
      </Box>
    </Box>
  );
};

export default Pricing;
