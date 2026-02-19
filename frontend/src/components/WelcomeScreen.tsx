import React, { ReactNode } from 'react';
import { Box, Typography, AvatarGroup, Avatar, Stack } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import mainLogoSvg from '../assets/logos/Main Logo.svg';
import secondaryLogoSvg from '../assets/logos/Secondary Logo.svg';

interface WelcomeScreenProps {
  /** Custom content to display (e.g., category cards, suggestion cards) */
  children?: ReactNode;
  /** Optional custom headline */
  headline?: string;
  /** Show blockchain network badges */
  showNetworkBadges?: boolean;
}

// Blockchain logos for network badges
const blockchainLogos = [
  'https://cryptologos.cc/logos/ethereum-eth-logo.png',
  'https://cryptologos.cc/logos/bitcoin-btc-logo.png',
  'https://cryptologos.cc/logos/binance-coin-bnb-logo.png',
  'https://cryptologos.cc/logos/solana-sol-logo.png',
  'https://cryptologos.cc/logos/polygon-matic-logo.png',
];

/**
 * Reusable welcome screen component shown before chat starts
 * Displays logo, headline, network badges, and custom content (categories/suggestions)
 */
export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  children,
  headline = "Ask Anything About Crypto. Get Intelligent Answers.",
  showNetworkBadges = true,
}) => {
  const theme = useTheme();

  return (
    <>
      {/* Logo */}
      <Box
        component="img"
        src={theme.palette.mode === 'light' ? secondaryLogoSvg : mainLogoSvg}
        alt="EventGraph AI"
        sx={{
          width: '120px',
          height: 'auto',
          mb: 2,
        }}
      />

      {/* Headline */}
      <Typography
        variant="h1"
        sx={{
          color: 'text.primary',
          fontSize: '35px',
          fontWeight: 600,
          textAlign: 'center',
          mb: 3,
        }}
      >
        {headline}
      </Typography>

      {/* Network Badges */}
      {showNetworkBadges && (
        <Stack alignItems="center" spacing={2} mb={4}>
          <AvatarGroup
            max={5}
            sx={{
              '& .MuiAvatar-root': {
                width: 32,
                height: 32,
                border: 2,
                borderColor: 'background.default',
                backgroundColor: 'background.paper',
              },
            }}
          >
            {blockchainLogos.map((logo, index) => (
              <Avatar key={index} src={logo} alt={`Blockchain ${index + 1}`} />
            ))}
          </AvatarGroup>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              fontSize: '14px',
            }}
          >
            Onchain Intelligence Across 10+ Blockchains
          </Typography>
        </Stack>
      )}

      {/* Custom Content (Category cards, suggestion cards, etc.) */}
      {children}
    </>
  );
};
