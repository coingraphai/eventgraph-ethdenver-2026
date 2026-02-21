/**
 * Events Page — Pure DB implementation
 * Groups silver.markets by event_slug (Polymarket) / event_ticker (Kalshi).
 * Limitless markets are standalone events.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Stack, Chip, IconButton, Button,
  TextField, InputAdornment, Tooltip, Pagination, Skeleton,
  ToggleButtonGroup, ToggleButton, Select, MenuItem, FormControl,
  useTheme, alpha,
} from '@mui/material';
import {
  Search, ViewModule, ViewList, AccessTime, TrendingUp, Refresh, OpenInNew,
} from '@mui/icons-material';
import { keyframes } from '@mui/system';
import {
  fetchUnifiedEvents,
  EventSummary,
  EventPlatform,
  EventSort,
  fmtVolume,
  fmtTimeRemaining,
  PLATFORM_DISPLAY,
} from '../services/unifiedEventsApi';
import { PLATFORM_COLORS } from '../utils/colors';

// ─── animations ───────────────────────────────────────────────────────────────
const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// ─── constants ────────────────────────────────────────────────────────────────
const PLATFORM_TABS: { value: EventPlatform; label: string }[] = [
  { value: 'all',        label: 'ALL' },
  { value: 'polymarket', label: 'POLYMARKET' },
  { value: 'kalshi',     label: 'KALSHI' },
  { value: 'limitless',  label: 'LIMITLESS' },
];

const SORT_OPTIONS: { value: EventSort; label: string }[] = [
  { value: 'volume_desc',       label: '📊 Volume (High→Low)' },
  { value: 'volume_24h_desc',   label: '⚡ 24h Volume' },
  { value: 'ending_soon',       label: '⏰ Ending Soon' },
  { value: 'market_count_desc', label: '📋 Most Markets' },
];

const CATEGORY_OPTIONS = [
  { value: 'all',           label: 'All Categories' },
  { value: 'politics',      label: '🗳️ Politics' },
  { value: 'sports',        label: '⚽ Sports' },
  { value: 'crypto',        label: '₿ Crypto' },
  { value: 'economy',       label: '💹 Economy' },
  { value: 'entertainment', label: '🎬 Entertainment' },
  { value: 'other',         label: '⚙️ Other' },
];

// Platform colour helper
const PC = (platform: string): { primary: string; bg: string } => ({
  polymarket: { primary: PLATFORM_COLORS.polymarket?.primary ?? '#3B82F6', bg: PLATFORM_COLORS.polymarket?.bg ?? 'rgba(59,130,246,0.12)' },
  kalshi:     { primary: PLATFORM_COLORS.kalshi?.primary     ?? '#10B981', bg: PLATFORM_COLORS.kalshi?.bg     ?? 'rgba(16,185,129,0.12)' },
  limitless:  { primary: PLATFORM_COLORS.limitless?.primary  ?? '#8B5CF6', bg: PLATFORM_COLORS.limitless?.bg  ?? 'rgba(139,92,246,0.12)' },
} as Record<string, { primary: string; bg: string }>)[platform] ?? { primary: '#6B7280', bg: 'rgba(107,114,128,0.12)' };

const fmtDate = (ts?: number | null): string => {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
};

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  active:   { color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  open:     { color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  closed:   { color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
  resolved: { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  paused:   { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
};
const getStatusColor = (s: string) => STATUS_COLORS[s?.toLowerCase()] ?? STATUS_COLORS.active;

// ─── EventCard ────────────────────────────────────────────────────────────────
interface EventCardProps { event: EventSummary; index: number; onClick: () => void; }

const EventCard: React.FC<EventCardProps> = ({ event, index, onClick }) => {
  const theme = useTheme();
  const colors = PC(event.platform);
  const isUrgent = event.end_time ? (event.end_time * 1000 - Date.now()) < 86400000 && (event.end_time * 1000 - Date.now()) > 0 : false;

  return (
    <Paper elevation={0} onClick={onClick} sx={{ p: 0, borderRadius: 2, cursor: 'pointer', overflow: 'hidden', border: `1px solid ${alpha(theme.palette.divider, 0.1)}`, backgroundColor: alpha(theme.palette.background.paper, 0.6), backdropFilter: 'blur(10px)', animation: `${fadeInUp} 0.25s ease ${index * 0.01}s both`, transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease', '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 8px 24px ${alpha(colors.primary, 0.15)}`, borderColor: alpha(colors.primary, 0.35) } }}>
      <Box sx={{ height: 4, background: `linear-gradient(90deg, ${colors.primary}, ${alpha(colors.primary, 0.25)})` }} />
      <Stack direction="row" spacing={1.25} sx={{ p: 1.5, pb: 0.75 }} alignItems="flex-start">
        {event.image_url ? (
          <Box component="img" src={event.image_url} sx={{ width: 44, height: 44, borderRadius: 1.5, objectFit: 'cover', flexShrink: 0, border: `1px solid ${alpha(theme.palette.divider, 0.15)}` }} />
        ) : (
          <Box sx={{ width: 44, height: 44, borderRadius: 1.5, backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>
            {event.platform === 'polymarket' ? '📊' : event.platform === 'kalshi' ? '🎯' : '🔮'}
          </Box>
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.4, flexWrap: 'wrap', gap: 0.3 }}>
            <Chip label={PLATFORM_DISPLAY[event.platform] || event.platform} size="small" sx={{ backgroundColor: colors.bg, color: colors.primary, fontWeight: 700, fontSize: '0.62rem', height: 17 }} />
            {event.market_count > 1 && (
              <Chip label={`${event.market_count} markets`} size="small" sx={{ backgroundColor: alpha(theme.palette.text.secondary, 0.08), color: 'text.secondary', fontSize: '0.60rem', height: 17 }} />
            )}
            {event.category && (
              <Chip label={event.category} size="small" sx={{ backgroundColor: alpha(theme.palette.text.secondary, 0.07), color: 'text.disabled', fontSize: '0.58rem', height: 17, textTransform: 'capitalize' }} />
            )}
          </Stack>
          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={event.title}>
            {event.title}
          </Typography>
          {event.market_count > 1 && event.top_prob_title && (
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.3 }}>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.63rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={event.top_prob_title}>
                {event.top_prob_title}
              </Typography>
              {event.top_yes_price != null && (
                <Box component="span" sx={{ flexShrink: 0, fontSize: '0.6rem', fontWeight: 700, fontFamily: 'monospace', px: 0.5, py: 0.1, borderRadius: 0.5, backgroundColor: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>
                  Y {Math.round(event.top_yes_price * 100)}¢
                </Box>
              )}
              {event.top_no_price != null && (
                <Box component="span" sx={{ flexShrink: 0, fontSize: '0.6rem', fontWeight: 700, fontFamily: 'monospace', px: 0.5, py: 0.1, borderRadius: 0.5, backgroundColor: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
                  N {Math.round(event.top_no_price * 100)}¢
                </Box>
              )}
            </Stack>
          )}
        </Box>
      </Stack>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 1.5, py: 0.75 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem', display: 'block' }}>Volume</Typography>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.75rem', color: 'text.primary' }}>{fmtVolume(event.total_volume)}</Typography>
          </Box>
          {event.volume_24h > 0 && (
            <Box>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem', display: 'block' }}>24h</Typography>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.72rem', color: '#22C55E' }}>{fmtVolume(event.volume_24h)}</Typography>
            </Box>
          )}
          {event.volume_7d > 0 && (
            <Box>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem', display: 'block' }}>7d</Typography>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.72rem', color: '#3B82F6' }}>{fmtVolume(event.volume_7d)}</Typography>
            </Box>
          )}
          {event.trades_24h > 0 && (
            <Box>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem', display: 'block' }}>Trades</Typography>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.72rem', color: '#F59E0B' }}>{event.trades_24h.toLocaleString()}</Typography>
            </Box>
          )}
        </Stack>
        <Tooltip title={event.end_time ? new Date(event.end_time * 1000).toLocaleString() : 'No end date'}>
          <Chip icon={<AccessTime sx={{ fontSize: 10 }} />} label={fmtTimeRemaining(event.end_time)} size="small"
            sx={{ height: 19, fontSize: '0.62rem', backgroundColor: isUrgent ? alpha('#EF4444', 0.1) : alpha(theme.palette.text.secondary, 0.08), color: isUrgent ? '#EF4444' : 'text.secondary', '& .MuiChip-icon': { color: isUrgent ? '#EF4444' : 'text.secondary' } }} />
        </Tooltip>
      </Stack>
    </Paper>
  );
};

// ─── EventRow (list view) ─────────────────────────────────────────────────────
interface EventRowProps { event: EventSummary; index: number; onClick: () => void; }

const EventRow: React.FC<EventRowProps> = ({ event, index, onClick }) => {
  const theme = useTheme();
  const colors = PC(event.platform);
  const sc = getStatusColor(event.status);
  return (
    <Box onClick={onClick} sx={{ display: 'grid', gridTemplateColumns: '44px 1fr 100px 110px 55px 90px 80px 80px 85px 72px 44px', alignItems: 'center', gap: 1.5, px: 2, py: 1.25, cursor: 'pointer', borderBottom: `1px solid ${alpha(theme.palette.divider, 0.06)}`, animation: `${fadeInUp} 0.2s ease ${index * 0.008}s both`, transition: 'background 0.1s ease', '&:hover': { backgroundColor: alpha(colors.primary, 0.04) }, '&:last-child': { borderBottom: 'none' } }}>
      {event.image_url ? (
        <Box component="img" src={event.image_url} sx={{ width: 36, height: 36, borderRadius: 1.5, objectFit: 'cover', border: `1px solid ${alpha(theme.palette.divider, 0.12)}` }} />
      ) : (
        <Box sx={{ width: 36, height: 36, borderRadius: 1.5, backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
          {event.platform === 'polymarket' ? '📊' : event.platform === 'kalshi' ? '🎯' : '🔮'}
        </Box>
      )}
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={event.title}>{event.title}</Typography>
        {event.market_count > 1 && event.top_prob_title && (
          <Stack direction="row" spacing={0.4} alignItems="center" sx={{ mt: 0.2 }}>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.63rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{event.top_prob_title}</Typography>
            {event.top_yes_price != null && (
              <Box component="span" sx={{ flexShrink: 0, fontSize: '0.58rem', fontWeight: 700, fontFamily: 'monospace', px: 0.4, borderRadius: 0.5, backgroundColor: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>
                Y {Math.round(event.top_yes_price * 100)}¢
              </Box>
            )}
            {event.top_no_price != null && (
              <Box component="span" sx={{ flexShrink: 0, fontSize: '0.58rem', fontWeight: 700, fontFamily: 'monospace', px: 0.4, borderRadius: 0.5, backgroundColor: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
                N {Math.round(event.top_no_price * 100)}¢
              </Box>
            )}
          </Stack>
        )}
      </Box>
      <Chip label={PLATFORM_DISPLAY[event.platform] || event.platform} size="small" sx={{ backgroundColor: colors.bg, color: colors.primary, fontWeight: 700, fontSize: '0.68rem', justifySelf: 'start' }} />
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{event.category || '—'}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.8rem' }}>{event.market_count}</Typography>
      <Typography variant="body2" sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{fmtVolume(event.total_volume)}</Typography>
      <Typography variant="body2" sx={{ textAlign: 'right', fontFamily: 'monospace', color: event.volume_24h > 0 ? '#22C55E' : 'text.disabled' }}>{event.volume_24h > 0 ? fmtVolume(event.volume_24h) : '—'}</Typography>
      <Typography variant="body2" sx={{ textAlign: 'right', fontFamily: 'monospace', color: event.volume_7d > 0 ? '#3B82F6' : 'text.disabled' }}>{event.volume_7d > 0 ? fmtVolume(event.volume_7d) : '—'}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'right', fontSize: '0.75rem' }}>{fmtDate(event.end_time)}</Typography>
      <Chip label={event.status || 'active'} size="small" sx={{ backgroundColor: sc.bg, color: sc.color, fontWeight: 700, fontSize: '0.62rem', height: 20, textTransform: 'capitalize', justifySelf: 'start' }} />
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        {event.source_url ? (
          <IconButton size="small" component="a" href={event.source_url} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            sx={{ color: 'text.disabled', '&:hover': { color: colors.primary } }}>
            <OpenInNew sx={{ fontSize: 14 }} />
          </IconButton>
        ) : <Box sx={{ width: 28 }} />}
      </Box>
    </Box>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export const EventsPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();

  const [platform, setPlatform] = useState<EventPlatform>('all');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<EventSort>('volume_desc');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [displayMode, setDisplayMode] = useState<'grid' | 'list'>('list');
  const [page, setPage] = useState(1);

  const [events, setEvents] = useState<EventSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [platformCounts, setPlatformCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUnifiedEvents({ platform, category, search, sort, page, pageSize: 24 });
      setEvents(data.events);
      setTotal(data.total);
      setTotalPages(data.total_pages);
      setPlatformCounts(data.platform_counts);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [platform, category, search, sort, page]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(val); setPage(1); }, 400);
  };

  const handlePlatformChange = (p: EventPlatform) => { setPlatform(p); setPage(1); };
  const handleEventClick = (ev: EventSummary) => navigate(`/events/${ev.platform}/${encodeURIComponent(ev.event_id)}`);

  const totalLabel = platform === 'all'
    ? `${total.toLocaleString()} events`
    : `${total.toLocaleString()} ${PLATFORM_DISPLAY[platform] || platform} events`;

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2.5 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.25 }}>Events</Typography>
          <Typography variant="body2" color="text.secondary">
            Browse prediction market events across platforms · data direct from DB
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip icon={<TrendingUp sx={{ fontSize: 14 }} />} label={totalLabel} size="small"
            sx={{ backgroundColor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main', fontWeight: 600 }} />
          <IconButton size="small" onClick={loadEvents} sx={{ color: 'text.secondary' }}><Refresh sx={{ fontSize: 18 }} /></IconButton>
        </Stack>
      </Stack>

      {/* Platform tabs + view toggle */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={0.5}>
          {PLATFORM_TABS.map(tab => {
            const cnt = tab.value === 'all' ? total : (platformCounts[tab.value] ?? 0);
            const active = platform === tab.value;
            const c = PC(tab.value === 'all' ? 'polymarket' : tab.value);
            const pColor = tab.value === 'all' ? theme.palette.primary.main : c.primary;
            const pBg = tab.value === 'all' ? alpha(theme.palette.primary.main, 0.15) : c.bg;
            return (
              <Button key={tab.value} size="small" onClick={() => handlePlatformChange(tab.value)}
                sx={{ px: 1.5, py: 0.6, borderRadius: 2, fontWeight: 700, fontSize: '0.72rem', minWidth: 0, backgroundColor: active ? pBg : 'transparent', color: active ? pColor : 'text.secondary', border: active ? `1px solid ${alpha(pColor, 0.3)}` : '1px solid transparent', '&:hover': { backgroundColor: alpha(pColor, 0.08) } }}>
                {tab.label}
                {!loading && cnt > 0 && <Box component="span" sx={{ ml: 0.6, opacity: 0.7, fontSize: '0.65rem' }}>{cnt}</Box>}
              </Button>
            );
          })}
        </Stack>
        <ToggleButtonGroup value={displayMode} exclusive onChange={(_, v) => v && setDisplayMode(v)} size="small"
          sx={{ '& .MuiToggleButton-root': { p: 0.75, border: `1px solid ${alpha(theme.palette.divider, 0.2)}` } }}>
          <ToggleButton value="grid"><ViewModule sx={{ fontSize: 18 }} /></ToggleButton>
          <ToggleButton value="list"><ViewList sx={{ fontSize: 18 }} /></ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* Search + filters */}
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5, flexWrap: 'wrap', gap: 1 }}>
        <TextField size="small" placeholder="Search events…" value={searchInput} onChange={e => handleSearchChange(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment> }}
          sx={{ width: 240, '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <Select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} sx={{ borderRadius: 2, fontSize: '0.82rem' }}>
            {CATEGORY_OPTIONS.map(opt => <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.82rem' }}>{opt.label}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 190 }}>
          <Select value={sort} onChange={e => { setSort(e.target.value as EventSort); setPage(1); }} sx={{ borderRadius: 2, fontSize: '0.82rem' }}>
            {SORT_OPTIONS.map(opt => <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.82rem' }}>{opt.label}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>

      {/* Error */}
      {error && (
        <Paper elevation={0} sx={{ p: 3, mb: 2, borderRadius: 2, border: `1px solid ${alpha('#EF4444', 0.3)}`, backgroundColor: alpha('#EF4444', 0.05) }}>
          <Typography color="error" variant="body2">{error}</Typography>
          <Button size="small" onClick={loadEvents} sx={{ mt: 1 }}>Retry</Button>
        </Paper>
      )}

      {/* Grid */}
      {displayMode === 'grid' && (
        <>
          {loading ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
              {[...Array(12)].map((_, i) => (
                <Paper key={i} elevation={0} sx={{ p: 0, borderRadius: 2, overflow: 'hidden', border: `1px solid ${alpha(theme.palette.divider, 0.1)}`, backgroundColor: alpha(theme.palette.background.paper, 0.6) }}>
                  <Skeleton variant="rectangular" height={4} animation="wave" />
                  <Box sx={{ p: 1.5 }}>
                    <Stack direction="row" spacing={1.25} sx={{ mb: 1 }}>
                      <Skeleton variant="rectangular" width={44} height={44} sx={{ borderRadius: 1.5, flexShrink: 0 }} animation="wave" />
                      <Box sx={{ flex: 1 }}>
                        <Skeleton animation="wave" height={14} width="40%" sx={{ mb: 0.5 }} />
                        <Skeleton animation="wave" height={18} />
                        <Skeleton animation="wave" height={14} width="70%" sx={{ mt: 0.25 }} />
                      </Box>
                    </Stack>
                    <Skeleton animation="wave" height={28} />
                  </Box>
                </Paper>
              ))}
            </Box>
          ) : events.length === 0 ? (
            <Paper elevation={0} sx={{ p: 6, textAlign: 'center', borderRadius: 2, border: `1px solid ${alpha(theme.palette.divider, 0.1)}` }}>
              <Typography color="text.secondary">No events found matching filters</Typography>
              <Button size="small" sx={{ mt: 1.5 }} onClick={() => { setPlatform('all'); setCategory('all'); setSearch(''); setSearchInput(''); }}>Clear filters</Button>
            </Paper>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
              {events.map((ev, i) => (
                <EventCard key={`${ev.platform}-${ev.event_id}`} event={ev} index={i} onClick={() => handleEventClick(ev)} />
              ))}
            </Box>
          )}
        </>
      )}

      {/* List */}
      {displayMode === 'list' && (
        <Paper elevation={0} sx={{ borderRadius: 2, overflow: 'hidden', border: `1px solid ${alpha(theme.palette.divider, 0.1)}`, backgroundColor: alpha(theme.palette.background.paper, 0.6), backdropFilter: 'blur(10px)' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '44px 1fr 100px 110px 55px 90px 80px 80px 85px 72px 44px', gap: 1.5, px: 2, py: 1, backgroundColor: alpha(theme.palette.primary.main, 0.04), borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}` }}>
            {['', 'Event', 'Platform', 'Category', 'Mkts', 'Volume', '24h Vol', '7d Vol', 'End', 'Status', 'Link'].map((h, i) => (
              <Typography key={i} variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.7rem', textAlign: i >= 4 && i <= 8 ? 'right' : 'left' }}>{h}</Typography>
            ))}
          </Box>
          {loading ? (
            [...Array(10)].map((_, i) => (
              <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '44px 1fr 100px 110px 55px 90px 80px 80px 85px 72px 44px', gap: 1.5, px: 2, py: 1.5, borderBottom: `1px solid ${alpha(theme.palette.divider, 0.06)}` }}>
                <Skeleton variant="rectangular" width={36} height={36} sx={{ borderRadius: 1.5 }} animation="wave" />
                <Box><Skeleton animation="wave" height={16} /><Skeleton animation="wave" height={13} width="60%" sx={{ mt: 0.25 }} /></Box>
                <Skeleton animation="wave" height={22} width={80} />
                {[70, 30, 55, 55, 50, 50, 50, 28, 28].map((w, j) => <Skeleton key={j} animation="wave" height={16} width={w} sx={{ ml: j >= 2 && j <= 6 ? 'auto' : 0 }} />)}
              </Box>
            ))
          ) : events.length === 0 ? (
            <Box sx={{ p: 5, textAlign: 'center' }}><Typography color="text.secondary">No events found</Typography></Box>
          ) : (
            events.map((ev, i) => <EventRow key={`${ev.platform}-${ev.event_id}`} event={ev} index={i} onClick={() => handleEventClick(ev)} />)
          )}
        </Paper>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination count={totalPages} page={page} onChange={(_, p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} color="primary" showFirstButton showLastButton />
        </Box>
      )}

      {/* Footer stats */}
      {!loading && events.length > 0 && (
        <Box sx={{ mt: 3, pt: 2, borderTop: `1px solid ${alpha(theme.palette.divider, 0.08)}` }}>
          <Stack direction="row" spacing={3} justifyContent="center" flexWrap="wrap">
            {Object.entries(platformCounts).map(([p, cnt]) => cnt > 0 && (
              <Typography key={p} variant="caption" color="text.disabled">
                {PLATFORM_DISPLAY[p] || p}: <strong style={{ color: PC(p).primary }}>{cnt}</strong>
              </Typography>
            ))}
            <Typography variant="caption" color="text.disabled">Total: <strong>{total.toLocaleString()}</strong> events · DB only</Typography>
          </Stack>
        </Box>
      )}
    </Box>
  );
};

export default EventsPage;