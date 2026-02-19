import React from 'react';
import { Box, Card, CardContent, Typography, Stack } from '@mui/material';

export interface SuggestionCategory {
  title: string;
  icon: string;
  questions: string[];
}

interface SuggestionCardsProps {
  categories: SuggestionCategory[];
  onQuestionClick: (question: string) => void;
}

/**
 * Reusable suggestion cards component
 * Displays categorized question suggestions with icons
 */
export const SuggestionCards: React.FC<SuggestionCardsProps> = ({
  categories,
  onQuestionClick,
}) => {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 3,
        width: '100%',
        mt: 2,
      }}
    >
      {categories.map((category, categoryIndex) => (
        <Card
          key={categoryIndex}
          sx={{
            backgroundColor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            borderRadius: '16px',
            transition: 'all 0.2s ease',
            '&:hover': {
              borderColor: 'primary.main',
              boxShadow: `0 0 20px rgba(187, 217, 119, 0.1)`,
            },
          }}
        >
          <CardContent sx={{ p: 3 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" mb={2}>
              <Typography sx={{ fontSize: '24px' }}>{category.icon}</Typography>
              <Typography
                variant="h6"
                sx={{
                  color: 'text.primary',
                  fontSize: '16px',
                  fontWeight: 600,
                }}
              >
                {category.title}
              </Typography>
            </Stack>

            <Stack spacing={1.5}>
              {category.questions.map((question, qIndex) => (
                <Box
                  key={qIndex}
                  onClick={() => onQuestionClick(question)}
                  sx={{
                    p: 1.5,
                    backgroundColor: 'background.default',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      backgroundColor: 'rgba(187, 217, 119, 0.1)',
                      transform: 'translateX(4px)',
                    },
                  }}
                >
                  <Typography
                    sx={{
                      color: 'text.secondary',
                      fontSize: '14px',
                      lineHeight: 1.5,
                    }}
                  >
                    {question}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
};
