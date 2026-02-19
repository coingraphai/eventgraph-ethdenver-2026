import React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { LightMode, DarkMode } from '@mui/icons-material';
import { useThemeMode } from '../contexts/ThemeContext';

export const ThemeToggle: React.FC = () => {
  const { mode, toggleTheme } = useThemeMode();

  return (
    <Tooltip title={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}>
      <IconButton
        onClick={toggleTheme}
        sx={{
          width: 32,
          height: 32,
          border: '1.5px solid',
          borderColor: mode === 'light' ? 'rgba(15, 23, 42, 0.15)' : 'divider',
          borderRadius: '8px',
          backgroundColor: mode === 'light' ? '#F0F9FF' : '#0C0C0C',
          color: mode === 'light' ? '#0284C7' : '#FFFFFF',
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: mode === 'light' ? '#E0F2FE' : '#1A1A1A',
            borderColor: mode === 'light' ? '#0EA5E9' : 'divider',
          },
        }}
      >
        {mode === 'light' ? (
          <DarkMode sx={{ fontSize: 18 }} />
        ) : (
          <LightMode sx={{ fontSize: 18 }} />
        )}
      </IconButton>
    </Tooltip>
  );
};
