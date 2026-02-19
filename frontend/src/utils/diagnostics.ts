/**
 * 🔍 WALLET DIAGNOSTIC TOOL
 * 
 * Open browser console and run:
 * window.diagnoseWallet()
 * 
 * This will show you exactly what wallets are detected and help troubleshoot connection issues.
 */

import { detectWallets, requestAccounts } from './walletDetection';

declare global {
  interface Window {
    diagnoseWallet: () => void;
    testWalletConnection: () => Promise<void>;
  }
}

/**
 * Main diagnostic function - shows detailed wallet information
 */
window.diagnoseWallet = () => {
  console.clear();
  console.log('%c🔍 EventGraph AI - Wallet Diagnostic Tool', 'font-size: 20px; color: #4CAF50; font-weight: bold;');
  console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #4CAF50;');
  console.log('');

  // 1. Check if running in browser
  console.log('%c1️⃣ Environment Check', 'font-size: 16px; color: #2196F3; font-weight: bold;');
  console.log('User Agent:', navigator.userAgent);
  console.log('Platform:', navigator.platform);
  console.log('');

  // 2. Check for window.ethereum
  console.log('%c2️⃣ Provider Detection', 'font-size: 16px; color: #2196F3; font-weight: bold;');
  const ethereum = (window as any)?.ethereum;
  
  if (!ethereum) {
    console.log('%c❌ PROBLEM FOUND: No ethereum provider detected', 'color: #f44336; font-weight: bold;');
    console.log('');
    console.log('%c💡 SOLUTION:', 'color: #FF9800; font-weight: bold;');
    console.log('Install a Web3 wallet extension:');
    console.log('  • MetaMask: https://metamask.io/download/');
    console.log('  • Coinbase Wallet: https://www.coinbase.com/wallet/downloads');
    console.log('');
    console.log('After installing, refresh this page.');
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #4CAF50;');
    return;
  }

  console.log('✅ Ethereum provider found');
  console.log('Provider object:', ethereum);
  console.log('');

  // 3. Detect specific wallets
  console.log('%c3️⃣ Wallet Detection Results', 'font-size: 16px; color: #2196F3; font-weight: bold;');
  const detection = detectWallets();
  
  console.table({
    'MetaMask': detection.metamask ? '✅ YES' : '❌ NO',
    'Coinbase': detection.coinbase ? '✅ YES' : '❌ NO',
    'Trust': detection.trust ? '✅ YES' : '❌ NO',
    'Binance': detection.binance ? '✅ YES' : '❌ NO',
    'OKX': detection.okx ? '✅ YES' : '❌ NO',
    // DISABLED: Phantom wallet (uncomment for future use)
    // 'Phantom': detection.phantom ? '✅ YES' : '❌ NO',
    'Any Injected': detection.anyInjected ? '✅ YES' : '❌ NO',
  });
  console.log('');

  // 4. Connection status
  console.log('%c4️⃣ Connection Status', 'font-size: 16px; color: #2196F3; font-weight: bold;');
  if (ethereum.selectedAddress) {
    console.log('✅ Connected to:', ethereum.selectedAddress);
    console.log('Short address:', `${ethereum.selectedAddress.slice(0, 6)}...${ethereum.selectedAddress.slice(-4)}`);
  } else {
    console.log('🔌 Not connected yet (click "Connect Wallet" button to connect)');
  }
  console.log('');

  // 5. Network info
  console.log('%c5️⃣ Network Information', 'font-size: 16px; color: #2196F3; font-weight: bold;');
  if (ethereum.chainId) {
    const chainId = parseInt(ethereum.chainId, 16);
    const networks: Record<number, string> = {
      1: 'Ethereum Mainnet',
      5: 'Goerli Testnet',
      11155111: 'Sepolia Testnet',
      137: 'Polygon',
      8453: 'Base',
      42161: 'Arbitrum',
      10: 'Optimism',
      56: 'BSC',
    };
    console.log('Chain ID:', ethereum.chainId, `(${chainId})`);
    console.log('Network:', networks[chainId] || 'Unknown network');
  } else {
    console.log('⚠️ Chain ID not available');
  }
  console.log('');

  // 6. Recommendations
  console.log('%c6️⃣ Recommendations', 'font-size: 16px; color: #2196F3; font-weight: bold;');
  
  if (!detection.metamask && !detection.coinbase && !detection.anyInjected) {
    console.log('%c⚠️ No wallet detected - Install a wallet extension', 'color: #FF9800; font-weight: bold;');
  } else if (!ethereum.selectedAddress) {
    console.log('%c✅ Wallet detected but not connected', 'color: #4CAF50;');
    console.log('👉 Click the "Connect Wallet" button in the app to connect');
  } else {
    console.log('%c✅ Everything looks good!', 'color: #4CAF50; font-weight: bold;');
    console.log('Your wallet is connected and ready to use.');
  }
  
  console.log('');
  console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #4CAF50;');
  console.log('');
  console.log('%c💡 To test connection:', 'color: #2196F3; font-weight: bold;');
  console.log('Run: window.testWalletConnection()');
  console.log('');
};

/**
 * Test wallet connection
 */
window.testWalletConnection = async () => {
  console.clear();
  console.log('%c🧪 Testing Wallet Connection...', 'font-size: 18px; color: #FF9800; font-weight: bold;');
  console.log('');

  try {
    const accounts = await requestAccounts();
    console.log('%c✅ SUCCESS!', 'font-size: 16px; color: #4CAF50; font-weight: bold;');
    console.log('Connected accounts:', accounts);
    console.log('');
    console.log('You can now use the app with wallet address:', accounts[0]);
  } catch (error: any) {
    console.log('%c❌ FAILED', 'font-size: 16px; color: #f44336; font-weight: bold;');
    console.error('Error:', error);
    console.log('');
    console.log('%c💡 Possible reasons:', 'color: #FF9800; font-weight: bold;');
    console.log('  • You rejected the connection request');
    console.log('  • Wallet is locked (unlock it and try again)');
    console.log('  • No wallet installed (run window.diagnoseWallet() for details)');
  }
};

// Auto-run on page load
setTimeout(() => {
  console.log('%c💡 TIP: Run window.diagnoseWallet() to check wallet status', 'color: #2196F3; font-style: italic;');
}, 1000);

export {};
