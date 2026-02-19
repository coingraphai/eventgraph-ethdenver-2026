import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  ToggleButtonGroup,
  ToggleButton,
  Grid,
  Chip,
  Alert,
  Tooltip as MuiTooltip,
} from '@mui/material';
import { createChart, ColorType, IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import { ChartDefinition, ChartGroup } from '../../config/agents/agentSchema';

interface ChartLibraryProps {
  charts: ChartDefinition[];
  data: Record<string, any>;
  mode: 'simple' | 'advanced';
}

const CHART_COLORS = [
  '#87CEEB', '#22C55E', '#F59E0B', '#A78BFA', '#14B8A6', 
  '#00BFFF', '#CE93D8', '#90EE90', '#FFA500', '#EF4444'
];

const GROUP_CONFIG: Record<ChartGroup, { label: string; color: string }> = {
  core: { label: 'Core Metrics', color: '#87CEEB' },
  market: { label: 'Market Data', color: '#00BFFF' },
  flow: { label: 'Money Flow', color: '#A78BFA' },
  risk: { label: 'Risk Analysis', color: '#EF4444' },
  derivatives: { label: 'Derivatives', color: '#F59E0B' },
  sentiment: { label: 'Sentiment', color: '#22C55E' },
};

// CandlestickChart component using TradingView lightweight-charts
interface CandleData {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface CandlestickChartProps {
  data: CandleData[];
  height: number;
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({ data, height }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || !data || data.length === 0) return;

    // Validate and filter data
    const validData = data.filter(d => {
      // Check if required fields exist and are valid
      const hasValidTime = d.time !== undefined && d.time !== null;
      const hasValidOHLC = 
        typeof d.open === 'number' && !isNaN(d.open) &&
        typeof d.high === 'number' && !isNaN(d.high) &&
        typeof d.low === 'number' && !isNaN(d.low) &&
        typeof d.close === 'number' && !isNaN(d.close);
      
      return hasValidTime && hasValidOHLC;
    });

    if (validData.length === 0) {
      console.warn('No valid candlestick data available');
      return;
    }

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255, 255, 255, 0.7)',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.1)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.1)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 1, // Normal
      },
    });

    chartRef.current = chart;

    // Add candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    candlestickSeriesRef.current = candlestickSeries;

    // Format data for lightweight-charts (expects timestamps)
    const formattedData = validData.map(d => {
      let timestamp: number;
      if (typeof d.time === 'string') {
        const date = new Date(d.time);
        timestamp = date.getTime() / 1000;
      } else {
        timestamp = d.time as number;
      }
      
      return {
        time: timestamp as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      };
    }).filter(d => !isNaN(d.time as number))
      .sort((a, b) => (a.time as number) - (b.time as number));

    if (formattedData.length === 0) {
      console.warn('No valid formatted candlestick data');
      return;
    }

    candlestickSeries.setData(formattedData);

    // Add volume series if volume data exists
    if (validData.some(d => d.volume !== undefined && typeof d.volume === 'number')) {
      const volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: 'volume',
      });
      
      chart.priceScale('volume').applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });

      const volumeData = validData.map((d) => {
        let timestamp: number;
        if (typeof d.time === 'string') {
          const date = new Date(d.time);
          timestamp = date.getTime() / 1000;
        } else {
          timestamp = d.time as number;
        }
        
        // Find matching formattedData point by timestamp
        const matchingPoint = formattedData.find(fd => fd.time === timestamp);
        const color = matchingPoint && matchingPoint.close >= matchingPoint.open ? '#26a69a' : '#ef5350';
        
        return {
          time: timestamp as Time,
          value: d.volume || 0,
          color,
        };
      }).filter(d => !isNaN(d.time as number))
        .sort((a, b) => (a.time as number) - (b.time as number));

      if (volumeData.length > 0) {
        volumeSeries.setData(volumeData);
        volumeSeriesRef.current = volumeSeries;
      }
    }

    // Fit content
    chart.timeScale().fitContent();

    // Handle window resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ 
          width: chartContainerRef.current.clientWidth 
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [data, height]);

  return <Box ref={chartContainerRef} sx={{ width: '100%', height }} />;
};

