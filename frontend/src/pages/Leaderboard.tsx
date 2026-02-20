import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  LinearProgress,
  ToggleButtonGroup,
  ToggleButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Tooltip,
  IconButton,
  Link as MuiLink,
  Paper,
  Grid,
  TextField,
  InputAdornment,
  alpha,
  useTheme,
} from '@mui/material';
import {
  OpenInNew,
  Refresh,
  EmojiEvents,
  Search,
  FilterList,
  Speed,
} from '@mui/icons-material';
import { keyframes } from '@mui/system';
import { PLATFORM_COLORS, TRADING_COLORS, CHART_COLORS } from '../utils/colors';

const API_BASE = import.meta.env.VITE_API_URL || '';

const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
`;

// ── Types ──────────────────────────────────────────────────────────────────────
interface TraderRow {
  rank: number;
  wallet_address: string;
  display_name: string;
  platform: string;
  profile_url: string;
  trade_count: number;
  total_volume: number;
  buy_volume: number;
  sell_volume: number;
  avg_trade_size: number;
  markets_traded: number;
  vol_24h: number;
  vol_7d: number;
  vol_30d: number;
  trades_24h: number;
  trades_7d: number;
  trades_30d: number;
  is_whale: boolean;
  is_active_24h: boolean;
  is_active_7d: boolean;
  last_trade: string | null;
  // Dome API enrichment
  handle: string | null;
  total_winnings: number;
  biggest_win: number;
  markets_won: number;
  dome_enriched: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtVol(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtPnl(v: number): string {
  const sign = v >= 0 ? '+' : '';
  if (Math.abs(v) >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000)     return `${sign}$${(v / 1_000).toFixed(0)}K`;
  return `${sign}$${v.toFixed(0)}`;
}

function fmtWallet(w: string): string {
  if (w.startsWith('0x') && w.length >= 10) return `${w.slice(0, 6)}…${w.slice(-4)}`;
  if (w.length > 16) return `${w.slice(0, 8)}…${w.slice(-4)}`;
  return w;
}

function fmtDate(s: string | null): string {
  if (!s) return '–';
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function medalEmoji(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '';
}

const PLATFORM_LABEL: Record<string, string> = {
  polymarket: 'Polymarket',
  kalshi: 'Kalshi',
  limitless: 'Limitless',
};

const PLATFORM_COLOR_MAP: Record<string, { primary: string; bg: string }> = {
  polymarket: PLATFORM_COLORS.polymarket,
  kalshi: PLATFORM_COLORS.kalshi,
  limitless: PLATFORM_COLORS.limitless,
};

// ── Main component ─────────────────────────────────────────────────────────────
export const Leaderboard: React.FC = () => {
  const theme = useTheme();

  const [traders, setTraders]         = useState<TraderRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [queryMs, setQueryMs]         = useState<number | null>(null);
  const [totalUnique, setTotalUnique] = useState(0);
  const [enrichedCount, setEnrichedCount] = useState(0);

  // filters / sorting
  const [search, setSearch]           = useState('');
  const [platform, setPlatform]       = useState('all');
  const [timeWindow, setTimeWindow]   = useState<'all' | '24h' | '7d' | '30d'>('all');
  const [sortBy, setSortBy]           = useState<'volume' | 'trades' | 'winnings' | 'biggest_win' | 'markets_won'>('volume');
  const [whalesOnly, setWhalesOnly]   = useState(false);
  const [activeOnly, setActiveOnly]   = useState(false);

  const fetchTraders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/leaderboard-enriched`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Unknown error');
      setTraders(data.traders ?? []);
      setQueryMs(data.query_ms ?? null);
      setTotalUnique(data.total_unique_traders ?? 0);
      setEnrichedCount(data.enriched_count ?? 0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTraders(); }, [fetchTraders]);

  // ── Client-side filter + sort ──────────────────────────────────────────────
  const displayed = useMemo(() => {
    let out = traders.filter(t => {
      if (whalesOnly && !t.is_whale) return false;
      if (activeOnly && !t.is_active_7d) return false;
      if (search) {
        const q = search.toLowerCase();
        const match = t.wallet_address.toLowerCase().includes(q)
          || (t.handle ?? '').toLowerCase().includes(q)
          || (t.display_name ?? '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    out.sort((a, b) => {
      const vol = (t: TraderRow) =>
        timeWindow === '24h' ? t.vol_24h
        : timeWindow === '7d' ? t.vol_7d
        : timeWindow === '30d' ? t.vol_30d
        : t.total_volume;

      if (sortBy === 'volume')      return vol(b) - vol(a);
      if (sortBy === 'winnings')     return b.total_winnings - a.total_winnings;
      if (sortBy === 'biggest_win')  return b.biggest_win - a.biggest_win;
      if (sortBy === 'markets_won')  return b.markets_won - a.markets_won;
      if (sortBy === 'trades')       return (timeWindow === '24h' ? b.trades_24h - a.trades_24h : b.trade_count - a.trade_count);
      return 0;
    });

    return out;
  }, [traders, search, whalesOnly, activeOnly, sortBy, timeWindow]);

  // ── Aggregate stats ────────────────────────────────────────────────────────
  const aggStats = useMemo(() => {
    const t = displayed;
    if (!t.length) return null;
    return {
        totalVolume:   t.reduce((s, x) => s + x.total_volume, 0),
        totalWinnings: t.reduce((s, x) => s + x.total_winnings, 0),
        totalTrades:   t.reduce((s, x) => s + x.trade_count, 0),
        whaleCount:    t.filter(x => x.is_whale).length,
        active24h:     t.filter(x => x.is_active_24h).length,
        winnersCount:  t.filter(x => x.total_winnings > 0).length,
    };
  }, [displayed]);

  // ── Volume getter based on time window ────────────────────────────────────
  const getVol = (t: TraderRow) =>
    timeWindow === '24h' ? t.vol_24h
    : timeWindow === '7d' ? t.vol_7d
    : timeWindow === '30d' ? t.vol_30d
    : t.total_volume;

  const getTrades = (t: TraderRow) =>
    timeWindow === '24h' ? t.trades_24h
    : timeWindow === '7d' ? t.trades_7d
    : timeWindow === '30d' ? t.trades_30d
    : t.trade_count;

  return (
    <Box sx={{ p: 3, minHeight: '100vh', backgroundColor: 'background.default' }}>

      {/* ── Header ── */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <EmojiEvents sx={{ color: '#F59E0B', fontSize: 32 }} />
              Trader Leaderboard
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Top 100 traders • DB volume + Dome API winnings • {totalUnique} unique traders
              </Typography>
              {queryMs !== null && (
                <Chip
                  icon={<Speed sx={{ fontSize: 12 }} />}
                  label={queryMs > 5000 ? `${(queryMs/1000).toFixed(1)}s • fetching Dome API…` : `${queryMs}ms cached`}
                  size="small"
                  sx={{ height: 18, fontSize: '0.65rem', color: TRADING_COLORS.YES, backgroundColor: alpha(TRADING_COLORS.YES, 0.1) }}
                />
              )}
            </Box>
          </Box>
          <Button
            variant="outlined"
            startIcon={<Refresh sx={{ animation: loading ? `${pulse} 1s infinite` : 'none' }} />}
            onClick={fetchTraders}
            disabled={loading}
            size="large"
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* ── Stats cards ── */}
      {aggStats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Traders Shown',    value: displayed.length,                        sub: `of ${totalUnique} in DB`,                                       color: theme.palette.primary.main },
            { label: 'Total Winnings',   value: fmtVol(aggStats.totalWinnings),           sub: `${aggStats.winnersCount} traders with REDEEM events (Dome API)`,  color: TRADING_COLORS.YES         },
            { label: 'Total Trades',     value: aggStats.totalTrades.toLocaleString(),    sub: `from predictions_silver.trades`,                                color: CHART_COLORS.amber          },
            { label: 'Active (24 h)',    value: aggStats.active24h,                       sub: `🐋 ${aggStats.whaleCount} whales • ${enrichedCount} Dome-enriched`, color: theme.palette.info.main  },
          ].map(({ label, value, sub, color }) => (
            <Grid item xs={12} sm={6} md={3} key={label}>
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                  background: `linear-gradient(135deg, ${alpha(color, 0.1)} 0%, ${alpha(color, 0.04)} 100%)`,
                  border: `1px solid ${alpha(color, 0.2)}`,
                }}
              >
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {label}
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 700, color, my: 0.5 }}>
                  {value}
                </Typography>
                <Typography variant="caption" color="text.secondary">{sub}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      {/* ── Filters ── */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 3,
          borderRadius: 2,
          backgroundColor: alpha(theme.palette.background.paper, 0.6),
          backdropFilter: 'blur(10px)',
          border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        }}
      >
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <FilterList sx={{ color: 'text.secondary' }} />

            <TextField
              size="small"
              placeholder="Search by wallet…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 16, color: 'text.disabled' }} /></InputAdornment>,
              }}
              sx={{ minWidth: 200 }}
            />

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Platform</InputLabel>
              <Select value={platform} label="Platform" onChange={e => setPlatform(e.target.value)}>
                <MenuItem value="all">All Platforms</MenuItem>
                <MenuItem value="polymarket">Polymarket</MenuItem>
                <MenuItem value="kalshi">Kalshi</MenuItem>
                <MenuItem value="limitless">Limitless</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Sort By</InputLabel>
              <Select value={sortBy} label="Sort By" onChange={e => setSortBy(e.target.value as any)}>
                <MenuItem value="volume">Volume (DB)</MenuItem>
                <MenuItem value="winnings">Winnings (Dome)</MenuItem>
                <MenuItem value="biggest_win">Biggest Win</MenuItem>
                <MenuItem value="markets_won">Markets Won</MenuItem>
                <MenuItem value="trades">Trade Count</MenuItem>
              </Select>
            </FormControl>

            <Box sx={{ flex: 1 }} />

            <ToggleButtonGroup
              value={whalesOnly ? 'whales' : 'all'}
              exclusive
              onChange={(_, v) => setWhalesOnly(v === 'whales')}
              size="small"
            >
              <ToggleButton value="all">All</ToggleButton>
              <ToggleButton value="whales">🐋 Whales</ToggleButton>
            </ToggleButtonGroup>

            <ToggleButtonGroup
              value={activeOnly ? 'active' : 'all'}
              exclusive
              onChange={(_, v) => setActiveOnly(v === 'active')}
              size="small"
            >
              <ToggleButton value="all">All</ToggleButton>
              <ToggleButton value="active">🟢 Active</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {/* Time window */}
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 55 }}>
              Time period:
            </Typography>
            <ToggleButtonGroup
              value={timeWindow}
              exclusive
              onChange={(_, v) => v && setTimeWindow(v)}
              size="small"
            >
              <ToggleButton value="24h">24 h</ToggleButton>
              <ToggleButton value="7d">7 d</ToggleButton>
              <ToggleButton value="30d">30 d</ToggleButton>
              <ToggleButton value="all">All time</ToggleButton>
            </ToggleButtonGroup>
            <Chip label={`${displayed.length} traders`} color="primary" variant="outlined" size="small" />
          </Stack>
        </Stack>
      </Paper>

      {/* ── Loading ── */}
      {loading && (
        <Paper elevation={0} sx={{ p: 2.5, mb: 3, borderRadius: 2, border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
            <EmojiEvents sx={{ color: '#F59E0B', fontSize: 20, animation: `${pulse} 1.5s ease-in-out infinite` }} />
            <Typography variant="subtitle2" fontWeight={600}>Loading top 100 traders + enriching with Dome API… (first load ~15s, then cached 10 min)</Typography>
          </Box>
          <LinearProgress sx={{ borderRadius: 1, height: 3 }} />
        </Paper>
      )}

      {/* ── Error ── */}
      {error && (
        <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 2, border: `1px solid ${alpha(TRADING_COLORS.NO, 0.3)}` }}>
          <Typography color="error" fontWeight={600}>{error}</Typography>
          <Button onClick={fetchTraders} sx={{ mt: 1 }}>Retry</Button>
        </Paper>
      )}

      {/* ── Table ── */}
      {!loading && !error && (
        <Card elevation={0} sx={{ borderRadius: 2, border: `1px solid ${alpha(theme.palette.divider, 0.1)}` }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: alpha(theme.palette.background.default, 0.6) }}>
                  {['Rank', 'Trader', 'Platform', 'Volume', 'Trades', 'Winnings', 'Biggest Win', 'Mkts Won', 'Avg Size', 'Last Trade', ''].map(h => (
                    <TableCell key={h} align={h === 'Rank' || h === '' ? 'center' : 'right'}
                      sx={{ fontWeight: 700, fontSize: '0.72rem', whiteSpace: 'nowrap',
                        ...(h === 'Trader' ? { textAlign: 'left' } : {}) }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {displayed.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} align="center" sx={{ py: 6 }}>
                      <EmojiEvents sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                      <Typography color="text.secondary">No traders found</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  displayed.map((trader, idx) => {
                    const platColor = PLATFORM_COLOR_MAP[trader.platform] ?? PLATFORM_COLOR_MAP.polymarket;

                    return (
                      <TableRow
                        key={`${trader.platform}-${trader.wallet_address}`}
                        hover
                        sx={{
                          animation: `${fadeInUp} 0.25s ease both`,
                          animationDelay: `${Math.min(idx * 20, 300)}ms`,
                          '&:nth-of-type(odd)': { backgroundColor: alpha(theme.palette.action.hover, 0.4) },
                        }}
                      >
                        {/* Rank */}
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25 }}>
                            {medalEmoji(idx + 1) && (
                              <Typography sx={{ fontSize: '1rem' }}>{medalEmoji(idx + 1)}</Typography>
                            )}
                            <Chip
                              label={`#${idx + 1}`}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                color: idx < 3 ? '#F59E0B' : 'text.secondary',
                                backgroundColor: idx < 3 ? alpha('#F59E0B', 0.12) : alpha(theme.palette.divider, 0.4),
                              }}
                            />
                          </Box>
                        </TableCell>

                        {/* Trader */}
                        <TableCell>
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            <Tooltip title={trader.is_active_24h ? 'Active in last 24h' : trader.is_active_7d ? 'Active in last 7d' : 'Inactive'}>
                              <Box sx={{
                                width: 7, height: 7, borderRadius: '50%',
                                backgroundColor: trader.is_active_24h ? TRADING_COLORS.YES : trader.is_active_7d ? CHART_COLORS.amber : '#6B7280',
                              }} />
                            </Tooltip>
                            <Tooltip title={trader.wallet_address}>
                              <Typography
                                variant="body2"
                                fontFamily={trader.handle ? 'inherit' : 'monospace'}
                                fontWeight={trader.handle ? 600 : 400}
                                sx={{ cursor: 'default', fontSize: '0.78rem' }}
                              >
                                {trader.display_name}
                              </Typography>
                            </Tooltip>
                            {trader.dome_enriched && (
                              <Tooltip title="Enriched with Dome API">
                                <Box component="span" sx={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#F59E0B', flexShrink: 0 }} />
                              </Tooltip>
                            )}
                            {trader.is_whale && (
                              <Tooltip title="Whale — large position sizes">
                                <Typography sx={{ fontSize: '0.85rem' }}>🐋</Typography>
                              </Tooltip>
                            )}
                          </Stack>
                        </TableCell>

                        {/* Platform */}
                        <TableCell align="right">
                          <Chip
                            label={PLATFORM_LABEL[trader.platform] ?? trader.platform}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.65rem',
                              fontWeight: 600,
                              color: platColor.primary,
                              backgroundColor: platColor.bg,
                              border: `1px solid ${alpha(platColor.primary, 0.3)}`,
                            }}
                          />
                        </TableCell>

                        {/* Volume */}
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8rem' }}>
                            {fmtVol(getVol(trader))}
                          </Typography>
                        </TableCell>

                        {/* Trades */}
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>
                            {getTrades(trader).toLocaleString()}
                          </Typography>
                        </TableCell>

                        {/* Winnings (REDEEM from Dome API) */}
                        <TableCell align="right">
                          {trader.total_winnings > 0 ? (
                            <Typography variant="body2" fontWeight={700} sx={{ color: TRADING_COLORS.YES, fontSize: '0.8rem' }}>
                              {fmtVol(trader.total_winnings)}
                            </Typography>
                          ) : (
                            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.72rem' }}>
                              {trader.dome_enriched ? '–' : '…'}
                            </Typography>
                          )}
                        </TableCell>

                        {/* Biggest Win */}
                        <TableCell align="right">
                          {trader.biggest_win > 0 ? (
                            <Typography variant="body2" fontWeight={600} sx={{ color: CHART_COLORS.amber, fontSize: '0.78rem' }}>
                              {fmtVol(trader.biggest_win)}
                            </Typography>
                          ) : (
                            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.72rem' }}>
                              {trader.dome_enriched ? '–' : '…'}
                            </Typography>
                          )}
                        </TableCell>

                        {/* Markets Won */}
                        <TableCell align="right">
                          {trader.markets_won > 0 ? (
                            <Chip
                              label={`${trader.markets_won} 🏆`}
                              size="small"
                              sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700, color: TRADING_COLORS.YES, backgroundColor: alpha(TRADING_COLORS.YES, 0.1) }}
                            />
                          ) : (
                            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.72rem' }}>
                              {trader.dome_enriched ? '–' : '…'}
                            </Typography>
                          )}
                        </TableCell>

                        {/* Avg Size */}
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                            {fmtVol(trader.avg_trade_size)}
                          </Typography>
                        </TableCell>

                        {/* Markets */}
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                            {trader.markets_traded}
                          </Typography>
                        </TableCell>

                        {/* Last Trade */}
                        <TableCell align="right">
                          <Typography variant="caption" sx={{ fontSize: '0.68rem', color: 'text.disabled' }}>
                            {trader.last_trade ? fmtDate(trader.last_trade) : '–'}
                          </Typography>
                        </TableCell>

                        {/* Action */}
                        <TableCell align="center">
                          <Tooltip title={`View on ${PLATFORM_LABEL[trader.platform] ?? trader.platform}`}>
                            <IconButton
                              size="small"
                              component={MuiLink}
                              href={trader.profile_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ p: 0.5, color: platColor.primary }}
                            >
                              <OpenInNew sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Table footer */}
          {displayed.length > 0 && (
            <Box sx={{ p: 1.5, borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="caption" color="text.disabled">
                Showing {displayed.length} of 100 traders • Volume from DB • Winnings = REDEEM events from Dome API
              </Typography>
              <Typography variant="caption" color="text.disabled">
                ● amber dot = enriched with Dome API • Winnings only include cashed-out (resolved) positions
              </Typography>
            </Box>
          )}
        </Card>
      )}
    </Box>
  );
};
