/**
 * Enhanced Settings Page
 * Professional settings interface with:
 * - Glassmorphism design
 * - Section icons
 * - Modern toggle styling
 */

import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Button,
  Divider,
  Stack,
  alpha,
  useTheme,
  keyframes,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  TrendingUp,
  ShowChart,
  Storage,
  DarkMode,
  Notifications,
  Speed,
  Security,
} from '@mui/icons-material';

// Animations
const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

export const Settings: React.FC = () => {
  const theme = useTheme();
  
  const sections = [
    {
      title: 'General',
      icon: SettingsIcon,
      color: theme.palette.primary.main,
      settings: [
        { type: 'select', label: 'Default Landing Page', value: 'markets', options: ['Markets', 'Terminal', 'Screener', 'Agent'] },
        { type: 'select', label: 'Theme', value: 'dark', options: ['Dark', 'Light', 'Auto'] },
        { type: 'switch', label: 'Enable sound notifications', checked: true },
        { type: 'switch', label: 'Show price in USD', checked: true },
      ],
    },
    {
      title: 'Trading',
      icon: TrendingUp,
      color: theme.palette.success.main,
      settings: [
        { type: 'select', label: 'Default Order Type', value: 'market', options: ['Market', 'Limit'] },
        { type: 'select', label: 'Default Routing', value: 'auto', options: ['Auto (Best Price)', 'Polymarket', 'Kalshi', 'Manifold'] },
        { type: 'switch', label: 'Require order confirmation', checked: true },
        { type: 'switch', label: 'Auto-fill best available price', checked: false },
      ],
    },
    {
      title: 'Charts',
      icon: ShowChart,
      color: theme.palette.info.main,
      settings: [
        { type: 'select', label: 'Default Chart Type', value: 'probability', options: ['Probability', 'Price', 'Volume'] },
        { type: 'select', label: 'Default Timeframe', value: '1h', options: ['15 minutes', '1 hour', '4 hours', '1 day'] },
        { type: 'switch', label: 'Show volume bars', checked: true },
        { type: 'switch', label: 'Auto-update charts', checked: true },
      ],
    },
    {
      title: 'API & Data',
      icon: Storage,
      color: theme.palette.warning.main,
      settings: [
        { type: 'select', label: 'Update Frequency', value: '5s', options: ['1 second', '5 seconds', '30 seconds', '1 minute'] },
        { type: 'switch', label: 'Enable real-time updates', checked: true },
        { type: 'switch', label: 'Cache market data', checked: true },
      ],
    },
  ];

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, minHeight: 'calc(100vh - 56px)' }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <Typography variant="h5" fontWeight={700}>
          Settings
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Customize your EventGraph Terminal experience
      </Typography>

      <Grid container spacing={3}>
        {sections.map((section, sectionIdx) => (
          <Grid item xs={12} md={6} key={section.title}>
            <Paper 
              elevation={0}
              sx={{ 
                p: 3,
                background: alpha(theme.palette.background.paper, 0.6),
                backdropFilter: 'blur(10px)',
                border: `1px solid ${alpha(section.color, 0.15)}`,
                borderRadius: 3,
                transition: 'all 0.3s ease',
                animation: `${fadeInUp} 0.5s ease-out ${sectionIdx * 0.1}s both`,
                '&:hover': {
                  borderColor: alpha(section.color, 0.3),
                  boxShadow: `0 4px 20px ${alpha(section.color, 0.1)}`,
                },
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
                <Box 
                  sx={{ 
                    p: 1, 
                    borderRadius: 2, 
                    background: alpha(section.color, 0.15),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <section.icon sx={{ fontSize: 20, color: section.color }} />
                </Box>
                <Typography variant="h6" fontWeight={700}>
                  {section.title}
                </Typography>
              </Stack>
              <Divider sx={{ mb: 2.5, borderColor: alpha(theme.palette.divider, 0.1) }} />
              
              <Stack spacing={2}>
                {section.settings.map((setting, idx) => (
                  setting.type === 'select' ? (
                    <FormControl 
                      fullWidth 
                      size="small" 
                      key={idx}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          background: alpha(theme.palette.background.paper, 0.5),
                          '&:hover': {
                            '& .MuiOutlinedInput-notchedOutline': {
                              borderColor: section.color,
                            },
                          },
                          '&.Mui-focused': {
                            '& .MuiOutlinedInput-notchedOutline': {
                              borderColor: section.color,
                            },
                          },
                        },
                      }}
                    >
                      <InputLabel>{setting.label}</InputLabel>
                      <Select label={setting.label} defaultValue={setting.value}>
                        {setting.options?.map((opt) => (
                          <MenuItem key={opt} value={opt.toLowerCase().replace(/ /g, '')}>{opt}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : (
                    <FormControlLabel
                      key={idx}
                      control={
                        <Switch 
                          defaultChecked={setting.checked}
                          sx={{
                            '& .MuiSwitch-switchBase.Mui-checked': {
                              color: section.color,
                            },
                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                              backgroundColor: section.color,
                            },
                          }}
                        />
                      }
                      label={
                        <Typography variant="body2" color="text.secondary">
                          {setting.label}
                        </Typography>
                      }
                      sx={{
                        mx: 0,
                        py: 0.5,
                        px: 1.5,
                        borderRadius: 1.5,
                        transition: 'background 0.2s ease',
                        '&:hover': {
                          background: alpha(theme.palette.primary.main, 0.05),
                        },
                      }}
                    />
                  )
                ))}
              </Stack>
            </Paper>
          </Grid>
        ))}

        {/* Save Button */}
        <Grid item xs={12}>
          <Box 
            sx={{ 
              display: 'flex', 
              justifyContent: 'flex-end', 
              gap: 2,
              animation: `${fadeInUp} 0.5s ease-out 0.4s both`,
            }}
          >
            <Button 
              variant="outlined"
              sx={{
                px: 3,
                borderColor: alpha(theme.palette.divider, 0.3),
                '&:hover': {
                  borderColor: theme.palette.primary.main,
                  background: alpha(theme.palette.primary.main, 0.05),
                },
              }}
            >
              Reset to Defaults
            </Button>
            <Button 
              variant="contained"
              sx={{
                px: 4,
                fontWeight: 600,
                background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                boxShadow: `0 4px 14px ${alpha(theme.palette.primary.main, 0.4)}`,
                '&:hover': {
                  transform: 'translateY(-1px)',
                  boxShadow: `0 6px 20px ${alpha(theme.palette.primary.main, 0.5)}`,
                },
              }}
            >
              Save Settings
            </Button>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};
