/**
 * Professional Trading Terminal
 * Real data integration with live market prices
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  Stack,
  Divider,
  Chip,
  IconButton,
  alpha,
  useTheme,
  Paper,
  Skeleton,
  keyframes,
  Grid,
  Tooltip,
} from '@mui/material';
import { 
  TrendingUp, 
  TrendingDown, 
  Star,
  StarBorder,
  Refresh,
  LocalFireDepartment,
  OpenInNew,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  fetchUnifiedMarkets, 
  UnifiedMarket,
  formatVolume 
} from '../services/unifiedMarketsApi';

// Animations
const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const blink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

// Platform colors
const PLATFORM_COLORS = {
  poly: { primary: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.1)' },
  kalshi: { primary: '#F97316', bg: 'rgba(249, 115, 22, 0.1)' },
};

interface WatchlistMarket extends UnifiedMarket {
  isFavorite?: boolean;
}

interface DataFreshness {
  last_updated: string | null;
  platforms: Record<string, { updated_at: string; item_count: number; status: string }>;
  server_time: string;
}

export const Terminal: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  
  // State
  const [markets, setMarkets] = useState<WatchlistMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMarket, setSelectedMarket] = useState<WatchlistMarket | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [dataFreshness, setDataFreshness] = useState<DataFreshness | null>(null);
  
  // Order state
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');
  const [orderDirection, setOrderDirection] = useState<'yes' | 'no'>('yes');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [orderSize, setOrderSize] = useState<string>('100');
  const [limitPrice, setLimitPrice] = useState<string>('');

  // Fetch top markets for watchlist
  const fetchMarkets = useCallback(async () => {
    setLoading(true);
    try {
      const [response, freshnessRes] = await Promise.all([
        fetchUnifiedMarkets({
          platform: 'all',
          category: 'trending',
          pageSize: 20,
          status: 'open',
          sort: 'volume_desc',
        }),
        axios.get<DataFreshness>(`${import.meta.env.VITE_API_BASE_URL || ''}/dashboard/data-freshness`).catch(() => null),
      ]);
      
      if (freshnessRes?.data) {
        setDataFreshness(freshnessRes.data);
      }
      
      const marketsWithFav = response.markets.map(m => ({
        ...m,
        isFavorite: favorites.has(`${m.platform}-${m.id}`),
      }));
      
      setMarkets(marketsWithFav);
      
      // Select first market if none selected
      if (!selectedMarket && marketsWithFav.length > 0) {
        setSelectedMarket(marketsWithFav[0]);
      }
    } catch (err) {
      console.error('Error fetching markets:', err);
    } finally {
      setLoading(false);
    }
  }, [favorites, selectedMarket]);

  useEffect(() => {
    fetchMarkets();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchMarkets, 30000);
    return () => clearInterval(interval);
  }, []);

  const toggleFavorite = (market: WatchlistMarket) => {
    const key = `${market.platform}-${market.id}`;
    setFavorites(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const handleMarketSelect = (market: WatchlistMarket) => {
    setSelectedMarket(market);
  };

  const openMarketDetail = (market: WatchlistMarket) => {
    const slug = market.extra?.market_slug || market.id;
    navigate(`/event/${market.platform}/${encodeURIComponent(slug)}`);
  };

  // Calculate order estimates
  const getPrice = () => {
    if (!selectedMarket) return 0.5;
    return orderDirection === 'yes' 
      ? (selectedMarket.last_price || 0.5)
      : (1 - (selectedMarket.last_price || 0.5));
  };

  const estimatedShares = orderSize ? parseFloat(orderSize) / getPrice() : 0;
  const estimatedFee = parseFloat(orderSize || '0') * 0.02;
  const potentialPayout = estimatedShares * 1;
  const potentialProfit = potentialPayout - parseFloat(orderSize || '0');

  return (
    <Box sx={{ 
      display: 'flex', 
      height: '100vh',
      backgroundColor: 'background.default',
      overflow: 'hidden',
    }}>
      {/* Left Panel - Watchlist */}
      <Box sx={{ 
        width: 320, 
        borderRight: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: alpha(theme.palette.background.paper, 0.4),
      }}>
        {/* Watchlist Header */}
        <Box sx={{ 
          p: 2, 
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: dataFreshness ? 1 : 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Top Markets
            </Typography>
            <IconButton size="small" onClick={fetchMarkets} disabled={loading}>
              <Refresh sx={{ fontSize: 18, animation: loading ? `${blink} 1s infinite` : 'none' }} />
            </IconButton>
          </Box>
          {dataFreshness?.last_updated && (
            <Tooltip title="Last data refresh from all platforms">
              <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#22C55E', display: 'inline-block' }} />
                Updated: {new Date(dataFreshness.last_updated).toLocaleTimeString()}
              </Typography>
            </Tooltip>
          )}
        </Box>

        {/* Markets List */}
        <List sx={{ flex: 1, overflowY: 'auto', py: 0 }}>
          {loading ? (
            [...Array(10)].map((_, i) => (
              <ListItem key={i} sx={{ py: 1 }}>
                <Skeleton variant="rectangular" width="100%" height={50} />
              </ListItem>
            ))
          ) : (
            markets.map((market) => {
              const isSelected = selectedMarket?.id === market.id && selectedMarket?.platform === market.platform;
              const price = market.last_price || 0;
              const volume24h = market.volume_24h_usd || 0;
              
              return (
                <ListItemButton
                  key={`${market.platform}-${market.id}`}
                  selected={isSelected}
                  onClick={() => handleMarketSelect(market)}
                  sx={{
                    py: 1.5,
                    px: 2,
                    borderBottom: `1px solid ${alpha(theme.palette.divider, 0.05)}`,
                    '&.Mui-selected': {
                      backgroundColor: alpha(theme.palette.primary.main, 0.1),
                      borderLeft: `3px solid ${theme.palette.primary.main}`,
                    },
                  }}
                >
                  <Box sx={{ width: '100%' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(market);
                        }}
                        sx={{ p: 0.25 }}
                      >
                        {favorites.has(`${market.platform}-${market.id}`) ? (
                          <Star sx={{ fontSize: 16, color: '#F59E0B' }} />
                        ) : (
                          <StarBorder sx={{ fontSize: 16, color: 'text.secondary' }} />
                        )}
                      </IconButton>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontWeight: 500,
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: '0.8rem',
                        }}
                      >
                        {market.title}
                      </Typography>
                      {volume24h > 100000 && (
                        <LocalFireDepartment sx={{ fontSize: 14, color: '#EF4444' }} />
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip
                        label={market.platform === 'poly' ? 'PM' : 'KL'}
                        size="small"
                        sx={{
                          height: 16,
                          fontSize: '0.6rem',
                          backgroundColor: PLATFORM_COLORS[market.platform].bg,
                          color: PLATFORM_COLORS[market.platform].primary,
                        }}
                      />
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          color: price > 0.5 ? '#22C55E' : '#EF4444',
                        }}
                      >
                        {(price * 100).toFixed(1)}¢
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                        {formatVolume(volume24h)}
                      </Typography>
                    </Box>
                  </Box>
                </ListItemButton>
              );
            })
          )}
        </List>
      </Box>

      {/* Center Panel - Chart & Info */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedMarket ? (
          <>
            {/* Market Header */}
            <Box sx={{ 
              p: 2, 
              borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
              backgroundColor: alpha(theme.palette.background.paper, 0.4),
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {selectedMarket.extra?.image && (
                  <Box
                    component="img"
                    src={selectedMarket.extra.image}
                    sx={{ width: 40, height: 40, borderRadius: 1 }}
                  />
                )}
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {selectedMarket.title}
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                      label={selectedMarket.platform === 'poly' ? 'Polymarket' : 'Kalshi'}
                      size="small"
                      sx={{
                        backgroundColor: PLATFORM_COLORS[selectedMarket.platform].bg,
                        color: PLATFORM_COLORS[selectedMarket.platform].primary,
                      }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      {selectedMarket.category}
                    </Typography>
                  </Stack>
                </Box>
                <IconButton onClick={() => openMarketDetail(selectedMarket)}>
                  <OpenInNew />
                </IconButton>
              </Box>
            </Box>

            {/* Price Display */}
            <Box sx={{ p: 3, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Grid container spacing={3}>
                {/* YES Price */}
                <Grid item xs={6}>
                  <Paper 
                    elevation={0}
                    sx={{ 
                      p: 3, 
                      textAlign: 'center',
                      backgroundColor: alpha('#22C55E', 0.1),
                      border: `1px solid ${alpha('#22C55E', 0.2)}`,
                      borderRadius: 2,
                    }}
                  >
                    <Typography variant="overline" color="text.secondary">
                      YES
                    </Typography>
                    <Typography 
                      variant="h2" 
                      sx={{ 
                        fontFamily: 'monospace', 
                        fontWeight: 700,
                        color: '#22C55E',
                      }}
                    >
                      {((selectedMarket.last_price || 0) * 100).toFixed(1)}¢
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatVolume(selectedMarket.volume_24h_usd)} 24h vol
                    </Typography>
                  </Paper>
                </Grid>

                {/* NO Price */}
                <Grid item xs={6}>
                  <Paper 
                    elevation={0}
                    sx={{ 
                      p: 3, 
                      textAlign: 'center',
                      backgroundColor: alpha('#EF4444', 0.1),
                      border: `1px solid ${alpha('#EF4444', 0.2)}`,
                      borderRadius: 2,
                    }}
                  >
                    <Typography variant="overline" color="text.secondary">
                      NO
                    </Typography>
                    <Typography 
                      variant="h2" 
                      sx={{ 
                        fontFamily: 'monospace', 
                        fontWeight: 700,
                        color: '#EF4444',
                      }}
                    >
                      {((1 - (selectedMarket.last_price || 0)) * 100).toFixed(1)}¢
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total: {formatVolume(selectedMarket.volume_total_usd)}
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>

              {/* Chart Placeholder */}
              <Paper
                elevation={0}
                sx={{
                  mt: 3,
                  flex: 1,
                  minHeight: 200,
                  borderRadius: 2,
                  backgroundColor: alpha(theme.palette.background.paper, 0.4),
                  border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Box sx={{ textAlign: 'center' }}>
                  <TrendingUp sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                  <Typography color="text.secondary">
                    Price chart - Click "View Details" for full analytics
                  </Typography>
                  <Button 
                    variant="outlined" 
                    sx={{ mt: 2 }}
                    onClick={() => openMarketDetail(selectedMarket)}
                  >
                    View Full Analytics
                  </Button>
                </Box>
              </Paper>
            </Box>
          </>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="text.secondary">Select a market to view details</Typography>
          </Box>
        )}
      </Box>

      {/* Right Panel - Order Entry */}
      <Box sx={{ 
        width: 320, 
        borderLeft: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: alpha(theme.palette.background.paper, 0.4),
      }}>
        {/* Order Type Header */}
        <Box sx={{ 
          p: 2, 
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Place Order
          </Typography>
          
          {/* Buy/Sell Toggle */}
          <ToggleButtonGroup
            value={orderSide}
            exclusive
            onChange={(_, val) => val && setOrderSide(val)}
            fullWidth
            size="small"
          >
            <ToggleButton 
              value="buy"
              sx={{
                '&.Mui-selected': {
                  backgroundColor: alpha('#22C55E', 0.2),
                  color: '#22C55E',
                  '&:hover': { backgroundColor: alpha('#22C55E', 0.3) },
                },
              }}
            >
              Buy
            </ToggleButton>
            <ToggleButton 
              value="sell"
              sx={{
                '&.Mui-selected': {
                  backgroundColor: alpha('#EF4444', 0.2),
                  color: '#EF4444',
                  '&:hover': { backgroundColor: alpha('#EF4444', 0.3) },
                },
              }}
            >
              Sell
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Order Form */}
        <Box sx={{ p: 2, flex: 1 }}>
          {/* YES/NO Toggle */}
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            Outcome
          </Typography>
          <ToggleButtonGroup
            value={orderDirection}
            exclusive
            onChange={(_, val) => val && setOrderDirection(val)}
            fullWidth
            size="small"
            sx={{ mb: 2 }}
          >
            <ToggleButton value="yes" sx={{ color: '#22C55E' }}>
              YES @ {((selectedMarket?.last_price || 0) * 100).toFixed(1)}¢
            </ToggleButton>
            <ToggleButton value="no" sx={{ color: '#EF4444' }}>
              NO @ {((1 - (selectedMarket?.last_price || 0)) * 100).toFixed(1)}¢
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Order Type */}
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            Order Type
          </Typography>
          <ToggleButtonGroup
            value={orderType}
            exclusive
            onChange={(_, val) => val && setOrderType(val)}
            fullWidth
            size="small"
            sx={{ mb: 2 }}
          >
            <ToggleButton value="market">Market</ToggleButton>
            <ToggleButton value="limit">Limit</ToggleButton>
          </ToggleButtonGroup>

          {/* Amount */}
          <TextField
            label="Amount (USD)"
            value={orderSize}
            onChange={(e) => setOrderSize(e.target.value)}
            fullWidth
            size="small"
            type="number"
            sx={{ mb: 2 }}
          />

          {orderType === 'limit' && (
            <TextField
              label="Limit Price (¢)"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              fullWidth
              size="small"
              type="number"
              sx={{ mb: 2 }}
            />
          )}

          <Divider sx={{ my: 2 }} />

          {/* Order Summary */}
          <Stack spacing={1} sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Est. Shares</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {estimatedShares.toFixed(2)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Fee (2%)</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                ${estimatedFee.toFixed(2)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Max Payout</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#22C55E' }}>
                ${potentialPayout.toFixed(2)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Potential Profit</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#22C55E' }}>
                +${potentialProfit.toFixed(2)}
              </Typography>
            </Box>
          </Stack>

          {/* Submit Button */}
          <Button
            variant="contained"
            fullWidth
            size="large"
            disabled={!selectedMarket}
            sx={{
              backgroundColor: orderSide === 'buy' ? '#22C55E' : '#EF4444',
              '&:hover': {
                backgroundColor: orderSide === 'buy' ? '#16A34A' : '#DC2626',
              },
              fontWeight: 600,
            }}
          >
            {orderSide === 'buy' ? 'Buy' : 'Sell'} {orderDirection.toUpperCase()}
          </Button>

          <Typography 
            variant="caption" 
            color="text.secondary" 
            sx={{ display: 'block', mt: 2, textAlign: 'center' }}
          >
            Connect wallet to trade
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default Terminal;
