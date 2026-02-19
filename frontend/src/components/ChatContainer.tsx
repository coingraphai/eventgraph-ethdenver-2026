import React, { useRef, useEffect, ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { UpgradeModal } from './UpgradeModal';
import { ConnectWalletPrompt } from './ConnectWalletPrompt';
import { useChatController } from '../hooks/useChatController';

interface ChatContainerProps {
  /** Session management */
  activeSessionId?: number | null;
  newChatTrigger?: number;
  onSessionCreated?: () => void;

  /** Welcome screen content (shown when no messages) */
  welcomeContent?: ReactNode;

  /** Input state management for question selection */
  inputValue?: string;
  onInputChange?: (value: string) => void;
}

/**
 * Unified chat container component
 * Handles all chat functionality: messages, input, modals, subscription checks
 * Reusable across Dashboard and all category pages
 */
export const ChatContainer: React.FC<ChatContainerProps> = ({
  activeSessionId,
  newChatTrigger,
  onSessionCreated,
  welcomeContent,
  inputValue = '',
  onInputChange,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Use unified chat controller
  const {
    messages,
    loading,
    error,
    sendMessage,
    stopGeneration,
    subscriptionStatus,
    paymentConfig,
    showUpgradeModal,
    setShowUpgradeModal,
    showConnectWalletPrompt,
    setShowConnectWalletPrompt,
  } = useChatController({
    activeSessionId,
    newChatTrigger,
    onSessionCreated,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Handle message submission
  const handleSendMessage = async (
    message: string,
    _files?: File[],
    mode?: string,
    chartMode?: boolean
  ) => {
    if (!message.trim()) return;

    try {
      const deeperResearch = mode === 'deeper_research';
      await sendMessage(message, chartMode, deeperResearch);

      // Clear input after sending
      if (onInputChange) {
        onInputChange('');
      }
    } catch (err) {
      console.error('[ChatContainer] Failed to send message:', err);
    }
  };

  return (
    <>
      {/* Main Content Area */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          width: '100%',
        }}
      >
        <Box
          sx={{
            maxWidth: '1100px',
            margin: '0 auto',
            padding: messages.length > 0 ? '16px 24px 100px' : '32px 24px 100px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minHeight: messages.length > 0 ? 'auto' : '100%',
            height: messages.length > 0 ? 'auto' : '100%',
            justifyContent: messages.length > 0 ? 'flex-start' : 'center',
          }}
        >
          {/* Initial State - Show welcome content when no messages */}
          {messages.length === 0 && welcomeContent}

          {/* Chat Messages - Show when conversation started */}
          <MessageList
            messages={messages}
            loading={loading}
            error={error}
            messagesEndRef={messagesEndRef}
          />

          {/* Footer */}
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              fontSize: '12px',
              mt: 6,
              textAlign: 'center',
            }}
          >
            EventGraph AI can make mistakes. Verify important information.
          </Typography>
        </Box>
      </Box>

      {/* Fixed Input Bar */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'background.default',
          padding: '12px 24px 16px',
          zIndex: 10,
        }}
      >
        <Box sx={{ maxWidth: '1100px', margin: '0 auto' }}>
          <ChatInput
            onSubmit={handleSendMessage}
            onStop={stopGeneration}
            loading={loading}
            value={inputValue}
            onChange={onInputChange}
          />
        </Box>
      </Box>

      {/* Upgrade Modal */}
      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        questionsUsed={subscriptionStatus?.questions_used || 0}
        questionsLimit={
          subscriptionStatus?.limit || paymentConfig?.free_question_limit || 5
        }
      />

      {/* Connect Wallet Prompt */}
      <ConnectWalletPrompt
        open={showConnectWalletPrompt}
        onClose={() => setShowConnectWalletPrompt(false)}
        onConnectWallet={() => {
          setShowConnectWalletPrompt(false);
          // Wallet modal will be opened by the user clicking connect button
        }}
        anonymousLimit={paymentConfig?.anonymous_question_limit || 3}
      />
    </>
  );
};
