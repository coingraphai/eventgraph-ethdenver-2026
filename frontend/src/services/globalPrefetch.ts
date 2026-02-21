/**
 * Global Data Prefetch Service
 * 
 * This service implements the same pattern used by Bloomberg, CoinGecko, and other
 * analytics platforms - preload all essential data when the app first loads.
 * 
 * Strategy:
 * 1. On app load, immediately start fetching critical data
 * 2. Store in memory cache for instant access
 * 3. Pages check cache first, fetch only if missing
 * 4. Background refresh keeps data fresh
 */

import { fetchEvents, Event, EventsResponse } from './eventsApi';
import { fetchEventAnalytics, EnhancedEventResponse } from './eventAnalyticsApi';

// In-memory cache for instant access
interface GlobalCache {
  events: {
    polymarket: EventsResponse | null;
    kalshi: EventsResponse | null;
    limitless: EventsResponse | null;
    all: EventsResponse | null;
    lastUpdated: number;
  };
  eventAnalytics: Map<string, EnhancedEventResponse>;
  isInitialized: boolean;
  isLoading: boolean;
}

const cache: GlobalCache = {
  events: {
    polymarket: null,
    kalshi: null,
    limitless: null,
    all: null,
    lastUpdated: 0,
  },
  eventAnalytics: new Map(),
  isInitialized: false,
  isLoading: false,
};

// Cache TTL (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

// Number of top events to prefetch analytics for
const TOP_EVENTS_TO_PREFETCH = 10;

// Listeners for cache updates
type CacheListener = () => void;
const listeners: Set<CacheListener> = new Set();

export function subscribeToCacheUpdates(listener: CacheListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners() {
  listeners.forEach(listener => listener());
}

/**
 * Check if cache is fresh
 */
function isCacheFresh(): boolean {
  return Date.now() - cache.events.lastUpdated < CACHE_TTL;
}

/**
 * Get cached events (returns null if not available)
 */
export function getCachedEvents(platform: 'polymarket' | 'kalshi' | 'limitless' | 'all' = 'all'): EventsResponse | null {
  return cache.events[platform];
}

/**
 * Get cached event analytics
 */
export function getCachedEventAnalytics(platform: string, eventId: string): EnhancedEventResponse | null {
  const key = `${platform}:${eventId}`;
  return cache.eventAnalytics.get(key) || null;
}

/**
 * Store event analytics in cache
 */
export function setCachedEventAnalytics(platform: string, eventId: string, data: EnhancedEventResponse): void {
  const key = `${platform}:${eventId}`;
  cache.eventAnalytics.set(key, data);
  notifyListeners();
}

/**
 * Check if global prefetch is initialized
 */
export function isPrefetchInitialized(): boolean {
  return cache.isInitialized;
}

/**
 * Check if global prefetch is currently loading
 */
export function isPrefetchLoading(): boolean {
  return cache.isLoading;
}

/**
 * Initialize global data prefetch
 * Call this once when the app loads
 */
export async function initializeGlobalPrefetch(): Promise<void> {
  if (cache.isInitialized || cache.isLoading) {
    return;
  }

  cache.isLoading = true;
  console.log('🚀 [GlobalPrefetch] Starting global data prefetch...');

  try {
    // Step 1: Fetch events list (this warms the backend cache too)
    const eventsPromise = fetchEventsWithRetry();
    
    // Wait for events first
    const eventsData = await eventsPromise;
    
    if (eventsData) {
      cache.events.all = eventsData;
      cache.events.lastUpdated = Date.now();
      cache.isInitialized = true;
      notifyListeners();
      
      console.log(`✅ [GlobalPrefetch] Events loaded: ${eventsData.total} events`);
      
      // Step 2: Prefetch analytics for top events (in background, don't await)
      prefetchTopEventAnalytics(eventsData.events.slice(0, TOP_EVENTS_TO_PREFETCH));
    }
  } catch (error) {
    console.error('❌ [GlobalPrefetch] Failed to initialize:', error);
  } finally {
    cache.isLoading = false;
  }
}

/**
 * Fetch events with retry logic
 */
async function fetchEventsWithRetry(maxRetries = 5): Promise<EventsResponse | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📡 [GlobalPrefetch] Fetching events (attempt ${attempt}/${maxRetries})...`);
      
      const response = await fetchEvents({
        platform: 'all',
        category: 'all',
        page: 1,
        pageSize: 100, // Fetch more for prefetch
        status: 'open',
      });
      
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // If cache is warming up, wait and retry
      if (errorMessage.includes('warming up') || errorMessage.includes('503')) {
        console.log(`⏳ [GlobalPrefetch] Backend cache warming up, retrying in 3s...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
      
      // Other errors, log and retry
      console.warn(`⚠️ [GlobalPrefetch] Attempt ${attempt} failed:`, errorMessage);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  return null;
}

/**
 * Prefetch analytics for top events (background, non-blocking)
 */
async function prefetchTopEventAnalytics(events: Event[]): Promise<void> {
  console.log(`📊 [GlobalPrefetch] Prefetching analytics for top ${events.length} events...`);
  
  // Prefetch in parallel but with concurrency limit
  const CONCURRENCY = 3;
  
  // Only prefetch Polymarket events - other platforms may not be in DB yet
  const polymarketEvents = events.filter(e => e.platform === 'polymarket');
  
  for (let i = 0; i < polymarketEvents.length; i += CONCURRENCY) {
    const batch = polymarketEvents.slice(i, i + CONCURRENCY);
    
    await Promise.allSettled(
      batch.map(async (event) => {
        const platformCode = 'poly'; // Only prefetch polymarket
        const cacheKey = `${platformCode}:${event.event_id}`;
        
        // Skip if already cached
        if (cache.eventAnalytics.has(cacheKey)) {
          return;
        }
        
        try {
          const analytics = await fetchEventAnalytics(platformCode, event.event_id, {
            includeTrades: true,
            maxMarkets: 50, // Smaller for prefetch
          });
          
          cache.eventAnalytics.set(cacheKey, analytics);
          console.log(`✅ [GlobalPrefetch] Cached analytics for: ${event.title.slice(0, 40)}...`);
        } catch (error) {
          // Silent fail for prefetch - user hasn't requested this yet
          console.debug(`[GlobalPrefetch] Failed to prefetch ${event.event_id}`);
        }
      })
    );
  }
  
  notifyListeners();
  console.log(`✅ [GlobalPrefetch] Prefetch complete! ${cache.eventAnalytics.size} event analytics cached`);
}

/**
 * Refresh cache in background
 */
export async function refreshCache(): Promise<void> {
  if (!isCacheFresh()) {
    console.log('🔄 [GlobalPrefetch] Refreshing stale cache...');
    cache.isInitialized = false;
    await initializeGlobalPrefetch();
  }
}

/**
 * Get cache stats for debugging
 */
export function getCacheStats() {
  return {
    isInitialized: cache.isInitialized,
    isLoading: cache.isLoading,
    eventsCount: cache.events.all?.total || 0,
    analyticsCount: cache.eventAnalytics.size,
    lastUpdated: cache.events.lastUpdated,
    isFresh: isCacheFresh(),
  };
}
