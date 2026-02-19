/**
 * X402 Payment Client for Agent Runs
 * 
 * Implements EIP-3009 transferWithAuthorization for pay-per-use agent execution
 */

import { ethers } from 'ethers';

// EIP-3009 USDC Contract ABI
const EIP3009_ABI = [
  // Read functions
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
  
  // EIP-3009 transferWithAuthorization
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
  
  // Domain separator for EIP-712
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
];

// Network configurations
const NETWORK_CONFIG = {
  base: {
    chainId: 8453,
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    blockExplorer: 'https://basescan.org',
  },
  polygon: {
    chainId: 137,
    name: 'Polygon',
    rpcUrl: 'https://polygon-rpc.com',
    usdcAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    blockExplorer: 'https://polygonscan.com',
  },
  ethereum: {
    chainId: 1,
    name: 'Ethereum',
    rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/',
    usdcAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    blockExplorer: 'https://etherscan.io',
  },
};

export interface X402PaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: {
    nonce: string;
    validAfter: number;
    validBefore: number;
    chain_id: number;
    agent_id: string;
    user_address: string;
    amount_usd: number;
  };
}

export interface X402Authorization {
  from: string;
  to: string;
  value: string;
  validAfter: number;
  validBefore: number;
  nonce: string;
  v: number;
  r: string;
  s: string;
}

/**
 * X402 Payment Client for agent runs
 */
export class X402AgentClient {
  private provider: ethers.BrowserProvider;
  private network: keyof typeof NETWORK_CONFIG;

  constructor(provider: ethers.BrowserProvider, network: keyof typeof NETWORK_CONFIG = 'base') {
    this.provider = provider;
    this.network = network;
  }

  /**
   * Get network configuration
   */
  getNetworkConfig() {
    return NETWORK_CONFIG[this.network];
  }

  /**
   * Check if user's wallet has sufficient USDC balance
   * Uses dedicated RPC to query correct network (not MetaMask's current network)
   */
  async checkBalance(userAddress: string): Promise<{ balance: string; sufficient: boolean; needed: string }> {
    const config = this.getNetworkConfig();
    
    // Use dedicated RPC provider to ensure we're querying the correct network
    // This prevents errors when MetaMask is connected to wrong network
    const rpcProvider = new ethers.JsonRpcProvider(config.rpcUrl);
    const usdcContract = new ethers.Contract(config.usdcAddress, EIP3009_ABI, rpcProvider);
    
    try {
      const balance = await usdcContract.balanceOf(userAddress);
      const balanceUSDC = ethers.formatUnits(balance, 6);
      
      return {
        balance: balanceUSDC,
        sufficient: parseFloat(balanceUSDC) >= 0.20,
        needed: '0.20',
      };
    } catch (error) {
      console.error('[X402] Balance check error:', error);
      // If RPC fails, return insufficient balance
      return {
        balance: '0',
        sufficient: false,
        needed: '0.20',
      };
    }
  }

