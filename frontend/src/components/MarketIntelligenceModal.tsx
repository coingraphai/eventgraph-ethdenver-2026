/**
 * Market Intelligence Modal - 4-Layer Design
 * 
 * Layer 1: Market Truth (Probability, Liquidity, Flow Bias, Market Quality)
 * Layer 2: Intelligence (Signals, Conviction, Whale, Regime)
 * Layer 3: Risk & Stability (Fragility, Volatility, Spread)
 * Layer 4: Execution (Cost Estimator, Raw Data)
 * 
 * Uses YC Top-10 Signals specification.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  Stack,
  IconButton,
  Avatar,
  CircularProgress,
  Alert,
  Divider,
  LinearProgress,
  Slider,
  useTheme,
  alpha,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
} from '@mui/material';
import {
  Close,
  OpenInNew,
  TrendingUp,
  TrendingDown,
  TrendingFlat,
  Warning,
  CheckCircle,
  LocalFireDepartment,
  Waves,
  Shield,
  ShowChart,
  AccountBalance,
  Info,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { TRADING_COLORS } from '../utils/colors';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Utility to add ref=eventgraph to any URL for affiliate tracking
const addRefParam = (url: string): string => {
  if (!url) return url;
  return `${url}${url.includes('?') ? '&' : '?'}ref=eventgraph`;
};

// Colors
const YES_COLOR = TRADING_COLORS.YES;
const NO_COLOR = TRADING_COLORS.NO;
const NEUTRAL_COLOR = '#6b7280';

// ============================================================================
// Types - Updated for new JSON contract
// ============================================================================

interface Market {
  market_id: string;
  source_market_id?: string;
  title: string;
  yes_price: number | null;
  no_price: number | null;
  volume_total: number | null;
  volume_24h: number | null;
  source_url?: string | null;
  image_url?: string | null;
  token_id_yes?: string;
  token_id_no?: string;
}

interface MarketIntelligence {
  market: {
    market_id: string;
    token_id: string | null;
    platform: string;
  };
  truth: {
    probability: {
      value: number;
      display: string;
      confidence: string;
    };
    liquidity: {
      score: number | null;
      status: string;
      confidence: string;
      description: string;
    };
    flow: {
      score: number; // -100 to +100
      label: string;
      confidence: string;
      buy_volume: number;
      sell_volume: number;
    };
    quality: {
      score: number;
      label: string;
      confidence: string;
      description: string;
    };
  };
  now: {
    insights: Array<{
      type: string;
      level: string;
      text: string;
      ts: number;
    }>;
    conviction: {
      detected: boolean;
      level: string | null;
      price_move: number;
      price_move_pct: number;
      direction: string | null;
      description: string;
    };
    whale: {
      whale_count: number;
      whale_share: number;
      whale_trades: Array<{
        timestamp: string;
        side: string;
        size: number;
        price: number;
        value: number;
      }>;
      level: string;
      description: string;
    };
    regime: {
      regime: string;
      momentum: number;
      momentum_pts: number;
      flip_rate: number;
      description: string;
    };
    trade_stats: {
      total: number;
      buy_count: number;
      sell_count: number;
      total_volume: number;
    };
    recent_trades: Array<{
      trade_id?: string;
      timestamp: string;
      side: string;
      price: number;
      quantity?: number;
      shares_normalized?: number;
      total_value?: number;
    }>;
  };
  risk: {
    fragility: {
      score: number | null;
      level: string;
      confidence: string;
      description: string;
    };
    volatility: {
      score: number;
      level: string;
      confidence: string;
      description: string;
    };
    spread: {
      abs: number;
      bps: number;
      best_bid: number;
      best_ask: number;
    };
  };
  execution: {
    mid: number;
    estimates: Array<{
      notional: number;
      buy_slippage_pts: number | null;
      sell_slippage_pts: number | null;
      feasible: boolean;
    }>;
    confidence: string;
    orderbook_status: string;
  };
  raw?: {
    trades_count: number;
    orderbook_bids: number;
    orderbook_asks: number;
    orderbook_status: string;
  };
  _meta?: {
    timestamp: string;
    hours_analyzed: number;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  market: Market | null;
  platform: string;
}

// ============================================================================
// Helper Components
// ============================================================================

const MetricTile: React.FC<{
  label: string;
  value: React.ReactNode;
  subtext?: string;
  color?: string;
  icon?: React.ReactNode;
  size?: 'small' | 'large';
  confidence?: string;
}> = ({ label, value, subtext, color, icon, size = 'large', confidence }) => {
  const theme = useTheme();
  
  return (
    <Card 
      variant="outlined" 
      sx={{ 
        height: '100%',
        bgcolor: alpha(theme.palette.background.paper, 0.6),
        borderColor: alpha(theme.palette.divider, 0.3),
      }}
    >
      <CardContent sx={{ py: size === 'small' ? 1.5 : 2, px: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
          {icon}
          <Typography variant="caption" color="text.secondary" fontWeight={500}>
            {label}
          </Typography>
          {confidence && confidence !== 'high' && (
            <Tooltip title={`Confidence: ${confidence}`}>
              <Info fontSize="inherit" sx={{ color: 'text.disabled', fontSize: 12 }} />
            </Tooltip>
          )}
        </Stack>
        <Typography 
          variant={size === 'large' ? 'h4' : 'h6'} 
          fontWeight={700}
          color={color || 'text.primary'}
          sx={{ lineHeight: 1.2 }}
        >
          {value}
        </Typography>
        {subtext && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {subtext}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

const FlowBiasGauge: React.FC<{ score: number }> = ({ score }) => {
  // score is -100 to +100, convert to 0-100 for visual
  const visualValue = (score + 100) / 2;
  const theme = useTheme();
  
  const getColor = () => {
    if (score >= 20) return YES_COLOR;
    if (score <= -20) return NO_COLOR;
    return NEUTRAL_COLOR;
  };
  
  return (
    <Box sx={{ width: '100%', mt: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption" color={NO_COLOR}>−100 Sell</Typography>
        <Typography variant="caption" color="text.disabled">0</Typography>
        <Typography variant="caption" color={YES_COLOR}>+100 Buy</Typography>
      </Box>
      <Box sx={{ position: 'relative', height: 8 }}>
        <LinearProgress
          variant="determinate"
          value={100}
          sx={{
            height: 8,
            borderRadius: 4,
            bgcolor: alpha(theme.palette.grey[500], 0.2),
            '& .MuiLinearProgress-bar': {
              display: 'none'
            }
          }}
        />
        {/* Indicator marker */}
        <Box
          sx={{
            position: 'absolute',
            top: -2,
            left: `${visualValue}%`,
            transform: 'translateX(-50%)',
            width: 12,
            height: 12,
            borderRadius: '50%',
            bgcolor: getColor(),
            border: '2px solid',
            borderColor: 'background.paper',
            boxShadow: 1,
          }}
        />
      </Box>
    </Box>
  );
};

