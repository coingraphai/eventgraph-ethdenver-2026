import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stepper,
  Step,
  StepLabel,
  LinearProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  HourglassEmpty as PendingIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { WorkflowStep } from '../../config/agents/agentSchema';

interface ProgressPanelProps {
  steps: WorkflowStep[];
  currentStepIndex: number;
  isRunning: boolean;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  errorMessage?: string;
}

const ProgressPanel: React.FC<ProgressPanelProps> = ({
  steps,
  currentStepIndex,
  isRunning,
  status,
  errorMessage,
}) => {
  const [expandedStep, setExpandedStep] = useState<number | false>(false);

  const handleStepExpand = (stepIndex: number) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedStep(isExpanded ? stepIndex : false);
  };

  const getStepStatus = (index: number): 'pending' | 'running' | 'completed' | 'failed' => {
    if (index < currentStepIndex) return 'completed';
    if (index === currentStepIndex && isRunning) return 'running';
    if (status === 'failed' && index === currentStepIndex) return 'failed';
    return 'pending';
  };

  const getStepIcon = (stepStatus: string) => {
    switch (stepStatus) {
      case 'completed':
        return <CheckCircleIcon sx={{ color: '#BBD977', fontSize: 24 }} />;
      case 'failed':
        return <ErrorIcon sx={{ color: 'error.main', fontSize: 24 }} />;
      case 'running':
        return (
          <Box
            sx={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: '3px solid #BBD977',
              borderTopColor: 'transparent',
              animation: 'spin 1s linear infinite',
              '@keyframes spin': {
                '0%': { transform: 'rotate(0deg)' },
                '100%': { transform: 'rotate(360deg)' },
              },
            }}
          />
        );
      case 'pending':
      default:
        return (
          <PendingIcon
            sx={{
              color: 'rgba(255, 255, 255, 0.3)',
              fontSize: 24,
            }}
          />
        );
    }
  };

  const getTimeEstimate = (step: WorkflowStep): string => {
    if (!step.estimatedTime) return '';
    if (step.estimatedTime < 60) return `~${step.estimatedTime}s`;
    return `~${Math.round(step.estimatedTime / 60)}m`;
  };

  return (
    <Card
      sx={{
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight={600} mb={3}>
          Execution Progress
        </Typography>

        {!isRunning && currentStepIndex === 0 ? (
          <Typography
            color="text.secondary"
            sx={{ textAlign: 'center', py: 8 }}
          >
            Click "Run Agent" to start
          </Typography>
        ) : (
          <>
            {/* Progress bar */}
            {isRunning && (
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Step {currentStepIndex + 1} of {steps.length}
                  </Typography>
                  <Typography variant="body2" color="primary">
                    {Math.round(((currentStepIndex + 1) / steps.length) * 100)}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={((currentStepIndex + 1) / steps.length) * 100}
                  sx={{
                    height: 8,
                    borderRadius: '4px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    '& .MuiLinearProgress-bar': {
                      background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                      borderRadius: '4px',
                    },
                  }}
                />
              </Box>
            )}

            {/* Steps accordion */}
            <Box sx={{ mb: 2 }}>
              {steps.map((step, index) => {
                const stepStatus = getStepStatus(index);
                return (
                  <Accordion
                    key={step.id}
                    expanded={expandedStep === index}
                    onChange={handleStepExpand(index)}
                    disabled={stepStatus === 'pending'}
                    sx={{
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      boxShadow: 'none',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      mb: 1,
                      '&:before': { display: 'none' },
                      '&.Mui-disabled': {
                        backgroundColor: 'transparent',
                      },
                    }}
                  >
                    <AccordionSummary
                      expandIcon={
                        stepStatus !== 'pending' ? <ExpandMoreIcon /> : null
                      }
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                        {getStepIcon(stepStatus)}
                        <Box sx={{ flex: 1 }}>
                          <Typography
                            variant="body2"
                            fontWeight={stepStatus === 'running' ? 600 : 400}
                            sx={{
                              color:
                                stepStatus === 'completed'
                                  ? '#BBD977'
                                  : stepStatus === 'failed'
                                  ? 'error.main'
                                  : stepStatus === 'running'
                                  ? 'primary.main'
                                  : 'text.secondary',
                            }}
                          >
                            {step.name}
                          </Typography>
                          {step.description && stepStatus !== 'pending' && (
                            <Typography variant="caption" color="text.secondary">
                              {step.description}
                            </Typography>
                          )}
                        </Box>
                        {getTimeEstimate(step) && stepStatus === 'running' && (
                          <Chip
                            label={getTimeEstimate(step)}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.7rem',
                              backgroundColor: 'rgba(102, 126, 234, 0.2)',
                            }}
                          />
                        )}
                      </Box>
                    </AccordionSummary>
                    {stepStatus !== 'pending' && (
                      <AccordionDetails>
                        <Box
                          sx={{
                            pl: 5,
                            borderLeft: '2px solid rgba(255, 255, 255, 0.1)',
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            {step.description || 'Processing...'}
                          </Typography>
                          {/* You can add logs here if available */}
                        </Box>
                      </AccordionDetails>
                    )}
                  </Accordion>
                );
              })}
            </Box>

            {/* Status alerts */}
            {status === 'completed' && (
              <Alert
                severity="success"
                icon={<CheckCircleIcon />}
                sx={{ borderRadius: '8px' }}
              >
                Agent completed successfully! All {steps.length} steps executed.
              </Alert>
            )}
            {status === 'failed' && (
              <Alert
                severity="error"
                icon={<ErrorIcon />}
                sx={{ borderRadius: '8px' }}
              >
                Agent failed at step {currentStepIndex + 1}: {errorMessage || 'Unknown error'}
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ProgressPanel;
