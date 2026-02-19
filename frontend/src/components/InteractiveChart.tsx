import React, { useRef } from 'react';
import Plot from './PlotlyBasic';
import { Box, Paper, Typography, IconButton, Tooltip } from '@mui/material';
import { Fullscreen as FullscreenIcon, Download as DownloadIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';

interface InteractiveChartProps {
  chartData: string; // Plotly JSON string
}

const InteractiveChart: React.FC<InteractiveChartProps> = ({ chartData }) => {
  const theme = useTheme();
  const plotContainerRef = useRef<HTMLDivElement>(null);
  
  // Parse the Plotly JSON
  const plotData = React.useMemo(() => {
    try {
      return JSON.parse(chartData);
    } catch (error) {
      console.error('Error parsing chart data:', error);
      return null;
    }
  }, [chartData]);

  if (!plotData) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="error">Error loading chart data</Typography>
      </Box>
    );
  }

  // Handle fullscreen toggle
  const handleFullscreen = () => {
    if (plotContainerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        plotContainerRef.current.requestFullscreen();
      }
    }
  };

  // Handle download - simplified without direct plotly ref
  const handleDownload = () => {
    // This will be handled by plotly's built-in download button in config
    console.log('Download triggered');
  };

  // Update layout for theme
  const layout = {
    ...plotData.layout,
    autosize: true,
    margin: { t: 60, r: 40, b: 60, l: 60 },
    plot_bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,1)',
    paper_bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,1)',
    font: {
      color: theme.palette.text.primary,
      family: theme.typography.fontFamily
    },
    hoverlabel: {
      bgcolor: theme.palette.background.paper,
      bordercolor: theme.palette.divider,
      font: {
        color: theme.palette.text.primary,
        family: theme.typography.fontFamily
      }
    },
    xaxis: {
      ...plotData.layout?.xaxis,
      gridcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
      color: theme.palette.text.primary
    },
    yaxis: {
      ...plotData.layout?.yaxis,
      gridcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
      color: theme.palette.text.primary
    }
  };

  // Config for Plotly
  const config: any = {
    displayModeBar: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    displaylogo: false,
    responsive: true,
    toImageButtonOptions: {
      format: 'png',
      filename: 'eventgraph-chart',
      height: 800,
      width: 1200,
      scale: 2
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        mt: 2,
        p: 2,
        backgroundColor: 'background.paper',
        borderRadius: '12px',
        border: 1,
        borderColor: 'divider',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Header with controls */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1
        }}
      >
        <Typography
          variant="subtitle2"
          sx={{
            color: 'text.secondary',
            fontSize: '12px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}
        >
          📊 Interactive Visualization
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Download Chart">
            <IconButton
              size="small"
              onClick={handleDownload}
              sx={{
                color: 'text.secondary',
                '&:hover': { color: 'primary.main' }
              }}
            >
              <DownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Fullscreen">
            <IconButton
              size="small"
              onClick={handleFullscreen}
              sx={{
                color: 'text.secondary',
                '&:hover': { color: 'primary.main' }
              }}
            >
              <FullscreenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Plotly Chart */}
      <Box
        ref={plotContainerRef}
        sx={{
          position: 'relative',
          width: '100%',
          minHeight: '450px',
          '& .plotly': {
            width: '100% !important',
            height: 'auto !important'
          },
          '& .main-svg': {
            borderRadius: '8px'
          }
        }}
      >
        <Plot
          data={plotData.data}
          layout={layout}
          config={config}
          style={{ width: '100%', height: '100%' }}
          useResizeHandler={true}
        />
      </Box>

      {/* Footer info */}
      <Box
        sx={{
          mt: 1,
          pt: 1,
          borderTop: 1,
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            fontSize: '11px',
            fontStyle: 'italic'
          }}
        >
          Interactive chart powered by Plotly • Hover for details • Click and drag to zoom
        </Typography>
        
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            fontSize: '11px',
            fontWeight: 500
          }}
        >
          Real-time data from EventGraph AI
        </Typography>
      </Box>
    </Paper>
  );
};

export default InteractiveChart;