const QualityBadge: React.FC<{ score: number; label: string }> = ({ score, label }) => {
  let color: 'success' | 'warning' | 'error' = 'warning';
  if (score >= 70) color = 'success';
  else if (score < 45) color = 'error';
  
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Typography variant="h5" fontWeight={700}>{score}</Typography>
      <Chip 
        label={label} 
        color={color}
        size="small"
        sx={{ fontWeight: 600 }}
      />
    </Stack>
  );
};

const InsightCard: React.FC<{
  insight: {
    type: string;
    level: string;
    text: string;
    ts: number;
  };
}> = ({ insight }) => {
  const theme = useTheme();
  
  const getIcon = () => {
    switch (insight.type) {
      case 'conviction': return '🔥';
      case 'whale': return '🐳';
      case 'regime': return '📈';
      case 'warning': return '⚠️';
      default: return '💡';
    }
  };
  
  const getColor = () => {
    switch (insight.level) {
      case 'high': return theme.palette.error.main;
      case 'medium': return theme.palette.warning.main;
      default: return theme.palette.info.main;
    }
  };
  
  return (
    <Paper 
      variant="outlined" 
      sx={{ 
        p: 1.5, 
        mb: 1,
        bgcolor: alpha(getColor(), 0.05),
        borderColor: alpha(getColor(), 0.3),
        borderLeft: `3px solid ${getColor()}`,
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Typography variant="h6">{getIcon()}</Typography>
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" fontWeight={500}>
            {insight.text}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
};

const VolatilityBar: React.FC<{ score: number; level: string }> = ({ score, level }) => {
  const theme = useTheme();
  
  const getColor = () => {
    if (level === 'hot') return theme.palette.error.main;
    if (level === 'moderate') return theme.palette.warning.main;
    return theme.palette.success.main;
  };
  
  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption">Calm</Typography>
        <Typography variant="caption">Hot</Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={score}
        sx={{
          height: 6,
          borderRadius: 3,
          bgcolor: alpha(theme.palette.grey[500], 0.2),
          '& .MuiLinearProgress-bar': {
            borderRadius: 3,
            bgcolor: getColor(),
          }
        }}
      />
    </Box>
  );
};

// ============================================================================
// Main Component
// ============================================================================

const MarketIntelligenceModal: React.FC<Props> = ({ open, onClose, market, platform }) => {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intelligence, setIntelligence] = useState<MarketIntelligence | null>(null);
  const [tradeSize, setTradeSize] = useState<number>(10000);
  
  // Fetch market intelligence when modal opens
  const fetchIntelligence = useCallback(async () => {
    if (!market) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const tokenId = market.token_id_yes || market.source_market_id || market.market_id;
      const marketId = market.source_market_id || market.market_id;
      
      const url = `${API_BASE_URL}/api/market-intelligence/${platform}/${encodeURIComponent(marketId)}?token_id=${encodeURIComponent(tokenId)}&hours=24`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch intelligence: ${response.status}`);
      }
      
      const data = await response.json();
      setIntelligence(data);
    } catch (err) {
      console.error('Failed to fetch market intelligence:', err);
      setError(err instanceof Error ? err.message : 'Failed to load market intelligence');
    } finally {
      setLoading(false);
    }
  }, [market, platform]);
  
  useEffect(() => {
    if (open && market) {
      fetchIntelligence();
    }
  }, [open, market, fetchIntelligence]);
  
  if (!market) return null;
  
  const formatVolume = (v: number | null | undefined) => {
    if (v == null) return '$0';
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
    return `$${v.toFixed(0)}`;
  };
  
  const getFlowIcon = (direction: string) => {
    if (direction === 'buy') return <TrendingUp sx={{ color: YES_COLOR }} />;
    if (direction === 'sell') return <TrendingDown sx={{ color: NO_COLOR }} />;
    return <TrendingFlat sx={{ color: NEUTRAL_COLOR }} />;
  };
  
  const getFragilityColor = (level: string) => {
    if (level === 'low') return 'success.main';
    if (level === 'medium') return 'warning.main';
    return 'error.main';
  };
  
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { 
          maxHeight: '85vh',
          bgcolor: theme.palette.background.default,
        }
      }}
    >
      {/* Header */}
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Avatar
            src={market.image_url || undefined}
            alt={market.title}
            sx={{ width: 48, height: 48 }}
          >
            {market.title.charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" fontWeight={600}>
              {market.title}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
              <Chip
                label={`Yes: ${((market.yes_price || 0) * 100).toFixed(1)}¢`}
                size="small"
                sx={{ bgcolor: alpha(YES_COLOR, 0.2), color: YES_COLOR, fontWeight: 600 }}
              />
              <Chip
                label={`No: ${((market.no_price || (1 - (market.yes_price || 0))) * 100).toFixed(1)}¢`}
                size="small"
                sx={{ bgcolor: alpha(NO_COLOR, 0.2), color: NO_COLOR, fontWeight: 600 }}
              />
              {market.source_url && (
                <IconButton
                  size="small"
                  href={addRefParam(market.source_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <OpenInNew fontSize="small" />
                </IconButton>
              )}
            </Stack>
          </Box>
          <IconButton onClick={onClose}>
            <Close />
          </IconButton>
        </Stack>
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 0 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
            <Stack alignItems="center" spacing={2}>
              <CircularProgress size={48} />
              <Typography color="text.secondary">Loading market intelligence...</Typography>
            </Stack>
          </Box>
        )}
        
        {error && (
          <Alert severity="error" sx={{ m: 3 }}>
            {error}
          </Alert>
        )}
        
        {!loading && !error && intelligence && (
          <Box sx={{ p: 3 }}>
            {/* ============================================================ */}
            {/* LAYER 1: MARKET TRUTH */}
            {/* ============================================================ */}
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
              📌 Market Truth
            </Typography>
            
            <Grid container spacing={2} sx={{ mb: 4 }}>
              {/* Probability Tile */}
              <Grid item xs={6} sm={3}>
                <MetricTile
                  label="Probability"
                  value={intelligence.truth.probability.display || `${Math.round((market.yes_price || 0) * 100)}%`}
                  subtext={`Confidence: ${intelligence.truth.probability.confidence}`}
                  color={YES_COLOR}
                  icon={<ShowChart fontSize="small" sx={{ color: YES_COLOR }} />}
                  confidence={intelligence.truth.probability.confidence}
                />
              </Grid>
              
              {/* Liquidity Tile */}
              <Grid item xs={6} sm={3}>
                <Card variant="outlined" sx={{ height: '100%', bgcolor: alpha(theme.palette.background.paper, 0.6) }}>
                  <CardContent sx={{ py: 2, px: 2 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                      <AccountBalance fontSize="small" color="primary" />
                      <Typography variant="caption" color="text.secondary" fontWeight={500}>
                        Liquidity
                      </Typography>
                      {intelligence.truth.liquidity.confidence && (
                        <Chip label={intelligence.truth.liquidity.confidence} size="small" sx={{ fontSize: '0.6rem', height: 16 }} />
                      )}
                    </Stack>
                    <Typography variant="h4" fontWeight={700}>
                      {intelligence.truth.liquidity.score ?? 0}
                      <Typography component="span" variant="body2" color="text.secondary"> / 100</Typography>
                    </Typography>
                    <LinearProgress 
                      variant="determinate" 
                      value={intelligence.truth.liquidity.score ?? 0}
                      sx={{ mt: 1, height: 6, borderRadius: 3 }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      {intelligence.truth.liquidity.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              {/* Flow Imbalance Tile */}
              <Grid item xs={6} sm={3}>
                <Card variant="outlined" sx={{ height: '100%', bgcolor: alpha(theme.palette.background.paper, 0.6) }}>
                  <CardContent sx={{ py: 2, px: 2 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                      <Waves fontSize="small" color="primary" />
                      <Typography variant="caption" color="text.secondary" fontWeight={500}>
                        Flow Imbalance
                      </Typography>
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      {getFlowIcon(intelligence.truth.flow.score > 10 ? 'buy' : intelligence.truth.flow.score < -10 ? 'sell' : 'neutral')}
                      <Typography variant="h5" fontWeight={700}>
                        {intelligence.truth.flow.label}
                        <Typography component="span" variant="body2" color="text.secondary">
                          {' '}({Math.abs(intelligence.truth.flow.score).toFixed(0)}%)
                        </Typography>
                      </Typography>
                    </Stack>
                    <FlowBiasGauge score={intelligence.truth.flow.score} />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      Buy: {formatVolume(intelligence.truth.flow.buy_volume)} | Sell: {formatVolume(intelligence.truth.flow.sell_volume)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              {/* Market Quality Tile */}
              <Grid item xs={6} sm={3}>
                <Card variant="outlined" sx={{ height: '100%', bgcolor: alpha(theme.palette.background.paper, 0.6) }}>
                  <CardContent sx={{ py: 2, px: 2 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                      <Shield fontSize="small" color="primary" />
                      <Typography variant="caption" color="text.secondary" fontWeight={500}>
                        Market Quality
                      </Typography>
                    </Stack>
                    <Box sx={{ mb: 1 }}>
                      <QualityBadge score={intelligence.truth.quality.score} label={intelligence.truth.quality.label} />
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {intelligence.truth.quality.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
            
            {/* ============================================================ */}
            {/* LAYER 2: WHAT'S HAPPENING NOW */}
            {/* ============================================================ */}
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
              🔥 What's Happening Now
            </Typography>
            
            <Grid container spacing={3} sx={{ mb: 4 }}>
              {/* Insights Feed */}
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    Market Insights
                  </Typography>
                  
                  {/* Whale Activity */}
                  {intelligence.now.whale && (
                    <Alert 
                      severity={intelligence.now.whale.whale_count > 0 ? 'warning' : 'info'}
                      sx={{ mb: 2 }}
                    >
                      <Typography variant="body2" fontWeight={600}>
                        {intelligence.now.whale.whale_count > 0 ? `🐋 ${intelligence.now.whale.whale_count} Whale Trade(s) Detected` : 'No Whale Activity'}
                      </Typography>
                      <Typography variant="caption">
                        {intelligence.now.whale.description}
                      </Typography>
                    </Alert>
                  )}
                  
                  {/* Conviction Move */}
                  {intelligence.now.conviction && (
                    <Alert 
                      severity={intelligence.now.conviction.detected ? 'success' : 'info'}
                      sx={{ mb: 2 }}
                    >
                      <Typography variant="body2" fontWeight={600}>
                        {intelligence.now.conviction.detected ? '🎯 Conviction Move Detected' : 'No Strong Conviction'}
                      </Typography>
                      <Typography variant="caption">
                        {intelligence.now.conviction.description}
                      </Typography>
                    </Alert>
                  )}
                  
                  {/* Regime */}
                  {intelligence.now.regime && (
                    <Alert 
                      severity={intelligence.now.regime.regime === 'trending' ? 'info' : 
                               intelligence.now.regime.regime === 'choppy' ? 'warning' : 'success'}
                      sx={{ mb: 2 }}
                    >
                      <Typography variant="body2" fontWeight={600}>
                        📊 Regime: {intelligence.now.regime.regime.charAt(0).toUpperCase() + intelligence.now.regime.regime.slice(1)}
                      </Typography>
                      <Typography variant="caption">
                        {intelligence.now.regime.description}
                      </Typography>
                    </Alert>
                  )}
                  
                  {/* Trade Stats Summary */}
                  <Divider sx={{ my: 2 }} />
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Total Trades (24h)</Typography>
                      <Typography variant="h6" fontWeight={600}>
                        {intelligence.now.trade_stats?.total || 0}
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Total Volume</Typography>
                      <Typography variant="h6" fontWeight={600}>
                        {formatVolume(intelligence.now.trade_stats?.total_volume)}
                      </Typography>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
              
              {/* Recent Trades */}
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    Recent Large Trades
                  </Typography>
                  
                  <TableContainer sx={{ maxHeight: 280 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell>Time</TableCell>
                          <TableCell>Side</TableCell>
                          <TableCell align="right">Price</TableCell>
                          <TableCell align="right">Value</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(intelligence.now.recent_trades || []).slice(0, 10).map((trade, idx) => (
                          <TableRow key={idx}>
                            <TableCell>
                              <Typography variant="caption">
                                {trade.timestamp ? format(new Date(trade.timestamp), 'MMM d, HH:mm') : '-'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={trade.side}
                                size="small"
                                sx={{
                                  bgcolor: trade.side === 'BUY' ? alpha(YES_COLOR, 0.2) : alpha(NO_COLOR, 0.2),
                                  color: trade.side === 'BUY' ? YES_COLOR : NO_COLOR,
                                  fontWeight: 600,
                                  fontSize: '0.65rem',
                                  height: 20,
                                }}
                              />
                            </TableCell>
                            <TableCell align="right">
                              {(trade.price * 100).toFixed(1)}¢
                            </TableCell>
                            <TableCell align="right">
                              {formatVolume(trade.total_value)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              </Grid>
            </Grid>
            
            {/* ============================================================ */}
            {/* LAYER 3: RISK & STABILITY */}
            {/* ============================================================ */}
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
              ⚠️ Risk & Stability
            </Typography>
            
            <Grid container spacing={2} sx={{ mb: 4 }}>
              {/* Fragility Tile */}
              <Grid item xs={12} sm={4}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>
                      Fragility
                    </Typography>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ my: 1 }}>
                      <Typography variant="h5" fontWeight={700}>
                        {intelligence.risk.fragility.score}
                        <Typography component="span" variant="body2" color="text.secondary"> / 100</Typography>
                      </Typography>
                      <Chip 
                        label={intelligence.risk.fragility.level.toUpperCase()}
                        color={intelligence.risk.fragility.level === 'low' ? 'success' : 
                               intelligence.risk.fragility.level === 'medium' ? 'warning' : 'error'}
                        size="small"
                        sx={{ fontWeight: 600 }}
                      />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {intelligence.risk.fragility.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              {/* Volatility Tile */}
              <Grid item xs={12} sm={4}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>
                      Volatility Heat
                    </Typography>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ my: 1 }}>
                      <LocalFireDepartment 
                        sx={{ 
                          color: intelligence.risk.volatility.level === 'hot' ? 'error.main' :
                                 intelligence.risk.volatility.level === 'moderate' ? 'warning.main' : 'success.main'
                        }} 
                      />
                      <Typography variant="h6" fontWeight={600}>
                        {intelligence.risk.volatility.level.charAt(0).toUpperCase() + intelligence.risk.volatility.level.slice(1)}
                      </Typography>
                    </Stack>
                    <VolatilityBar 
                      score={intelligence.risk.volatility.score}
                      level={intelligence.risk.volatility.level}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      {intelligence.risk.volatility.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              {/* Orderbook Status Tile */}
              <Grid item xs={12} sm={4}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>
                      Orderbook Status
                    </Typography>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ my: 1 }}>
                      <Chip 
                        label={intelligence.execution.orderbook_status.toUpperCase()}
                        color={intelligence.execution.orderbook_status === 'ok' ? 'success' : 
                               intelligence.execution.orderbook_status === 'unreliable' ? 'warning' : 'error'}
                        size="small"
                        sx={{ fontWeight: 600 }}
                      />
                    </Stack>
                    {intelligence.risk.spread && (
                      <>
                        <Grid container spacing={1} sx={{ my: 1 }}>
                          <Grid item xs={6}>
                            <Typography variant="caption" color="text.secondary">Best Bid</Typography>
                            <Typography variant="body2" fontWeight={600} color={YES_COLOR}>
                              {(intelligence.risk.spread.best_bid * 100).toFixed(1)}¢
                            </Typography>
                          </Grid>
                          <Grid item xs={6}>
                            <Typography variant="caption" color="text.secondary">Best Ask</Typography>
                            <Typography variant="body2" fontWeight={600} color={NO_COLOR}>
                              {(intelligence.risk.spread.best_ask * 100).toFixed(1)}¢
                            </Typography>
                          </Grid>
                        </Grid>
                        <Typography variant="caption" color="text.secondary">
                          Spread: {(intelligence.risk.spread.bps / 100).toFixed(2)}%
                        </Typography>
                      </>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
            
            {/* ============================================================ */}
            {/* LAYER 4: EXECUTION */}
            {/* ============================================================ */}
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
              💰 Execution
            </Typography>
            
            <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Execution Cost Estimator
              </Typography>
              
              <Box sx={{ mb: 3 }}>
                <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                  {[1000, 10000, 50000, 100000].map((size) => (
                    <Button
                      key={size}
                      variant={tradeSize === size ? 'contained' : 'outlined'}
                      size="small"
                      onClick={() => setTradeSize(size)}
                    >
                      ${size >= 1000 ? `${size / 1000}K` : size}
                    </Button>
                  ))}
                </Stack>
                
                <Slider
                  value={tradeSize}
                  onChange={(_, v) => setTradeSize(v as number)}
                  min={1000}
                  max={100000}
                  step={1000}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v) => `$${v >= 1000 ? `${v/1000}K` : v}`}
                />
              </Box>
              
              {/* Find the estimate for the selected trade size */}
              {(() => {
                const estimate = intelligence.execution.estimates.find(
                  e => e.notional === tradeSize
                );
                if (estimate) {
                  const avgSlippage = ((estimate.buy_slippage_pts || 0) + (estimate.sell_slippage_pts || 0)) / 2;
                  const slippagePct = avgSlippage / 100; // Convert pts to %
                  return (
                    <Alert 
                      severity={
                        slippagePct < 1 ? 'success' :
                        slippagePct < 2 ? 'warning' : 'error'
                      }
                      sx={{ mb: 2 }}
                    >
                      <Typography variant="body2" fontWeight={600}>
                        Estimated price impact: ~{slippagePct.toFixed(2)}% ({avgSlippage.toFixed(0)} pts)
                      </Typography>
                      <Typography variant="caption">
                        Buy slippage: {estimate.buy_slippage_pts?.toFixed(0) || 'N/A'} pts | 
                        Sell slippage: {estimate.sell_slippage_pts?.toFixed(0) || 'N/A'} pts | 
                        {estimate.feasible ? '✓ Feasible' : '⚠️ May not be feasible'}
                      </Typography>
                    </Alert>
                  );
                }
                return (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    Select a trade size to see execution cost estimate
                  </Alert>
                );
              })()}
              
              {/* All estimates table */}
              <Typography variant="subtitle2" fontWeight={600} gutterBottom sx={{ mt: 2 }}>
                All Estimates
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Size</TableCell>
                      <TableCell align="right">Buy Slippage</TableCell>
                      <TableCell align="right">Sell Slippage</TableCell>
                      <TableCell align="center">Feasible</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {intelligence.execution.estimates.map((est, idx) => {
                      const avgSlippage = ((est.buy_slippage_pts || 0) + (est.sell_slippage_pts || 0)) / 2;
                      const slippagePct = avgSlippage / 100;
                      return (
                        <TableRow 
                          key={idx} 
                          selected={est.notional === tradeSize}
                          sx={{ cursor: 'pointer' }}
                          onClick={() => setTradeSize(est.notional)}
                        >
                          <TableCell>
                            ${est.notional >= 1000 ? `${est.notional / 1000}K` : est.notional}
                          </TableCell>
                          <TableCell align="right">
                            <Chip 
                              label={`${est.buy_slippage_pts?.toFixed(0) || 'N/A'} pts`}
                              size="small"
                              color={slippagePct < 1 ? 'success' : slippagePct < 2 ? 'warning' : 'error'}
                              sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Chip 
                              label={`${est.sell_slippage_pts?.toFixed(0) || 'N/A'} pts`}
                              size="small"
                              color={slippagePct < 1 ? 'success' : slippagePct < 2 ? 'warning' : 'error'}
                              sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                            />
                          </TableCell>
                          <TableCell align="center">
                            {est.feasible ? <CheckCircle color="success" fontSize="small" /> : <Warning color="warning" fontSize="small" />}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
            
            {/* Raw Data Summary */}
            {intelligence.raw && (
              <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Raw Data Summary
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Trades Analyzed</Typography>
                    <Typography variant="body1" fontWeight={600}>{intelligence.raw.trades_count}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Orderbook Bids</Typography>
                    <Typography variant="body1" fontWeight={600}>{intelligence.raw.orderbook_bids}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Orderbook Asks</Typography>
                    <Typography variant="body1" fontWeight={600}>{intelligence.raw.orderbook_asks}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Orderbook Status</Typography>
                    <Chip 
                      label={intelligence.raw.orderbook_status.toUpperCase()}
                      size="small"
                      color={intelligence.raw.orderbook_status === 'ok' ? 'success' : 'warning'}
                    />
                  </Grid>
                </Grid>
              </Paper>
            )}
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {market.source_url && (
          <Button
            variant="contained"
            endIcon={<OpenInNew />}
            href={addRefParam(market.source_url)}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on {platform}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default MarketIntelligenceModal;
