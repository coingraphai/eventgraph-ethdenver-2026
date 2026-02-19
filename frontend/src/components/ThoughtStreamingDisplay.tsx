import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  LinearProgress,
  Card,
  CardContent,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  useTheme,
  Fade,
  Grow,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Psychology as PsychologyIcon,
  Pending as PendingIcon,
  ExpandMore as ExpandMoreIcon,
  Analytics as AnalyticsIcon,
  Storage as StorageIcon,
  TrendingUp as TrendingUpIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';
import { ThoughtStep } from '../services/chatApi';

interface ThoughtStreamingDisplayProps {
  steps: ThoughtStep[];
  isStreaming: boolean;
}

export const ThoughtStreamingDisplay: React.FC<ThoughtStreamingDisplayProps> = ({ 
  steps, 
  isStreaming 
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(true);
  const [animatingStep, setAnimatingStep] = useState<number | null>(null);

  // Animate new steps as they arrive
  useEffect(() => {
    if (steps.length > 0) {
      const latestStep = steps[steps.length - 1];
      setAnimatingStep(latestStep.step);
      const timer = setTimeout(() => setAnimatingStep(null), 800);
      return () => clearTimeout(timer);
    }
  }, [steps.length]);

  // Auto-collapse after completion for cleaner UI
  useEffect(() => {
    if (!isStreaming && steps.length > 0 && steps.every(step => step.status === 'complete')) {
      const timer = setTimeout(() => setExpanded(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, steps]);

  const getStepIcon = (stepName: string, status: string) => {
    const isDark = theme.palette.mode === 'dark';
    
    if (status === 'complete') return <CheckCircleIcon sx={{ color: '#BBD977', fontSize: 18 }} />;
    if (status === 'error') return <ErrorIcon sx={{ color: '#f44336', fontSize: 18 }} />;
    
    // Dynamic icons based on step type - using brand green
    if (stepName.includes('Intent') || stepName.includes('Understanding')) {
      return <PsychologyIcon sx={{ color: isDark ? '#BBD977' : '#9BC255', fontSize: 18 }} />;
    }
    if (stepName.includes('Strategy') || stepName.includes('Planning')) {
      return <AnalyticsIcon sx={{ color: isDark ? '#BBD977' : '#9BC255', fontSize: 18 }} />;
    }
    if (stepName.includes('Data') || stepName.includes('Gathering')) {
      return <StorageIcon sx={{ color: isDark ? '#BBD977' : '#9BC255', fontSize: 18 }} />;
    }
    if (stepName.includes('Synthesis') || stepName.includes('Insights')) {
      return <TrendingUpIcon sx={{ color: isDark ? '#BBD977' : '#9BC255', fontSize: 18 }} />;
    }
    
    return <PendingIcon sx={{ color: isDark ? '#BBD977' : '#9BC255', fontSize: 18 }} />;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete': return '#BBD977';  // Brand green for complete
      case 'in_progress': return '#BBD977';  // Brand green for in progress
      case 'error': return '#f44336';
      default: return '#858585';  // Gray from theme
    }
  };

  const formatStepResult = (result: string) => {
    // Enhanced result formatting for better readability
    if (result.includes('API') || result.includes('data queries')) {
      return `🔍 ${result}`;
    }
    if (result.includes('detected') || result.includes('analysis')) {
      return `🎯 ${result}`;
    }
    if (result.includes('tools') || result.includes('comprehensive')) {
      return `⚡ ${result}`;
    }
    return result;
  };

  if (steps.length === 0) return null;

  const isDark = theme.palette.mode === 'dark';

  return (
    <Fade in={true} timeout={300}>
      <Paper 
        elevation={0}
        sx={{ 
          mb: 2,
          borderRadius: 2,
          background: isDark ? '#1A1A1A' : '#F7FFE4',
          border: `1px solid ${isDark ? '#1E1E1E' : '#C5C5C5'}`,
          overflow: 'hidden'
        }}
      >
        <Accordion 
          expanded={expanded} 
          onChange={() => setExpanded(!expanded)}
          sx={{ 
            '&:before': { display: 'none' },
            boxShadow: 'none',
            backgroundColor: 'transparent',
            backgroundImage: 'none'
          }}
        >
          <AccordionSummary 
            expandIcon={<ExpandMoreIcon sx={{ color: isDark ? '#BBD977' : '#9BC255' }} />}
            sx={{ 
              px: 2, 
              py: 1.5,
              minHeight: 'auto',
              '& .MuiAccordionSummary-content': {
                margin: '8px 0',
                alignItems: 'center'
              }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
              <PsychologyIcon sx={{ color: isDark ? '#BBD977' : '#9BC255', fontSize: 20 }} />
              
              <Box sx={{ flexGrow: 1 }}>
                <Typography 
                  variant="subtitle2" 
                  sx={{ 
                    fontWeight: 600,
                    color: isDark ? '#FFFFFF' : '#000000',
                    fontSize: '0.875rem'
                  }}
                >
                  AI Thought Process
                </Typography>
                <Typography 
                  variant="caption" 
                  sx={{ 
                    color: isDark ? '#858585' : '#666666',
                    fontSize: '0.75rem'
                  }}
                >
                  {isStreaming ? 'Analyzing your request...' : `${steps.length} reasoning steps completed`}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {steps.slice(0, 4).map((step) => (
                  <Box
                    key={step.step}
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: getStatusColor(step.status),
                      opacity: step.status === 'complete' ? 1 : 0.6,
                      transition: 'all 0.3s ease',
                      ...(animatingStep === step.step && {
                        transform: 'scale(1.3)',
                        boxShadow: `0 0 8px ${getStatusColor(step.status)}`
                      })
                    }}
                  />
                ))}
                {steps.length > 4 && (
                  <Typography variant="caption" sx={{ ml: 0.5, color: isDark ? '#858585' : '#666666' }}>
                    +{steps.length - 4}
                  </Typography>
                )}
              </Box>

              {isStreaming && (
                <SpeedIcon 
                  sx={{ 
                    color: '#BBD977',
                    fontSize: 16,
                    animation: 'pulse 1.5s infinite'
                  }} 
                />
              )}
            </Box>
          </AccordionSummary>

          <AccordionDetails sx={{ px: 2, pb: 2, pt: 0 }}>
            <Stack spacing={1.5}>
              {steps.map((step, index) => (
                <Grow 
                  in={true} 
                  timeout={300 + (index * 100)}
                  key={step.step}
                >
                  <Card 
                    variant="outlined"
                    sx={{ 
                      backgroundColor: step.status === 'complete' 
                        ? (isDark ? 'rgba(187, 217, 119, 0.08)' : 'rgba(187, 217, 119, 0.2)') 
                        : step.status === 'in_progress' 
                          ? (isDark ? 'rgba(187, 217, 119, 0.05)' : 'rgba(187, 217, 119, 0.1)')
                          : 'transparent',
                      borderColor: step.status === 'complete' 
                        ? (isDark ? 'rgba(187, 217, 119, 0.3)' : 'rgba(187, 217, 119, 0.5)')
                        : step.status === 'in_progress' 
                          ? (isDark ? 'rgba(187, 217, 119, 0.2)' : 'rgba(187, 217, 119, 0.4)')
                          : (isDark ? '#1E1E1E' : '#C5C5C5'),
                      transition: 'all 0.4s ease',
                      ...(animatingStep === step.step && {
                        boxShadow: isDark 
                          ? `0 4px 12px rgba(187, 217, 119, 0.2)`
                          : `0 4px 12px rgba(187, 217, 119, 0.3)`,
                        transform: 'translateY(-2px)'
                      })
                    }}
                  >
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                        <Box sx={{ mt: 0.25 }}>
                          {getStepIcon(step.name, step.status)}
                        </Box>
                        
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                fontWeight: 600,
                                fontSize: '0.813rem',
                                color: isDark ? '#FFFFFF' : '#000000'
                              }}
                            >
                              {step.name}
                            </Typography>
                            
                            <Chip 
                              label={step.status.replace('_', ' ')}
                              size="small"
                              sx={{ 
                                height: 18,
                                fontSize: '0.688rem',
                                fontWeight: 500,
                                textTransform: 'capitalize',
                                backgroundColor: isDark 
                                  ? `${getStatusColor(step.status)}20`
                                  : `${getStatusColor(step.status)}30`,
                                color: getStatusColor(step.status),
                                border: `1px solid ${getStatusColor(step.status)}${isDark ? '40' : '60'}`,
                                '& .MuiChip-label': { px: 1 }
                              }} 
                            />
                          </Box>
                          
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              color: isDark ? '#858585' : '#666666',
                              fontSize: '0.75rem',
                              lineHeight: 1.4,
                              mb: step.result ? 1 : 0
                            }}
                          >
                            {step.description}
                          </Typography>

                          {step.result && (
                            <Box 
                              sx={{ 
                                mt: 1,
                                p: 1,
                                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)',
                                borderRadius: 1,
                                borderLeft: `3px solid ${getStatusColor(step.status)}`
                              }}
                            >
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  fontSize: '0.75rem',
                                  color: isDark ? '#FFFFFF' : '#000000',
                                  fontStyle: 'italic',
                                  lineHeight: 1.4
                                }}
                              >
                                {formatStepResult(step.result)}
                              </Typography>
                            </Box>
                          )}

                          {step.status === 'in_progress' && (
                            <LinearProgress 
                              sx={{ 
                                mt: 1,
                                height: 3,
                                borderRadius: 1.5,
                                backgroundColor: isDark 
                                  ? 'rgba(187, 217, 119, 0.1)'
                                  : 'rgba(187, 217, 119, 0.2)',
                                '& .MuiLinearProgress-bar': {
                                  backgroundColor: '#BBD977',
                                  borderRadius: 1.5
                                }
                              }} 
                            />
                          )}
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                </Grow>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* Global styles for animations */}
        <style>
          {`
            @keyframes pulse {
              0% { opacity: 1; }
              50% { opacity: 0.5; }
              100% { opacity: 1; }
            }
          `}
        </style>
      </Paper>
    </Fade>
  );
};
