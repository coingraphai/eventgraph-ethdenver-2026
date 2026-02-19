/**
 * Market Test API Service
 * ISOLATED from existing markets functionality
 * Fetches from /api/market-test endpoints
 */
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// Types
export type MarketStatus = 'open' | 'closed' | 'resolved';
export type SortBy = 'volume' | 'created' | 'end_date' | 'title';

export interface MarketTest {
  id: string;
  market_id: string;
  title: string;
  category: string;
  start: string | null;
  end: string | null;
  status: MarketStatus;
  platforms: string[];
  created_at: string;
  updated_at: string;
  
  // Polymarket mapping
  polymarket_market_slug: string | null;
  polymarket_condition_id: string | null;
  polymarket_token_id_yes: string | null;
  polymarket_token_id_no: string | null;
  
  // Kalshi mapping
  kalshi_market_ticker: string | null;
  kalshi_event_ticker: string | null;
  
  // Volume metrics
  volume_total_usd: number;
  volume_24h_usd: number | null;
  volume_7d_usd: number | null;
  
  // Price metrics
  yes_price_last: number | null;
  last_price_yes: number | null;
  last_price_no: number | null;
  mid_price: number | null;
  yes_change_24h: number | null;
  yes_change_24h_pct: number | null;
  
  // Order book metrics
  bid_depth_usd: number | null;
  ask_depth_usd: number | null;
  spread_bps: number | null;
  
  // Trade metrics
  trades_24h: number | null;
  trade_count_24h: number | null;
  avg_trade_notional_24h_usd: number | null;
  avg_trade_size_24h_contracts: number | null;
  avg_trade_size_usd: number | null;
  
  // Trade timing
  last_trade_time: string | null;
  last_trade_age_minutes: number | null;
  
  // Buy/sell pressure
  buy_pressure_24h_ratio: number | null;
  buy_notional_24h_usd: number | null;
  sell_notional_24h_usd: number | null;
  
  // Whale activity
  whale_trades_24h: number | null;
  whale_threshold_usd: number;
  
  // Liquidity scoring
  liquidity_score: number | null;
  liquidity_label: 'High' | 'Medium' | 'Low' | 'Very Low' | null;
  
  // Arbitrage opportunity
  arb_best_spread: number | null;
  arb_direction: 'poly_to_kalshi' | 'kalshi_to_poly' | null;
  arb_executability: 'Good' | 'Medium' | 'Poor' | null;
  
  // Actions
  actions: {
    open_market?: string;
    trade?: string;
    arb_view?: string;
  };
  
