import { createConfig, http } from 'wagmi';
import { mainnet, polygon, arbitrum, optimism, base, bsc, gnosis, avalanche, fantom } from 'wagmi/chains';
import { injected, coinbaseWallet } from 'wagmi/connectors';

// App name for wallet connections
const appName = 'EventGraph AI';

// Configure supported chains - All networks supported by Coinbase AgentKit
export const chains = [mainnet, polygon, arbitrum, optimism, base, bsc, gnosis, avalanche, fantom] as const;

/**
 * Supported Wallets (Browser Extensions Only):
 * 
 * 🦊 MetaMask - Browser extension (injected)
 * 💙 Coinbase Wallet - Dedicated connector
 * ⚫ OKX Wallet - Browser extension (injected)
 * 📱 Injected - Any other injected wallet (Trust, Binance, etc.)
 * 
 * DISABLED FOR NOW (uncomment for future use):
 * 👻 Phantom - Browser extension (EVM mode)
 */

// Create wagmi config with custom connectors
export const config = createConfig({
  chains,
  connectors: [
    injected({
      target: 'metaMask',
    }),
    coinbaseWallet({
      appName,
    }),
    injected({
      target() {
        return {
          id: 'injected',
          name: 'Browser Wallet',
          provider: (window as any)?.ethereum,
        };
      },
    }),
  ],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [base.id]: http(),
    [bsc.id]: http(),
    [gnosis.id]: http(),
    [avalanche.id]: http(),
    [fantom.id]: http(),
  },
});

/**
 * Wallet Detection Helpers
 * Detect specific wallet providers in browser
 */
export const detectWalletProvider = () => {
  const providers = {
    metamask: !!(window as any)?.ethereum?.isMetaMask,
    coinbase: !!(window as any)?.ethereum?.isCoinbaseWallet,
    trust: !!(window as any)?.ethereum?.isTrust,
    binance: !!(window as any)?.BinanceChain,
    okx: !!(window as any)?.okxwallet,
    // DISABLED: Phantom wallet detection (uncomment for future use)
    // phantom: !!(window as any)?.phantom?.ethereum,
  };
  
  return providers;
};

/**
 * Get human-readable wallet name from provider
 */
export const getWalletName = (provider: any): string => {
  if (!provider) return 'Unknown Wallet';
  
  // Check various wallet identifiers
  if (provider.isMetaMask) return 'MetaMask';
  if (provider.isCoinbaseWallet) return 'Coinbase Wallet';
  if (provider.isTrust) return 'Trust Wallet';
  if (provider.isOkxWallet) return 'OKX Wallet';
  if ((window as any)?.BinanceChain) return 'Binance Wallet';
  // DISABLED: Phantom wallet detection (uncomment for future use)
  // if ((window as any)?.phantom?.ethereum) return 'Phantom';
  
  return 'Browser Wallet';
};
