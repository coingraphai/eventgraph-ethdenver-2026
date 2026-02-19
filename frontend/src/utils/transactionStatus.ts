/**
 * Transaction Status Checker
 * Polls transaction status from blockchain explorer or RPC
 */

export interface TransactionStatus {
  hash: string;
  status: 'pending' | 'success' | 'failed';
  blockNumber?: number;
  gasUsed?: string;
  confirmations?: number;
  timestamp?: number;
}

const POLL_INTERVAL = 3000; // 3 seconds
const MAX_POLLS = 40; // 40 polls = 2 minutes max

/**
 * Check transaction status using Web3 RPC
 * @param hash Transaction hash
 * @param rpcUrl RPC endpoint
 * @returns Transaction status
 */
async function checkTransactionWithRPC(hash: string, rpcUrl: string): Promise<TransactionStatus | null> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionReceipt',
        params: [hash],
      }),
    });

    const data = await response.json();
    const receipt = data.result;

    if (!receipt) {
      return { hash, status: 'pending' };
    }

    const status = receipt.status === '0x1' ? 'success' : 'failed';
    
    return {
      hash,
      status,
      blockNumber: parseInt(receipt.blockNumber, 16),
      gasUsed: parseInt(receipt.gasUsed, 16).toString(),
    };
  } catch (error) {
    console.error('RPC check failed:', error);
    return null;
  }
}

/**
 * Poll transaction status until confirmed or timeout
 * @param hash Transaction hash
 * @param network Network ID ('ethereum', 'base', 'sepolia')
 * @param onUpdate Callback for status updates
 * @returns Final transaction status
 */
export async function pollTransactionStatus(
  hash: string,
  network: string,
  onUpdate?: (status: TransactionStatus) => void
): Promise<TransactionStatus> {
  // Network RPC URLs
  const rpcUrls: Record<string, string> = {
    ethereum: 'https://eth.llamarpc.com',
    base: 'https://mainnet.base.org',
    sepolia: 'https://sepolia.base.org',
  };

  const rpcUrl = rpcUrls[network] || rpcUrls.ethereum;

  let polls = 0;

  while (polls < MAX_POLLS) {
    const status = await checkTransactionWithRPC(hash, rpcUrl);

    if (status) {
      onUpdate?.(status);

      if (status.status !== 'pending') {
        return status;
      }
    }

    polls++;
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }

  // Timeout - still pending
  return { hash, status: 'pending' };
}

/**
 * Get explorer URL for transaction
 * @param hash Transaction hash
 * @param network Network ID
 * @returns Explorer URL
 */
export function getExplorerUrl(hash: string, network: string): string {
  const explorers: Record<string, string> = {
    ethereum: 'etherscan.io',
    base: 'basescan.org',
    sepolia: 'sepolia.basescan.org',
  };

  const explorer = explorers[network] || explorers.ethereum;
  return `https://${explorer}/tx/${hash}`;
}

/**
 * Get explorer name for network
 * @param network Network ID
 * @returns Explorer name
 */
export function getExplorerName(network: string): string {
  const names: Record<string, string> = {
    ethereum: 'Etherscan',
    base: 'Basescan',
    sepolia: 'Basescan (Sepolia)',
  };

  return names[network] || 'Etherscan';
}
