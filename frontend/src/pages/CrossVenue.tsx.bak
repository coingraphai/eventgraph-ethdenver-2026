import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Button,
  CircularProgress,
  TextField,
  Stack,
  Paper,
  IconButton,
  Tooltip,
  Alert,
  InputAdornment,
  Collapse,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Tabs,
  Tab,
} from '@mui/material';
import {
  OpenInNew,
  Refresh,
  CompareArrows,
  Search,
  ExpandMore,
  ExpandLess,
  TrendingUp,
  Category,
  AccessTime,
  TableChart,
  ViewModule,
} from '@mui/icons-material';

// Types
interface MarketOutcome {
  market_id: string;
  title: string;
  yes_price: number | null;
  no_price: number | null;
  yes_bid: number | null;
  yes_ask: number | null;
  volume: number;
  url: string | null;
}

interface PlatformEvent {
  event_id: string;
  title: string;
  url: string;
  total_volume: number;
  market_count: number;
  end_date?: string | number;
  category?: string;
  markets: MarketOutcome[];
}

interface CrossVenueEvent {
  canonical_title: string;
  similarity_score: number;
  match_confidence: string;
  polymarket: PlatformEvent;
  kalshi: PlatformEvent;
  total_volume: number;
  volume_difference: number;
  volume_ratio: number;
  market_count_diff: number;
  end_date_match: boolean;
}

interface CrossVenueEventsStats {
  total_event_matches: number;
  high_confidence_matches: number;
  avg_similarity: number;
  total_combined_volume: number;
  polymarket_events_scanned: number;
  kalshi_events_scanned: number;
  scan_time: number;
}

