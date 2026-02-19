import { useEffect, useCallback } from 'react';
import { useChatBot } from './useChatBot';
import { useSubscription } from './useSubscription';
import { getUserId } from '../utils/userId';

interface UseChatControllerOptions {
  activeSessionId?: number | null;
  newChatTrigger?: number;
  onSessionCreated?: () => void;
}

/**
 * Unified chat controller that combines chatbot and subscription logic
 * This makes chat functionality reusable across all pages
 */
export const useChatController = ({
  activeSessionId,
  newChatTrigger,
  onSessionCreated,
}: UseChatControllerOptions = {}) => {
  // Chat functionality
  const {
    messages,
    sessionId,
    loading,
    error,
    needsWallet,
    sendMessage: rawSendMessage,
    stopGeneration,
    startNewSession,
    clearNeedsWallet,
  } = useChatBot(getUserId(), activeSessionId || undefined);

  // Subscription management
  const {
    subscriptionStatus,
    paymentConfig,
    showUpgradeModal,
    setShowUpgradeModal,
    showConnectWalletPrompt,
    setShowConnectWalletPrompt,
    checkQuestionLimit,
    incrementQuestionCount,
  } = useSubscription();

  // Show connect wallet prompt when needsWallet is true
  useEffect(() => {
    if (needsWallet) {
      setShowConnectWalletPrompt(true);
    }
  }, [needsWallet, setShowConnectWalletPrompt]);

  // Reset chat when newChatTrigger changes
  useEffect(() => {
    if (newChatTrigger !== undefined && newChatTrigger > 0) {
      startNewSession();
    }
  }, [newChatTrigger, startNewSession]);

  /**
   * Send message with automatic limit checking and question counting
   */
  const sendMessage = useCallback(
    async (
      message: string,
      chartMode: boolean = false,
      deeperResearch: boolean = false
    ) => {
      if (!message.trim()) return;

      // Proactive check: Show modal BEFORE sending if limit would be exceeded
      const canAsk = await checkQuestionLimit(true);
      if (!canAsk) {
        console.log('[ChatController] Proactive limit check: Cannot send question, modal shown');
        return;
      }

      try {
        // Send message to backend
        await rawSendMessage(message, chartMode, deeperResearch);

        // Increment question count locally for immediate UI update
        console.log('[ChatController] Message sent, incrementing question count');
        incrementQuestionCount();

        // Trigger history refresh after first message (new session created)
        if (!sessionId && onSessionCreated) {
          onSessionCreated();
        }
      } catch (err) {
        console.error('[ChatController] Failed to send message:', err);
        throw err;
      }
    },
    [checkQuestionLimit, rawSendMessage, incrementQuestionCount, sessionId, onSessionCreated]
  );

  return {
    // Chat state
    messages,
    sessionId,
    loading,
    error,
    
    // Chat actions
    sendMessage,
    stopGeneration,
    startNewSession,
    clearNeedsWallet,
    
    // Subscription state
    subscriptionStatus,
    paymentConfig,
    showUpgradeModal,
    setShowUpgradeModal,
    showConnectWalletPrompt,
    setShowConnectWalletPrompt,
  };
};
