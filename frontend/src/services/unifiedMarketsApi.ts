/**
 * Unified Markets API Service
 * Fetches normalized market data from Polymarket, Kalshi, Limitless, and OpinionTrade
 */

import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';

export type PlatformType = 'all' | 'poly' | 'kalshi' | 'limitless' | 'opiniontrade';
export type CategoryType = 'all' | 'trending' | 'politics' | 'crypto' | 'sports' | 'entertainment' | 'economy' | 'weather' | 'other';
export type SortType = 'volume_desc' | 'volume_24h_desc' | 'volume_asc' | 'price_desc' | 'price_asc' | 'ending_soon' | 'newest' | 'change_desc' | 'ann_roi_desc';

export interface UnifiedMarket {
  platform: 'poly' | 'kalshi' | 'limitless' | 'opiniontrade';
  id: string;
  title: string;
  status: string;
  start_time: number | null;
  end_time: number | null;
  close_time: number | null;
  volume_total_usd: number;
  volume_24h_usd: number | null;
  volume_1_week_usd: number | null;
  volume_1_month_usd: number | null;
  category: string;
  tags: string[];
  last_price: number | null;
  no_price?: number | null;
  liquidity?: number | null;
  price_change_24h?: number | null;
  price_change_pct_24h?: number | null;
  volume_24h_change_pct?: number | null;
  trade_count_24h?: number | null;
  unique_traders_24h?: number | null;
  ann_roi?: number | null;
  event_group?: string | null;
  event_group_label?: string | null;
  extra: {
    // Common
    source_url?: string;
    // Polymarket
    condition_id?: string;
    market_slug?: string;
    event_slug?: string;
    image?: string;
    resolution_source?: string;
    side_a?: { id: string; label: string };
    side_b?: { id: string; label: string };
    winning_side?: string | null;
    game_start_time?: string;
    // Kalshi
    market_ticker?: string;
    event_ticker?: string;
    result?: string | null;
    // Limitless
    liquidity?: number;
    creator?: string;
    // OpinionTrade
    category_id?: string;
  };
}

export interface PaginationInfo {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_more: boolean;
  poly_available: number;
  kalshi_available: number;
}

export interface PlatformStats {
  polymarket: {
    total_available: number;
    fetched: number;
  };
  kalshi: {
    total_available: number;
    fetched: number;
  };
}

export interface UnifiedMarketsResponse {
  markets: UnifiedMarket[];
  pagination: PaginationInfo;
  platform_stats: PlatformStats;
}

export interface MarketDetailResponse {
  market: UnifiedMarket;
  raw: Record<string, unknown>;
}

export interface FetchMarketsParams {
  platform?: PlatformType;
  category?: CategoryType;
  search?: string;
  status?: 'open' | 'closed' | 'all';
  minVolume?: number;
  sort?: SortType;
  page?: number;
  pageSize?: number;
  tags?: string[];
  eventTicker?: string[];
}

/**
 * Fetch unified markets from both platforms
 */
export async function fetchUnifiedMarkets(params: FetchMarketsParams = {}): Promise<UnifiedMarketsResponse> {
  const {
    platform = 'all',
    category = 'all',
    search,
    status = 'open',
    minVolume,
    sort = 'volume_desc',
    page = 1,
    pageSize = 10,
    tags,
    eventTicker,
  } = params;

  const queryParams = new URLSearchParams();
  queryParams.set('platform', platform);
  queryParams.set('category', category);
  queryParams.set('status', status);
  queryParams.set('sort', sort);
  queryParams.set('page', page.toString());
  queryParams.set('page_size', pageSize.toString());

  if (search) queryParams.set('search', search);
  if (minVolume) queryParams.set('min_volume', minVolume.toString());
  if (tags?.length) queryParams.set('tags', tags.join(','));
  if (eventTicker?.length) queryParams.set('event_ticker', eventTicker.join(','));

  const response = await axios.get<UnifiedMarketsResponse>(
    `${API_BASE}/api/unified/markets?${queryParams.toString()}`
  );

  return response.data;
}

/**
 * Fetch a single market by platform and ID
 */
export async function fetchMarketDetail(
  platform: 'poly' | 'kalshi',
  marketId: string
): Promise<MarketDetailResponse> {
  const response = await axios.get<MarketDetailResponse>(
    `${API_BASE}/api/unified/markets/${platform}/${encodeURIComponent(marketId)}`
  );

  return response.data;
}

/**
 * Format currency for display
 */
export function formatVolume(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

/**
 * Format date for display
 */
export function formatMarketDate(timestamp: number | null): string {
  if (!timestamp) return 'No date';
  
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  });
}

/**
 * Get platform display name
 */
export function getPlatformName(platform: 'poly' | 'kalshi'): string {
  return platform === 'poly' ? 'Polymarket' : 'Kalshi';
}

/**
 * Get platform color
 */
export function getPlatformColor(platform: 'poly' | 'kalshi'): 'primary' | 'secondary' {
  return platform === 'poly' ? 'primary' : 'secondary';
}

// Storage key for persisted platform selection
const PLATFORM_STORAGE_KEY = 'coingraph_platform_preference';

/**
 * Get persisted platform preference
 */
export function getPersistedPlatform(): PlatformType {
  try {
    const stored = localStorage.getItem(PLATFORM_STORAGE_KEY);
    if (stored === 'all' || stored === 'poly' || stored === 'kalshi') {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return 'all';
}

/**
 * Set persisted platform preference
 */
export function setPersistedPlatform(platform: PlatformType): void {
  try {
    localStorage.setItem(PLATFORM_STORAGE_KEY, platform);
  } catch {
    // localStorage not available
  }
}
