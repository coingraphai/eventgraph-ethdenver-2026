import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
} from '@mui/material';
import { AccountBalanceWallet as WalletIcon } from '@mui/icons-material';

interface ConnectWalletPromptProps {
  open: boolean;
  onClose: () => void;
  onConnectWallet: () => void;
  anonymousLimit: number;
}

export const ConnectWalletPrompt: React.FC<ConnectWalletPromptProps> = ({
  open,
  onClose,
  onConnectWallet,
  anonymousLimit,
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.1)',
        },
      }}
    >
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
        <WalletIcon sx={{ color: '#BBD977' }} />
        Connect Your Wallet
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.8)', mb: 2 }}>
            You've reached the limit of <strong>{anonymousLimit}</strong> anonymous questions.
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
            Connect your wallet to continue using EventGraph AI and unlock more features.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.6)' }}>
          Maybe Later
        </Button>
        <Button
          variant="contained"
          onClick={onConnectWallet}
          startIcon={<WalletIcon />}
          sx={{
            backgroundColor: '#BBD977',
            color: '#000',
            fontWeight: 600,
            '&:hover': { backgroundColor: '#9BC45A' },
          }}
        >
          Connect Wallet
        </Button>
      </DialogActions>
    </Dialog>
  );
};