// Utility functions
const formatVolume = (vol: number): string => {
  if (vol >= 1_000_000_000) return `$${(vol / 1_000_000_000).toFixed(1)}B`;
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K`;
  return `$${vol.toFixed(0)}`;
};

const formatPrice = (price: number | null): string => {
  if (price === null || price === undefined) return '—';
  return `${(price * 100).toFixed(0)}¢`;
};

const formatDate = (timestamp?: string | number): string => {
  if (!timestamp) return 'N/A';
  try {
    const ts = typeof timestamp === 'string' ? parseInt(timestamp) : timestamp;
    return new Date(ts * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'N/A';
  }
};

const getConfidenceColor = (confidence: string): 'success' | 'warning' | 'default' => {
  if (confidence === 'high') return 'success';
  if (confidence === 'medium') return 'warning';
  return 'default';
};

// Expandable Event Card Component
const EventCard: React.FC<{ event: CrossVenueEvent }> = ({ event }) => {
  const [expanded, setExpanded] = useState(false);

  const polyMarkets = event.polymarket.markets || [];
  const kalshiMarkets = event.kalshi.markets || [];

  return (
    <Card
      sx={{
        border: 2,
        borderColor:
          event.match_confidence === 'high'
            ? 'success.main'
            : event.match_confidence === 'medium'
            ? 'warning.main'
            : 'divider',
        mb: 2,
      }}
    >
      <CardContent sx={{ pb: 1 }}>
        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
              {event.canonical_title}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" gap={0.5}>
              <Chip
                label={`${(event.similarity_score * 100).toFixed(0)}% Match`}
                color={getConfidenceColor(event.match_confidence)}
                size="small"
              />
              <Chip
                icon={<TrendingUp sx={{ fontSize: 16 }} />}
                label={formatVolume(event.total_volume)}
                size="small"
                variant="outlined"
              />
              {event.polymarket.category && (
                <Chip
                  icon={<Category sx={{ fontSize: 16 }} />}
                  label={event.polymarket.category}
                  size="small"
                  variant="outlined"
                  color="info"
                />
              )}
              {event.end_date_match && (
                <Chip
                  icon={<AccessTime sx={{ fontSize: 16 }} />}
                  label="Same End Date"
                  size="small"
                  variant="outlined"
                  color="success"
                />
              )}
            </Stack>
          </Box>
          <Stack direction="row" spacing={1}>
            <Tooltip title="View on Polymarket">
              <IconButton
                size="small"
                href={event.polymarket.url}
                target="_blank"
                sx={{ bgcolor: 'primary.dark', '&:hover': { bgcolor: 'primary.main' } }}
              >
                <OpenInNew fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="View on Kalshi">
              <IconButton
                size="small"
                href={event.kalshi.url}
                target="_blank"
                sx={{ bgcolor: 'secondary.dark', '&:hover': { bgcolor: 'secondary.main' } }}
              >
                <OpenInNew fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        {/* Summary Table */}
        <TableContainer component={Paper} sx={{ mb: 2, bgcolor: 'background.default' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.900' }}>
                <TableCell sx={{ fontWeight: 'bold', width: '20%' }}>Platform</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Event Title</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Volume</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>Markets</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>End Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                <TableCell>
                  <Chip label="Polymarket" size="small" color="primary" />
                </TableCell>
                <TableCell sx={{ maxWidth: 300 }}>
                  <Typography variant="body2" noWrap title={event.polymarket.title}>
                    {event.polymarket.title}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" color="success.main" fontWeight="bold">
                    {formatVolume(event.polymarket.total_volume)}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Chip label={event.polymarket.market_count} size="small" variant="outlined" />
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" color="text.secondary">
                    {formatDate(event.polymarket.end_date)}
                  </Typography>
                </TableCell>
              </TableRow>
              <TableRow sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                <TableCell>
                  <Chip label="Kalshi" size="small" color="secondary" />
                </TableCell>
                <TableCell sx={{ maxWidth: 300 }}>
                  <Typography variant="body2" noWrap title={event.kalshi.title}>
                    {event.kalshi.title}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" color="success.main" fontWeight="bold">
                    {formatVolume(event.kalshi.total_volume)}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Chip label={event.kalshi.market_count} size="small" variant="outlined" />
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" color="text.secondary">
                    {formatDate(event.kalshi.end_date)}
                  </Typography>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        {/* Expand Button for Markets */}
        {(polyMarkets.length > 0 || kalshiMarkets.length > 0) && (
          <Button
            onClick={() => setExpanded(!expanded)}
            endIcon={expanded ? <ExpandLess /> : <ExpandMore />}
            size="small"
            sx={{ mb: 1 }}
          >
            {expanded ? 'Hide' : 'Show'} Market Prices ({Math.max(polyMarkets.length, kalshiMarkets.length)} markets)
          </Button>
        )}

        {/* Expanded Markets Table */}
        <Collapse in={expanded}>
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              {/* Polymarket Markets */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 2, bgcolor: 'grey.900', borderLeft: 3, borderColor: 'primary.main' }}>
                  <Typography variant="subtitle2" fontWeight="bold" color="primary.light" sx={{ mb: 1 }}>
                    Polymarket Markets
                  </Typography>
                  {polyMarkets.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No market data available
                    </Typography>
                  ) : (
                    <TableContainer sx={{ maxHeight: 300 }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ bgcolor: 'grey.900', fontWeight: 'bold' }}>Outcome</TableCell>
                            <TableCell align="center" sx={{ bgcolor: 'grey.900', fontWeight: 'bold', color: 'success.main' }}>YES</TableCell>
                            <TableCell align="center" sx={{ bgcolor: 'grey.900', fontWeight: 'bold', color: 'error.main' }}>NO</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'grey.900', fontWeight: 'bold' }}>Vol</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {polyMarkets.map((mkt, idx) => (
                            <TableRow key={mkt.market_id || idx} hover>
                              <TableCell sx={{ maxWidth: 150 }}>
                                <Typography variant="body2" noWrap title={mkt.title}>
                                  {mkt.url ? (
                                    <a href={mkt.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                                      {mkt.title.length > 40 ? mkt.title.slice(0, 40) + '...' : mkt.title}
                                    </a>
                                  ) : (
                                    mkt.title.length > 40 ? mkt.title.slice(0, 40) + '...' : mkt.title
                                  )}
                                </Typography>
                              </TableCell>
                              <TableCell align="center">
                                <Typography variant="body2" color="success.main" fontWeight="bold">
                                  {formatPrice(mkt.yes_price)}
                                </Typography>
                              </TableCell>
                              <TableCell align="center">
                                <Typography variant="body2" color="error.main">
                                  {formatPrice(mkt.no_price)}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="caption" color="text.secondary">
                                  {formatVolume(mkt.volume)}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Paper>
              </Grid>

              {/* Kalshi Markets */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 2, bgcolor: 'grey.900', borderLeft: 3, borderColor: 'secondary.main' }}>
                  <Typography variant="subtitle2" fontWeight="bold" color="secondary.light" sx={{ mb: 1 }}>
                    Kalshi Markets
                  </Typography>
                  {kalshiMarkets.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No market data available
                    </Typography>
                  ) : (
                    <TableContainer sx={{ maxHeight: 300 }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ bgcolor: 'grey.900', fontWeight: 'bold' }}>Outcome</TableCell>
                            <TableCell align="center" sx={{ bgcolor: 'grey.900', fontWeight: 'bold', color: 'success.main' }}>YES</TableCell>
                            <TableCell align="center" sx={{ bgcolor: 'grey.900', fontWeight: 'bold', color: 'error.main' }}>NO</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'grey.900', fontWeight: 'bold' }}>Vol</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {kalshiMarkets.map((mkt, idx) => (
                            <TableRow key={mkt.market_id || idx} hover>
                              <TableCell sx={{ maxWidth: 150 }}>
                                <Typography variant="body2" noWrap title={mkt.title}>
                                  {mkt.url ? (
                                    <a href={mkt.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                                      {mkt.title.length > 40 ? mkt.title.slice(0, 40) + '...' : mkt.title}
                                    </a>
                                  ) : (
                                    mkt.title.length > 40 ? mkt.title.slice(0, 40) + '...' : mkt.title
                                  )}
                                </Typography>
                              </TableCell>
                              <TableCell align="center">
                                <Typography variant="body2" color="success.main" fontWeight="bold">
                                  {formatPrice(mkt.yes_price)}
                                </Typography>
                              </TableCell>
                              <TableCell align="center">
                                <Typography variant="body2" color="error.main">
                                  {formatPrice(mkt.no_price)}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="caption" color="text.secondary">
                                  {formatVolume(mkt.volume)}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Paper>
              </Grid>
            </Grid>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
};

// Main Component
export const CrossVenue: React.FC = () => {
  const [events, setEvents] = useState<CrossVenueEvent[]>([]);
  const [stats, setStats] = useState<CrossVenueEventsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        min_similarity: '0.60',
        min_volume: '5000',
        limit: '100',
      });

      const response = await fetch(`/api/cross-venue-events?${params}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setEvents(data.events || []);
      setStats(data.stats || null);
    } catch (err) {
      console.error('Error fetching cross-venue events:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
    } finally {
      setLoading(false);
    }
  };

  // Filter events by search
  const filteredEvents = events.filter(
    (e) =>
      searchQuery === '' ||
      e.canonical_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.polymarket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.kalshi.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.polymarket.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Box sx={{ p: 3, maxWidth: 1600, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
          <CompareArrows sx={{ fontSize: 48, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">
              Cross-Venue Event Comparison
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Matching events across Polymarket & Kalshi with market-level prices
            </Typography>
          </Box>
        </Stack>

        {/* Stats Cards */}
        {!loading && stats && (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6} sm={4} md={2}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'primary.dark' }}>
                <Typography variant="h5" color="white" fontWeight="bold">
                  {stats.total_event_matches}
                </Typography>
                <Typography variant="caption" color="grey.300">
                  Matched Events
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'success.dark' }}>
                <Typography variant="h5" color="white" fontWeight="bold">
                  {stats.high_confidence_matches}
                </Typography>
                <Typography variant="caption" color="grey.300">
                  High Confidence
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h5" color="primary.main" fontWeight="bold">
                  {(stats.avg_similarity * 100).toFixed(0)}%
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Avg Similarity
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h5" color="warning.main" fontWeight="bold">
                  {formatVolume(stats.total_combined_volume)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Total Volume
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h5" fontWeight="bold">
                  {stats.polymarket_events_scanned}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Poly Events
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h5" fontWeight="bold">
                  {stats.kalshi_events_scanned}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Kalshi Events
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        )}

        {/* Search, View Toggle, Refresh */}
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" gap={1}>
          <TextField
            size="small"
            placeholder="Search events, categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ width: 300 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />
          <Tabs value={viewMode} onChange={(_, v) => setViewMode(v)} sx={{ minHeight: 36 }}>
            <Tab value="cards" icon={<ViewModule />} iconPosition="start" label="Cards" sx={{ minHeight: 36, py: 0 }} />
            <Tab value="table" icon={<TableChart />} iconPosition="start" label="Table" sx={{ minHeight: 36, py: 0 }} />
          </Tabs>
          <Button variant="outlined" startIcon={<Refresh />} onClick={fetchEvents} disabled={loading}>
            Refresh
          </Button>
        </Stack>
      </Box>

      {/* Loading State */}
      {loading && (
        <Box sx={{ py: 8 }}>
          <Stack alignItems="center" spacing={2}>
            <CircularProgress size={48} />
            <Typography color="text.secondary">Scanning platforms for matching events...</Typography>
            <LinearProgress sx={{ width: 200 }} />
          </Stack>
        </Box>
      )}

      {/* Error State */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          {filteredEvents.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">No matching events found. Try adjusting your search.</Typography>
            </Paper>
          ) : viewMode === 'cards' ? (
            <Stack spacing={2}>
              {filteredEvents.map((event, idx) => (
                <EventCard key={`${event.polymarket.event_id}-${event.kalshi.event_id}-${idx}`} event={event} />
              ))}
            </Stack>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.900' }}>
                    <TableCell sx={{ fontWeight: 'bold' }}>Event</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>Match</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>Category</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>Poly Vol</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>Poly Mkts</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>Kalshi Vol</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>Kalshi Mkts</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>Total Vol</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>Links</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredEvents.map((event, idx) => (
                    <TableRow
                      key={`${event.polymarket.event_id}-${event.kalshi.event_id}-${idx}`}
                      hover
                      sx={{
                        borderLeft: 4,
                        borderColor:
                          event.match_confidence === 'high' ? 'success.main' : event.match_confidence === 'medium' ? 'warning.main' : 'transparent',
                      }}
                    >
                      <TableCell sx={{ maxWidth: 300 }}>
                        <Typography variant="body2" fontWeight="bold" noWrap title={event.canonical_title}>
                          {event.canonical_title}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={`${(event.similarity_score * 100).toFixed(0)}%`} size="small" color={getConfidenceColor(event.match_confidence)} />
                      </TableCell>
                      <TableCell align="center">
                        {event.polymarket.category && <Chip label={event.polymarket.category} size="small" variant="outlined" />}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="primary.main">
                          {formatVolume(event.polymarket.total_volume)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">{event.polymarket.market_count}</TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="secondary.main">
                          {formatVolume(event.kalshi.total_volume)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">{event.kalshi.market_count}</TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight="bold" color="success.main">
                          {formatVolume(event.total_volume)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Tooltip title="Polymarket">
                            <IconButton size="small" href={event.polymarket.url} target="_blank">
                              <OpenInNew fontSize="small" color="primary" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Kalshi">
                            <IconButton size="small" href={event.kalshi.url} target="_blank">
                              <OpenInNew fontSize="small" color="secondary" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </Box>
  );
};
