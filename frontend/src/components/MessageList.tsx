import React from 'react';
import { Box, Stack, CircularProgress, Typography, Alert } from '@mui/material';
import MarkdownRenderer from './MarkdownRenderer';
import { ThoughtProcess } from './ThoughtProcess';
import InteractiveChart from './InteractiveChart';
import { Message } from '../services/chatApi';

interface MessageListProps {
  messages: Message[];
  loading?: boolean;
  error: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

/**
 * Reusable message list component that renders chat messages
 * Handles user messages, AI responses, thought process, and charts
 */
export const MessageList: React.FC<MessageListProps> = ({
  messages,
  loading = false,
  error,
  messagesEndRef,
}) => {
  if (messages.length === 0) {
    return null;
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Stack spacing={4}>
        {messages.map((msg, index) => (
          <Box
            key={index}
            sx={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 2,
              width: '100%',
            }}
          >
            {/* Avatar */}
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                backgroundColor: msg.role === 'user' ? 'primary.main' : 'background.paper',
                border: 1,
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Typography
                sx={{
                  color: msg.role === 'user' ? 'background.default' : 'primary.main',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                {msg.role === 'user' ? 'Y' : 'AI'}
              </Typography>
            </Box>

            {/* Message Content */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  fontSize: '12px',
                  fontWeight: 500,
                  mb: 1,
                  display: 'block',
                }}
              >
                {msg.role === 'user' ? 'You' : 'EventGraph AI'}
              </Typography>

              {/* Render AI messages with markdown, user messages as plain text */}
              {msg.role === 'assistant' ? (
                msg.content ? (
                  <MarkdownRenderer content={msg.content} />
                ) : loading ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={16} sx={{ color: 'primary.main' }} />
                    <Typography sx={{ color: 'text.secondary', fontSize: '14px' }}>
                      Thinking...
                    </Typography>
                  </Box>
                ) : null
              ) : (
                <Typography
                  sx={{
                    color: 'text.primary',
                    fontSize: '15px',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                  }}
                >
                  {msg.content}
                </Typography>
              )}

              {/* Chain of Thought - Show reasoning process for AI responses */}
              {msg.role === 'assistant' &&
                msg.thoughtProcess &&
                msg.thoughtProcess.length > 0 && (
                  <ThoughtProcess steps={msg.thoughtProcess} sqlQuery={msg.sqlQuery} />
                )}

              {/* Interactive Chart Display - Show Plotly chart if available */}
              {msg.chartData && <InteractiveChart chartData={msg.chartData} />}

              {/* Legacy Chart Display - Show static chart image if available */}
              {msg.chartUrl && !msg.chartData && (
                <Box
                  sx={{
                    mt: 2,
                    p: 2,
                    backgroundColor: 'background.paper',
                    borderRadius: '12px',
                    border: 1,
                    borderColor: 'divider',
                  }}
                >
                  <img
                    src={msg.chartUrl}
                    alt="Chart visualization"
                    style={{
                      width: '100%',
                      maxWidth: '800px',
                      height: 'auto',
                      display: 'block',
                      borderRadius: '8px',
                    }}
                  />
                </Box>
              )}
            </Box>
          </Box>
        ))}
      </Stack>

      {/* Error Display */}
      {error && (
        <Alert
          severity="error"
          onClose={() => {}}
          sx={{
            width: '100%',
            mt: 3,
            backgroundColor: 'rgba(244, 67, 54, 0.1)',
            border: '1px solid #f44336',
            borderRadius: '12px',
            '& .MuiAlert-icon': {
              color: '#f44336',
            },
          }}
        >
          {error}
        </Alert>
      )}

      {/* Scroll anchor */}
      <div ref={messagesEndRef} />
    </Box>
  );
};
