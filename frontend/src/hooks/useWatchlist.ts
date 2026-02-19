/**
 * useWatchlist Hook
 * Manages watchlist with localStorage persistence
 */

import { useState, useEffect, useCallback } from 'react';

const WATCHLIST_STORAGE_KEY = 'coingraph_watchlist';

export interface WatchlistItem {
  id: string;
  addedAt: number;
}

interface UseWatchlistReturn {
  watchlist: Set<string>;
  watchlistItems: WatchlistItem[];
  isWatching: (marketId: string) => boolean;
  addToWatchlist: (marketId: string) => void;
  removeFromWatchlist: (marketId: string) => void;
  toggleWatchlist: (marketId: string) => void;
  clearWatchlist: () => void;
  watchlistCount: number;
}

export function useWatchlist(): UseWatchlistReturn {
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(WATCHLIST_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setWatchlistItems(Array.isArray(parsed) ? parsed : []);
      }
    } catch (error) {
      console.error('Failed to load watchlist from localStorage:', error);
      setWatchlistItems([]);
    }
  }, []);

  // Save to localStorage when watchlist changes
  useEffect(() => {
    try {
      localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlistItems));
    } catch (error) {
      console.error('Failed to save watchlist to localStorage:', error);
    }
  }, [watchlistItems]);

  // Computed Set for quick lookups
  const watchlist = new Set(watchlistItems.map(item => item.id));

  const isWatching = useCallback((marketId: string): boolean => {
    return watchlistItems.some(item => item.id === marketId);
  }, [watchlistItems]);

  const addToWatchlist = useCallback((marketId: string) => {
    setWatchlistItems(prev => {
      if (prev.some(item => item.id === marketId)) {
        return prev; // Already exists
      }
      return [...prev, { id: marketId, addedAt: Date.now() }];
    });
  }, []);

  const removeFromWatchlist = useCallback((marketId: string) => {
    setWatchlistItems(prev => prev.filter(item => item.id !== marketId));
  }, []);

  const toggleWatchlist = useCallback((marketId: string) => {
    setWatchlistItems(prev => {
      const exists = prev.some(item => item.id === marketId);
      if (exists) {
        return prev.filter(item => item.id !== marketId);
      }
      return [...prev, { id: marketId, addedAt: Date.now() }];
    });
  }, []);

  const clearWatchlist = useCallback(() => {
    setWatchlistItems([]);
  }, []);

  return {
    watchlist,
    watchlistItems,
    isWatching,
    addToWatchlist,
    removeFromWatchlist,
    toggleWatchlist,
    clearWatchlist,
    watchlistCount: watchlistItems.length,
  };
}

export default useWatchlist;
