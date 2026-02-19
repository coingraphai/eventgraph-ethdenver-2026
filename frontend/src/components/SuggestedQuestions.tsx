import React from 'react';
import { Box, Typography, Stack } from '@mui/material';
import { LightbulbOutlined } from '@mui/icons-material';
// import { colors } from '../theme/theme';

interface SuggestedQuestion {
  id: string;
  text: string;
  icon?: string;
}

interface SuggestedQuestionsProps {
  visible?: boolean;
  onQuestionClick?: (questionId: string) => void;
  onViewAll?: () => void;
}

export const SuggestedQuestions: React.FC<SuggestedQuestionsProps> = ({
  visible = true,
  onQuestionClick,
  onViewAll,
}) => {
  const suggestedQuestions: SuggestedQuestion[] = [
    {
      id: '1',
      text: 'What day of the week shows highest volume across all DEXs—optimize your trading?',
      icon: '📊',
    },
    {
      id: '2',
      text: 'Track developer activity spikes only on Solana—undervalued tokens ready for breakout?',
      icon: '💻',
    },
    {
      id: '3',
      text: 'Analyze TVL growth specifically on Ethereum—migration signals for ETH longs?',
      icon: '🔍',
    },
  ];

  if (!visible) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: '40px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: '640px',
        padding: '0 20px',
        zIndex: 1200,
        animation: 'slideUp 0.3s ease-out',
        '@keyframes slideUp': {
          from: {
            opacity: 0,
            transform: 'translateX(-50%) translateY(20px)',
          },
          to: {
            opacity: 1,
            transform: 'translateX(-50%) translateY(0)',
          },
        },
      }}
    >
      <Stack
        spacing={1.5}
        sx={{
          backgroundColor: 'background.paper',
          border: `1px solid ${'divider'}`,
          borderRadius: '24px',
          padding: '20px 24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Question Cards */}
        {suggestedQuestions.map((question) => (
          <Box
            key={question.id}
            onClick={() => onQuestionClick?.(question.id)}
            sx={{
              backgroundColor: 'background.default',
              border: `1px solid ${'divider'}`,
              borderRadius: '16px',
              padding: '14px 18px',
              cursor: 'pointer',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                borderColor: 'primary.main',
                backgroundColor: '#0C0C0C',
                transform: 'translateX(4px)',
              },
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              {/* Icon */}
              <Box
                sx={{
                  fontSize: '14px',
                  lineHeight: '20px',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                {question.icon}
              </Box>

              {/* Question Text */}
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                  fontSize: '13px',
                  lineHeight: '18px',
                  flex: 1,
                }}
              >
                {question.text}
              </Typography>
            </Stack>
          </Box>
        ))}

        {/* View All Button */}
        <Box
          onClick={onViewAll}
          sx={{
            backgroundColor: 'background.default',
            border: `1px solid ${'divider'}`,
            borderRadius: '16px',
            padding: '10px 18px',
            cursor: 'pointer',
            transition: 'all 0.2s ease-in-out',
            textAlign: 'center',
            '&:hover': {
              borderColor: 'primary.main',
              backgroundColor: '#0C0C0C',
            },
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
            <LightbulbOutlined sx={{ fontSize: '16px', color: 'text.secondary' }} />
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              View all (30)
            </Typography>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
};
