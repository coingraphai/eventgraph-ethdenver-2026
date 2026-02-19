/**
 * Event Analytics API Service
 * Fetches comprehensive event data from the enhanced analytics endpoint
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// ============================================================================
// Types
// ============================================================================

export interface MarketAnalytics {
  market_id: string;
  event_slug?: string | null;  // For Polymarket URL
  title: string;
  yes_price?: number | null;
  no_price?: number | null;
  volume_total?: number | null;
  volume_24h?: number | null;
  volume_1_week?: number | null;
  volume_change_pct?: number | null;
  end_time?: number | null;
  status: string;
  image?: string | null;
  source_url?: string | null;  // Direct link to market on platform
  token_id_yes?: string | null;
  token_id_no?: string | null;
  condition_id?: string | null;
  momentum_score?: number | null;
  is_whale_active: boolean;
  price_volatility?: number | null;
  liquidity_score?: number | null;
}

export interface TradeRecord {
  timestamp: number;
  market_id: string;
  market_title?: string | null;
  side: string;
  token_label: string;
  price: number;
  shares: number;
  usd_value?: number | null;
  is_whale: boolean;
  taker?: string | null;
  tx_hash?: string | null;
  order_hash?: string | null;
}

export interface TradeFlowStats {
  total_trades: number;
  buy_count: number;
  sell_count: number;
  buy_volume: number;
  sell_volume: number;
  buy_sell_ratio: number;
  whale_trades: number;
  whale_buy_volume: number;
  whale_sell_volume: number;
  avg_trade_size: number;
  largest_trade?: TradeRecord | null;
}

export interface VolumeTrend {
  market_id: string;
  title: string;
  volume_24h: number;
  volume_7d: number;
  volume_30d: number;
  trend: 'up' | 'down' | 'stable';
  change_pct: number;
}

export interface EventSummary {
  event_id: string;
  title: string;
  platform: string;
  category: string;
  status: string;
  end_time?: number | null;
  time_remaining?: string | null;
  total_markets: number;
  total_volume: number;
  volume_24h: number;
  volume_7d: number;
  avg_yes_price?: number | null;
  high_conviction_count: number;
  toss_up_count: number;
  image?: string | null;
  tags: string[];
}

export interface CrossPlatformData {
  kalshi_available: boolean;
  kalshi_event_ticker?: string | null;
  kalshi_total_volume?: number | null;
  price_differences: Array<{ [key: string]: any }>;
  arbitrage_opportunities: Array<{ [key: string]: any }>;
}

export interface EnhancedEventResponse {
  summary: EventSummary;
  markets: MarketAnalytics[];
  trade_flow: TradeFlowStats;
  recent_trades: TradeRecord[];
  volume_trends: VolumeTrend[];
  price_history: { [market_id: string]: Array<{ timestamp: number; price: number }> };
  volume_by_market: Array<{ market_id: string; title: string; volume: number; volume_24h?: number }>;
  price_distribution: { [range: string]: number };
  cross_platform: CrossPlatformData;
  // Pagination info for trades
  total_trades_available: number;
  trades_paginated: boolean;
  last_updated: string;
  refresh_interval_seconds: number;
}

export interface PaginatedTradesResponse {
  trades: TradeRecord[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
  token_filter?: string | null;
  sort_by: string;
  sort_order: string;
  total_volume: number;
  whale_count: number;
  buy_count: number;
  sell_count: number;
}

export interface PriceHistoryResponse {
  token_id: string;
  history: Array<{ timestamp: number; price: number | null }>;
  hours: number;
  interval_minutes: number;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetch comprehensive event analytics
 */
export async function fetchEventAnalytics(
  platform: string,
  eventId: string,
  options: {
    includeHistory?: boolean;
    includeTrades?: boolean;
    maxMarkets?: number;
  } = {}
): Promise<EnhancedEventResponse> {
  const { includeHistory = false, includeTrades = true, maxMarkets = 100 } = options;

  const params = new URLSearchParams({
    include_history: String(includeHistory),
    include_trades: String(includeTrades),
    max_markets: String(maxMarkets),
  });

  const response = await fetch(
    `${API_BASE_URL}/api/event/${platform}/${encodeURIComponent(eventId)}/analytics?${params}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch price history for a specific token
 */
export async function fetchPriceHistory(
  tokenId: string,
  hours: number = 24,
  interval: number = 60
): Promise<PriceHistoryResponse> {
  const params = new URLSearchParams({
    hours: String(hours),
    interval: String(interval),
  });

  const response = await fetch(
    `${API_BASE_URL}/api/market/${tokenId}/price-history?${params}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch paginated trades for an event
 * Use this for deep dive into ALL trades with pagination
 */
export async function fetchPaginatedTrades(
  platform: string,
  eventId: string,
  options: {
    page?: number;
    pageSize?: number;
    tokenFilter?: 'YES' | 'NO' | null;
    sortBy?: 'value' | 'time';
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<PaginatedTradesResponse> {
  const { 
    page = 1, 
    pageSize = 100, 
    tokenFilter = null, 
    sortBy = 'value', 
    sortOrder = 'desc' 
  } = options;

  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    sort_by: sortBy,
    sort_order: sortOrder,
  });

  if (tokenFilter) {
    params.set('token_filter', tokenFilter);
  }

  const response = await fetch(
    `${API_BASE_URL}/api/event/${platform}/${encodeURIComponent(eventId)}/trades?${params}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// Utility Functions
// ============================================================================

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

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

export function formatPrice(value: number | null | undefined): string {
  if (value == null) return '-';
  return `${(value * 100).toFixed(1)}¢`;
}

export function formatPercentChange(value: number | null | undefined): string {
  if (value == null) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function getMomentumColor(score: number | null | undefined): string {
  if (score == null) return '#9e9e9e';
  if (score > 30) return '#4caf50';
  if (score > 0) return '#8bc34a';
  if (score > -30) return '#ff9800';
  return '#f44336';
}

export function getTrendIcon(trend: string): string {
  switch (trend) {
    case 'up':
      return '📈';
    case 'down':
      return '📉';
    default:
      return '➖';
  }
}
