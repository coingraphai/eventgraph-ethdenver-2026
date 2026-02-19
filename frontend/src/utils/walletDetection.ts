/**
 * Wallet Detection Utilities
 * Helps diagnose and detect browser wallet extensions
 */

export interface WalletDetectionResult {
  metamask: boolean;
  coinbase: boolean;
  trust: boolean;
  binance: boolean;
  okx: boolean;
  // DISABLED: Phantom wallet (uncomment for future use)
  // phantom: boolean;
  anyInjected: boolean;
  provider: any;
  details: string[];
}

/**
 * Comprehensive wallet detection
 * @returns Detailed information about available wallets
 */
export const detectWallets = (): WalletDetectionResult => {
  const ethereum = (window as any)?.ethereum;
  
  const result: WalletDetectionResult = {
    metamask: false,
    coinbase: false,
    trust: false,
    binance: false,
    okx: false,
    // DISABLED: Phantom wallet (uncomment for future use)
    // phantom: false,
    anyInjected: !!ethereum,
    provider: ethereum,
    details: [],
  };

  if (!ethereum) {
    result.details.push('❌ No ethereum provider found');
    result.details.push('👉 Install a wallet extension (MetaMask, Coinbase, etc.)');
    return result;
  }

  result.details.push('✅ Ethereum provider found');

  // Check MetaMask
  if (ethereum.isMetaMask) {
    result.metamask = true;
    result.details.push('✅ MetaMask detected');
  }

  // Check Coinbase
  if (ethereum.isCoinbaseWallet) {
    result.coinbase = true;
    result.details.push('✅ Coinbase Wallet detected');
  }

  // Check Trust Wallet
  if (ethereum.isTrust) {
    result.trust = true;
    result.details.push('✅ Trust Wallet detected');
  }

  // Check Binance
  if ((window as any).BinanceChain) {
    result.binance = true;
    result.details.push('✅ Binance Wallet detected');
  }

  // Check OKX
  if ((window as any).okxwallet) {
    result.okx = true;
    result.details.push('✅ OKX Wallet detected');
  }

  // DISABLED: Phantom wallet detection (uncomment for future use)
  // if ((window as any).phantom?.ethereum) {
  //   result.phantom = true;
  //   result.details.push('✅ Phantom detected');
  // }

  // If no specific wallet detected but ethereum exists
  if (!result.metamask && !result.coinbase && !result.trust && !result.binance && !result.okx) {
    result.details.push('⚠️ Generic injected wallet detected');
  }

  // Add provider details
  if (ethereum.selectedAddress) {
    result.details.push(`📍 Connected: ${ethereum.selectedAddress.slice(0, 6)}...${ethereum.selectedAddress.slice(-4)}`);
  } else {
    result.details.push('🔌 Not connected yet');
  }

  return result;
};

/**
 * Wait for wallet to be injected (some wallets load async)
 * @param timeout Maximum time to wait in ms
 */
export const waitForWallet = (timeout = 3000): Promise<boolean> => {
  return new Promise((resolve) => {
    // Already available
    if ((window as any)?.ethereum) {
      resolve(true);
      return;
    }

    let elapsed = 0;
    const interval = 100;

    const checkInterval = setInterval(() => {
      elapsed += interval;

      if ((window as any)?.ethereum) {
        clearInterval(checkInterval);
        resolve(true);
        return;
      }

      if (elapsed >= timeout) {
        clearInterval(checkInterval);
        resolve(false);
      }
    }, interval);

    // Also listen for ethereum initialization event
    const handleInit = () => {
      clearInterval(checkInterval);
      resolve(true);
    };

    window.addEventListener('ethereum#initialized', handleInit, { once: true });
  });
};

/**
 * Log wallet detection results to console
 */
export const logWalletDetection = () => {
  console.group('🔍 Wallet Detection Report');
  const result = detectWallets();
  
  console.log('Provider available:', result.anyInjected ? '✅ YES' : '❌ NO');
  console.log('MetaMask:', result.metamask ? '✅ YES' : '❌ NO');
  console.log('Coinbase:', result.coinbase ? '✅ YES' : '❌ NO');
  console.log('Trust:', result.trust ? '✅ YES' : '❌ NO');
  console.log('Binance:', result.binance ? '✅ YES' : '❌ NO');
  console.log('OKX:', result.okx ? '✅ YES' : '❌ NO');
  // DISABLED: Phantom wallet logging (uncomment for future use)
  // console.log('Phantom:', result.phantom ? '✅ YES' : '❌ NO');
  
  console.log('\nDetails:');
  result.details.forEach(detail => console.log(detail));
  
  console.groupEnd();
  
  return result;
};

/**
 * Request account access from wallet
 */
export const requestAccounts = async (): Promise<string[]> => {
  const ethereum = (window as any)?.ethereum;
  
  if (!ethereum) {
    throw new Error('No wallet found. Please install MetaMask or another Web3 wallet.');
  }

  try {
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    console.log('✅ Accounts granted:', accounts);
    return accounts;
  } catch (error: any) {
    console.error('❌ User denied account access:', error);
    throw new Error(`User denied account access: ${error.message}`);
  }
};
