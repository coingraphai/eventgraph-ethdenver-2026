import { useCallback, useRef } from 'react';

/**
 * Hook to open the OnchainKit wallet connection modal
 * This replaces the RainbowKit useConnectModal hook
 */
export const useWalletModal = () => {
  // Track if a connection request is pending to prevent multiple simultaneous requests
  const isPendingRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const openWalletModal = useCallback(() => {
    // Prevent multiple simultaneous wallet connection requests
    if (isPendingRef.current) {
      console.log('⏸️ Wallet connection already pending, skipping duplicate request');
      return;
    }

    // OnchainKit wallet button is in the TopBar
    // Find and click the OnchainKit connect button to open the modal
    const connectButton = document.querySelector('.coingraph-wallet-btn') as HTMLElement;
    if (connectButton) {
      isPendingRef.current = true;
      console.log('🔄 Opening wallet connection modal...');
      connectButton.click();

      // Clear pending state after 2 seconds (enough time for user to see/cancel modal)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        isPendingRef.current = false;
        console.log('✅ Wallet connection request timeout cleared');
      }, 2000);
    }
  }, []);

  return { openWalletModal };
};
