import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  LinearProgress,
  ToggleButtonGroup,
  ToggleButton,
  alpha,
  useTheme,
} from '@mui/material';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

export interface ScenarioOutcome {
  metric: string;
  baseCase: number;
  bestCase: number;
  worstCase: number;
  unit?: string;
}

export interface ForecastScenario {
  id: string;
  name: string;
  probability: number; // 0-100
  description: string;
  timeframe: string; // e.g., "7 days", "30 days"
  outcomes: ScenarioOutcome[];
  catalysts?: string[];
  risks?: string[];
}

export interface ForecastData {
  summary: string;
  priceProjection?: {
    timeLabels: string[];
    baseCase: number[];
    bestCase: number[];
    worstCase: number[];
    currentPrice: number;
  };
  scenarios: ForecastScenario[];
  confidenceLevel: number; // 0-100
  modelInfo?: string;
  timestamp?: number;
}

interface ForecastPanelProps {
  data: ForecastData;
}

const ForecastPanel: React.FC<ForecastPanelProps> = ({ data }) => {
  const theme = useTheme();
  const [selectedScenario, setSelectedScenario] = useState<string>(data.scenarios[0]?.id || '');

  const currentScenario = data.scenarios.find((s) => s.id === selectedScenario) || data.scenarios[0];

  const getProbabilityColor = (prob: number): string => {
    if (prob > 60) return '#26a69a';
    if (prob > 30) return '#FFA726';
    return '#ef5350';
  };

  const formatNumber = (num: number, unit?: string): string => {
    let formatted: string;
    if (num >= 1e9) {
      formatted = `${(num / 1e9).toFixed(2)}B`;
    } else if (num >= 1e6) {
      formatted = `${(num / 1e6).toFixed(2)}M`;
    } else if (num >= 1e3) {
      formatted = `${(num / 1e3).toFixed(2)}K`;
    } else {
      formatted = num.toFixed(2);
    }
    return unit ? `${formatted} ${unit}` : formatted;
  };

  // Prepare chart data
  const chartData =
    data.priceProjection?.timeLabels.map((time, idx) => ({
      time,
      'Base Case': data.priceProjection?.baseCase[idx],
      'Best Case': data.priceProjection?.bestCase[idx],
      'Worst Case': data.priceProjection?.worstCase[idx],
    })) || [];

  return (
    <Box>
      {/* Forecast Summary */}
      <Card
        sx={{
          mb: 3,
          backgroundColor: alpha(theme.palette.primary.main, 0.1),
          border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
          borderRadius: '12px',
        }}
      >
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                🔮 Forecast Summary
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {data.summary}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right', minWidth: 120 }}>
              <Typography variant="caption" color="text.secondary">
                Model Confidence
              </Typography>
              <Typography variant="h4" fontWeight={700} sx={{ color: getProbabilityColor(data.confidenceLevel) }}>
                {data.confidenceLevel}%
              </Typography>
            </Box>
          </Box>
          {data.modelInfo && (
            <Typography variant="caption" color="text.secondary">
              Model: {data.modelInfo}
            </Typography>
          )}
          {data.timestamp && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Generated {new Date(data.timestamp).toLocaleString()}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Price Projection Chart */}
      {data.priceProjection && chartData.length > 0 && (
        <Card
          sx={{
            mb: 3,
            backgroundColor: alpha(theme.palette.background.paper, 0.6),
            border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
            borderRadius: '12px',
          }}
        >
          <CardContent>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Price Projection
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.divider, 0.2)} />
                <XAxis dataKey="time" stroke={theme.palette.text.secondary} />
                <YAxis stroke={theme.palette.text.secondary} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: alpha(theme.palette.background.paper, 0.95),
                    border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
                    borderRadius: '8px',
                    color: theme.palette.text.primary,
                  }}
                />
                <Legend />
                <ReferenceLine
                  y={data.priceProjection.currentPrice}
                  stroke="#9e9e9e"
                  strokeDasharray="5 5"
                  label="Current"
                />
                <Area
                  type="monotone"
                  dataKey="Best Case"
                  stroke="#26a69a"
                  fill="#26a69a"
                  fillOpacity={0.2}
                />
                <Area
                  type="monotone"
                  dataKey="Base Case"
                  stroke="#4FC3F7"
                  fill="#4FC3F7"
                  fillOpacity={0.3}
                />
                <Area
                  type="monotone"
                  dataKey="Worst Case"
                  stroke="#ef5350"
                  fill="#ef5350"
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Scenario Selector */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" fontWeight={600} gutterBottom>
          Scenarios & Probabilities
        </Typography>
        <ToggleButtonGroup
          value={selectedScenario}
          exclusive
          onChange={(_, value) => value && setSelectedScenario(value)}
          fullWidth
          sx={{
            '& .MuiToggleButton-root': {
              textTransform: 'none',
              flexDirection: 'column',
              py: 2,
              borderColor: alpha(theme.palette.divider, 0.2),
              '&.Mui-selected': {
                backgroundColor: alpha(theme.palette.primary.main, 0.2),
                borderColor: theme.palette.primary.main,
                '&:hover': {
                  backgroundColor: alpha(theme.palette.primary.main, 0.3),
                },
              },
            },
          }}
        >
          {data.scenarios.map((scenario) => (
            <ToggleButton key={scenario.id} value={scenario.id}>
              <Typography variant="subtitle2" fontWeight={600}>
                {scenario.name}
              </Typography>
              <Chip
                label={`${scenario.probability}%`}
                size="small"
                sx={{
                  mt: 0.5,
                  backgroundColor: `${getProbabilityColor(scenario.probability)}20`,
                  color: getProbabilityColor(scenario.probability),
                  fontWeight: 600,
                }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                {scenario.timeframe}
              </Typography>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* Selected Scenario Details */}
      {currentScenario && (
        <Grid container spacing={3}>
          {/* Scenario Info */}
          <Grid item xs={12} md={6}>
            <Card
              sx={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                height: '100%',
              }}
            >
              <CardContent>
                <Typography variant="h6" fontWeight={600} gutterBottom>
                  {currentScenario.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  {currentScenario.description}
                </Typography>

                {/* Probability bar */}
                <Box sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Probability
                    </Typography>
                    <Typography variant="caption" fontWeight={600}>
                      {currentScenario.probability}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={currentScenario.probability}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: alpha(theme.palette.divider, 0.2),
                      '& .MuiLinearProgress-bar': {
                        borderRadius: 4,
                        backgroundColor: getProbabilityColor(currentScenario.probability),
                      },
                    }}
                  />
                </Box>

                {/* Catalysts */}
                {currentScenario.catalysts && currentScenario.catalysts.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                      📈 Key Catalysts
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {currentScenario.catalysts.map((catalyst, idx) => (
                        <Chip
                          key={idx}
                          label={catalyst}
                          size="small"
                          sx={{
                            backgroundColor: 'rgba(38, 166, 154, 0.2)',
                            color: '#26a69a',
                          }}
                        />
                      ))}
                    </Box>
                  </Box>
                )}

                {/* Risks */}
                {currentScenario.risks && currentScenario.risks.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                      ⚠️ Risk Factors
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {currentScenario.risks.map((risk, idx) => (
                        <Chip
                          key={idx}
                          label={risk}
                          size="small"
                          sx={{
                            backgroundColor: 'rgba(239, 83, 80, 0.2)',
                            color: '#ef5350',
                          }}
                        />
                      ))}
                    </Box>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Expected Outcomes */}
          <Grid item xs={12} md={6}>
            <Card
              sx={{
                backgroundColor: alpha(theme.palette.background.paper, 0.6),
                border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
                borderRadius: '12px',
                height: '100%',
              }}
            >
              <CardContent>
                <Typography variant="h6" fontWeight={600} gutterBottom>
                  Expected Outcomes
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {currentScenario.outcomes.map((outcome, idx) => (
                    <Box key={idx}>
                      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                        {outcome.metric}
                      </Typography>
                      <Grid container spacing={1}>
                        <Grid item xs={4}>
                          <Box
                            sx={{
                              p: 1.5,
                              borderRadius: '8px',
                              backgroundColor: 'rgba(239, 83, 80, 0.1)',
                              border: '1px solid rgba(239, 83, 80, 0.3)',
                            }}
                          >
                            <Typography variant="caption" color="#ef5350" display="block">
                              Worst Case
                            </Typography>
                            <Typography variant="body2" fontWeight={600}>
                              {formatNumber(outcome.worstCase, outcome.unit)}
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={4}>
                          <Box
                            sx={{
                              p: 1.5,
                              borderRadius: '8px',
                              backgroundColor: 'rgba(79, 195, 247, 0.1)',
                              border: '1px solid rgba(79, 195, 247, 0.3)',
                            }}
                          >
                            <Typography variant="caption" color="#4FC3F7" display="block">
                              Base Case
                            </Typography>
                            <Typography variant="body2" fontWeight={600}>
                              {formatNumber(outcome.baseCase, outcome.unit)}
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={4}>
                          <Box
                            sx={{
                              p: 1.5,
                              borderRadius: '8px',
                              backgroundColor: 'rgba(38, 166, 154, 0.1)',
                              border: '1px solid rgba(38, 166, 154, 0.3)',
                            }}
                          >
                            <Typography variant="caption" color="#26a69a" display="block">
                              Best Case
                            </Typography>
                            <Typography variant="body2" fontWeight={600}>
                              {formatNumber(outcome.bestCase, outcome.unit)}
                            </Typography>
                          </Box>
                        </Grid>
                      </Grid>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default ForecastPanel;