  /**
   * Create EIP-3009 transferWithAuthorization signature
   * 
   * This allows the platform to execute the transfer on behalf of the user
   * without requiring a separate transaction from the user.
   */
  async createAuthorizationSignature(
    paymentReq: X402PaymentRequirement,
    userAddress: string
  ): Promise<X402Authorization> {
    const config = this.getNetworkConfig();
    
    // Check current network first (before getting signer)
    let network = await this.provider.getNetwork();
    if (Number(network.chainId) !== config.chainId) {
      console.log(`[X402] Current network: ${network.chainId}, Required: ${config.chainId}`);
      console.log(`[X402] Switching to ${config.name} network...`);
      try {
        // Try to switch to the correct network
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${config.chainId.toString(16)}` }],
        });
        
        // CRITICAL: Recreate provider after network switch to avoid stale connection
        console.log('[X402] Recreating provider after network switch...');
        this.provider = new ethers.BrowserProvider(window.ethereum);
        
        // Wait a bit for network to stabilize
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verify network switch was successful
        network = await this.provider.getNetwork();
        console.log(`[X402] Network after switch: ${network.chainId}`);
        
        if (Number(network.chainId) !== config.chainId) {
          throw new Error(`Network switch failed. Expected ${config.chainId}, got ${network.chainId}`);
        }
      } catch (switchError: any) {
        console.error('[X402] Network switch error:', switchError);
        // If network doesn't exist, add it
        if (switchError.code === 4902) {
          console.log(`[X402] Adding ${config.name} network to MetaMask...`);
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${config.chainId.toString(16)}`,
              chainName: config.name,
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: [config.rpcUrl],
              blockExplorerUrls: [config.blockExplorer],
            }],
          });
          
          // Recreate provider after adding network
          this.provider = new ethers.BrowserProvider(window.ethereum);
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          throw new Error(`Failed to switch to ${config.name} network: ${switchError.message}`);
        }
      }
    }
    
    // Now get signer from fresh provider
    const signer = await this.provider.getSigner();

    // Get USDC contract
    const usdcContract = new ethers.Contract(config.usdcAddress, EIP3009_ABI, signer);
    
    // Check if nonce has been used
    const nonceBytes = ethers.keccak256(ethers.toUtf8Bytes(paymentReq.extra.nonce));
    const isUsed = await usdcContract.authorizationState(userAddress, nonceBytes);
    if (isUsed) {
      throw new Error('Payment nonce already used');
    }

    // EIP-712 domain for USDC
    const domain = {
      name: 'USD Coin',
      version: '2',
      chainId: config.chainId,
      verifyingContract: config.usdcAddress,
    };

    // EIP-712 types for transferWithAuthorization
    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    };

    // Message to sign
    const message = {
      from: userAddress,
      to: paymentReq.payTo,
      value: paymentReq.maxAmountRequired,
      validAfter: paymentReq.extra.validAfter,
      validBefore: paymentReq.extra.validBefore,
      nonce: nonceBytes,
    };

    console.log('[X402] Signing authorization:', message);

    // Sign using EIP-712
    const signature = await signer.signTypedData(domain, types, message);
    
    // Split signature into v, r, s
    const sig = ethers.Signature.from(signature);

    const authorization: X402Authorization = {
      from: userAddress,
      to: paymentReq.payTo,
      value: paymentReq.maxAmountRequired,
      validAfter: paymentReq.extra.validAfter,
      validBefore: paymentReq.extra.validBefore,
      nonce: paymentReq.extra.nonce,
      v: sig.v,
      r: sig.r,
      s: sig.s,
    };

    console.log('[X402] Authorization created:', authorization);

    return authorization;
  }

  /**
   * Execute transferWithAuthorization on-chain (for settlement)
   * 
   * This is typically called by the platform's facilitator service,
   * but can also be called by the client for immediate settlement.
   */
  async executeTransferWithAuthorization(
    authorization: X402Authorization
  ): Promise<{ txHash: string; blockNumber: number }> {
    const config = this.getNetworkConfig();
    const signer = await this.provider.getSigner();
    
    const usdcContract = new ethers.Contract(config.usdcAddress, EIP3009_ABI, signer);
    
    // Convert nonce back to bytes32
    const nonceBytes = ethers.keccak256(ethers.toUtf8Bytes(authorization.nonce));
    
    console.log('[X402] Executing transferWithAuthorization on-chain...');
    
    const tx = await usdcContract.transferWithAuthorization(
      authorization.from,
      authorization.to,
      authorization.value,
      authorization.validAfter,
      authorization.validBefore,
      nonceBytes,
      authorization.v,
      authorization.r,
      authorization.s
    );
    
    console.log('[X402] Transaction sent:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('[X402] Transaction confirmed in block:', receipt.blockNumber);
    
    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  }

  /**
   * Full X402 agent run flow
   */
  async runAgentWithX402(
    agentId: string,
    query: string,
    userAddress: string,
    apiBaseUrl: string = ''
  ): Promise<any> {
    console.log('[X402] Starting agent run with X402 payment...');

    // Step 1: Request agent run - Get 402 Payment Required
    console.log('[X402] Step 1: Requesting payment requirements...');
    const paymentReqResponse = await fetch(`${apiBaseUrl}/api/x402/agents/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        query: query,
        user_address: userAddress,
        network: this.network,
        asset: 'usdc',
      }),
    });

    if (paymentReqResponse.status !== 402) {
      throw new Error(`Expected 402 Payment Required, got ${paymentReqResponse.status}`);
    }

    const paymentData = await paymentReqResponse.json();
    console.log('[X402] Payment required:', paymentData);

    const paymentReq = paymentData.payment_required.accepts[0];

    // Step 2: Check balance
    console.log('[X402] Step 2: Checking USDC balance...');
    const balanceCheck = await this.checkBalance(userAddress);
    if (!balanceCheck.sufficient) {
      throw new Error(
        `Insufficient USDC balance. Have: ${balanceCheck.balance}, Need: ${balanceCheck.needed}`
      );
    }

    // Step 3: Create authorization signature
    console.log('[X402] Step 3: Creating EIP-3009 authorization signature...');
    const authorization = await this.createAuthorizationSignature(paymentReq, userAddress);

    // Step 4: Execute agent with authorization
    console.log('[X402] Step 4: Executing agent with payment authorization...');
    const executeResponse = await fetch(`${apiBaseUrl}/api/x402/agents/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        query: query,
        user_address: userAddress,
        transaction_id: paymentData.payment_required.accepts[0].extra.nonce,
        authorization_signature: authorization,
        network: this.network,
      }),
    });

    if (!executeResponse.ok) {
      const error = await executeResponse.json();
      throw new Error(`Agent execution failed: ${error.detail}`);
    }

    const result = await executeResponse.json();
    console.log('[X402] Agent execution complete:', result);

    // Step 5 (Optional): Settle payment on-chain immediately
    // For now, let the backend's facilitator handle settlement
    // Uncomment to enable immediate settlement:
    /*
    console.log('[X402] Step 5: Settling payment on-chain...');
    const settlement = await this.executeTransferWithAuthorization(authorization);
    
    await fetch(`${apiBaseUrl}/api/x402/agents/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction_id: result.transaction_id,
        tx_hash: settlement.txHash,
        block_number: settlement.blockNumber,
      }),
    });
    */

    return result;
  }
}

/**
 * Hook for React components
 */
export function useX402AgentClient(network: keyof typeof NETWORK_CONFIG = 'base') {
  const createClient = async () => {
    if (!window.ethereum) {
      throw new Error('MetaMask not installed');
    }
    
    const provider = new ethers.BrowserProvider(window.ethereum);
    return new X402AgentClient(provider, network);
  };

  return { createClient };
}