const ChartLibrary: React.FC<ChartLibraryProps> = ({ charts, data, mode }) => {
  const [selectedGroup, setSelectedGroup] = useState<ChartGroup | 'all'>('all');

  // Debug logging
  console.log('[ChartLibrary] Initialization', {
    totalCharts: charts.length,
    dataKeys: Object.keys(data),
    mode,
  });

  // Filter charts based on mode and selected group
  const visibleCharts = charts.filter((chart) => {
    // In advanced mode, show charts with showInAdvanced=true
    // In simple mode, show charts with showInSimple=true or showInSimpleMode=true
    const modeMatch = mode === 'advanced' 
      ? (chart.showInAdvanced !== false)
      : (chart.showInSimple === true || chart.showInSimpleMode === true);
    const groupMatch = selectedGroup === 'all' || chart.group === selectedGroup;
    return modeMatch && groupMatch;
  });

  console.log('[ChartLibrary] Visible charts', {
    totalVisible: visibleCharts.length,
    visibleIds: visibleCharts.map(c => c.id),
  });

  // Get available groups from charts
  const availableGroups = Array.from(
    new Set(charts.map((c) => c.group))
  ) as ChartGroup[];

  const handleGroupChange = (
    _event: React.MouseEvent<HTMLElement>,
    newGroup: ChartGroup | 'all' | null
  ) => {
    if (newGroup !== null) {
      setSelectedGroup(newGroup);
    }
  };

  const formatNumber = (num: number): string => {
    if (!num || isNaN(num)) return '0';
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toFixed(2);
  };

  const renderChart = (chart: ChartDefinition) => {
    const chartData = data[chart.dataKey];
    
    // Debug logging
    console.log(`[ChartLibrary] Rendering chart: ${chart.id}`, {
      dataKey: chart.dataKey,
      hasData: !!chartData,
      dataType: Array.isArray(chartData) ? 'array' : typeof chartData,
      dataLength: Array.isArray(chartData) ? chartData.length : 'N/A',
      firstItem: Array.isArray(chartData) && chartData.length > 0 ? chartData[0] : chartData,
    });
    
    if (!chartData || (Array.isArray(chartData) && chartData.length === 0)) {
      return (
        <Alert severity="info" sx={{ mt: 2 }}>
          No data available for {chart.title}
        </Alert>
      );
    }

    const ChartComponent = getChartComponent(chart, chartData);

    return (
      <Card
        key={chart.id}
        sx={{
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="h6" fontWeight={600}>
              {chart.title}
            </Typography>
            {chart.group && (
              <Chip
                label={GROUP_CONFIG[chart.group].label}
                size="small"
                sx={{
                  backgroundColor: `${GROUP_CONFIG[chart.group].color}20`,
                  color: GROUP_CONFIG[chart.group].color,
                  height: 20,
                  fontSize: '0.7rem',
                }}
              />
            )}
          </Box>
          {chart.description && (
            <Typography variant="caption" color="text.secondary" display="block" mb={2}>
              {chart.description}
            </Typography>
          )}
          {ChartComponent}
        </CardContent>
      </Card>
    );
  };

  const getChartComponent = (chart: ChartDefinition, chartData: any) => {
    const height = chart.height || chart.config?.height || 300;
    
    // Support both direct properties and config object
    const xAxis = chart.xAxis || chart.config?.xAxis || 'time';
    const yAxis = chart.yAxis || (chart.config?.yAxis ? (Array.isArray(chart.config.yAxis) ? chart.config.yAxis : [chart.config.yAxis]) : ['value']);
    const colors = chart.config?.colors || CHART_COLORS;

    switch (chart.type) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey={xAxis} stroke="rgba(255,255,255,0.5)" />
              <YAxis stroke="rgba(255,255,255,0.5)" tickFormatter={formatNumber} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(30, 30, 30, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              {yAxis.map((key, idx) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={colors[idx % colors.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey={xAxis} stroke="rgba(255,255,255,0.5)" />
              <YAxis stroke="rgba(255,255,255,0.5)" tickFormatter={formatNumber} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(30, 30, 30, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              {yAxis.map((key, idx) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={colors[idx % colors.length]}
                  fill={colors[idx % colors.length]}
                  fillOpacity={0.3}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey={xAxis} stroke="rgba(255,255,255,0.5)" />
              <YAxis stroke="rgba(255,255,255,0.5)" tickFormatter={formatNumber} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(30, 30, 30, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              {yAxis.map((key, idx) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={colors[idx % colors.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'composed':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey={xAxis} stroke="rgba(255,255,255,0.5)" />
              <YAxis stroke="rgba(255,255,255,0.5)" tickFormatter={formatNumber} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(30, 30, 30, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Bar dataKey={yAxis[0]} fill={colors[0]} radius={[4, 4, 0, 0]} />
              {yAxis.slice(1).map((key, idx) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={colors[(idx + 1) % colors.length]}
                  strokeWidth={2}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        );

      case 'pie':
        const pieValueKey = chart.valueKey || 'value';
        const pieLabelKey = chart.labelKey || 'name';
        
        return (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey={pieValueKey}
                nameKey={pieLabelKey}
                cx="50%"
                cy="50%"
                outerRadius={100}
                label
              >
                {chartData.map((entry: any, index: number) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.color || colors[index % colors.length]} 
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(30, 30, 30, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                }}
                formatter={(value: number) => [formatNumber(value), '']}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey={xAxis} stroke="rgba(255,255,255,0.5)" />
              <YAxis dataKey={yAxis[0]} stroke="rgba(255,255,255,0.5)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(30, 30, 30, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Scatter data={chartData} fill={colors[0]} />
            </ScatterChart>
          </ResponsiveContainer>
        );

      case 'radar':
        const labelKey = chart.labelKey || 'metric';
        const valueKeys = chart.valueKey ? [chart.valueKey] : yAxis;
        
        return (
          <ResponsiveContainer width="100%" height={height}>
            <RadarChart data={chartData}>
              <PolarGrid stroke="rgba(255,255,255,0.2)" />
              <PolarAngleAxis dataKey={labelKey} stroke="rgba(255,255,255,0.5)" />
              <PolarRadiusAxis stroke="rgba(255,255,255,0.5)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(30, 30, 30, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              {valueKeys.map((key, idx) => (
                <Radar
                  key={key}
                  name={key}
                  dataKey={key}
                  stroke={colors[idx % colors.length]}
                  fill={colors[idx % colors.length]}
                  fillOpacity={0.3}
                />
              ))}
            </RadarChart>
          </ResponsiveContainer>
        );

      case 'heatmap':
        // Custom heatmap implementation
        const heatmapData = chartData as Array<{ x: string; y: string; value: number }>;
        if (!heatmapData || !Array.isArray(heatmapData)) {
          return <Alert severity="warning">Invalid heatmap data format</Alert>;
        }

        // Get unique x and y values
        const xValues = Array.from(new Set(heatmapData.map(d => d.x)));
        const yValues = Array.from(new Set(heatmapData.map(d => d.y)));
        
        // Find min/max for color scaling
        const values = heatmapData.map(d => d.value);
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        
        // Color interpolation function (blue -> green -> yellow -> red)
        const getHeatmapColor = (value: number): string => {
          const normalized = (value - minValue) / (maxValue - minValue);
          if (normalized < 0.25) {
            const t = normalized / 0.25;
            return `rgb(${Math.floor(0 + 66 * t)}, ${Math.floor(119 + 68 * t)}, ${Math.floor(179 - 32 * t)})`;
          } else if (normalized < 0.5) {
            const t = (normalized - 0.25) / 0.25;
            return `rgb(${Math.floor(66 + 121 * t)}, ${Math.floor(187 + 82 * t)}, ${Math.floor(147 - 68 * t)})`;
          } else if (normalized < 0.75) {
            const t = (normalized - 0.5) / 0.25;
            return `rgb(${Math.floor(187 + 68 * t)}, ${Math.floor(269 - 14 * t)}, ${Math.floor(79 - 12 * t)})`;
          } else {
            const t = (normalized - 0.75) / 0.25;
            return `rgb(${Math.floor(255)}, ${Math.floor(255 - 112 * t)}, ${Math.floor(67 - 67 * t)})`;
          }
        };

        return (
          <Box sx={{ overflowX: 'auto' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: `80px repeat(${xValues.length}, 60px)`, gap: '2px', minWidth: 'fit-content' }}>
              {/* Header row */}
              <Box sx={{ gridColumn: '1 / 2' }} />
              {xValues.map((x, idx) => (
                <Box key={`header-${idx}`} sx={{ textAlign: 'center', fontSize: '0.75rem', color: 'text.secondary', py: 0.5 }}>
                  {x}
                </Box>
              ))}
              
              {/* Data rows */}
              {yValues.map((y, yIdx) => (
                <React.Fragment key={`row-${yIdx}`}>
                  <Box sx={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem', color: 'text.secondary', pr: 1 }}>
                    {y}
                  </Box>
                  {xValues.map((x, xIdx) => {
                    const dataPoint = heatmapData.find(d => d.x === x && d.y === y);
                    const value = dataPoint?.value || 0;
                    const normalized = (value - minValue) / (maxValue - minValue);
                    return (
                      <MuiTooltip key={`cell-${yIdx}-${xIdx}`} title={`${x} / ${y}: ${formatNumber(value)}`} arrow>
                        <Box
                          sx={{
                            height: 40,
                            backgroundColor: getHeatmapColor(value),
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: normalized > 0.5 ? '#000' : '#fff',
                            cursor: 'pointer',
                            transition: 'transform 0.2s',
                            '&:hover': {
                              transform: 'scale(1.1)',
                              zIndex: 1,
                            },
                          }}
                        >
                          {value > 0 ? formatNumber(value) : ''}
                        </Box>
                      </MuiTooltip>
                    );
                  })}
                </React.Fragment>
              ))}
            </Box>
            
            {/* Color scale legend */}
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary">Low</Typography>
              <Box sx={{ flex: 1, height: 20, borderRadius: '4px', background: `linear-gradient(to right, rgb(0,119,179), rgb(66,187,147), rgb(187,269,79), rgb(255,143,0), rgb(255,0,0))` }} />
              <Typography variant="caption" color="text.secondary">High</Typography>
            </Box>
          </Box>
        );
      

      case 'candlestick':
        // TradingView lightweight-charts implementation
        return <CandlestickChart data={chartData} height={height} />;

      case 'gauge':
        // Custom gauge implementation
        const gaugeValue = typeof chartData === 'number' ? chartData : (chartData?.[chart.valueKey || 'value'] ?? 0);
        const max = chart.max || 100;
        const percentage = Math.min(100, Math.max(0, (gaugeValue / max) * 100));
        
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 3 }}>
            <Box
              sx={{
                position: 'relative',
                width: 200,
                height: 200,
                borderRadius: '50%',
                background: `conic-gradient(${CHART_COLORS[0]} ${percentage}%, rgba(255,255,255,0.1) ${percentage}%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Box
                sx={{
                  width: 160,
                  height: 160,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(30, 30, 30, 0.95)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Typography variant="h3" fontWeight={700} color={CHART_COLORS[0]}>
                  {typeof gaugeValue === 'number' ? gaugeValue.toFixed(1) : '0.0'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  / {max}
                </Typography>
              </Box>
            </Box>
          </Box>
        );

      default:
        return (
          <Alert severity="warning">
            Chart type "{chart.type}" not yet implemented
          </Alert>
        );
    }
  };

  if (visibleCharts.length === 0) {
    return (
      <Alert severity="info">
        No charts available for the current mode and filters.
      </Alert>
    );
  }

  return (
    <Box>
      {/* Group filter */}
      {availableGroups.length > 1 && (
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
          <ToggleButtonGroup
            value={selectedGroup}
            exclusive
            onChange={handleGroupChange}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                textTransform: 'none',
                px: 2,
                py: 1,
                borderColor: 'rgba(255, 255, 255, 0.12)',
                '&.Mui-selected': {
                  backgroundColor: 'rgba(102, 126, 234, 0.2)',
                  color: '#667eea',
                  '&:hover': {
                    backgroundColor: 'rgba(102, 126, 234, 0.3)',
                  },
                },
              },
            }}
          >
            <ToggleButton value="all">All Charts ({charts.length})</ToggleButton>
            {availableGroups.map((group) => {
              const count = charts.filter((c) => c.group === group).length;
              return (
                <ToggleButton key={group} value={group}>
                  {GROUP_CONFIG[group].label} ({count})
                </ToggleButton>
              );
            })}
          </ToggleButtonGroup>
        </Box>
      )}

      {/* Charts grid */}
      <Grid container spacing={3}>
        {visibleCharts.map((chart) => (
          <Grid item xs={12} md={chart.width === 'full' ? 12 : 6} key={chart.id}>
            {renderChart(chart)}
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default ChartLibrary;
