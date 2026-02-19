/**
 * X402 Micropayment Protocol Utilities
 * 
 * Handles EIP-3009 transferWithAuthorization for USDC payments
 * when agent workflow credits are exhausted.
 */

import { ethers } from 'ethers';

export interface X402PaymentRequired {
  x402Version: number;
  accepts: X402PaymentScheme[];
  error: string | null;
}

export interface X402PaymentScheme {
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
    name: string;
    version: string;
  };
}

export interface X402PaymentPayload {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  from: string;
  to: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
  v: number;
  r: string;
  s: string;
}

/**
 * EIP-3009 transferWithAuthorization signature for USDC
 */
export async function signEIP3009Authorization(
  provider: ethers.BrowserProvider,
  signer: ethers.Signer,
  paymentScheme: X402PaymentScheme,
  fromAddress: string,
  eip712Name?: string,
  eip712Version?: string,
  tokenAddress?: string
): Promise<X402PaymentPayload> {
  // Payment scheme is already a single scheme object
  const scheme = paymentScheme;
  
  // Parse network (format: eip155:1)
  const chainId = parseInt(scheme.network.split(':')[1]);
  
  // Generate nonce (32 bytes)
  const nonce = ethers.hexlify(ethers.randomBytes(32));
  
  // Set validity period (now to +5 minutes)
  const now = Math.floor(Date.now() / 1000);
  const validAfter = now;
  const validBefore = now + scheme.maxTimeoutSeconds;
  
  // EIP-712 domain for the token (use override params or defaults from scheme)
  const domain = {
    name: eip712Name || scheme.extra.name,
    version: eip712Version || scheme.extra.version,
    chainId: chainId,
    verifyingContract: tokenAddress || scheme.asset,
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
  
  // Values to sign
  const value = {
    from: fromAddress,
    to: scheme.payTo,
    value: scheme.maxAmountRequired,
    validAfter: validAfter,
    validBefore: validBefore,
    nonce: nonce,
  };
  
  // Sign the authorization
  const signature = await signer.signTypedData(domain, types, value);
  
  // Split signature
  const sig = ethers.Signature.from(signature);
  
  return {
    scheme: scheme.scheme,
    network: scheme.network,
    asset: tokenAddress || scheme.asset,
    amount: scheme.maxAmountRequired,
    from: fromAddress,
    to: scheme.payTo,
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    nonce: nonce,
    v: sig.v,
    r: sig.r,
    s: sig.s,
  };
}

/**
 * Format USDC amount for display (6 decimals)
 */
export function formatUSDCAmount(atomicAmount: string): string {
  const amount = parseFloat(atomicAmount) / 1e6;
  return amount.toFixed(2);
}

/**
 * Parse chain ID from network string (e.g., "eip155:1" -> 1)
 */
export function parseChainId(network: string): number {
  if (!network) {
    console.error('[x402] parseChainId: network is undefined');
    return 1; // Default to Ethereum mainnet
  }
  const parts = network.split(':');
  if (parts.length !== 2) {
    console.error('[x402] parseChainId: invalid network format:', network);
    return 1;
  }
  return parseInt(parts[1]);
}

/**
 * Get network name from chain ID
 */
export function getNetworkName(chainId: number): string {
  const networks: Record<number, string> = {
    1: 'Ethereum Mainnet',
    8453: 'Base',
    84532: 'Base Sepolia',
    137: 'Polygon',
  };
  return networks[chainId] || `Chain ${chainId}`;
}
