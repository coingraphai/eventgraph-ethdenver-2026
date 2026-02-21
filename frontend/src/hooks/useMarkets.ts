/**
 * useMarkets Hook
 * Fetches and manages prediction market data from DATABASE (fast)
 * Falls back to Dome API if database is unavailable
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { fetchAllMarkets } from '../services/domeClient';
import { 
  UnifiedMarket, 
  normalizeAllMarkets, 
  calculateMarketStats,
  MarketStats 
} from '../services/marketNormalizer';

export type SortField = 'volume24h' | 'liquidity' | 'change24h' | 'expiryDays' | 'yesPrice' | 'spread';
export type SortDirection = 'asc' | 'desc';
export type CategoryFilter = 'all' | 'Politics' | 'Crypto' | 'Sports' | 'Entertainment' | 'Technology' | 'Other';

interface UseMarketsOptions {
  autoRefresh?: boolean;
  refreshInterval?: number; // ms
  limit?: number;
}

interface UseMarketsReturn {
  markets: UnifiedMarket[];
  filteredMarkets: UnifiedMarket[];
  stats: MarketStats;
  loading: boolean;
  error: string | null;
  
  // Filters
  category: CategoryFilter;
  setCategory: (category: CategoryFilter) => void;
  platform: 'all' | 'POLYMARKET' | 'KALSHI';
  setPlatform: (platform: 'all' | 'POLYMARKET' | 'KALSHI') => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  showOnlyArb: boolean;
  setShowOnlyArb: (show: boolean) => void;
  
  // Sorting
  sortField: SortField;
  setSortField: (field: SortField) => void;
  sortDirection: SortDirection;
  setSortDirection: (direction: SortDirection) => void;
  
  // Actions
  refresh: () => Promise<void>;
  getMarketById: (id: string) => UnifiedMarket | undefined;
}

// Mock data for when API is not available
const MOCK_MARKETS: UnifiedMarket[] = [
  {
    id: 'poly_btc150k',
    platform: 'POLYMARKET',
    title: 'Bitcoin to reach $150k by end of 2026',
    category: 'Crypto',
    yesPrice: 0.68,
    noPrice: 0.32,
    spread: 0.02,
    change24h: 5.2,
    liquidity: 1250000,
    volume24h: 380000,
    expiryTime: Math.floor(Date.now() / 1000) + 358 * 24 * 60 * 60,
    expiryDays: 358,
    arbitrageScore: 0.01,
    hasArb: false,
    sourceUrl: 'https://polymarket.com',
  },
  {
    id: 'kalshi_midterm2026',
    platform: 'KALSHI',
    title: 'Democrats win 2026 midterm elections',
    category: 'Politics',
    yesPrice: 0.52,
    noPrice: 0.48,
    spread: 0.01,
    change24h: -2.1,
    liquidity: 2800000,
    volume24h: 920000,
    expiryTime: Math.floor(Date.now() / 1000) + 125 * 24 * 60 * 60,
    expiryDays: 125,
    arbitrageScore: 0.03,
    hasArb: true,
    sourceUrl: 'https://kalshi.com',
  },
  {
    id: 'poly_ethetf',
    platform: 'POLYMARKET',
    title: 'Ethereum ETF approval in Q1 2026',
    category: 'Crypto',
    yesPrice: 0.75,
    noPrice: 0.25,
    spread: 0.03,
    change24h: 8.4,
    liquidity: 890000,
    volume24h: 310000,
    expiryTime: Math.floor(Date.now() / 1000) + 83 * 24 * 60 * 60,
    expiryDays: 83,
    arbitrageScore: 0.01,
    hasArb: false,
    sourceUrl: 'https://polymarket.com',
  },
  {
    id: 'kalshi_superbowl',
    platform: 'KALSHI',
    title: 'Super Bowl LX winner - Kansas City Chiefs',
    category: 'Sports',
    yesPrice: 0.42,
    noPrice: 0.58,
    spread: 0.02,
    change24h: 1.8,
    liquidity: 650000,
    volume24h: 180000,
    expiryTime: Math.floor(Date.now() / 1000) + 28 * 24 * 60 * 60,
    expiryDays: 28,
    arbitrageScore: 0.01,
    hasArb: false,
    sourceUrl: 'https://kalshi.com',
  },
  {
    id: 'poly_trump2028',
    platform: 'POLYMARKET',
    title: 'Trump wins 2028 Presidential Election',
    category: 'Politics',
    yesPrice: 0.35,
    noPrice: 0.65,
    spread: 0.02,
    change24h: -1.5,
    liquidity: 4500000,
    volume24h: 1200000,
    expiryTime: Math.floor(Date.now() / 1000) + 700 * 24 * 60 * 60,
    expiryDays: 700,
    arbitrageScore: 0.01,
    hasArb: false,
    sourceUrl: 'https://polymarket.com',
  },
  {
    id: 'kalshi_recession2026',
    platform: 'KALSHI',
    title: 'US enters recession in 2026',
    category: 'Finance',
    yesPrice: 0.28,
    noPrice: 0.72,
    spread: 0.03,
    change24h: 3.2,
    liquidity: 1800000,
    volume24h: 520000,
    expiryTime: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    expiryDays: 365,
    arbitrageScore: 0.02,
    hasArb: false,
    sourceUrl: 'https://kalshi.com',
  },
  {
    id: 'poly_sol500',
    platform: 'POLYMARKET',
    title: 'Solana to reach $500 in 2026',
    category: 'Crypto',
    yesPrice: 0.22,
    noPrice: 0.78,
    spread: 0.04,
    change24h: 12.5,
    liquidity: 420000,
    volume24h: 95000,
    expiryTime: Math.floor(Date.now() / 1000) + 358 * 24 * 60 * 60,
    expiryDays: 358,
    arbitrageScore: 0.01,
    hasArb: false,
    sourceUrl: 'https://polymarket.com',
  },
  {
    id: 'kalshi_oscars',
    platform: 'KALSHI',
    title: 'Best Picture Oscar 2026 - Oppenheimer II',
    category: 'Entertainment',
    yesPrice: 0.18,
    noPrice: 0.82,
    spread: 0.05,
    change24h: -0.8,
    liquidity: 280000,
    volume24h: 45000,
    expiryTime: Math.floor(Date.now() / 1000) + 60 * 24 * 60 * 60,
    expiryDays: 60,
    arbitrageScore: 0.01,
    hasArb: false,
    sourceUrl: 'https://kalshi.com',
  },
];

export function useMarkets(options: UseMarketsOptions = {}): UseMarketsReturn {
  const { autoRefresh = false, refreshInterval = 30000, limit = 50 } = options;

  // Data state
  const [markets, setMarkets] = useState<UnifiedMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [platform, setPlatform] = useState<'all' | 'POLYMARKET' | 'KALSHI'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyArb, setShowOnlyArb] = useState(false);

  // Sort state
  const [sortField, setSortField] = useState<SortField>('volume24h');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  /**
   * Convert database event to UnifiedMarket format
   */
  const convertDbEventToMarket = (event: any): UnifiedMarket => {
    const yesPrice = event.top_market?.yes_price ?? 0.5;
    const endTime = event.end_time ? event.end_time : null;
    const now = Math.floor(Date.now() / 1000);
    const expiryDays = endTime ? Math.max(0, Math.floor((endTime - now) / 86400)) : 999;
    
    return {
      id: `${event.platform}_${event.event_id}`,
      platform: event.platform?.toUpperCase() || 'POLYMARKET',
      title: event.title || event.event_title || 'Unknown Event',
      category: event.category || 'Other',
      yesPrice: yesPrice,
      noPrice: 1 - yesPrice,
      spread: 0.02, // Default spread
      change24h: 0, // Not available from DB events endpoint
      liquidity: event.liquidity || 0,
      volume24h: event.volume_24h || 0,
      expiryTime: endTime,
      expiryDays: expiryDays,
      arbitrageScore: 0,
      hasArb: false,
      sourceUrl: event.link || event.top_market?.source_url || '',
      // Extra fields for navigation
      eventId: event.event_id,
      marketCount: event.market_count || 1,
      totalVolume: event.total_volume || 0,
      image: event.image,
    };
  };

  /**
   * Fetch markets from DATABASE (fast) with fallback to API
   */
  const fetchMarkets = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      
      // Try database first (fast)
      const dbResponse = await axios.get(`${apiBase}/db/events`, {
        params: {
          page: 1,
          page_size: limit,
          sort_by: 'volume',
        }
      });
      
      if (dbResponse.data?.events?.length > 0) {
        const dbMarkets = dbResponse.data.events.map(convertDbEventToMarket);
        console.log(`Loaded ${dbMarkets.length} events from database`);
        setMarkets(dbMarkets);
        return;
      }
      
      // Fallback to Dome API if database is empty
      console.log('Database empty, falling back to Dome API');
      const apiKey = import.meta.env.VITE_DOME_API_KEY;
      
      if (!apiKey) {
        console.log('No DOME_API_KEY found, using mock data');
        setMarkets(MOCK_MARKETS);
        return;
      }

      const { polymarket, kalshi } = await fetchAllMarkets({ limit });
      const normalized = normalizeAllMarkets(polymarket, kalshi);
      
      if (normalized.length === 0) {
        console.log('API returned empty, using mock data');
        setMarkets(MOCK_MARKETS);
      } else {
        setMarkets(normalized);
      }
    } catch (err: any) {
      console.error('Failed to fetch markets:', err);
      setError(err.message || 'Failed to load markets');
      // Use mock data on error
      setMarkets(MOCK_MARKETS);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  // Initial fetch
  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchMarkets, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchMarkets]);

  /**
   * Filter and sort markets
   */
  const filteredMarkets = useMemo(() => {
    let result = [...markets];

    // Filter by category
    if (category !== 'all') {
      result = result.filter(m => m.category === category);
    }

    // Filter by platform
    if (platform !== 'all') {
      result = result.filter(m => m.platform === platform);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(m => 
        m.title.toLowerCase().includes(query) ||
        m.category.toLowerCase().includes(query)
      );
    }

    // Filter by arbitrage
    if (showOnlyArb) {
      result = result.filter(m => m.hasArb);
    }

    // Sort
    result.sort((a, b) => {
      const aVal = a[sortField] ?? 0;
      const bVal = b[sortField] ?? 0;
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return result;
  }, [markets, category, platform, searchQuery, showOnlyArb, sortField, sortDirection]);

  /**
   * Calculate stats from all markets (not filtered)
   */
  const stats = useMemo(() => {
    return calculateMarketStats(markets);
  }, [markets]);

  /**
   * Get market by ID
   */
  const getMarketById = useCallback((id: string): UnifiedMarket | undefined => {
    return markets.find(m => m.id === id);
  }, [markets]);

  return {
    markets,
    filteredMarkets,
    stats,
    loading,
    error,
    category,
    setCategory,
    platform,
    setPlatform,
    searchQuery,
    setSearchQuery,
    showOnlyArb,
    setShowOnlyArb,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    refresh: fetchMarkets,
    getMarketById,
  };
}

export default useMarkets;
