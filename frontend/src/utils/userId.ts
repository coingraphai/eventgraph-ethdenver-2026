/**
 * Get or create a consistent user ID for anonymous users
 * Returns the session-based user ID from sessionStorage, or creates one if it doesn't exist
 */
export const getUserId = (): string => {
  let userId = sessionStorage.getItem('user_id');
  if (!userId) {
    userId = `anon_${Date.now()}`;
    sessionStorage.setItem('user_id', userId);
  }
  return userId;
};

/**
 * Clear the user ID (called on logout or new session)
 */
export const clearUserId = (): void => {
  sessionStorage.removeItem('user_id');
};
