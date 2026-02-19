import { useState, useCallback, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const TOKEN_KEY = 'wallet_auth_token';
const ADDRESS_KEY = 'wallet_address';

interface ChallengeResponse {
  nonce: string;
  message: string;
  expires_at: string;
}

interface LoginResponse {
  token: string;
  expires_in: number;
  address: string;
}

/**
 * useWalletAuth Hook
 * 
 * Handles wallet-based authentication flow:
 * 1. Request challenge from backend
 * 2. Sign message with wallet
 * 3. Submit signature for JWT token
 * 4. Store token in localStorage
 */
export const useWalletAuth = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user is already authenticated and token is still valid
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const storedAddress = localStorage.getItem(ADDRESS_KEY);
    
    if (token && storedAddress && address && storedAddress.toLowerCase() === address.toLowerCase()) {
      // Token exists and wallet is still connected with same address
      setIsAuthenticated(true);
    } else if (token && storedAddress && !address) {
      // Token exists but wallet is disconnected - keep authenticated until wallet reconnects or user logs out
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
      // Clean up stale tokens only if wallet address changed
      if (token && storedAddress && address && storedAddress.toLowerCase() !== address.toLowerCase()) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(ADDRESS_KEY);
      }
    }
  }, [address]);

  /**
   * Login with wallet signature
   */
  const login = useCallback(async () => {
    if (!address || !isConnected) {
      setError('Wallet not connected');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Request challenge from backend
      const challengeResponse = await axios.post<ChallengeResponse>(
        `${API_BASE_URL}/auth/challenge`,
        { address }
      );

      const { message } = challengeResponse.data;

      // Step 2: Sign the message
      const signature = await signMessageAsync({ message });

      // Step 3: Submit signature to backend
      const loginResponse = await axios.post<LoginResponse>(
        `${API_BASE_URL}/auth/wallet-login`,
        {
          address,
          signature,
        }
      );

      const { token } = loginResponse.data;

      // Step 4: Store token
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(ADDRESS_KEY, address);
      setIsAuthenticated(true);

      console.log('✅ Wallet authentication successful');
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.message || 'Authentication failed';
      setError(errorMsg);
      console.error('❌ Wallet auth error:', errorMsg);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, [address, isConnected, signMessageAsync]);

  /**
   * Logout - clear token
   */
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADDRESS_KEY);
    setIsAuthenticated(false);
    console.log('✅ Logged out');
  }, []);

  /**
   * Get stored auth token
   */
  const getToken = useCallback((): string | null => {
    return localStorage.getItem(TOKEN_KEY);
  }, []);

  return {
    login,
    logout,
    getToken,
    isAuthenticated,
    isLoading,
    error,
  };
};
