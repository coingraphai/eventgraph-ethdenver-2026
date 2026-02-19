/**
 * Dome API Client
 * Connects to Dome API for aggregated prediction market data
 * https://docs.domeapi.io/
 */

const DOME_API_BASE = 'https://api.domeapi.io/v1';

// API Key should be set in environment variable
const getApiKey = (): string => {
  const key = import.meta.env.VITE_DOME_API_KEY;
  if (!key) {
    console.warn('DOME_API_KEY not set. Add VITE_DOME_API_KEY to your .env file');
  }
  return key || '';
};

interface DomeRequestOptions {
  limit?: number;
  offset?: number;
  status?: 'open' | 'closed' | 'all';
  category?: string;
}

// Polymarket market structure from Dome API
export interface PolymarketMarket {
  id: string;
  question: string;
  description?: string;
  outcomes: string[];
  outcomePrices: number[];
  volume: number;
  volume24h?: number;
  liquidity?: number;
  endDate?: string;
  category?: string;
  active: boolean;
  slug?: string;
  conditionId?: string;
}

// Kalshi market structure from Dome API
export interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle?: string;
  category?: string;
  status: string;
  yes_bid?: number;
  yes_ask?: number;
  no_bid?: number;
  no_ask?: number;
  last_price?: number;
  volume?: number;
  volume_24h?: number;
  open_interest?: number;
  end_time?: string;
  close_time?: string;
  result?: string;
}

interface DomeApiResponse<T> {
  data: T[];
  pagination?: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Make authenticated request to Dome API
 */
async function domeRequest<T>(
  endpoint: string,
  options: DomeRequestOptions = {}
): Promise<DomeApiResponse<T>> {
  const apiKey = getApiKey();
  
  const params = new URLSearchParams();
  if (options.limit) params.append('limit', options.limit.toString());
  if (options.offset) params.append('offset', options.offset.toString());
  if (options.status) params.append('status', options.status);
  if (options.category) params.append('category', options.category);

  const url = `${DOME_API_BASE}${endpoint}${params.toString() ? '?' + params.toString() : ''}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        throw new Error(`Rate limited. Retry after ${retryAfter || '60'} seconds`);
      }
      throw new Error(`Dome API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Dome API request failed: ${endpoint}`, error);
    throw error;
  }
}

/**
 * Fetch Polymarket markets from Dome API
 */
export async function fetchPolymarketMarkets(
  options: DomeRequestOptions = {}
): Promise<PolymarketMarket[]> {
  const defaultOptions: DomeRequestOptions = {
    limit: 50,
    offset: 0,
    status: 'open',
    ...options,
  };

  try {
    const response = await domeRequest<PolymarketMarket>(
      '/polymarket/markets',
      defaultOptions
    );
    return response.data || [];
  } catch (error) {
    console.error('Failed to fetch Polymarket markets:', error);
    return [];
  }
}

/**
 * Fetch Kalshi markets from Dome API
 */
export async function fetchKalshiMarkets(
  options: DomeRequestOptions = {}
): Promise<KalshiMarket[]> {
  const defaultOptions: DomeRequestOptions = {
    limit: 50,
    offset: 0,
    status: 'open',
    ...options,
  };

  try {
    const response = await domeRequest<KalshiMarket>(
      '/kalshi/markets',
      defaultOptions
    );
    return response.data || [];
  } catch (error) {
    console.error('Failed to fetch Kalshi markets:', error);
    return [];
  }
}

/**
 * Fetch all markets from all platforms in parallel
 */
export async function fetchAllMarkets(
  options: DomeRequestOptions = {}
): Promise<{
  polymarket: PolymarketMarket[];
  kalshi: KalshiMarket[];
}> {
  const [polymarket, kalshi] = await Promise.all([
    fetchPolymarketMarkets(options),
    fetchKalshiMarkets(options),
  ]);

  return { polymarket, kalshi };
}

/**
 * Check if Dome API is configured and accessible
 */
export async function checkDomeApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${DOME_API_BASE}/health`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export default {
  fetchPolymarketMarkets,
  fetchKalshiMarkets,
  fetchAllMarkets,
  checkDomeApiHealth,
};
