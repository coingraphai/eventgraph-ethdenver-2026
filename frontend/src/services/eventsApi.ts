/**
 * Events API Service
 * Fetches and manages prediction market events from the backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Types
export type EventPlatform = 'all' | 'polymarket' | 'kalshi' | 'limitless';
export type EventCategory = 'all' | 'politics' | 'crypto' | 'sports' | 'economy' | 'entertainment' | 'other';

export interface EventMarket {
  market_id: string;
  event_slug?: string | null;  // For Polymarket URL: /event/{event_slug}
  title: string;
  yes_price?: number | null;
  volume_total?: number | null;
  volume_24h?: number | null;
  status: string;
  image?: string;
  token_id?: string;
}

export interface Event {
  event_id: string;
  title: string;
  platform: string;
  category: string;
  image?: string | null;
  link?: string | null;  // Source URL for the event
  market_count: number;
  total_volume: number;
  liquidity?: number | null;  // Available liquidity for trading
  volume_24h?: number | null;
  volume_1_week?: number | null;
  volume_7d?: number | null;  // Alias for volume_1_week
  start_time?: number | null;
  end_time?: number | null;
  status: string;
  tags: string[];
  markets: EventMarket[];
  top_market?: {
    market_id: string;
    title: string;
    yes_price?: number | null;
    no_price?: number | null;
    volume?: number | null;
    source_url?: string | null;
  } | null;
  top_markets: Array<{
    market_id: string;
    title: string;
    yes_price?: number | null;
    volume_total?: number | null;
    image?: string;
  }>;
}

export interface AggregateMetrics {
  total_events?: number;
  total_markets: number;
  total_volume: number;
  volume_24h: number;
  volume_1_week: number;
  avg_markets_per_event: number;
  avg_volume_per_event: number;
  polymarket_markets: number;
  polymarket_volume: number;
  kalshi_markets: number;
  kalshi_volume: number;
  limitless_markets: number;
  limitless_volume: number;
}

export interface EventsResponse {
  events: Event[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  platform_counts: {
    polymarket: number;
    kalshi: number;
    limitless: number;
  };
  aggregate_metrics?: AggregateMetrics;
}

export interface RecentTrade {
  timestamp: number;
  side: string;
  price: number;
  shares: number;
  market_id: string;
  market_title?: string;
  token_label?: string;
}

export interface VolumeByMarket {
  title: string;
  volume: number;
  volume_1_week?: number;
  volume_24h?: number;
}

export interface PriceSummary {
  avg_price?: number | null;
  max_price?: number | null;
  min_price?: number | null;
  markets_with_price: number;
}

export interface EventDetailResponse {
  event: Event;
  markets: Array<{
    market_id: string;
    event_slug?: string | null;  // For Polymarket URL
    title: string;
    yes_price?: number | null;
    no_price?: number | null;
    volume_total?: number | null;
    volume_24h?: number | null;
    volume_1_week?: number | null;
    end_time?: number | null;
    close_time?: number | null;
    status: string;
    result?: string | null;
    image?: string;
    source_url?: string | null;  // Direct link to market on platform
    token_id_yes?: string;
    token_id_no?: string;
    condition_id?: string;
  }>;
  platform: string;
  recent_trades: RecentTrade[];
  volume_by_market: VolumeByMarket[];
  price_summary: PriceSummary;
}

export interface FetchEventsParams {
  platform?: EventPlatform;
  category?: string;  // Changed from EventCategory to string for dynamic categories
  search?: string;
  page?: number;
  pageSize?: number;
  minVolume?: number;
  status?: string;
}

/**
 * Fetch aggregate stats for overview cards (fast endpoint, < 200ms)
 * Returns: total_events, total_markets, total_volume, avg_per_event, platform_counts
 */
export interface EventsStatsResponse {
  total_events: number;
  total_markets: number;
  total_volume: number;
  avg_per_event: number;
  platform_counts: Record<string, number>;
  aggregate_metrics: Record<string, number>;
  cache_age_seconds: number;
  cache_status: string;
  response_time_ms: number;
  force_refresh_rejected?: boolean;
  force_refresh_available_in_seconds?: number;
}

