/**
 * useDataFreshness — polls /api/data-status every 60 s and returns
 * human-readable freshness info for the header badge.
 */

import { useState, useEffect, useCallback } from 'react';

// ---------- types ----------------------------------------------------------

export type FreshnessStatus = 'live' | 'stale' | 'delayed' | 'unknown';

export interface SourceFreshness {
  last_updated: string | null;
  age_seconds: number | null;
  age_text: string;
  market_count: number;
  status: FreshnessStatus;
}

export interface DataFreshnessResult {
  /** e.g. "3m ago", "just now", "2h ago" */
  ageText: string;
  /** Green / amber / red indicator */
  status: FreshnessStatus;
  /** Per-source breakdown for tooltip */
  sources: Record<string, SourceFreshness>;
  /** ISO8601 of the most-recent update across all sources */
  lastUpdated: string | null;
  /** True while the first fetch is in flight */
  loading: boolean;
}

// ---------- constants -------------------------------------------------------

const POLL_INTERVAL_MS = 60_000; // 1 minute
const API_URL = '/api/data-status';

// ---------- hook ------------------------------------------------------------

export function useDataFreshness(): DataFreshnessResult {
  const [data, setData] = useState<DataFreshnessResult>({
    ageText: '…',
    status: 'unknown',
    sources: {},
    lastUpdated: null,
    loading: true,
  });

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(API_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      setData({
        ageText:     json.overall_age_text ?? 'unknown',
        status:      json.status           ?? 'unknown',
        sources:     json.sources          ?? {},
        lastUpdated: json.overall_last_updated ?? null,
        loading:     false,
      });
    } catch {
      // Keep the last known state, just mark not-loading
      setData(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  return data;
}
