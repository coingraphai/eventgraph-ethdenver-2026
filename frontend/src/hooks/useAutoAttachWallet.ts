import { useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';
const ATTACHED_WALLETS_KEY = 'coingraph_attached_wallets';

/**
 * Hook to automatically attach wallet to existing sessions on first connection
 * This fixes analytics for users who have chat history created before wallet connection
 */
export const useAutoAttachWallet = () => {
  const { address, isConnected } = useAccount();
  const hasAttemptedAttach = useRef(false);

  useEffect(() => {
    const attachWalletToSessions = async () => {
      if (!isConnected || !address || hasAttemptedAttach.current) {
        return;
      }

      try {
        // Check if we've already attached this wallet
        const attachedWallets = JSON.parse(
          localStorage.getItem(ATTACHED_WALLETS_KEY) || '[]'
        );
        
        const walletLower = address.toLowerCase();
        
        if (attachedWallets.includes(walletLower)) {
          console.log('[useAutoAttachWallet] Wallet already attached:', walletLower);
          hasAttemptedAttach.current = true;
          return;
        }

        console.log('[useAutoAttachWallet] Attempting to attach wallet to existing sessions:', walletLower);

        // Call the backend endpoint to attach wallet to sessions
        const response = await axios.post(
          `${API_URL}/api/chat/sessions/attach-wallet`,
          {
            wallet_address: address
          },
          {
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.data.success) {
          const { updated_count, session_ids } = response.data;
          
          if (updated_count > 0) {
            console.log(
              `[useAutoAttachWallet] ✅ Successfully attached wallet to ${updated_count} existing sessions`,
              session_ids
            );
            
            // Store this wallet as attached to avoid future attempts
            attachedWallets.push(walletLower);
            localStorage.setItem(ATTACHED_WALLETS_KEY, JSON.stringify(attachedWallets));
          } else {
            console.log('[useAutoAttachWallet] No sessions needed attachment');
          }
        }

        hasAttemptedAttach.current = true;

      } catch (error: any) {
        console.error('[useAutoAttachWallet] Error attaching wallet:', error);
        // Don't block user experience if this fails
        hasAttemptedAttach.current = true;
      }
    };

    // Run attachment check after a short delay to ensure wallet is fully connected
    const timeoutId = setTimeout(attachWalletToSessions, 1000);

    return () => clearTimeout(timeoutId);
  }, [address, isConnected]);

  return null;
};
