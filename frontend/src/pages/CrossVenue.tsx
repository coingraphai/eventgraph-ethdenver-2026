/**
 * CrossVenue — one matched pair per item (table or grid)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Paper, Typography, Stack, Chip, alpha, useTheme,
  IconButton, Button, Tooltip, TextField, InputAdornment,
  FormControl, InputLabel, Select, MenuItem, LinearProgress,
  ToggleButtonGroup, ToggleButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel,
} from '@mui/material';
import {
  Refresh, OpenInNew, Search, CompareArrows, ViewList, ViewModule,
} from '@mui/icons-material';
import { keyframes } from '@mui/system';
import { PLATFORM_COLORS, TRADING_COLORS } from '../utils/colors';

const API_BASE = import.meta.env.VITE_API_URL || '';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 1; transform: translateY(0); }
`;
const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
`;

const POLY = PLATFORM_COLORS.polymarket;
const KAL  = PLATFORM_COLORS.kalshi;

// ── Types ─────────────────────────────────────────────────────────────────────
interface DbMarket {
  market_id: string;
  title: string;
  yes_price: number | null;
  no_price: number | null;
  volume: number;
  url: string | null;
}
interface DbPlatformEvent {
  event_id: string;
  title: string;
  url: string;
  total_volume: number;
  market_count: number;
  end_date: number | null;
  category: string | null;
  image_url: string | null;
  markets: DbMarket[];
}
interface DbCrossVenueEvent {
  canonical_title: string;
  similarity_score: number;
  match_confidence: string;
  polymarket: DbPlatformEvent;
  kalshi: DbPlatformEvent;
  total_volume: number;
  volume_difference: number;
  volume_ratio: number;
  market_count_diff: number;
  end_date_match: boolean;
  price_spread: number | null;
}
interface DbCrossVenueStats {
  total_matches: number;
  high_confidence: number;
  medium_confidence: number;
  avg_similarity: number;
  total_volume: number;
  polymarket_events: number;
  kalshi_events: number;
  query_ms: number;
}
interface MatchedPair {
  poly: DbMarket | null;
  kalshi: DbMarket | null;
  matchScore: number;
  type: 'matched' | 'poly-only' | 'kalshi-only';
}

/** Flat unit — one matched pair with its event context */
interface FlatPair {
  id: string;
  eventTitle: string;
  confidence: string;
  similarity: number;
  endDate: number | null;
  category: string | null;
  poly: DbMarket;
  kalshi: DbMarket;
  polyEventUrl: string;
  kalEventUrl: string;
  spread: number; // cents, absolute YES diff
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtVol = (v: number) =>
  v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v}`;

const fmtCents = (p: number | null) =>
  p == null ? '–' : `${(p * 100).toFixed(1)}¢`;

const fmtDate = (ts: number | null) =>
  ts
    ? new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
    : null;

function confColor(c: string): string {
  return c === 'high' ? '#22c55e' : c === 'medium' ? '#f59e0b' : '#6b7280';
}

function spreadColor(s: number, fallback: string): string {
  return s >= 10 ? '#22c55e' : s >= 4 ? '#f59e0b' : fallback;
}

// ── Market matching ───────────────────────────────────────────────────────────
const STOP = new Set([
  'will','who','can','be','the','a','an','in','of','to','at','win','wins','winning','won',
  'nominated','nomination','nominate','nominee','democratic','republican','presidential',
  'president','election','2024','2025','2026','2027','2028','2029','2030','next','for',
  'on','by','what','when','where','with','from','its','their','this','if','do','does',
  'and','or','not','is','are','was','were','has','have','had','as','so','up','it',
]);
function keyTerms(t: string): Set<string> {
  return new Set(
    t.toLowerCase().replace(/[?.,!'"]/g, '').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w))
  );
}
function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  a.forEach(w => b.has(w) && inter++);
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}
function matchMarkets(poly: DbMarket[], kal: DbMarket[]): MatchedPair[] {
  const matched: MatchedPair[] = [];
  const used = new Set<number>();
  for (const pm of poly) {
    const pt = keyTerms(pm.title);
    let bi = -1, bs = 0;
    kal.forEach((km, i) => {
      if (used.has(i)) return;
      const s = jaccard(pt, keyTerms(km.title));
      if (s > bs && s > 0.15) { bs = s; bi = i; }
    });
    if (bi >= 0) {
      used.add(bi);
      matched.push({ poly: pm, kalshi: kal[bi], matchScore: bs, type: 'matched' });
    }
  }
  return matched;
}

// ── GapBox ────────────────────────────────────────────────────────────────────
const GapBox: React.FC<{ spread: number; size?: 'sm' | 'md' }> = ({ spread, size = 'md' }) => {
  const theme = useTheme();
  const sc = spreadColor(spread, theme.palette.text.secondary as string);
  const hasSig = spread > 0.5;
  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      px: size === 'sm' ? 0.6 : 0.75,
      py: size === 'sm' ? 0.4 : 0.5,
      borderRadius: 1.25,
      minWidth: size === 'sm' ? 46 : 56,
      backgroundColor: hasSig ? alpha(sc, 0.1) : alpha(theme.palette.divider, 0.08),
      border: hasSig ? `1.5px solid ${alpha(sc, 0.35)}` : `1px solid ${alpha(theme.palette.divider, 0.18)}`,
    }}>
      <Typography sx={{
        fontSize: size === 'sm' ? '0.44rem' : '0.48rem',
        fontWeight: 800, letterSpacing: 0.8, lineHeight: 1,
        color: hasSig ? alpha(sc, 0.65) : 'text.disabled',
        textTransform: 'uppercase',
      }}>GAP</Typography>
      <Typography sx={{
        fontSize: size === 'sm' ? '0.82rem' : '0.95rem',
        fontWeight: 800, lineHeight: 1.15,
        color: hasSig ? sc : 'text.disabled',
      }}>
        {spread > 0 ? `${spread.toFixed(1)}¢` : '–'}
      </Typography>
    </Box>
  );
};

// ── PricePill ─────────────────────────────────────────────────────────────────
const PricePill: React.FC<{ yes: number | null; no?: number | null; size?: 'sm' | 'md' }> = ({
  yes, no, size = 'md',
}) => (
  <Stack direction="row" spacing={0.4}>
    {yes != null && (
      <Chip label={`YES ${fmtCents(yes)}`} size="small" sx={{
        height: size === 'sm' ? 20 : 24,
        fontSize: size === 'sm' ? '0.67rem' : '0.73rem',
        fontWeight: 700,
        color: TRADING_COLORS.YES,
        backgroundColor: alpha(TRADING_COLORS.YES, 0.12),
        border: `1px solid ${alpha(TRADING_COLORS.YES, 0.28)}`,
      }} />
    )}
    {no != null && (
      <Chip label={`NO ${fmtCents(no)}`} size="small" sx={{
        height: size === 'sm' ? 20 : 24,
        fontSize: size === 'sm' ? '0.67rem' : '0.73rem',
        fontWeight: 700,
        color: TRADING_COLORS.NO,
        backgroundColor: alpha(TRADING_COLORS.NO, 0.1),
        border: `1px solid ${alpha(TRADING_COLORS.NO, 0.2)}`,
      }} />
    )}
  </Stack>
);

// ── VolPill ───────────────────────────────────────────────────────────────────
const VolPill: React.FC<{ vol: number; color: string }> = ({ vol, color }) =>
  vol > 0 ? (
    <Box sx={{
      display: 'inline-block',
      px: 0.65, py: 0.1, borderRadius: 0.75,
      backgroundColor: alpha(color, 0.07),
    }}>
      <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: 'text.secondary', lineHeight: 1.2 }}>
        {fmtVol(vol)}
      </Typography>
    </Box>
  ) : null;

// ── PairGridCard ──────────────────────────────────────────────────────────────
const PairGridCard: React.FC<{ pair: FlatPair; index: number }> = ({ pair, index }) => {
  const theme = useTheme();
  const sc = spreadColor(pair.spread, theme.palette.text.disabled as string);

  return (
    <Paper elevation={0} sx={{
      borderRadius: 2, overflow: 'hidden',
      border: `1px solid ${alpha(pair.spread >= 4 ? sc : theme.palette.divider, pair.spread >= 4 ? 0.35 : 0.12)}`,
      backgroundColor: alpha(theme.palette.background.paper, 0.85),
      display: 'flex', flexDirection: 'column',
      animation: `${fadeIn} 0.2s ease both`,
      animationDelay: `${Math.min(index * 18, 200)}ms`,
      transition: 'transform 0.15s, box-shadow 0.15s',
      '&:hover': {
        transform: 'translateY(-2px)',
        boxShadow: `0 6px 20px ${alpha(pair.spread >= 4 ? sc : theme.palette.primary.main, 0.12)}`,
      },
    }}>
      {/* Top bar: Poly | Kal colour split */}
      <Box sx={{ height: 3, display: 'flex' }}>
        <Box sx={{ flex: 1, backgroundColor: POLY.primary, opacity: 0.8 }} />
        <Box sx={{ flex: 1, backgroundColor: KAL.primary, opacity: 0.8 }} />
      </Box>

      {/* Event name */}
      <Box sx={{
        px: 1.5, pt: 1, pb: 0.6,
        backgroundColor: alpha(theme.palette.background.default, 0.4),
        borderBottom: `1px solid ${alpha(theme.palette.divider, 0.07)}`,
      }}>
        <Typography sx={{
          fontSize: '0.7rem', fontWeight: 600, lineHeight: 1.3,
          color: 'text.secondary',
          display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {pair.eventTitle}
        </Typography>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.3 }}>
          <Chip label={pair.confidence.toUpperCase()} size="small" sx={{
            height: 14, fontSize: '0.55rem', fontWeight: 700,
            color: confColor(pair.confidence),
            backgroundColor: alpha(confColor(pair.confidence), 0.1),
          }} />
          {pair.endDate && (
            <Typography variant="caption" sx={{ fontSize: '0.55rem', color: 'text.disabled' }}>
              {fmtDate(pair.endDate)}
            </Typography>
          )}
        </Stack>
      </Box>

      {/* Main: Poly | GAP | Kalshi */}
      <Box sx={{
        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
        gap: 0.75, px: 1.25, py: 1.25, alignItems: 'start',
        flex: 1,
      }}>
        {/* Polymarket side */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, mb: 0.5 }}>
            <Chip label="POLY" size="small" sx={{
              height: 15, fontSize: '0.56rem', fontWeight: 800,
              color: POLY.primary, backgroundColor: POLY.bg,
            }} />
            {pair.poly.url && (
              <IconButton size="small" component="a" href={pair.poly.url} target="_blank"
                sx={{ p: 0, opacity: 0.3, '&:hover': { opacity: 1 } }}>
                <OpenInNew sx={{ fontSize: 9 }} />
              </IconButton>
            )}
          </Box>
          <Tooltip title={pair.poly.title}>
            <Typography sx={{
              fontSize: '0.7rem', fontWeight: 500, lineHeight: 1.3, mb: 0.6,
              display: '-webkit-box', WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical', overflow: 'hidden', color: 'text.primary',
            }}>
              {pair.poly.title}
            </Typography>
          </Tooltip>
          <PricePill yes={pair.poly.yes_price} no={pair.poly.no_price} size="sm" />
          <Box sx={{ mt: 0.5 }}>
            <VolPill vol={pair.poly.volume} color={POLY.primary} />
          </Box>
        </Box>

        {/* Gap */}
        <Box sx={{ pt: 1.5 }}>
          <GapBox spread={pair.spread} size="sm" />
        </Box>

        {/* Kalshi side */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, mb: 0.5 }}>
            {pair.kalshi.url && (
              <IconButton size="small" component="a" href={pair.kalshi.url} target="_blank"
                sx={{ p: 0, opacity: 0.3, '&:hover': { opacity: 1 } }}>
                <OpenInNew sx={{ fontSize: 9 }} />
              </IconButton>
            )}
            <Chip label="KAL" size="small" sx={{
              height: 15, fontSize: '0.56rem', fontWeight: 800,
              color: KAL.primary, backgroundColor: KAL.bg,
            }} />
          </Box>
          <Tooltip title={pair.kalshi.title}>
            <Typography sx={{
              fontSize: '0.7rem', fontWeight: 500, lineHeight: 1.3, mb: 0.6, textAlign: 'right',
              display: '-webkit-box', WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical', overflow: 'hidden', color: 'text.primary',
            }}>
              {pair.kalshi.title}
            </Typography>
          </Tooltip>
          <PricePill yes={pair.kalshi.yes_price} no={pair.kalshi.no_price} size="sm" />
          <Box sx={{ mt: 0.5, display: 'flex', justifyContent: 'flex-end' }}>
            <VolPill vol={pair.kalshi.volume} color={KAL.primary} />
          </Box>
        </Box>
      </Box>
    </Paper>
  );
};

// ── PairTableRow ──────────────────────────────────────────────────────────────
const tcSx = {
  py: 1, px: 1.5,
  fontSize: '0.75rem',
  borderBottom: 'inherit',
};

const PairTableRow: React.FC<{ pair: FlatPair; idx: number }> = ({ pair, idx }) => {
  const theme = useTheme();
  const sc = spreadColor(pair.spread, theme.palette.text.disabled as string);
  const hasSig = pair.spread >= 4;

  return (
    <TableRow sx={{
      backgroundColor: idx % 2 === 0 ? 'transparent' : alpha(theme.palette.background.default, 0.3),
      '&:hover': { backgroundColor: alpha(theme.palette.action.hover, 0.5) },
      borderLeft: hasSig ? `3px solid ${alpha(sc, 0.7)}` : '3px solid transparent',
    }}>
      {/* Event — with right border divider */}
      <TableCell sx={{
        ...tcSx, maxWidth: 170,
        borderRight: `2px solid ${theme.palette.divider}`,
        backgroundColor: 'inherit',
      }}>
        <Tooltip title={pair.eventTitle}>
          <Typography sx={{
            fontSize: '0.72rem', fontWeight: 700, lineHeight: 1.3, color: 'text.primary',
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {pair.eventTitle}
          </Typography>
        </Tooltip>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.4, flexWrap: 'wrap' }} useFlexGap>
          <Chip label={pair.confidence.toUpperCase()} size="small" sx={{
            height: 13, fontSize: '0.52rem', fontWeight: 700,
            color: confColor(pair.confidence),
            backgroundColor: alpha(confColor(pair.confidence), 0.1),
          }} />
          {pair.category && (
            <Chip label={pair.category} size="small" sx={{
              height: 13, fontSize: '0.50rem', fontWeight: 600,
              color: 'text.secondary',
              backgroundColor: alpha(theme.palette.divider, 0.15),
            }} />
          )}
          {pair.endDate && (
            <Typography sx={{ fontSize: '0.58rem', color: 'text.disabled' }}>
              {fmtDate(pair.endDate)}
            </Typography>
          )}
        </Stack>
      </TableCell>

      {/* Polymarket question + prices */}
      <TableCell sx={{ ...tcSx, maxWidth: 220 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, mb: 0.4 }}>
          <Chip label="POLY" size="small" sx={{
            height: 14, fontSize: '0.55rem', fontWeight: 800,
            color: POLY.primary, backgroundColor: POLY.bg, flexShrink: 0,
          }} />
          {pair.poly.url && (
            <IconButton size="small" component="a" href={pair.poly.url} target="_blank"
              sx={{ p: 0, opacity: 0.3, '&:hover': { opacity: 1 } }}>
              <OpenInNew sx={{ fontSize: 9 }} />
            </IconButton>
          )}
          <VolPill vol={pair.poly.volume} color={POLY.primary} />
        </Box>
        <Tooltip title={pair.poly.title}>
          <Typography sx={{
            fontSize: '0.72rem', fontWeight: 500, lineHeight: 1.3, mb: 0.4, color: 'text.primary',
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {pair.poly.title}
          </Typography>
        </Tooltip>
        <PricePill yes={pair.poly.yes_price} no={pair.poly.no_price} size="sm" />
      </TableCell>

      {/* GAP */}
      <TableCell sx={{ ...tcSx, textAlign: 'center', px: 0.75 }}>
        <GapBox spread={pair.spread} size="sm" />
      </TableCell>

      {/* Kalshi question + prices */}
      <TableCell sx={{ ...tcSx, maxWidth: 220 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, mb: 0.4 }}>
          <Chip label="KAL" size="small" sx={{
            height: 14, fontSize: '0.55rem', fontWeight: 800,
            color: KAL.primary, backgroundColor: KAL.bg, flexShrink: 0,
          }} />
          {pair.kalshi.url && (
            <IconButton size="small" component="a" href={pair.kalshi.url} target="_blank"
              sx={{ p: 0, opacity: 0.3, '&:hover': { opacity: 1 } }}>
              <OpenInNew sx={{ fontSize: 9 }} />
            </IconButton>
          )}
          <VolPill vol={pair.kalshi.volume} color={KAL.primary} />
        </Box>
        <Tooltip title={pair.kalshi.title}>
          <Typography sx={{
            fontSize: '0.72rem', fontWeight: 500, lineHeight: 1.3, mb: 0.4, color: 'text.primary',
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {pair.kalshi.title}
          </Typography>
        </Tooltip>
        <PricePill yes={pair.kalshi.yes_price} no={pair.kalshi.no_price} size="sm" />
      </TableCell>

      {/* Combined Volume */}
      <TableCell sx={{ ...tcSx, textAlign: 'center', px: 1 }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary' }}>
          {fmtVol(pair.poly.volume + pair.kalshi.volume)}
        </Typography>
      </TableCell>
    </TableRow>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
export const CrossVenue: React.FC = () => {
  const theme = useTheme();

  const [events,  setEvents]  = useState<DbCrossVenueEvent[]>([]);
  const [stats,   setStats]   = useState<DbCrossVenueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [search,      setSearch]      = useState('');
  const [sortBy,      setSortBy]      = useState<'gap' | 'volume' | 'similarity'>('gap');
  const [displayMode, setDisplayMode] = useState<'table' | 'grid'>('table');
  const [confFilter,  setConfFilter]  = useState<'all' | 'high' | 'high+medium'>('high+medium');

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/cross-venue-events-db?min_similarity=0.25&min_volume=0&limit=200`
      );
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setEvents(data.events ?? []);
      setStats(data.stats ?? null);
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 120_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  /** Flatten all events → one FlatPair per matched market pair */
  const allPairs = useMemo<FlatPair[]>(() => {
    const pairs: FlatPair[] = [];
    for (const ev of events) {
      const matched = matchMarkets(ev.polymarket.markets, ev.kalshi.markets);
      for (const mp of matched) {
        if (!mp.poly || !mp.kalshi) continue;
        const spread =
          mp.poly.yes_price != null && mp.kalshi.yes_price != null
            ? Math.abs(mp.poly.yes_price - mp.kalshi.yes_price) * 100
            : 0;
        pairs.push({
          id: `${mp.poly.market_id}-${mp.kalshi.market_id}`,
          // polymarket.title is slug-derived (e.g. "Who Will Trump Nominate As Fed Chair")
          // canonical_title wrongly picks a Kalshi market question when it is longer
          eventTitle: ev.polymarket.title || ev.canonical_title,
          confidence: ev.match_confidence,
          similarity: ev.similarity_score,
          endDate: ev.polymarket.end_date,
          category: ev.polymarket.category,
          poly: mp.poly,
          kalshi: mp.kalshi,
          polyEventUrl: ev.polymarket.url,
          kalEventUrl: ev.kalshi.url,
          spread,
        });
      }
    }
    return pairs;
  }, [events]);

  const filtered = useMemo<FlatPair[]>(() => {
    let out = allPairs;

    // Confidence filter — hide low-confidence matches by default
    if (confFilter === 'high') {
      out = out.filter(p => p.confidence === 'high');
    } else if (confFilter === 'high+medium') {
      out = out.filter(p => p.confidence === 'high' || p.confidence === 'medium');
    }

    if (search) {
      const q = search.toLowerCase();
      out = out.filter(p =>
        p.eventTitle.toLowerCase().includes(q) ||
        p.poly.title.toLowerCase().includes(q) ||
        p.kalshi.title.toLowerCase().includes(q)
      );
    }
    const sorted = [...out];
    sorted.sort((a, b) =>
      sortBy === 'volume'
        ? (b.poly.volume + b.kalshi.volume) - (a.poly.volume + a.kalshi.volume)
        : sortBy === 'similarity'
        ? b.similarity - a.similarity
        : b.spread - a.spread  // gap desc (default)
    );
    return sorted;
  }, [allPairs, search, sortBy, confFilter]);

  return (
    <Box sx={{ p: 3, minHeight: '100vh' }}>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
            <CompareArrows sx={{ color: 'primary.main' }} />
            Cross-Venue
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Polymarket ↔ Kalshi · matched market pairs across venues
          </Typography>
        </Box>
        <Button
          variant="outlined" size="small"
          startIcon={<Refresh sx={{ animation: loading ? `${pulse} 1s infinite` : 'none', fontSize: 15 }} />}
          onClick={fetchData} disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {/* Filter bar */}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small" placeholder="Search…" value={search}
          onChange={e => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: 15, color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 200 }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Sort by</InputLabel>
          <Select value={sortBy} label="Sort by" onChange={e => setSortBy(e.target.value as any)}>
            <MenuItem value="gap">Gap (largest first)</MenuItem>
            <MenuItem value="volume">Combined Volume</MenuItem>
            <MenuItem value="similarity">Match Similarity</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Confidence</InputLabel>
          <Select value={confFilter} label="Confidence" onChange={e => setConfFilter(e.target.value as any)}>
            <MenuItem value="high">High only</MenuItem>
            <MenuItem value="high+medium">High + Medium</MenuItem>
            <MenuItem value="all">All matches</MenuItem>
          </Select>
        </FormControl>

        <ToggleButtonGroup
          value={displayMode} exclusive
          onChange={(_, val) => val && setDisplayMode(val)}
          size="small"
        >
          <ToggleButton value="table">
            <Tooltip title="Table view"><ViewList sx={{ fontSize: 18 }} /></Tooltip>
          </ToggleButton>
          <ToggleButton value="grid">
            <Tooltip title="Grid view"><ViewModule sx={{ fontSize: 18 }} /></Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        {!loading && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
              {filtered.length} pair{filtered.length !== 1 ? 's' : ''}
            </Typography>
            {stats && (
              <>
                <Chip label={`${stats.high_confidence} high`} size="small" sx={{
                  height: 16, fontSize: '0.55rem', fontWeight: 700,
                  color: '#22c55e', backgroundColor: alpha('#22c55e', 0.1),
                }} />
                <Chip label={`${stats.medium_confidence} med`} size="small" sx={{
                  height: 16, fontSize: '0.55rem', fontWeight: 700,
                  color: '#f59e0b', backgroundColor: alpha('#f59e0b', 0.1),
                }} />
              </>
            )}
          </Stack>
        )}
      </Box>

      {/* Loading */}
      {loading && <LinearProgress sx={{ borderRadius: 1, height: 2, mb: 2 }} />}

      {/* Error */}
      {error && (
        <Paper elevation={0} sx={{ p: 2.5, mb: 2, borderRadius: 2, border: `1px solid ${alpha(theme.palette.error.main, 0.3)}` }}>
          <Typography color="error" fontWeight={600}>{error}</Typography>
          <Button onClick={fetchData} size="small" sx={{ mt: 1 }}>Retry</Button>
        </Paper>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <CompareArrows sx={{ fontSize: 44, color: 'text.disabled', mb: 1.5 }} />
          <Typography variant="h6" color="text.secondary">No pairs found</Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>Try a different search</Typography>
        </Box>
      )}

      {/* ── TABLE VIEW ── */}
      {!loading && filtered.length > 0 && displayMode === 'table' && (
        <Paper elevation={0} sx={{
          borderRadius: 2, overflow: 'hidden',
          border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        }}>
          <TableContainer>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{
                    fontWeight: 700, fontSize: '0.68rem', py: 1, px: 1.5,
                    backgroundColor: alpha(theme.palette.background.default, 0.95),
                    borderRight: `2px solid ${alpha(theme.palette.divider, 0.18)}`,
                    color: 'text.secondary',
                  }}>
                    Event
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.68rem', py: 1, px: 1.5, backgroundColor: alpha(theme.palette.background.default, 0.95) }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Chip label="POLY" size="small" sx={{ height: 14, fontSize: '0.55rem', fontWeight: 800, color: POLY.primary, backgroundColor: POLY.bg }} />
                      Market · Odds
                    </Box>
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.68rem', py: 1, px: 0.75, backgroundColor: alpha(theme.palette.background.default, 0.95) }}>
                    <TableSortLabel
                      active={sortBy === 'gap'}
                      direction="desc"
                      onClick={() => setSortBy('gap')}
                    >
                      Gap
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.68rem', py: 1, px: 1.5, backgroundColor: alpha(theme.palette.background.default, 0.95) }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Chip label="KAL" size="small" sx={{ height: 14, fontSize: '0.55rem', fontWeight: 800, color: KAL.primary, backgroundColor: KAL.bg }} />
                      Market · Odds
                    </Box>
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.68rem', py: 1, px: 1, backgroundColor: alpha(theme.palette.background.default, 0.95) }}>
                    <TableSortLabel
                      active={sortBy === 'volume'}
                      direction="desc"
                      onClick={() => setSortBy('volume')}
                    >
                      Volume
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((pair, i) => (
                  <PairTableRow key={pair.id} pair={pair} idx={i} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* ── GRID VIEW ── */}
      {!loading && filtered.length > 0 && displayMode === 'grid' && (
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
          gap: 2,
        }}>
          {filtered.map((pair, i) => (
            <PairGridCard key={pair.id} pair={pair} index={i} />
          ))}
        </Box>
      )}

    </Box>
  );
};

export default CrossVenue;
