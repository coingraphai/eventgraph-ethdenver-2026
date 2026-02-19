import React, { useState } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Typography,
  Button,
  Menu,
  MenuItem,
  Divider,
  Alert,
} from '@mui/material';
import {
  TipsAndUpdates as SummaryIcon,
  Dashboard as DashboardIcon,
  ShowChart as ChartsIcon,
  Psychology as IntelligenceIcon,
  TrendingUp as ForecastIcon,
  Download as DownloadIcon,
  Link as SourcesIcon,
} from '@mui/icons-material';
import { AgentMode } from '../../config/agents/agentSchema';

interface OutputTabsProps {
  mode: AgentMode;
  availableTabs: string[];
  children: React.ReactNode;
  onExportJson?: () => void;
  onViewSources?: () => void;
}

// Tab configuration with max 5 tabs
const TAB_CONFIG = [
  { id: 'summary', label: 'Summary', icon: <SummaryIcon /> },
  { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { id: 'charts', label: 'Charts', icon: <ChartsIcon /> },
  { id: 'intelligence', label: 'Intelligence', icon: <IntelligenceIcon /> },
  { id: 'forecast', label: 'Forecast', icon: <ForecastIcon /> },
];

const OutputTabs: React.FC<OutputTabsProps> = ({
  mode,
  availableTabs,
  children,
  onExportJson,
  onViewSources,
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Filter tabs based on what's available
  const visibleTabs = TAB_CONFIG.filter((tab) => availableTabs.includes(tab.id));

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleExport = () => {
    handleMenuClose();
    onExportJson?.();
  };

  const handleSources = () => {
    handleMenuClose();
    onViewSources?.();
  };

  if (visibleTabs.length === 0) {
    return (
      <Alert severity="info" sx={{ borderRadius: '8px' }}>
        No output available. Run the agent to see results.
      </Alert>
    );
  }

  return (
    <Box>
      {/* Tab headers */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          mb: 3,
        }}
      >
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 500,
              minHeight: 56,
              px: 3,
              '&.Mui-selected': {
                color: '#BBD977',
              },
            },
            '& .MuiTabs-indicator': {
              backgroundColor: '#BBD977',
              height: 3,
            },
          }}
        >
          {visibleTabs.map((tab, index) => (
            <Tab
              key={tab.id}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {tab.icon}
                  {tab.label}
                </Box>
              }
            />
          ))}
        </Tabs>

        {/* Export/Sources dropdown */}
        <Box>
          <Button
            variant="outlined"
            size="small"
            onClick={handleMenuOpen}
            endIcon={<DownloadIcon />}
            sx={{
              textTransform: 'none',
              borderRadius: '8px',
              mr: 2,
            }}
          >
            Actions
          </Button>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            PaperProps={{
              sx: {
                mt: 1,
                backgroundColor: 'rgba(30, 30, 30, 0.95)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              },
            }}
          >
            {onExportJson && (
              <MenuItem onClick={handleExport}>
                <DownloadIcon sx={{ mr: 1, fontSize: 18 }} />
                Export as JSON
              </MenuItem>
            )}
            {onViewSources && (
              <MenuItem onClick={handleSources}>
                <SourcesIcon sx={{ mr: 1, fontSize: 18 }} />
                View Data Sources
              </MenuItem>
            )}
            {!onExportJson && !onViewSources && (
              <MenuItem disabled>
                <Typography variant="caption" color="text.secondary">
                  No actions available
                </Typography>
              </MenuItem>
            )}
          </Menu>
        </Box>
      </Box>

      {/* Tab content */}
      <Box>
        {React.Children.toArray(children).map((child, index) => (
          <Box
            key={index}
            role="tabpanel"
            hidden={activeTab !== index}
            sx={{ display: activeTab === index ? 'block' : 'none' }}
          >
            {child}
          </Box>
        ))}
      </Box>

      {/* Mode indicator */}
      {mode === 'simple' && (
        <Alert
          severity="info"
          sx={{
            mt: 3,
            borderRadius: '8px',
            backgroundColor: 'rgba(102, 126, 234, 0.1)',
          }}
        >
          💡 <strong>Tip:</strong> Switch to Advanced Mode to see more detailed charts, technical analysis, and derivatives data.
        </Alert>
      )}
    </Box>
  );
};

export default OutputTabs;