export async function fetchEventsStats(forceRefresh: boolean = false): Promise<EventsStatsResponse> {
  const url = new URL(`${API_BASE_URL}/api/db/events/stats`, window.location.origin);
  if (forceRefresh) {
    url.searchParams.set('force_refresh', 'true');
  }
  
  const response = await fetch(url.toString());
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Fetch list of events
 * minVolume not passed - uses backend defaults: Polymarket $10K, Kalshi $5K
 */
export async function fetchEvents(params: FetchEventsParams = {}): Promise<EventsResponse> {
  const {
    platform = 'all',
    category = 'all',
    search,
    page = 1,
    pageSize = 20,
    status = 'open',
  } = params;

  const queryParams = new URLSearchParams({
    platform,
    category,
    page: String(page),
    page_size: String(pageSize),
    status,
  });

  if (search) {
    queryParams.set('search', search);
  }

  const response = await fetch(`${API_BASE_URL}/api/db/events?${queryParams}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch event detail with all markets (from database)
 */
export async function fetchEventDetail(
  platform: string, 
  eventId: string, 
  forceRefresh: boolean = false
): Promise<EventDetailResponse> {
  const url = new URL(`${API_BASE_URL}/api/db/events/${platform}/${encodeURIComponent(eventId)}`, window.location.origin);
  
  // Add force_refresh query parameter if true
  if (forceRefresh) {
    url.searchParams.set('force_refresh', 'true');
  }
  
  const response = await fetch(url.toString());

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Format volume for display
 */
export function formatVolume(volume: number | null | undefined): string {
  if (volume == null || isNaN(volume)) return '-';
  
  if (volume >= 1_000_000_000) {
    return `$${(volume / 1_000_000_000).toFixed(1)}B`;
  } else if (volume >= 1_000_000) {
    return `$${(volume / 1_000_000).toFixed(1)}M`;
  } else if (volume >= 1_000) {
    return `$${(volume / 1_000).toFixed(1)}K`;
  } else {
    return `$${volume.toFixed(0)}`;
  }
}

/**
 * Format date from unix timestamp
 */
export function formatEventDate(timestamp: number | null | undefined): string {
  if (!timestamp) return '-';
  
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get platform display name
 */
export function getPlatformName(platform: string): string {
  switch (platform) {
    case 'polymarket':
      return 'Polymarket';
    case 'kalshi':
      return 'Kalshi';
    case 'limitless':
      return 'Limitless';
    default:
      return platform;
  }
}

/**
 * Get category display name
 */
export function getCategoryName(category: string): string {
  const names: Record<string, string> = {
    all: 'All',
    politics: 'Politics',
    crypto: 'Crypto',
    sports: 'Sports',
    economy: 'Economy',
    entertainment: 'Entertainment',
    other: 'Other',
  };
  return names[category] || category;
}

/**
 * Get category color
 */
export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    politics: '#3f51b5',
    crypto: '#ff9800',
    sports: '#4caf50',
    economy: '#2196f3',
    entertainment: '#e91e63',
    other: '#9e9e9e',
  };
  return colors[category] || colors.other;
}

export interface CategoryInfo {
  name: string;
  count: number;
  label: string;
}

export interface CategoriesResponse {
  categories: CategoryInfo[];
  total_categories: number;
}

/**
 * Fetch available categories for a platform
 */
export async function fetchEventCategories(platform: string = 'all'): Promise<CategoriesResponse> {
  const queryParams = new URLSearchParams({ platform });
  
  const response = await fetch(`${API_BASE_URL}/api/db/events/categories?${queryParams}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch categories: ${response.statusText}`);
  }
  
  return response.json();
}

// Persistence for platform selection
const PLATFORM_STORAGE_KEY = 'events_platform_preference';

export function getPersistedEventsPlatform(): EventPlatform {
  try {
    const stored = localStorage.getItem(PLATFORM_STORAGE_KEY);
    if (stored && ['all', 'polymarket', 'kalshi'].includes(stored)) {
      return stored as EventPlatform;
    }
  } catch {
    // localStorage not available
  }
  return 'all';
}

export function setPersistedEventsPlatform(platform: EventPlatform): void {
  try {
    localStorage.setItem(PLATFORM_STORAGE_KEY, platform);
  } catch {
    // localStorage not available
  }
}

/**
 * Fetch on-demand trades for a market (real-time from Dome API)
 */
export interface Trade {
  timestamp: string;
  side: string;
  price: number;
  shares: number;
  total_value: number;
  outcome?: string;
}

export interface TradesResponse {
  trades: Trade[];
  total_count: number;
  filtered_count: number;
  market_id: string;
  platform: string;
  hours: number;
  min_usd: number;
}

export async function fetchMarketTrades(
  platform: string,
  marketId: string,
  hours: number = 24,
  minUsd: number = 1000,
  limit: number = 500
): Promise<TradesResponse> {
  const queryParams = new URLSearchParams({
    hours: String(hours),
    min_usd: String(minUsd),
    limit: String(limit),
  });

  const response = await fetch(
    `${API_BASE_URL}/api/realtime/trades/${platform}/${marketId}?${queryParams}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch on-demand orderbook for a market (real-time from Dome API)
 */
export interface OrderbookLevel {
  price: number;
  size: number;
  total_value: number;
}

export interface OrderbookResponse {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  spread: number;
  mid_price: number;
  token_id: string;
  platform: string;
  depth: number;
}

export async function fetchMarketOrderbook(
  platform: string,
  tokenId: string,
  depth: number = 20
): Promise<OrderbookResponse> {
  const queryParams = new URLSearchParams({
    depth: String(depth),
  });

  const response = await fetch(
    `${API_BASE_URL}/api/realtime/orderbook/${platform}/${tokenId}?${queryParams}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}
