/**
 * Event Detail Page — Pure DB implementation
 * Shows all markets in an event + insights panel.
 * Route: /events/:platform/:eventId
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Stack, Chip, IconButton, Button,
  Tooltip, Skeleton, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Divider, LinearProgress,
  useTheme, alpha,
} from '@mui/material';
import {
  ArrowBack, OpenInNew, AccessTime, TrendingUp, TrendingDown,
  Category as CategoryIcon, ShowChart, EmojiEvents, Bolt,
} from '@mui/icons-material';
import { keyframes } from '@mui/system';
import {
  fetchUnifiedEventDetail,
  EventDetailResponse,
  MarketInEvent,
  fmtVolume,
  fmtTimeRemaining,
  PLATFORM_DISPLAY,
} from '../services/unifiedEventsApi';
import { PLATFORM_COLORS } from '../utils/colors';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// Platform colour helper
const PC = (platform: string): { primary: string; bg: string } => ({
  polymarket: { primary: PLATFORM_COLORS.polymarket?.primary ?? '#3B82F6', bg: PLATFORM_COLORS.polymarket?.bg ?? 'rgba(59,130,246,0.12)' },
  kalshi:     { primary: PLATFORM_COLORS.kalshi?.primary     ?? '#10B981', bg: PLATFORM_COLORS.kalshi?.bg     ?? 'rgba(16,185,129,0.12)' },
  limitless:  { primary: PLATFORM_COLORS.limitless?.primary  ?? '#8B5CF6', bg: PLATFORM_COLORS.limitless?.bg  ?? 'rgba(139,92,246,0.12)' },
} as Record<string, { primary: string; bg: string }>)[platform] ?? { primary: '#6B7280', bg: 'rgba(107,114,128,0.12)' };

// Format % price
const fmtPrice = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(1)}¢` : '—';
// Format ann roi
const fmtROI = (v: number | null | undefined) => {
  if (v == null) return '—';
  if (v > 9999) return '>9999% p.a.';
  return `${v.toLocaleString()}% p.a.`;
};
// Platform source URL builders
const buildSourceUrl = (platform: string, market: MarketInEvent): string | null => {
  if (market.source_url) return market.source_url;
  if (platform === 'polymarket') {
    const extra = (market as unknown as { extra?: Record<string, string> }).extra;
    const slug = extra?.event_slug || extra?.market_slug || market.market_id;
    return `https://polymarket.com/event/${slug}?ref=eventgraph`;
  }
  if (platform === 'kalshi') return `https://kalshi.com/markets/${market.market_id}?ref=eventgraph`;
  if (platform === 'limitless') return `https://limitless.exchange/markets/${market.market_id}?ref=eventgraph`;
  return null;
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
interface StatCardProps { label: string; value: string; sub?: string; color?: string; icon?: React.ReactNode; }
const StatCard: React.FC<StatCardProps> = ({ label, value, sub, color, icon }) => {
  const theme = useTheme();
  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${alpha(theme.palette.divider, 0.1)}`, backgroundColor: alpha(theme.palette.background.paper, 0.6), backdropFilter: 'blur(10px)', flex: 1, minWidth: 120 }}>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        {icon && <Box sx={{ color: color ?? 'primary.main', mt: 0.25 }}>{icon}</Box>}
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', display: 'block', mb: 0.25 }}>{label}</Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, fontFamily: 'monospace', color: color ?? 'text.primary', lineHeight: 1.2 }}>{value}</Typography>
          {sub && <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.68rem' }}>{sub}</Typography>}
        </Box>
      </Stack>
    </Paper>
  );
};

// ─── Price Bar ────────────────────────────────────────────────────────────────
interface PriceBarProps { title: string; yesPrice: number | null | undefined; rank: number; }
const PriceBar: React.FC<PriceBarProps> = ({ title, yesPrice, rank }) => {
  const theme = useTheme();
  const pct = yesPrice != null ? yesPrice * 100 : 0;
  const color = pct >= 60 ? '#22C55E' : pct >= 40 ? '#F59E0B' : '#EF4444';
  return (
    <Box sx={{ mb: 1, animation: `${fadeIn} 0.25s ease ${rank * 0.04}s both` }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.35 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pr: 1 }}>{title}</Typography>
        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color, fontSize: '0.75rem', flexShrink: 0 }}>{fmtPrice(yesPrice)}</Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 6, borderRadius: 3,
          backgroundColor: alpha(color, 0.1),
          '& .MuiLinearProgress-bar': { borderRadius: 3, backgroundColor: color },
        }}
      />
    </Box>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export const EventDetailDBPage: React.FC = () => {
  const { platform = '', eventId = '' } = useParams<{ platform: string; eventId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();

  const [data, setData] = useState<EventDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const decodedEventId = decodeURIComponent(eventId);
  const colors = PC(platform);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchUnifiedEventDetail(platform, decodedEventId);
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load event');
    } finally {
      setLoading(false);
    }
  }, [platform, decodedEventId]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <Skeleton variant="circular" width={32} height={32} animation="wave" />
        <Skeleton animation="wave" height={20} width={200} />
      </Stack>
      <Skeleton animation="wave" height={40} width="60%" sx={{ mb: 2 }} />
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        {[...Array(4)].map((_, i) => <Skeleton key={i} animation="wave" height={80} sx={{ flex: 1, borderRadius: 2 }} />)}
      </Stack>
      <Skeleton animation="wave" height={400} sx={{ borderRadius: 2 }} />
    </Box>
  );

  // ── Error state ────────────────────────────────────────────────────────────
  if (error || !data) return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Button startIcon={<ArrowBack />} onClick={() => navigate('/events')} size="small" sx={{ mb: 2 }}>Back to Events</Button>
      <Paper elevation={0} sx={{ p: 4, borderRadius: 2, textAlign: 'center', border: `1px solid ${alpha('#EF4444', 0.3)}` }}>
        <Typography color="error" sx={{ mb: 2 }}>{error || 'Event not found'}</Typography>
        <Button variant="outlined" onClick={loadDetail}>Retry</Button>
      </Paper>
    </Box>
  );

  const { insights, markets } = data;
  const sortedByPrice = [...markets].filter(m => m.yes_price != null).sort((a, b) => (b.yes_price ?? 0) - (a.yes_price ?? 0));

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* ── Breadcrumb / Back ──────────────────────────────────────────────── */}
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 2 }}>
        <Button startIcon={<ArrowBack sx={{ fontSize: 16 }} />} onClick={() => navigate('/events')} size="small" sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 500 }}>
          Events
        </Button>
        <Typography color="text.disabled" variant="body2">›</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>
          {data.title}
        </Typography>
      </Stack>

      {/* ── Event Header ──────────────────────────────────────────────────── */}
      <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mb: 2.5 }}>
        {data.image_url && (
          <Box component="img" src={data.image_url}
            sx={{ width: 72, height: 72, borderRadius: 2, objectFit: 'cover', flexShrink: 0, border: `2px solid ${alpha(colors.primary, 0.3)}` }} />
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
            <Chip label={PLATFORM_DISPLAY[platform] || platform} size="small" sx={{ backgroundColor: colors.bg, color: colors.primary, fontWeight: 700, height: 20, fontSize: '0.68rem' }} />
            {data.category && (
              <Chip icon={<CategoryIcon sx={{ fontSize: 12 }} />} label={data.category} size="small"
                sx={{ height: 20, fontSize: '0.68rem', backgroundColor: alpha(theme.palette.text.secondary, 0.08), color: 'text.secondary', '& .MuiChip-icon': { color: 'text.secondary' } }} />
            )}
            <Chip icon={<AccessTime sx={{ fontSize: 11 }} />} label={fmtTimeRemaining(data.end_time)} size="small"
              sx={{ height: 20, fontSize: '0.68rem', backgroundColor: alpha(theme.palette.text.secondary, 0.08), color: 'text.secondary', '& .MuiChip-icon': { color: 'text.secondary' } }} />
          </Stack>
          <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.25, mb: 0.25 }}>{data.title}</Typography>
          <Typography variant="body2" color="text.disabled">
            {data.market_count} {data.market_count === 1 ? 'market' : 'markets'} · {PLATFORM_DISPLAY[platform]} · DB data
          </Typography>
        </Box>
      </Stack>

      {/* ── Stats Row ─────────────────────────────────────────────────────── */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <StatCard label="Total Volume" value={fmtVolume(data.total_volume)} icon={<ShowChart sx={{ fontSize: 18 }} />} color={colors.primary} />
        <StatCard label="24h Volume" value={data.volume_24h > 0 ? fmtVolume(data.volume_24h) : '—'} icon={<Bolt sx={{ fontSize: 18 }} />} color="#22C55E" />
        <StatCard label="Markets" value={String(data.market_count)} sub={`${insights.markets_with_price} with price`} icon={<CategoryIcon sx={{ fontSize: 18 }} />} />
        {insights.avg_yes_price != null && (
          <StatCard label="Avg YES Price" value={fmtPrice(insights.avg_yes_price)} sub="across all markets" icon={<TrendingUp sx={{ fontSize: 18 }} />} color="#F59E0B" />
        )}
      </Stack>

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 320px' }, gap: 2 }}>

        {/* LEFT — Markets Table */}
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.25, color: 'text.primary' }}>
            Markets in this Event
          </Typography>
          <Paper elevation={0} sx={{ borderRadius: 2, overflow: 'hidden', border: `1px solid ${alpha(theme.palette.divider, 0.1)}`, backgroundColor: alpha(theme.palette.background.paper, 0.6), backdropFilter: 'blur(10px)' }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: alpha(colors.primary, 0.05) }}>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', py: 1.25 }}>Market</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.72rem', py: 1.25 }}>YES</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.72rem', py: 1.25 }}>NO</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.72rem', py: 1.25 }}>
                      <Tooltip title="Annualised ROI if YES resolves">
                        <span>Ann. ROI</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.72rem', py: 1.25 }}>Volume</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.72rem', py: 1.25 }}>24h Δ</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.72rem', py: 1.25 }}>Ends In</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.72rem', py: 1.25, width: 40 }}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {markets.map((m, i) => {
                    const yesPct = m.yes_price != null ? m.yes_price * 100 : null;
                    const noPct = m.no_price != null ? m.no_price * 100 : (yesPct != null ? 100 - yesPct : null);
                    const hasChange = m.price_change_pct_24h != null && m.price_change_pct_24h !== 0;
                    const url = buildSourceUrl(platform, m);
                    return (
                      <TableRow key={m.market_id}
                        sx={{ animation: `${fadeIn} 0.2s ease ${i * 0.015}s both`, '&:last-child td': { borderBottom: 0 }, '&:hover': { backgroundColor: alpha(colors.primary, 0.04) } }}>
                        <TableCell sx={{ py: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem' }} title={m.title}>
                            {m.title}
                          </Typography>
                          {m.trade_count_24h != null && m.trade_count_24h > 0 && (
                            <Chip label={`${m.trade_count_24h} trades`} size="small" sx={{ height: 16, fontSize: '0.6rem', mt: 0.25, backgroundColor: alpha('#22C55E', 0.1), color: '#22C55E' }} />
                          )}
                        </TableCell>
                        <TableCell align="right" sx={{ py: 1 }}>
                          <Box sx={{ display: 'inline-block', px: 0.75, py: 0.3, borderRadius: 1, backgroundColor: alpha('#22C55E', 0.1), border: `1px solid ${alpha('#22C55E', 0.2)}` }}>
                            <Typography variant="caption" sx={{ color: '#22C55E', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                              {yesPct != null ? `${yesPct.toFixed(1)}¢` : '—'}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right" sx={{ py: 1 }}>
                          <Box sx={{ display: 'inline-block', px: 0.75, py: 0.3, borderRadius: 1, backgroundColor: alpha('#EF4444', 0.1), border: `1px solid ${alpha('#EF4444', 0.2)}` }}>
                            <Typography variant="caption" sx={{ color: '#EF4444', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                              {noPct != null ? `${noPct.toFixed(1)}¢` : '—'}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right" sx={{ py: 1 }}>
                          {m.ann_roi != null ? (
                            <Chip label={fmtROI(m.ann_roi)} size="small"
                              sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700, backgroundColor: m.ann_roi > 1000 ? alpha('#F97316', 0.12) : alpha('#22C55E', 0.12), color: m.ann_roi > 1000 ? '#F97316' : '#22C55E' }} />
                          ) : <Typography variant="caption" color="text.disabled">—</Typography>}
                        </TableCell>
                        <TableCell align="right" sx={{ py: 1 }}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{fmtVolume(m.volume_total)}</Typography>
                          {m.volume_24h != null && m.volume_24h > 0 && (
                            <Typography variant="caption" color="text.disabled" sx={{ fontFamily: 'monospace', display: 'block', fontSize: '0.65rem' }}>{fmtVolume(m.volume_24h)} 24h</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right" sx={{ py: 1 }}>
                          {hasChange ? (
                            <Stack direction="row" spacing={0.25} alignItems="center" justifyContent="flex-end">
                              {m.price_change_pct_24h! > 0 ? <TrendingUp sx={{ fontSize: 13, color: '#22C55E' }} /> : <TrendingDown sx={{ fontSize: 13, color: '#EF4444' }} />}
                              <Typography variant="caption" sx={{ color: m.price_change_pct_24h! > 0 ? '#22C55E' : '#EF4444', fontWeight: 700, fontSize: '0.72rem' }}>
                                {m.price_change_pct_24h! > 0 ? '+' : ''}{m.price_change_pct_24h!.toFixed(1)}%
                              </Typography>
                            </Stack>
                          ) : <Typography variant="caption" color="text.disabled">—</Typography>}
                        </TableCell>
                        <TableCell align="right" sx={{ py: 1 }}>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>{fmtTimeRemaining(m.end_time)}</Typography>
                        </TableCell>
                        <TableCell align="center" sx={{ py: 1, pr: 1 }}>
                          {url && (
                            <IconButton size="small" component="a" href={url} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              sx={{ p: 0.4, color: 'text.disabled', '&:hover': { color: colors.primary } }}>
                              <OpenInNew sx={{ fontSize: 14 }} />
                            </IconButton>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>

        {/* RIGHT — Insights Panel */}
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.25, color: 'text.primary' }}>
            Insights
          </Typography>
          <Stack spacing={1.5}>
            {/* Implied probability distribution */}
            {sortedByPrice.length > 0 && (
              <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${alpha(theme.palette.divider, 0.1)}`, backgroundColor: alpha(theme.palette.background.paper, 0.6) }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1.25, fontSize: '0.68rem' }}>
                  📊 Implied Probability
                </Typography>
                {sortedByPrice.slice(0, 8).map((m, i) => (
                  <PriceBar key={m.market_id} title={m.title} yesPrice={m.yes_price} rank={i} />
                ))}
                {sortedByPrice.length > 8 && (
                  <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                    +{sortedByPrice.length - 8} more markets
                  </Typography>
                )}
              </Paper>
            )}

            {/* Most Likely */}
            {insights.most_likely && (
              <Paper elevation={0} sx={{ p: 1.75, borderRadius: 2, border: `1px solid ${alpha('#22C55E', 0.2)}`, backgroundColor: alpha('#22C55E', 0.04) }}>
                <Stack direction="row" spacing={0.75} alignItems="flex-start">
                  <EmojiEvents sx={{ fontSize: 18, color: '#22C55E', mt: 0.1, flexShrink: 0 }} />
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#22C55E', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 0.25 }}>Most Likely Outcome</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3, fontSize: '0.82rem' }}>{insights.most_likely.title}</Typography>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#22C55E', fontWeight: 700 }}>{fmtPrice(insights.most_likely.yes_price)} YES</Typography>
                  </Box>
                </Stack>
              </Paper>
            )}

            {/* Highest ROI */}
            {insights.highest_roi && (
              <Paper elevation={0} sx={{ p: 1.75, borderRadius: 2, border: `1px solid ${alpha('#F97316', 0.2)}`, backgroundColor: alpha('#F97316', 0.04) }}>
                <Stack direction="row" spacing={0.75} alignItems="flex-start">
                  <TrendingUp sx={{ fontSize: 18, color: '#F97316', mt: 0.1, flexShrink: 0 }} />
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#F97316', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 0.25 }}>Highest ROI</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3, fontSize: '0.82rem' }}>{insights.highest_roi.title}</Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.25 }}>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#F97316', fontWeight: 700 }}>{fmtROI(insights.highest_roi.ann_roi)}</Typography>
                      <Typography variant="caption" color="text.disabled">at {fmtPrice(insights.highest_roi.yes_price)}</Typography>
                    </Stack>
                  </Box>
                </Stack>
              </Paper>
            )}

            {/* Most Active */}
            {insights.most_active && (
              <Paper elevation={0} sx={{ p: 1.75, borderRadius: 2, border: `1px solid ${alpha('#3B82F6', 0.2)}`, backgroundColor: alpha('#3B82F6', 0.04) }}>
                <Stack direction="row" spacing={0.75} alignItems="flex-start">
                  <Bolt sx={{ fontSize: 18, color: '#3B82F6', mt: 0.1, flexShrink: 0 }} />
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#3B82F6', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 0.25 }}>Most Active (24h)</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3, fontSize: '0.82rem' }}>{insights.most_active.title}</Typography>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#3B82F6', fontWeight: 700 }}>{fmtVolume(insights.most_active.volume_24h)} today</Typography>
                  </Box>
                </Stack>
              </Paper>
            )}

            {/* Price distribution */}
            {insights.markets_with_price > 0 && (
              <Paper elevation={0} sx={{ p: 1.75, borderRadius: 2, border: `1px solid ${alpha(theme.palette.divider, 0.1)}`, backgroundColor: alpha(theme.palette.background.paper, 0.6) }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1.25, fontSize: '0.68rem' }}>
                  🎲 Price Distribution
                </Typography>
                {Object.entries(insights.price_buckets).map(([label, count]) => {
                  const pct = insights.markets_with_price > 0 ? (count / insights.markets_with_price) * 100 : 0;
                  const bColor = label.startsWith('>80') ? '#22C55E' : label.startsWith('60') ? '#84CC16' : label.startsWith('40') ? '#F59E0B' : label.startsWith('20') ? '#F97316' : '#EF4444';
                  return count > 0 ? (
                    <Box key={label} sx={{ mb: 0.75 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.25 }}>
                        <Typography variant="caption" sx={{ color: bColor, fontWeight: 600, fontSize: '0.7rem' }}>{label}</Typography>
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.68rem' }}>{count} ({pct.toFixed(0)}%)</Typography>
                      </Stack>
                      <LinearProgress variant="determinate" value={pct} sx={{ height: 5, borderRadius: 2, backgroundColor: alpha(bColor, 0.1), '& .MuiLinearProgress-bar': { borderRadius: 2, backgroundColor: bColor } }} />
                    </Box>
                  ) : null;
                })}
              </Paper>
            )}

            {/* Volume summary */}
            <Paper elevation={0} sx={{ p: 1.75, borderRadius: 2, border: `1px solid ${alpha(theme.palette.divider, 0.1)}`, backgroundColor: alpha(theme.palette.background.paper, 0.6) }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1, fontSize: '0.68rem' }}>
                💰 Volume Summary
              </Typography>
              <Stack spacing={0.6}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">Total Volume</Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{fmtVolume(insights.total_volume)}</Typography>
                </Stack>
                <Divider sx={{ opacity: 0.3 }} />
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">24h Volume</Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#22C55E' }}>{insights.volume_24h > 0 ? fmtVolume(insights.volume_24h) : '—'}</Typography>
                </Stack>
                <Divider sx={{ opacity: 0.3 }} />
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">Markets</Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{data.market_count}</Typography>
                </Stack>
              </Stack>
            </Paper>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
};

export default EventDetailDBPage;
