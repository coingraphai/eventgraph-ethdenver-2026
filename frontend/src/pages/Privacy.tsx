/**
 * EventGraph AI - Privacy Policy
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

export const Privacy: React.FC = () => {
  const theme = useTheme();

  const sections = [
    {
      title: '1. Information We Collect',
      content: `We collect information you provide directly to us, including:

• Email Address: When you sign up for alerts or Pro subscription
• Usage Data: Pages visited, features used, and interaction patterns
• Alert Preferences: Market conditions and notification settings you configure
• Session Data: Anonymous session identifiers for personalization

We do NOT collect:
• Trading account credentials
• Financial information beyond subscription payments
• Personal identification documents`,
    },
    {
      title: '2. How We Use Your Information',
      content: `We use the information we collect to:

• Send alert notifications based on your preferences
• Process subscription payments (via Stripe)
• Improve and optimize the Service
• Analyze usage patterns to enhance features
• Communicate important updates about the Service
• Provide customer support`,
    },
    {
      title: '3. Data Sharing',
      content: `We do not sell, trade, or rent your personal information to third parties. We may share information with:

• Service Providers: Payment processors (Stripe), email services, and hosting providers who help us operate the Service
• Legal Requirements: If required by law, court order, or governmental regulation
• Business Transfers: In connection with a merger, acquisition, or sale of assets

All third-party providers are bound by confidentiality agreements.`,
    },
    {
      title: '4. Data Security',
      content: `We implement appropriate technical and organizational security measures to protect your information, including:

• Encryption of data in transit (TLS/SSL)
• Encryption of sensitive data at rest
• Regular security audits
• Access controls and authentication
• Secure cloud infrastructure (DigitalOcean, AWS)

However, no method of transmission over the Internet is 100% secure. We cannot guarantee absolute security.`,
    },
    {
      title: '5. Cookies and Tracking',
      content: `We use cookies and similar technologies to:

• Maintain your session and preferences
• Analyze traffic and usage patterns (Google Analytics)
• Remember your settings between visits

You can control cookies through your browser settings. Disabling cookies may affect some features of the Service.`,
    },
    {
      title: '6. Data Retention',
      content: `We retain your information for as long as your account is active or as needed to provide you services. We will retain and use your information as necessary to:

• Comply with legal obligations
• Resolve disputes
• Enforce our agreements

You may request deletion of your data at any time by contacting info@eventgraph.ai.`,
    },
    {
      title: '7. Your Rights',
      content: `Depending on your location, you may have rights including:

• Access: Request a copy of your personal data
• Correction: Request correction of inaccurate data
• Deletion: Request deletion of your data
• Portability: Request transfer of your data
• Opt-out: Unsubscribe from marketing communications
• Object: Object to certain processing of your data

To exercise these rights, contact info@eventgraph.ai.`,
    },
    {
      title: '8. California Privacy Rights (CCPA)',
      content: `California residents have additional rights under the CCPA:

• Right to know what personal information is collected
• Right to delete personal information
• Right to opt-out of the sale of personal information
• Right to non-discrimination for exercising privacy rights

We do not sell personal information as defined by the CCPA.`,
    },
    {
      title: '9. International Data Transfers',
      content: `Your information may be transferred to and processed in countries other than your country of residence. These countries may have different data protection laws. By using the Service, you consent to such transfers.`,
    },
    {
      title: '10. Children\'s Privacy',
      content: `The Service is not intended for children under 18 years of age. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately.`,
    },
    {
      title: '11. Changes to This Policy',
      content: `We may update this Privacy Policy from time to time. We will notify you of significant changes by posting the new policy on this page and updating the "Last updated" date. We encourage you to review this policy periodically.`,
    },
    {
      title: '12. Contact Us',
      content: `If you have questions about this Privacy Policy or our data practices, please contact us at:

EventGraph AI
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
          Privacy Policy
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          Last updated: February 1, 2026
        </Typography>

        <Divider sx={{ mb: 4 }} />

        <Typography color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
          At EventGraph AI, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our prediction market intelligence platform.
        </Typography>

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
          By using EventGraph AI, you acknowledge that you have read and understood this Privacy Policy.
        </Typography>
      </Paper>
    </Box>
  );
};

export default Privacy;