  // Raw platform data
  polymarket_data: Record<string, unknown> | null;
  kalshi_data: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

export interface MarketTestCreate {
  market_id: string;
  title: string;
  category: string;
  start?: string | null;
  end?: string | null;
  status?: MarketStatus;
  platforms?: string[];
  polymarket_market_slug?: string | null;
  polymarket_condition_id?: string | null;
  polymarket_token_id_yes?: string | null;
  polymarket_token_id_no?: string | null;
  kalshi_market_ticker?: string | null;
  kalshi_event_ticker?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PaginationInfo {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_more: boolean;
}

export interface MarketTestResponse {
  markets: MarketTest[];
  pagination: PaginationInfo;
  filters: {
    category: string | null;
    status: string | null;
    platform: string | null;
  };
}

export interface MarketTestDetailResponse {
  market: MarketTest;
}

export interface MarketTestStatsResponse {
  total: number;
  by_category: Record<string, number>;
  by_status: Record<string, number>;
  by_platform: Record<string, number>;
}

export interface FetchMarketTestParams {
  category?: string;
  status?: MarketStatus;
  platform?: string;
  sort_by?: SortBy;
  page?: number;
  page_size?: number;
  enrich?: boolean;
}

/**
 * Fetch all market tests with optional filters
 */
export async function fetchMarketTests(
  params: FetchMarketTestParams = {}
): Promise<MarketTestResponse> {
  const {
    category,
    status,
    platform,
    sort_by = 'volume',
    page = 1,
    page_size = 20,
    enrich = true,
  } = params;

  const queryParams: Record<string, string | number | boolean> = {
    page,
    page_size,
    sort_by,
    enrich,
  };

  if (category) queryParams.category = category;
  if (status) queryParams.status = status;
  if (platform) queryParams.platform = platform;

  const response = await axios.get<MarketTestResponse>(
    `${API_BASE_URL}/api/market-test/markets`,
    { params: queryParams }
  );

  return response.data;
}

/**
 * Fetch a single market test by ID
 */
export async function fetchMarketTestById(
  marketTestId: string,
  enrich: boolean = true
): Promise<MarketTestDetailResponse> {
  const response = await axios.get<MarketTestDetailResponse>(
    `${API_BASE_URL}/api/market-test/markets/${marketTestId}`,
    { params: { enrich } }
  );

  return response.data;
}

/**
 * Create a new market test
 */
export async function createMarketTest(
  data: MarketTestCreate
): Promise<{ market: MarketTest; message: string }> {
  const response = await axios.post(
    `${API_BASE_URL}/api/market-test/markets`,
    data
  );

  return response.data;
}

/**
 * Update an existing market test
 */
export async function updateMarketTest(
  marketTestId: string,
  data: Partial<MarketTestCreate>
): Promise<{ market: MarketTest; message: string }> {
  const response = await axios.put(
    `${API_BASE_URL}/api/market-test/markets/${marketTestId}`,
    data
  );

  return response.data;
}

/**
 * Delete a market test
 */
export async function deleteMarketTest(
  marketTestId: string
): Promise<{ message: string }> {
  const response = await axios.delete(
    `${API_BASE_URL}/api/market-test/markets/${marketTestId}`
  );

  return response.data;
}

/**
 * Seed sample market test data
 */
export async function seedMarketTests(): Promise<{ message: string; count: number }> {
  const response = await axios.post(`${API_BASE_URL}/api/market-test/seed`);
  return response.data;
}

/**
 * Get all unique categories
 */
export async function fetchMarketTestCategories(): Promise<{ categories: string[] }> {
  const response = await axios.get(`${API_BASE_URL}/api/market-test/categories`);
  return response.data;
}

/**
 * Get market test statistics
 */
export async function fetchMarketTestStats(): Promise<MarketTestStatsResponse> {
  const response = await axios.get(`${API_BASE_URL}/api/market-test/stats`);
  return response.data;
}

/**
 * Format volume for display
 */
export function formatVolume(volume: number | null | undefined): string {
  if (volume === null || volume === undefined) return '—';
  if (volume >= 1_000_000) {
    return `$${(volume / 1_000_000).toFixed(2)}M`;
  }
  if (volume >= 1_000) {
    return `$${(volume / 1_000).toFixed(1)}K`;
  }
  return `$${volume.toFixed(0)}`;
}

/**
 * Format price as percentage
 */
export function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return '—';
  return `${(price * 100).toFixed(1)}%`;
}

/**
 * Format spread in basis points
 */
export function formatSpread(spreadBps: number | null | undefined): string {
  if (spreadBps === null || spreadBps === undefined) return '—';
  return `${spreadBps.toFixed(0)} bps`;
}

/**
 * Format percentage change
 */
export function formatChange(change: number | null | undefined, isPercent: boolean = false): string {
  if (change === null || change === undefined) return '—';
  const sign = change >= 0 ? '+' : '';
  if (isPercent) {
    return `${sign}${change.toFixed(1)}%`;
  }
  return `${sign}${(change * 100).toFixed(1)}¢`;
}

/**
 * Format trade count
 */
export function formatTrades(count: number | null | undefined): string {
  if (count === null || count === undefined) return '—';
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

/**
 * Format time ago in minutes
 */
export function formatTimeAgo(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

/**
 * Format buy pressure ratio
 */
export function formatBuyPressure(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return '—';
  const pct = ratio * 100;
  if (pct >= 60) return `${pct.toFixed(0)}% Buy`;
  if (pct <= 40) return `${(100 - pct).toFixed(0)}% Sell`;
  return 'Balanced';
}

/**
 * Get buy pressure color
 */
export function getBuyPressureColor(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return 'text.secondary';
  if (ratio >= 0.6) return 'success.main';
  if (ratio <= 0.4) return 'error.main';
  return 'text.secondary';
}

/**
 * Get liquidity label color
 */
export function getLiquidityColor(label: string | null | undefined): string {
  if (!label) return 'default';
  switch (label) {
    case 'High': return 'success';
    case 'Medium': return 'info';
    case 'Low': return 'warning';
    case 'Very Low': return 'error';
    default: return 'default';
  }
}

/**
 * Get arb executability color
 */
export function getArbExecutabilityColor(exec: string | null | undefined): string {
  if (!exec) return 'default';
  switch (exec) {
    case 'Good': return 'success';
    case 'Medium': return 'warning';
    case 'Poor': return 'error';
    default: return 'default';
  }
}

/**
 * Get platform display info
 */
export function getPlatformInfo(platforms: string[]): {
  hasPolymarket: boolean;
  hasKalshi: boolean;
  displayText: string;
} {
  const hasPolymarket = platforms.some(p => p.toLowerCase() === 'polymarket');
  const hasKalshi = platforms.some(p => p.toLowerCase() === 'kalshi');
  
  let displayText = '';
  if (hasPolymarket && hasKalshi) {
    displayText = 'Both';
  } else if (hasPolymarket) {
    displayText = 'Poly';
  } else if (hasKalshi) {
    displayText = 'Kalshi';
  }
  
  return { hasPolymarket, hasKalshi, displayText };
}


// =============================================================================
// Market Terminal Types & API
// =============================================================================

export interface TradeData {
  token_id?: string;
  token_label?: string;
  side: string;
  market_slug?: string;
  condition_id?: string;
  shares: number;
  shares_normalized?: number;
  price: number;
  tx_hash?: string;
  title?: string;
  timestamp: number;
  order_hash?: string;
  user?: string;
  taker?: string;
  // Kalshi fields
  trade_id?: string;
  market_ticker?: string;
  count?: number;
  yes_price?: number;
  no_price?: number;
  yes_price_dollars?: number;
  no_price_dollars?: number;
  taker_side?: string;
  created_time?: number;
}

export interface TradeAnalytics {
  total_trades: number;
  total_volume: number;
  avg_trade_size: number;
  buy_count: number;
  sell_count: number;
  buy_volume: number;
  sell_volume: number;
  buy_pressure: number;
  whale_trades: number;
  largest_trade: number;
}

export interface OrderbookLevel {
  price: number;
  size: number;
}

export interface OrderbookAnalytics {
  best_bid: number | null;
  best_ask: number | null;
  spread: number | null;
  spread_bps: number | null;
  mid_price: number | null;
  bid_depth_10: number;
  ask_depth_10: number;
  total_liquidity: number;
  imbalance: number;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketTerminalResponse {
  platform: string;
  market_id: string;
  market: MarketTest;
  trades?: {
    data: TradeData[];
    total_fetched: number;
    analytics: TradeAnalytics;
  };
  orderbook?: {
    snapshot: Record<string, unknown> | null;
    analytics: OrderbookAnalytics;
  };
  chart?: {
    candles: CandleData[];
    interval_minutes: number;
    days: number;
  };
  links: {
    trade: string;
    share: string;
  };
}

export interface FetchMarketTerminalParams {
  include_trades?: boolean;
  include_orderbook?: boolean;
  include_chart?: boolean;
  trade_limit?: number;
  chart_days?: number;
}

/**
 * Fetch comprehensive market terminal data
 */
export async function fetchMarketTerminalData(
  platform: 'polymarket' | 'poly' | 'kalshi',
  marketId: string,
  params: FetchMarketTerminalParams = {}
): Promise<MarketTerminalResponse> {
  const {
    include_trades = true,
    include_orderbook = true,
    include_chart = true,
    trade_limit = 100,
    chart_days = 30,
  } = params;

  const queryParams: Record<string, string | number | boolean> = {
    include_trades,
    include_orderbook,
    include_chart,
    trade_limit,
    chart_days,
  };

  const response = await axios.get<MarketTerminalResponse>(
    `${API_BASE_URL}/api/market-test/market/${platform}/${marketId}`,
    { params: queryParams }
  );

  return response.data;
}

/**
 * Format timestamp to readable time
 */
export function formatTradeTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format trade size with appropriate suffix
 */
export function formatTradeSize(size: number): string {
  if (size >= 1_000_000) {
    return `${(size / 1_000_000).toFixed(2)}M`;
  }
  if (size >= 1_000) {
    return `${(size / 1_000).toFixed(1)}K`;
  }
  return size.toFixed(2);
}

/**
 * Get side color for trades
 */
export function getSideColor(side: string): 'success' | 'error' | 'default' {
  const s = side.toUpperCase();
  if (s === 'BUY' || s === 'YES') return 'success';
  if (s === 'SELL' || s === 'NO') return 'error';
  return 'default';
}

/**
 * Format orderbook depth for display
 */
export function formatDepth(depth: number): string {
  if (depth >= 1_000_000) {
    return `$${(depth / 1_000_000).toFixed(2)}M`;
  }
  if (depth >= 1_000) {
    return `$${(depth / 1_000).toFixed(1)}K`;
  }
  return `$${depth.toFixed(0)}`;
}

/**
 * Get imbalance color and direction
 */
export function getImbalanceInfo(imbalance: number): {
  color: 'success' | 'error' | 'inherit';
  direction: 'Bid Heavy' | 'Ask Heavy' | 'Balanced';
} {
  if (imbalance > 0.15) {
    return { color: 'success', direction: 'Bid Heavy' };
  }
  if (imbalance < -0.15) {
    return { color: 'error', direction: 'Ask Heavy' };
  }
  return { color: 'inherit', direction: 'Balanced' };
}

