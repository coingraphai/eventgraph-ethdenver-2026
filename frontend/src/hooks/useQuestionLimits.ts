import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAccount } from 'wagmi';
import { useSessionId } from './useSessionId';

export interface QuestionLimitStatus {
  tier: 'anonymous' | 'free_tier' | 'premium' | 'unknown';
  can_ask: boolean;
  questions_used: number;
  questions_remaining: number;
  limit: number;
  is_premium: boolean;
  needs_wallet: boolean;
  needs_upgrade: boolean;
  premium_expires_at?: string;
  error?: string;
}

/**
 * Hook to manage question limits for anonymous, free tier, and premium users
 */
export const useQuestionLimits = () => {
  const { address } = useAccount();
  const sessionId = useSessionId();
  const [status, setStatus] = useState<QuestionLimitStatus | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * Fetch current question limit status from backend
   */
  const fetchStatus = useCallback(async () => {
    if (!sessionId && !address) {
      // No identifier yet
      return;
    }

    setLoading(true);
    try {
      const params: any = {};
      if (address) {
        params.wallet_address = address;
      } else if (sessionId) {
        params.session_id = sessionId;
      }

      const response = await axios.get('/api/payment/subscription-status', { params });
      setStatus(response.data);
      console.log('Question limit status:', response.data);
    } catch (error: any) {
      console.error('Failed to fetch question limits:', error);
      setStatus({
        tier: 'unknown',
        can_ask: false,
        questions_used: 0,
        questions_remaining: 0,
        limit: 0,
        is_premium: false,
        needs_wallet: true,
        needs_upgrade: false,
        error: error.response?.data?.detail || 'Failed to check limits'
      });
    } finally {
      setLoading(false);
    }
  }, [address, sessionId]);

  /**
   * Refresh status when wallet or session changes
   */
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  /**
   * Check if user can ask a question before submitting
   */
  const canAskQuestion = useCallback((): boolean => {
    if (!status) return false;
    return status.can_ask;
  }, [status]);

  /**
   * Get user-friendly status message
   */
  const getStatusMessage = useCallback((): string => {
    if (!status) return 'Checking limits...';

    if (status.is_premium) {
      return 'Premium - Unlimited Questions';
    }

    if (status.tier === 'anonymous') {
      if (status.questions_remaining > 0) {
        return `${status.questions_remaining} of ${status.limit} free questions remaining`;
      }
      return 'Connect your wallet for more questions';
    }

    if (status.tier === 'free_tier') {
      if (status.questions_remaining > 0) {
        return `${status.questions_remaining} of ${status.limit} questions remaining today`;
      }
      return 'Upgrade to Premium for unlimited questions';
    }

    return 'Loading...';
  }, [status]);

  /**
   * Get severity level for status display
   */
  const getStatusSeverity = useCallback((): 'success' | 'info' | 'warning' | 'error' => {
    if (!status) return 'info';

    if (status.is_premium) return 'success';
    if (!status.can_ask) return 'error';
    if (status.questions_remaining <= 1) return 'warning';
    return 'info';
  }, [status]);

  return {
    status,
    loading,
    canAskQuestion,
    getStatusMessage,
    getStatusSeverity,
    refreshStatus: fetchStatus
  };
};
