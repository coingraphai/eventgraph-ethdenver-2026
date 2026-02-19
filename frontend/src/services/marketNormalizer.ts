/**
 * Market Normalizer
 * Normalizes market data from different platforms into a unified shape
 */

import { PolymarketMarket, KalshiMarket } from './domeClient';

export type Platform = 'POLYMARKET' | 'KALSHI';

export interface UnifiedMarket {
  id: string;
  platform: Platform;
  title: string;
  category: string;
  yesPrice: number;        // Normalized 0-1
  noPrice: number;         // Normalized 0-1
  spread: number;          // Bid/ask spread
  change24h: number;       // Percentage change
  liquidity: number;       // USD
  volume24h: number;       // USD
  expiryTime: number | null; // Unix timestamp (seconds)
  expiryDays: number;      // Days until expiry
  arbitrageScore: number;  // 0-1, higher = more arb opportunity
  sourceUrl: string;
  hasArb: boolean;
  raw?: any;               // Original data for debugging
}

// Category mapping for normalization
const CATEGORY_MAPPING: Record<string, string> = {
  'politics': 'Politics',
  'political': 'Politics',
  'crypto': 'Crypto',
  'cryptocurrency': 'Crypto',
  'bitcoin': 'Crypto',
  'ethereum': 'Crypto',
  'sports': 'Sports',
  'nfl': 'Sports',
  'nba': 'Sports',
  'soccer': 'Sports',
  'football': 'Sports',
  'baseball': 'Sports',
  'entertainment': 'Entertainment',
  'culture': 'Entertainment',
  'science': 'Science',
  'tech': 'Technology',
  'technology': 'Technology',
  'finance': 'Finance',
  'economics': 'Finance',
  'weather': 'Weather',
  'climate': 'Weather',
};

/**
 * Normalize category string to standard categories
 */
function normalizeCategory(category?: string): string {
  if (!category) return 'Other';
  
  const lower = category.toLowerCase();
  
  for (const [key, value] of Object.entries(CATEGORY_MAPPING)) {
    if (lower.includes(key)) {
      return value;
    }
  }
  
  // Capitalize first letter if no mapping found
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
}

/**
 * Calculate days until expiry from timestamp
 */
function calculateExpiryDays(expiryTime: number | null): number {
  if (!expiryTime) return 365; // Default to 1 year if no expiry
  
  const now = Math.floor(Date.now() / 1000);
  const secondsRemaining = expiryTime - now;
  const daysRemaining = Math.ceil(secondsRemaining / (60 * 60 * 24));
  
  return Math.max(0, daysRemaining);
}

/**
 * Calculate arbitrage score based on price discrepancies
 * Higher score = more opportunity
 */
function calculateArbitrageScore(yesPrice: number, noPrice: number): number {
  // Perfect market: yesPrice + noPrice = 1
  // Arb opportunity exists when sum deviates from 1
  const sum = yesPrice + noPrice;
  const deviation = Math.abs(1 - sum);
  
  // Also consider spread
  const spread = Math.abs(yesPrice - (1 - noPrice));
  
  // Normalize to 0-1 score (higher = more arb)
  return Math.min(1, (deviation + spread) * 2);
}

/**
 * Generate a simulated 24h change (for demo purposes)
 * In production, this would come from historical data
 */
function generateChange24h(yesPrice: number): number {
  // Simulate realistic price changes between -15% and +15%
  const baseChange = (Math.random() - 0.5) * 30;
  // Higher priced markets tend to have smaller % changes
  const volatilityFactor = 1 - (Math.abs(yesPrice - 0.5) * 0.5);
  return parseFloat((baseChange * volatilityFactor).toFixed(1));
}

/**
 * Normalize Polymarket market to UnifiedMarket
 */
export function normalizePolymarketMarket(market: PolymarketMarket): UnifiedMarket {
  // Polymarket prices are already 0-1
  // outcomePrices[0] = YES, outcomePrices[1] = NO (typically)
  const yesPrice = market.outcomePrices?.[0] ?? 0.5;
  const noPrice = market.outcomePrices?.[1] ?? (1 - yesPrice);
  
  // Calculate spread (difference from perfect pricing)
  const spread = Math.abs(1 - (yesPrice + noPrice));
  
  // Parse expiry time
  let expiryTime: number | null = null;
  if (market.endDate) {
    expiryTime = Math.floor(new Date(market.endDate).getTime() / 1000);
  }
  
  const arbitrageScore = calculateArbitrageScore(yesPrice, noPrice);
  
  return {
    id: `poly_${market.id}`,
    platform: 'POLYMARKET',
    title: market.question,
    category: normalizeCategory(market.category),
    yesPrice,
    noPrice,
    spread,
    change24h: generateChange24h(yesPrice),
    liquidity: market.liquidity ?? market.volume * 0.3, // Estimate if not provided
    volume24h: market.volume24h ?? market.volume * 0.1, // Estimate if not provided
    expiryTime,
    expiryDays: calculateExpiryDays(expiryTime),
    arbitrageScore,
    hasArb: arbitrageScore > 0.02, // Flag if >2% arb opportunity
    // Use event_slug for Polymarket URL (falls back to slug or id)
    sourceUrl: `https://polymarket.com/event/${market.event_slug || market.slug || market.id}?ref=eventgraph`,
    raw: market,
  };
}

