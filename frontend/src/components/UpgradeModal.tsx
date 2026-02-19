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

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  questionsUsed: number;
  questionsLimit: number;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  open,
  onClose,
  questionsUsed,
  questionsLimit,
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
      <DialogTitle sx={{ fontWeight: 700 }}>
        ⚡ Upgrade Your Plan
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.8)', mb: 2 }}>
            You've used <strong>{questionsUsed}</strong> of <strong>{questionsLimit}</strong> free questions.
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
            Connect your wallet and upgrade to continue using EventGraph AI with unlimited access.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.6)' }}>
          Maybe Later
        </Button>
        <Button
          variant="contained"
          onClick={onClose}
          sx={{
            backgroundColor: '#BBD977',
            color: '#000',
            fontWeight: 600,
            '&:hover': { backgroundColor: '#9BC45A' },
          }}
        >
          Upgrade Now
        </Button>
      </DialogActions>
    </Dialog>
  );
};
