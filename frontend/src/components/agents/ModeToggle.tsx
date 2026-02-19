import React from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Typography, Chip } from '@mui/material';
import { AutoAwesome, Settings } from '@mui/icons-material';

interface ModeToggleProps {
  currentMode: 'simple' | 'advanced';
  onChange: (mode: 'simple' | 'advanced') => void;
  disabled?: boolean;
}

const ModeToggle: React.FC<ModeToggleProps> = ({ currentMode, onChange, disabled = false }) => {
  const handleModeChange = (
    event: React.MouseEvent<HTMLElement>,
    newMode: 'simple' | 'advanced' | null
  ) => {
    if (newMode !== null) {
      onChange(newMode);
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        Mode:
      </Typography>
      <ToggleButtonGroup
        value={currentMode}
        exclusive
        onChange={handleModeChange}
        aria-label="agent mode"
        disabled={disabled}
        sx={{
          '& .MuiToggleButton-root': {
            px: 2.5,
            py: 0.75,
            textTransform: 'none',
            fontWeight: 500,
            border: '1px solid rgba(255, 255, 255, 0.12)',
            '&.Mui-selected': {
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: '#fff',
              '&:hover': {
                background: 'linear-gradient(135deg, #5568d3 0%, #6a3f91 100%)',
              },
            },
            '&:hover': {
              backgroundColor: 'rgba(102, 126, 234, 0.08)',
            },
          },
        }}
      >
        <ToggleButton value="simple" aria-label="simple mode">
          <AutoAwesome sx={{ fontSize: 18, mr: 0.75 }} />
          Simple
          {currentMode === 'simple' && (
            <Chip
              label="Beginner Friendly"
              size="small"
              sx={{
                ml: 1,
                height: 18,
                fontSize: '0.7rem',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                color: '#fff',
              }}
            />
          )}
        </ToggleButton>
        <ToggleButton value="advanced" aria-label="advanced mode">
          <Settings sx={{ fontSize: 18, mr: 0.75 }} />
          Advanced
          {currentMode === 'advanced' && (
            <Chip
              label="Pro Trader"
              size="small"
              sx={{
                ml: 1,
                height: 18,
                fontSize: '0.7rem',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                color: '#fff',
              }}
            />
          )}
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
};

export default ModeToggle;
