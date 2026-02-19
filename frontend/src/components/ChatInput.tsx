import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  IconButton,
  InputBase,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material';
import {
  ArrowUpward as SendIcon,
  Stop as StopIcon,
} from '@mui/icons-material';

interface ChatInputProps {
  onSubmit: (message: string, files?: File[], mode?: 'normal' | 'deeper_research', chartMode?: boolean) => void;
  onStop?: () => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSubmit,
  onStop,
  disabled = false,
  loading = false,
  placeholder = 'Ask about prediction markets...',
  value: externalValue,
  onChange: externalOnChange,
}) => {
  const theme = useTheme();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [internalMessage, setInternalMessage] = useState('');
  const isDark = theme.palette.mode === 'dark';

  const message = externalValue !== undefined ? externalValue : internalMessage;
  const setMessage = externalOnChange !== undefined ? externalOnChange : setInternalMessage;

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (loading || disabled || !message.trim()) return;
    onSubmit(message.trim(), [], 'normal', false);
    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (loading) return;
    // Ignore Enter during IME composition (e.g., CJK input)
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hasContent = message.trim().length > 0;

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: '800px',
        margin: '0 auto',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 1,
          backgroundColor: isDark
            ? alpha(theme.palette.background.paper, 0.6)
            : alpha('#f8f9fa', 0.95),
          backdropFilter: 'blur(20px)',
          borderRadius: '20px',
          border: `1px solid ${alpha(theme.palette.divider, isDark ? 0.15 : 0.2)}`,
          padding: '8px 8px 8px 20px',
          transition: 'all 0.2s ease',
          boxShadow: isDark
            ? `0 4px 24px ${alpha('#000', 0.3)}`
            : `0 4px 24px ${alpha('#000', 0.06)}`,
          '&:focus-within': {
            borderColor: alpha(theme.palette.primary.main, 0.4),
            boxShadow: isDark
              ? `0 4px 24px ${alpha('#000', 0.3)}, 0 0 0 2px ${alpha(theme.palette.primary.main, 0.1)}`
              : `0 4px 24px ${alpha('#000', 0.06)}, 0 0 0 2px ${alpha(theme.palette.primary.main, 0.08)}`,
          },
        }}
      >
        <InputBase
          inputRef={inputRef}
          multiline
          maxRows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={loading ? 'Generating response...' : placeholder}
          disabled={disabled || loading}
          sx={{
            flex: 1,
            fontSize: '15px',
            lineHeight: 1.5,
            py: 0.75,
            color: 'text.primary',
            '& textarea::placeholder': {
              color: 'text.secondary',
              opacity: 0.6,
            },
          }}
        />

        {/* Send / Stop Button */}
        {loading ? (
          <Tooltip title="Stop generating" placement="top">
            <IconButton
              onClick={onStop}
              sx={{
                width: 36,
                height: 36,
                backgroundColor: isDark ? alpha('#fff', 0.1) : alpha('#000', 0.08),
                color: 'text.primary',
                borderRadius: '12px',
                transition: 'all 0.15s ease',
                '&:hover': {
                  backgroundColor: isDark ? alpha('#fff', 0.15) : alpha('#000', 0.12),
                },
              }}
            >
              <StopIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        ) : (
          <IconButton
            onClick={handleSubmit}
            disabled={disabled || !hasContent}
            sx={{
              width: 36,
              height: 36,
              backgroundColor: hasContent
                ? theme.palette.primary.main
                : isDark ? alpha('#fff', 0.06) : alpha('#000', 0.05),
              color: hasContent
                ? (isDark ? '#000' : '#fff')
                : 'text.disabled',
              borderRadius: '12px',
              transition: 'all 0.15s ease',
              '&:hover': {
                backgroundColor: hasContent
                  ? theme.palette.primary.dark
                  : isDark ? alpha('#fff', 0.08) : alpha('#000', 0.08),
              },
              '&.Mui-disabled': {
                backgroundColor: isDark ? alpha('#fff', 0.04) : alpha('#000', 0.03),
                color: 'text.disabled',
              },
            }}
          >
            <SendIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}
      </Box>
    </Box>
  );
};
