/**
 * useMetaMaskBot Hook
 * Manages MetaMask AI assistant chat state and interactions
 */
import { useState, useCallback, useEffect } from 'react';
import { metamaskApi } from '../services/metamaskApi';
import { useAccount, useBalance, useChainId, usePublicClient } from 'wagmi';
import { formatEther, parseEther } from 'viem';

export interface MetaMaskMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
  tool_results?: Array<{
    name: string;
    result: any;
  }>;
}

export interface UseMetaMaskBotReturn {
  messages: MetaMaskMessage[];
  sessionId: number | null;
  loading: boolean;
  error: string | null;
  sendMessage: (message: string, walletAddress?: string, chainId?: number) => Promise<void>;
  startNewSession: () => void;
}

export const useMetaMaskBot = (
  userId: string,
  initialSessionId?: number
): UseMetaMaskBotReturn => {
  const [messages, setMessages] = useState<MetaMaskMessage[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(initialSessionId || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wallet hooks
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: balance } = useBalance({ address });
  const publicClient = usePublicClient();

  // Execute tool calls automatically
  const executeToolCalls = useCallback(async (
    toolCalls: Array<{ name: string; arguments: any }>, 
    sessionIdToUse: number
  ) => {
    const results: Array<{ name: string; result: any }> = [];
    
    // Tools that can be executed on frontend with wagmi/viem
    const frontendTools = ['get_account', 'get_balance', 'estimate_gas', 'get_token_balance'];
    
    // Tools that need backend execution
    const backendTools = ['verify_message', 'get_chain_info', 'get_ens_address', 'get_gas_price', 
                         'get_block_number', 'get_transaction_receipt'];
    
    for (const tool of toolCalls) {
      try {
        let result;
        
        if (frontendTools.includes(tool.name)) {
          // Execute on frontend
          switch (tool.name) {
            case 'get_account':
              result = {
                address: address || 'Not connected',
                chainId: chainId,
                isConnected: isConnected,
              };
              break;
              
            case 'get_balance':
              const targetAddress = tool.arguments.address || address;
              result = {
                address: targetAddress,
                balance: balance ? formatEther(balance.value) : '0',
                symbol: balance?.symbol || 'ETH',
                formatted: balance?.formatted || '0',
              };
              break;
              
            case 'estimate_gas':
              if (!publicClient) {
                result = { error: 'Web3 provider not available' };
                break;
              }
              
              try {
                const toAddress = tool.arguments.to as `0x${string}`;
                const value = tool.arguments.value ? parseEther(tool.arguments.value) : 0n;
                
                const gasEstimate = await publicClient.estimateGas({
                  account: address,
                  to: toAddress,
                  value: value,
                  data: tool.arguments.data as `0x${string}` | undefined,
                });
                
                const gasPrice = await publicClient.getGasPrice();
                const estimatedCost = gasEstimate * gasPrice;
                
                result = {
                  success: true,
                  gasLimit: gasEstimate.toString(),
                  gasPrice: formatEther(gasPrice),
                  estimatedCost: formatEther(estimatedCost),
                  estimatedCostETH: `${formatEther(estimatedCost)} ETH`,
                  to: toAddress,
                  value: tool.arguments.value || '0',
                };
              } catch (err: any) {
                result = { 
                  error: `Gas estimation failed: ${err.message || String(err)}`,
                  details: err.shortMessage || err.message
                };
              }
              break;
              
            case 'get_token_balance':
              if (!publicClient) {
                result = { error: 'Web3 provider not available' };
                break;
              }
              
              try {
                const walletAddress = tool.arguments.address as `0x${string}` || address;
                const tokenAddress = tool.arguments.token as `0x${string}`;
                
                if (!tokenAddress) {
                  result = { error: 'Token contract address is required' };
                  break;
                }
                
                // ERC-20 ABI for balanceOf and decimals
                const erc20Abi = [
                  {
                    name: 'balanceOf',
                    type: 'function',
                    stateMutability: 'view',
                    inputs: [{ name: 'account', type: 'address' }],
                    outputs: [{ name: 'balance', type: 'uint256' }],
                  },
                  {
                    name: 'decimals',
                    type: 'function',
                    stateMutability: 'view',
                    inputs: [],
                    outputs: [{ name: '', type: 'uint8' }],
                  },
                  {
                    name: 'symbol',
                    type: 'function',
                    stateMutability: 'view',
                    inputs: [],
                    outputs: [{ name: '', type: 'string' }],
                  },
                ] as const;
                
                // Read token balance
                const [tokenBalance, decimals, symbol] = await Promise.all([
                  publicClient.readContract({
                    address: tokenAddress,
                    abi: erc20Abi,
                    functionName: 'balanceOf',
                    args: [walletAddress],
                  }),
                  publicClient.readContract({
                    address: tokenAddress,
                    abi: erc20Abi,
                    functionName: 'decimals',
                  }).catch(() => 18), // Default to 18 decimals if call fails
                  publicClient.readContract({
                    address: tokenAddress,
                    abi: erc20Abi,
                    functionName: 'symbol',
                  }).catch(() => 'TOKEN'), // Default symbol if call fails
                ]);
                
                // Format balance
                const divisor = 10n ** BigInt(decimals);
                const formattedBalance = Number(tokenBalance) / Number(divisor);
                
                result = {
                  success: true,
                  address: walletAddress,
                  tokenAddress: tokenAddress,
                  balance: tokenBalance.toString(),
                  decimals: decimals,
                  symbol: symbol,
                  formatted: formattedBalance.toFixed(6),
                  formattedWithSymbol: `${formattedBalance.toFixed(6)} ${symbol}`,
                };
              } catch (err: any) {
                result = { 
                  error: `Failed to get token balance: ${err.message || String(err)}`,
                  details: err.shortMessage || err.message
                };
              }
              break;
          }
        } else if (backendTools.includes(tool.name)) {
          // Execute on backend
          try {
            const backendResult = await metamaskApi.executeTool(
              tool.name,
              tool.arguments,
              sessionIdToUse
            );
            result = backendResult.result || backendResult;
          } catch (apiErr: any) {
            result = { 
              error: apiErr.response?.data?.detail || apiErr.message || 'Backend execution failed'
            };
          }
        } else {
          // Tools requiring user interaction (send_transaction, sign_message, etc.)
          result = { 
            info: `Tool ${tool.name} requires wallet interaction. Please use MetaMask to complete this action.`,
            action: 'user_interaction_required'
          };
        }
        
        results.push({ name: tool.name, result });
        
        // Add tool result as a formatted message
        let resultContent = '';
        if (tool.name === 'get_account') {
          resultContent = `**Account Information:**\n- Address: \`${result.address}\`\n- Chain ID: ${result.chainId}\n- Connected: ${result.isConnected ? '✅ Yes' : '❌ No'}`;
        } else if (tool.name === 'get_balance') {
          resultContent = `**Balance Information:**\n- Address: \`${result.address}\`\n- Balance: **${result.formatted} ${result.symbol}**`;
        } else if (tool.name === 'get_token_balance' && result.success) {
          resultContent = `**Token Balance:**\n- Wallet: \`${result.address}\`\n- Token: \`${result.tokenAddress}\`\n- Balance: **${result.formattedWithSymbol}**`;
        } else if (tool.name === 'get_chain_info' && !result.error) {
          resultContent = `**Chain Information:**\n- Name: ${result.name}\n- Symbol: ${result.symbol}\n- Explorer: ${result.explorer}`;
        } else if (tool.name === 'get_ens_address' && result.success) {
          resultContent = `**ENS Resolution:**\n- ENS Name: \`${result.ens_name}\`\n- Address: \`${result.address}\``;
        } else if (tool.name === 'estimate_gas' && result.success) {
          resultContent = `**Gas Estimation:**\n- To: \`${result.to}\`\n- Value: ${result.value} ETH\n- Gas Limit: ${result.gasLimit}\n- Gas Price: ${result.gasPrice} ETH\n- **Estimated Cost: ${result.estimatedCostETH}**`;
        } else if (tool.name === 'get_gas_price' && result.success) {
          resultContent = `**Current Gas Price:**\n- Chain ID: ${result.chainId}\n- Gas Price: **${result.formatted}**\n- In Wei: ${result.gasPrice}\n- In ETH: ${result.gasPriceETH}`;
        } else if (tool.name === 'get_block_number' && result.success) {
          resultContent = `**Latest Block:**\n- Chain ID: ${result.chainId}\n- Block Number: **${result.blockNumber.toLocaleString()}**`;
        } else if (result.error) {
          resultContent = `**Error:** ${result.error}${result.details ? `\n\n*Details: ${result.details}*` : ''}`;
        } else {
          // Default formatting for other tools
          resultContent = `**${tool.name} Result:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``;
        }
        
        const toolResultMessage: MetaMaskMessage = {
          id: `tool-result-${Date.now()}-${tool.name}`,
          role: 'assistant',
          content: resultContent,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, toolResultMessage]);
        
      } catch (err) {
        console.error(`Error executing tool ${tool.name}:`, err);
        results.push({ name: tool.name, result: { error: String(err) } });
        
        // Add error message
        const errorMessage: MetaMaskMessage = {
          id: `tool-error-${Date.now()}-${tool.name}`,
          role: 'system',
          content: `❌ ${tool.name} failed: ${String(err)}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    }
    
    return results;
  }, [address, chainId, balance, isConnected, publicClient]);

  // Load chat history when session ID changes
  useEffect(() => {
    if (initialSessionId && initialSessionId !== sessionId) {
      loadHistory(initialSessionId);
    }
  }, [initialSessionId]);

  const loadHistory = async (sid: number) => {
    try {
      setLoading(true);
      setError(null);

      const history = await metamaskApi.getHistory(sid);
      
      const formattedMessages: MetaMaskMessage[] = history.messages.map((msg, idx) => ({
        id: `${sid}-${idx}`,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp),
      }));

      setMessages(formattedMessages);
      setSessionId(sid);
    } catch (err: any) {
      console.error('Failed to load MetaMask history:', err);
      setError(err.response?.data?.detail || 'Failed to load chat history');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = useCallback(
    async (message: string, walletAddress?: string, chainId?: number) => {
      if (!message.trim()) return;

      try {
        setLoading(true);
        setError(null);

        // Add user message optimistically
        const userMessage: MetaMaskMessage = {
          id: `user-${Date.now()}`,
          role: 'user',
          content: message,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMessage]);

        // Send to backend
        const response = await metamaskApi.sendMessage(
          userId,
          message,
          sessionId || undefined,
          walletAddress,
          chainId
        );

        // Update session ID if this was the first message
        const currentSessionId = response.session_id || sessionId;
        if (!sessionId && response.session_id) {
          setSessionId(response.session_id);
        }

        // Add assistant response
        const assistantMessage: MetaMaskMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.message,
          timestamp: new Date(),
          tool_calls: response.tool_calls,
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // Execute tool calls if any (using the current session ID)
        if (response.tool_calls && response.tool_calls.length > 0 && currentSessionId) {
          await executeToolCalls(response.tool_calls, currentSessionId);
        }

      } catch (err: any) {
        console.error('Failed to send MetaMask message:', err);
        const errorMessage = err.response?.data?.detail || 'Failed to send message';
        setError(errorMessage);

        // Add error message
        const errorMsg: MetaMaskMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `❌ Error: ${errorMessage}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setLoading(false);
      }
    },
    [userId, sessionId, executeToolCalls]
  );

  const startNewSession = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setError(null);
  }, []);

  return {
    messages,
    sessionId,
    loading,
    error,
    sendMessage,
    startNewSession,
  };
};
