/**
 * Unified Events API Service
 * Pure DB-backed endpoints — no live API calls.
 * Groups silver.markets by event_slug (Polymarket) / event_ticker (Kalshi).
 * Limitless markets are standalone events.
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EventPlatform = 'all' | 'polymarket' | 'kalshi' | 'limitless';
export type EventSort =
  | 'volume_desc'
  | 'volume_24h_desc'
  | 'ending_soon'
  | 'newest'
  | 'market_count_desc';

export interface EventSummary {
  platform: string;       // 'polymarket' | 'kalshi' | 'limitless'
  event_id: string;       // event_slug / event_ticker / source_market_id
  title: string;
  image_url?: string | null;
  category?: string | null;
  market_count: number;
  total_volume: number;
  volume_24h: number;
  end_time?: number | null; // unix timestamp
  sample_titles: string[];  // first 3 market titles for tooltip/preview
}

export interface EventsListResponse {
  events: EventSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  platform_counts: Record<string, number>;
}

export interface MarketInEvent {
  market_id: string;
  title: string;
  yes_price?: number | null;
  no_price?: number | null;
  volume_total?: number | null;
  volume_24h?: number | null;
  end_time?: number | null;
  status: string;
  source_url?: string | null;
  image_url?: string | null;
  category?: string | null;
  price_change_pct_24h?: number | null;
  price_change_24h?: number | null;
  volume_change_pct_24h?: number | null;
  trade_count_24h?: number | null;
  unique_traders_24h?: number | null;
  ann_roi?: number | null;
}

export interface EventInsights {
  most_likely?: { market_id: string; title: string; yes_price: number } | null;
  highest_roi?: { market_id: string; title: string; ann_roi: number; yes_price: number } | null;
  most_active?: { market_id: string; title: string; volume_24h: number } | null;
  price_buckets: Record<string, number>;
  total_volume: number;
  volume_24h: number;
  avg_yes_price?: number | null;
  markets_with_price: number;
}

export interface EventDetailResponse {
  platform: string;
  event_id: string;
  title: string;
  image_url?: string | null;
  category?: string | null;
  market_count: number;
  total_volume: number;
  volume_24h: number;
  end_time?: number | null;
  markets: MarketInEvent[];
  insights: EventInsights;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

export interface FetchEventsParams {
  platform?: EventPlatform;
  category?: string;
  search?: string;
  sort?: EventSort;
  page?: number;
  pageSize?: number;
}

export async function fetchUnifiedEvents(params: FetchEventsParams = {}): Promise<EventsListResponse> {
  const {
    platform = 'all',
    category = 'all',
    search,
    sort = 'volume_desc',
    page = 1,
    pageSize = 24,
  } = params;

  const q = new URLSearchParams({
    platform,
    category,
    sort,
    page: String(page),
    page_size: String(pageSize),
  });
  if (search) q.set('search', search);

  const res = await fetch(`${API_BASE}/api/unified/events?${q}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchUnifiedEventDetail(
  platform: string,
  eventId: string,
): Promise<EventDetailResponse> {
  const res = await fetch(
    `${API_BASE}/api/unified/events/${encodeURIComponent(platform)}/${encodeURIComponent(eventId)}`,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Format utilities ─────────────────────────────────────────────────────────

export function fmtVolume(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '—';
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function fmtTimeRemaining(ts: number | null | undefined): string {
  if (!ts) return '—';
  const diff = ts * 1000 - Date.now();
  if (diff <= 0) return 'Ended';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  if (d > 30) return `${Math.floor(d / 7)}w`;
  if (d > 0)  return `${d}d ${h}h`;
  return `${h}h`;
}

export const PLATFORM_DISPLAY: Record<string, string> = {
  polymarket: 'Polymarket',
  kalshi:     'Kalshi',
  limitless:  'Limitless',
};
