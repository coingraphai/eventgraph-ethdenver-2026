/**
 * Transaction Monitor Hook
 * Polls backend for transaction status updates
 */
import { useState, useEffect, useCallback } from 'react';

interface Transaction {
  id: number;
  transaction_hash: string;
  status: 'pending' | 'confirmed' | 'failed';
  transaction_type: string;
  from_address?: string;
  to_address?: string;
  amount?: string;
  token_symbol?: string;
  from_token?: string;
  to_token?: string;
  from_amount?: string;
  to_amount?: string;
  network: string;
  block_number?: number;
  confirmation_count?: number;
  error_message?: string;
  created_at: string;
  confirmed_at?: string;
}

interface UseTransactionMonitorOptions {
  transactionHash?: string;
  autoRefresh?: boolean;
  refreshInterval?: number; // milliseconds
  onStatusChange?: (transaction: Transaction) => void;
}

export const useTransactionMonitor = ({
  transactionHash,
  autoRefresh = true,
  refreshInterval = 5000, // 5 seconds
  onStatusChange,
}: UseTransactionMonitorOptions = {}) => {
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTransaction = useCallback(async () => {
    if (!transactionHash) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `/api/agent/transactions/${transactionHash}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch transaction');
      }

      const data = await response.json();

      if (data.success && data.transaction) {
        const newTransaction = data.transaction;
        
        // Check if status changed
        if (transaction && transaction.status !== newTransaction.status) {
          onStatusChange?.(newTransaction);
        }
        
        setTransaction(newTransaction);
      } else {
        throw new Error('Transaction not found');
      }
    } catch (err) {
      console.error('Error fetching transaction:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [transactionHash, transaction, onStatusChange]);

  // Initial fetch
  useEffect(() => {
    if (transactionHash) {
      fetchTransaction();
    }
  }, [transactionHash]); // Only on hash change

  // Auto-refresh for pending transactions
  useEffect(() => {
    if (!autoRefresh || !transactionHash || !transaction) return;

    // Only poll if transaction is still pending
    if (transaction.status !== 'pending') return;

    const intervalId = setInterval(() => {
      fetchTransaction();
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [autoRefresh, transactionHash, transaction, refreshInterval, fetchTransaction]);

  const refresh = useCallback(() => {
    fetchTransaction();
  }, [fetchTransaction]);

  return {
    transaction,
    isLoading,
    error,
    refresh,
    isPending: transaction?.status === 'pending',
    isConfirmed: transaction?.status === 'confirmed',
    isFailed: transaction?.status === 'failed',
  };
};

/**
 * Hook to fetch recent transactions
 */
export const useRecentTransactions = (limit: number = 10, sessionId?: string) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        limit: limit.toString(),
        ...(sessionId && { session_id: sessionId }),
      });

      const response = await fetch(
        `/api/agent/transactions?${params}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }

      const data = await response.json();

      if (data.success && data.transactions) {
        setTransactions(data.transactions);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [limit, sessionId]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return {
    transactions,
    isLoading,
    error,
    refresh: fetchTransactions,
  };
};

/**
 * Get block explorer URL for transaction
 */
export const getBlockExplorerUrl = (
  transactionHash: string,
  network: string = 'base-sepolia'
): string => {
  const explorers: Record<string, string> = {
    'base-sepolia': 'https://sepolia.basescan.org',
    'base-mainnet': 'https://basescan.org',
    'ethereum': 'https://etherscan.io',
    'polygon': 'https://polygonscan.com',
  };

  const baseUrl = explorers[network] || explorers['base-sepolia'];
  return `${baseUrl}/tx/${transactionHash}`;
};

/**
 * Format transaction status for display
 */
export const getTransactionStatusLabel = (
  status: string
): { label: string; color: string } => {
  switch (status) {
    case 'pending':
      return { label: 'Pending', color: '#FF9800' };
    case 'confirmed':
      return { label: 'Confirmed', color: '#4CAF50' };
    case 'failed':
      return { label: 'Failed', color: '#F44336' };
    default:
      return { label: 'Unknown', color: '#9E9E9E' };
  }
};
