import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

const SESSION_KEY = 'coingraph_session_id';

/**
 * Get or create session ID synchronously
 * Used for initial state to avoid empty string on first render
 */
const getOrCreateSessionId = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }
  
  let existingSessionId = localStorage.getItem(SESSION_KEY);
  
  if (!existingSessionId) {
    existingSessionId = uuidv4();
    localStorage.setItem(SESSION_KEY, existingSessionId);
    console.log('Generated new session ID:', existingSessionId);
  }
  
  return existingSessionId;
};

/**
 * Hook to manage anonymous session ID
 * Generates and persists a unique session ID in localStorage
 * Used for tracking anonymous users before wallet connection
 */
export const useSessionId = (): string => {
  // Initialize with actual session ID to avoid empty string on first render
  const [sessionId, setSessionId] = useState<string>(() => getOrCreateSessionId());

  useEffect(() => {
    // Ensure session ID is set (handles SSR edge cases)
    if (!sessionId) {
      const newSessionId = getOrCreateSessionId();
      if (newSessionId) {
        setSessionId(newSessionId);
        console.log('Session ID initialized in effect:', newSessionId);
      }
    }
  }, [sessionId]);

  return sessionId;
};

/**
 * Clear session ID (useful when connecting wallet)
 */
export const clearSessionId = (): void => {
  localStorage.removeItem(SESSION_KEY);
  console.log('Session ID cleared');
};
