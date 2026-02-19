import React, { useState } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Stack,
  Paper,
  Divider,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Pending as PendingIcon,
  Code as CodeIcon,
  TableChart as TableIcon,
} from '@mui/icons-material';
// import { colors } from '../theme/theme';
import { ThoughtStep } from '../services/chatApi';

interface ThoughtProcessProps {
  steps: ThoughtStep[];
  sqlQuery?: string;
}

export const ThoughtProcess: React.FC<ThoughtProcessProps> = ({ steps, sqlQuery }) => {
  const [expanded, setExpanded] = useState(false);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircleIcon sx={{ fontSize: 16, color: 'primary.main' }} />;
      case 'failed':
        return <ErrorIcon sx={{ fontSize: 16, color: '#FF6B6B' }} />;
      case 'in_progress':
        return <PendingIcon sx={{ fontSize: 16, color: 'text.secondary' }} />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete':
        return 'primary.main';
      case 'failed':
        return '#FF6B6B';
      case 'in_progress':
        return 'text.secondary';
      case 'skipped':
        return '#FFA500';
      default:
        return 'text.secondary';
    }
  };

  if (!steps || steps.length === 0) {
    return null;
  }

  return (
    <Box sx={{ mt: 2, mb: 2 }}>
      <Accordion
        expanded={expanded}
        onChange={() => setExpanded(!expanded)}
        sx={{
          backgroundColor: 'background.paper',
          border: `1px solid ${'divider'}`,
          borderRadius: '8px',
          '&:before': {
            display: 'none',
          },
          boxShadow: 'none',
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon sx={{ color: 'primary.main' }} />}
          sx={{
            '& .MuiAccordionSummary-content': {
              alignItems: 'center',
              gap: 1,
            },
          }}
        >
          <Typography
            sx={{
              color: 'text.primary',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            🧠 Chain of Thought
          </Typography>
          <Chip
            label={`${steps.length} steps`}
            size="small"
            sx={{
              backgroundColor: 'background.default',
              color: 'primary.main',
              fontSize: '11px',
              height: '20px',
            }}
          />
        </AccordionSummary>

        <AccordionDetails>
          <Stack spacing={2}>
            {steps.map((step, index) => (
              <Paper
                key={index}
                sx={{
                  backgroundColor: 'background.default',
                  border: `1px solid ${'divider'}`,
                  borderRadius: '6px',
                  p: 2,
                }}
              >
                {/* Step Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography
                    sx={{
                      color: 'primary.main',
                      fontSize: '12px',
                      fontWeight: 700,
                      backgroundColor: 'background.paper',
                      px: 1,
                      py: 0.5,
                      borderRadius: '4px',
                    }}
                  >
                    Step {step.step}
                  </Typography>
                  {getStatusIcon(step.status)}
                  <Typography
                    sx={{
                      color: 'text.primary',
                      fontSize: '13px',
                      fontWeight: 600,
                      flex: 1,
                    }}
                  >
                    {step.description}
                  </Typography>
                  <Chip
                    label={step.status}
                    size="small"
                    sx={{
                      backgroundColor: 'background.paper',
                      color: getStatusColor(step.status),
                      fontSize: '10px',
                      height: '18px',
                      fontWeight: 600,
                    }}
                  />
                </Box>

                {/* Step Details */}
                {step.tables_found && step.tables_found.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <TableIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                      <Typography sx={{ color: 'text.secondary', fontSize: '11px' }}>
                        Tables Found:
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap">
                      {step.tables_found.map((table, idx) => (
                        <Chip
                          key={idx}
                          label={table}
                          size="small"
                          sx={{
                            backgroundColor: 'background.paper',
                            color: 'primary.main',
                            fontSize: '10px',
                            height: '18px',
                          }}
                        />
                      ))}
                    </Stack>
                  </Box>
                )}

                {step.sql_generated && (
                  <Box sx={{ mt: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <CodeIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                      <Typography sx={{ color: 'text.secondary', fontSize: '11px' }}>
                        SQL Query:
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        backgroundColor: '#1A1A1A',
                        border: `1px solid ${'divider'}`,
                        borderRadius: '4px',
                        p: 1.5,
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        color: '#BBD977',
                        overflowX: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {step.sql_generated}
                    </Box>
                  </Box>
                )}

                {step.corrected_sql && (
                  <Box sx={{ mt: 1 }}>
                    <Typography sx={{ color: '#FFA500', fontSize: '11px', mb: 0.5 }}>
                      ⚠️ Corrected SQL:
                    </Typography>
                    <Box
                      sx={{
                        backgroundColor: '#1A1A1A',
                        border: `1px solid #FFA500`,
                        borderRadius: '4px',
                        p: 1.5,
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        color: '#BBD977',
                        overflowX: 'auto',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {step.corrected_sql}
                    </Box>
                  </Box>
                )}

                {step.rows_retrieved !== undefined && (
                  <Typography sx={{ color: 'text.secondary', fontSize: '11px', mt: 1 }}>
                    📊 Retrieved {step.rows_retrieved} row{step.rows_retrieved !== 1 ? 's' : ''}
                  </Typography>
                )}

                {step.error && (
                  <Box
                    sx={{
                      mt: 1,
                      p: 1,
                      backgroundColor: 'rgba(255, 107, 107, 0.1)',
                      border: '1px solid #FF6B6B',
                      borderRadius: '4px',
                    }}
                  >
                    <Typography sx={{ color: '#FF6B6B', fontSize: '11px' }}>
                      ❌ {step.error}
                    </Typography>
                  </Box>
                )}

                {step.result && typeof step.result === 'string' && (
                  <Typography sx={{ color: 'text.secondary', fontSize: '11px', mt: 1 }}>
                    ✓ {step.result}
                  </Typography>
                )}
              </Paper>
            ))}

            {/* Final SQL Query Display */}
            {sqlQuery && (
              <>
                <Divider sx={{ borderColor: 'divider', my: 1 }} />
                <Box>
                  <Typography
                    sx={{
                      color: 'primary.main',
                      fontSize: '12px',
                      fontWeight: 600,
                      mb: 1,
                    }}
                  >
                    📝 Final SQL Query Executed:
                  </Typography>
                  <Box
                    sx={{
                      backgroundColor: '#1A1A1A',
                      border: `2px solid ${'primary.main'}`,
                      borderRadius: '6px',
                      p: 2,
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      color: 'primary.main',
                      overflowX: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {sqlQuery}
                  </Box>
                </Box>
              </>
            )}
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};
