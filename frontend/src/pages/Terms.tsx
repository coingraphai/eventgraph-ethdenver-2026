/**
 * EventGraph AI - Terms of Service
 */

import React from 'react';
import {
  Box,
  Typography,
  Paper,
  alpha,
  useTheme,
  Divider,
} from '@mui/material';
import { keyframes } from '@mui/system';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

export const Terms: React.FC = () => {
  const theme = useTheme();

  const sections = [
    {
      title: '1. Acceptance of Terms',
      content: `By accessing and using EventGraph AI ("the Service"), you accept and agree to be bound by the terms and provisions of this agreement. If you do not agree to abide by these terms, please do not use this Service.`,
    },
    {
      title: '2. Description of Service',
      content: `EventGraph AI is a prediction market intelligence platform that aggregates data from multiple prediction market platforms including Polymarket, Kalshi, and Limitless. We provide market analysis, AI-powered insights, arbitrage opportunity detection, and alerting services. We do not execute trades on your behalf.`,
    },
    {
      title: '3. User Responsibilities',
      content: `You are responsible for:
• Ensuring any trading activity complies with your local laws and regulations
• Conducting your own research before making any trading decisions
• Understanding the risks involved in prediction market trading
• Keeping your account information secure
• Providing accurate email addresses for alert notifications`,
    },
    {
      title: '4. No Financial Advice',
      content: `The information provided by EventGraph AI is for informational purposes only and should not be construed as financial, investment, or trading advice. We are not registered investment advisors or broker-dealers. Any trading decisions you make are solely your responsibility. Past performance and detected arbitrage opportunities do not guarantee future results.`,
    },
    {
      title: '5. Data Accuracy',
      content: `While we strive to provide accurate and up-to-date information, EventGraph AI makes no warranties or representations regarding the accuracy, completeness, or timeliness of the data displayed. Prices and market information may be delayed or contain errors. Always verify information on the original platform before trading.`,
    },
    {
      title: '6. Arbitrage Disclaimer',
      content: `Arbitrage opportunities displayed are based on automated title matching algorithms and may not represent truly identical markets. Market terms, resolution criteria, and timing may differ between platforms. Consider transaction fees, slippage, liquidity, and execution timing when evaluating opportunities.`,
    },
    {
      title: '7. Subscription and Billing',
      content: `• Free tier is available indefinitely with stated limitations
• Pro subscriptions are billed monthly or annually
• You may cancel your subscription at any time
• No refunds are provided for partial billing periods
• We reserve the right to modify pricing with 30 days notice`,
    },
    {
      title: '8. Intellectual Property',
      content: `All content, features, and functionality of EventGraph AI, including but not limited to text, graphics, logos, and software, are the exclusive property of EventGraph AI and are protected by copyright, trademark, and other intellectual property laws.`,
    },
    {
      title: '9. Limitation of Liability',
      content: `EventGraph AI shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your use of the Service. Our total liability shall not exceed the amount you paid us in the twelve months preceding the claim.`,
    },
    {
      title: '10. Termination',
      content: `We reserve the right to terminate or suspend your account and access to the Service at our sole discretion, without notice, for conduct that we believe violates these Terms of Service or is harmful to other users, us, or third parties.`,
    },
    {
      title: '11. Modifications to Terms',
      content: `We reserve the right to modify these terms at any time. We will notify users of significant changes via email or through the Service. Your continued use of the Service after changes constitutes acceptance of the new terms.`,
    },
    {
      title: '12. Governing Law',
      content: `These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of law provisions.`,
    },
    {
      title: '13. Contact Information',
      content: `For questions about these Terms of Service, please contact us at:
Email: info@eventgraph.ai`,
    },
  ];

  return (
    <Box
      sx={{
        minHeight: '100%',
        p: { xs: 2, md: 4 },
        animation: `${fadeIn} 0.5s ease`,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          maxWidth: 900,
          mx: 'auto',
          p: { xs: 3, md: 5 },
          borderRadius: 4,
          backgroundColor: alpha(theme.palette.background.paper, 0.6),
          backdropFilter: 'blur(10px)',
          border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        }}
      >
        <Typography
          variant="h3"
          sx={{
            fontWeight: 800,
            mb: 1,
            background: `linear-gradient(135deg, ${theme.palette.text.primary} 0%, ${theme.palette.primary.main} 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Terms of Service
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          Last updated: February 1, 2026
        </Typography>

        <Divider sx={{ mb: 4 }} />

        {sections.map((section, index) => (
          <Box key={index} sx={{ mb: 4 }}>
            <Typography
              variant="h6"
              sx={{ fontWeight: 700, mb: 2, color: 'primary.main' }}
            >
              {section.title}
            </Typography>
            <Typography
              color="text.secondary"
              sx={{
                whiteSpace: 'pre-line',
                lineHeight: 1.8,
              }}
            >
              {section.content}
            </Typography>
          </Box>
        ))}

        <Divider sx={{ my: 4 }} />

        <Typography variant="body2" color="text.secondary" textAlign="center">
          By using EventGraph AI, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
        </Typography>
      </Paper>
    </Box>
  );
};

export default Terms;
