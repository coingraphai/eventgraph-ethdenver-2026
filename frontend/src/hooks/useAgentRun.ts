// useAgentRun.ts - Hook for running agents with payment check
import { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';

interface AgentRunOptions {
  agentId: string;
  agentName: string;
  params: any;
  userTier?: string;
}

interface AgentRunResult {
  success: boolean;
  data?: any;
  error?: string;
  runId?: string;
}

interface UseAgentRunReturn {
  runAgent: (options: AgentRunOptions) => Promise<AgentRunResult>;
  isRunning: boolean;
  needsPayment: boolean;
  showPaymentModal: boolean;
  closePaymentModal: () => void;
  currentBalance: number;
  requiredAmount: number;
}

export function useAgentRun(): UseAgentRunReturn {
  const { address, isConnected } = useAccount();
  const [isRunning, setIsRunning] = useState(false);
  const [needsPayment, setNeedsPayment] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [requiredAmount] = useState(0.25); // $0.25 per run
  const [pendingRun, setPendingRun] = useState<AgentRunOptions | null>(null);

  const checkBalance = async (userTier: string = 'basic'): Promise<boolean> => {
    if (!address) return false;

    try {
      const response = await fetch('/api/payments/check-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: address,
          user_tier: userTier,
        }),
      });

      const result = await response.json();
      setCurrentBalance(result.balance);

      if (!result.can_run) {
        setNeedsPayment(true);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to check balance:', error);
      return false;
    }
  };

  const executeAgentRun = async (options: AgentRunOptions): Promise<AgentRunResult> => {
    try {
      const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Call your existing agent execution endpoint
      const response = await fetch('/api/agent/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          run_id: runId,
          agent_id: options.agentId,
          agent_name: options.agentName,
          user_id: address,
          params: options.params,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Deduct credits from wallet
        await fetch('/api/payments/deduct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: address,
            amount: requiredAmount,
            run_id: runId,
            agent_id: options.agentId,
            agent_name: options.agentName,
          }),
        });

        return {
          success: true,
          data: result.data,
          runId,
        };
      } else {
        return {
          success: false,
          error: result.error || 'Agent execution failed',
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to execute agent',
      };
    }
  };

  const runAgent = useCallback(
    async (options: AgentRunOptions): Promise<AgentRunResult> => {
      if (!isConnected || !address) {
        return {
          success: false,
          error: 'Please connect your wallet first',
        };
      }

      setIsRunning(true);
      setNeedsPayment(false);

      try {
        // Check if user has sufficient balance
        const hasBalance = await checkBalance(options.userTier || 'basic');

        if (!hasBalance) {
          // Show payment modal
          setPendingRun(options);
          setShowPaymentModal(true);
          setIsRunning(false);
          
          return {
            success: false,
            error: 'insufficient_credits',
          };
        }

        // Execute agent
        const result = await executeAgentRun(options);
        return result;
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Agent run failed',
        };
      } finally {
        setIsRunning(false);
      }
    },
    [isConnected, address]
  );

  const handlePaymentSuccess = async () => {
    setShowPaymentModal(false);
    setNeedsPayment(false);

    // Auto-run the pending agent after payment
    if (pendingRun) {
      setIsRunning(true);
      const result = await executeAgentRun(pendingRun);
      setPendingRun(null);
      setIsRunning(false);
      return result;
    }
  };

  const closePaymentModal = () => {
    setShowPaymentModal(false);
    setPendingRun(null);
  };

  return {
    runAgent,
    isRunning,
    needsPayment,
    showPaymentModal,
    closePaymentModal,
    currentBalance,
    requiredAmount,
  };
}