/**
 * Normalize Kalshi market to UnifiedMarket
 * Note: Kalshi prices are in cents (0-100), convert to 0-1
 */
export function normalizeKalshiMarket(market: KalshiMarket): UnifiedMarket {
  // Kalshi last_price is in cents (0-100), convert to 0-1
  const lastPrice = (market.last_price ?? 50) / 100;
  
  // Use bid/ask if available, otherwise derive from last price
  const yesPrice = market.yes_bid 
    ? (market.yes_bid + (market.yes_ask ?? market.yes_bid)) / 2 / 100
    : lastPrice;
  const noPrice = market.no_bid
    ? (market.no_bid + (market.no_ask ?? market.no_bid)) / 2 / 100
    : 1 - yesPrice;
  
  // Calculate bid-ask spread
  let spread = 0;
  if (market.yes_bid && market.yes_ask) {
    spread = (market.yes_ask - market.yes_bid) / 100;
  }
  
  // Parse expiry time
  let expiryTime: number | null = null;
  if (market.end_time) {
    expiryTime = Math.floor(new Date(market.end_time).getTime() / 1000);
  } else if (market.close_time) {
    expiryTime = Math.floor(new Date(market.close_time).getTime() / 1000);
  }
  
  const arbitrageScore = calculateArbitrageScore(yesPrice, noPrice);
  
  return {
    id: `kalshi_${market.ticker}`,
    platform: 'KALSHI',
    title: market.title,
    category: normalizeCategory(market.category),
    yesPrice,
    noPrice,
    spread,
    change24h: generateChange24h(yesPrice),
    liquidity: (market.open_interest ?? 0) * lastPrice * 100, // Estimate from open interest
    volume24h: market.volume_24h ?? market.volume ?? 0,
    expiryTime,
    expiryDays: calculateExpiryDays(expiryTime),
    arbitrageScore,
    hasArb: arbitrageScore > 0.02,
    sourceUrl: `https://kalshi.com/browse?search=${market.ticker}&ref=eventgraph`,
    raw: market,
  };
}

/**
 * Normalize and merge markets from all platforms
 */
export function normalizeAllMarkets(
  polymarketMarkets: PolymarketMarket[],
  kalshiMarkets: KalshiMarket[]
): UnifiedMarket[] {
  const normalizedPoly = polymarketMarkets.map(normalizePolymarketMarket);
  const normalizedKalshi = kalshiMarkets.map(normalizeKalshiMarket);
  
  return [...normalizedPoly, ...normalizedKalshi];
}

/**
 * Calculate market stats from unified markets
 */
export interface MarketStats {
  totalActiveMarkets: number;
  totalLiquidity: number;
  totalVolume24h: number;
  biggestMover: UnifiedMarket | null;
  highestVolume: UnifiedMarket | null;
  avgChange24h: number;
  volatilityIndex: number;
}

export function calculateMarketStats(markets: UnifiedMarket[]): MarketStats {
  if (markets.length === 0) {
    return {
      totalActiveMarkets: 0,
      totalLiquidity: 0,
      totalVolume24h: 0,
      biggestMover: null,
      highestVolume: null,
      avgChange24h: 0,
      volatilityIndex: 0,
    };
  }

  const totalLiquidity = markets.reduce((sum, m) => sum + m.liquidity, 0);
  const totalVolume24h = markets.reduce((sum, m) => sum + m.volume24h, 0);
  
  // Find biggest mover (highest absolute change)
  const biggestMover = markets.reduce((max, m) => 
    Math.abs(m.change24h) > Math.abs(max?.change24h ?? 0) ? m : max
  , markets[0]);
  
  // Find highest volume
  const highestVolume = markets.reduce((max, m) =>
    m.volume24h > (max?.volume24h ?? 0) ? m : max
  , markets[0]);
  
  // Calculate average change
  const avgChange24h = markets.reduce((sum, m) => sum + m.change24h, 0) / markets.length;
  
  // Calculate volatility index (standard deviation of changes)
  const variance = markets.reduce((sum, m) => 
    sum + Math.pow(m.change24h - avgChange24h, 2), 0
  ) / markets.length;
  const volatilityIndex = Math.sqrt(variance);
  
  return {
    totalActiveMarkets: markets.length,
    totalLiquidity,
    totalVolume24h,
    biggestMover,
    highestVolume,
    avgChange24h,
    volatilityIndex,
  };
}

export default {
  normalizePolymarketMarket,
  normalizeKalshiMarket,
  normalizeAllMarkets,
  calculateMarketStats,
};
