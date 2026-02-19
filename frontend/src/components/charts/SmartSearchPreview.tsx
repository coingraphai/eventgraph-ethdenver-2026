/**
 * Smart Search Preview
 * AI-powered natural language search demonstration
 */
import React, { useState, useEffect } from 'react';
import { Box, Typography, useTheme, alpha, TextField, Chip, Stack, IconButton, InputAdornment } from '@mui/material';
import { Search, AutoAwesome, TrendingUp, AccessTime, ArrowForward, Mic } from '@mui/icons-material';
import { keyframes } from '@mui/system';
import { PLATFORM_COLORS as APP_PLATFORM_COLORS } from '../../utils/colors';

interface SearchResult {
  title: string;
  platform: string;
  price: number;
  relevance: number;
  category: string;
}

interface SmartSearchPreviewProps {
  onSearch?: (query: string) => void;
}

const typing = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
`;

const SAMPLE_QUERIES = [
  "What's the probability of a Fed rate cut this year?",
  "Show me crypto markets with high volume",
  "Trump vs DeSantis GOP primary odds",
  "Which sports markets are expiring this week?",
  "Best arbitrage opportunities right now",
];

const SAMPLE_RESULTS: Record<string, SearchResult[]> = {
  "fed rate cut": [
    { title: 'Fed Rate Cut by June 2026', platform: 'kalshi', price: 0.58, relevance: 98, category: 'Economy' },
    { title: 'Fed Cuts Rates in March', platform: 'polymarket', price: 0.42, relevance: 95, category: 'Economy' },
    { title: 'Fed Holds Rates All Year', platform: 'kalshi', price: 0.25, relevance: 88, category: 'Economy' },
  ],
  "crypto": [
    { title: 'Bitcoin $150K by EOY', platform: 'polymarket', price: 0.28, relevance: 96, category: 'Crypto' },
    { title: 'ETH Above $10K', platform: 'limitless', price: 0.15, relevance: 92, category: 'Crypto' },
    { title: 'Solana Flips Ethereum', platform: 'polymarket', price: 0.08, relevance: 85, category: 'Crypto' },
  ],
  "trump": [
    { title: 'Trump Wins 2028 Election', platform: 'polymarket', price: 0.42, relevance: 99, category: 'Politics' },
    { title: 'Trump Wins GOP Primary', platform: 'kalshi', price: 0.72, relevance: 97, category: 'Politics' },
    { title: 'Trump Indictment Dismissed', platform: 'polymarket', price: 0.35, relevance: 82, category: 'Politics' },
  ],
};

const PLATFORM_COLORS: Record<string, string> = {
  polymarket: APP_PLATFORM_COLORS.polymarket.primary,
  kalshi: APP_PLATFORM_COLORS.kalshi.primary,
  limitless: APP_PLATFORM_COLORS.limitless.primary,
  opiniontrade: APP_PLATFORM_COLORS.opiniontrade.primary,
};

export const SmartSearchPreview: React.FC<SmartSearchPreviewProps> = ({ onSearch }) => {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [currentQueryIndex, setCurrentQueryIndex] = useState(0);
  const [displayedQuery, setDisplayedQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  // Auto-type demo queries
  useEffect(() => {
    if (!isTyping) return;
    
    const targetQuery = SAMPLE_QUERIES[currentQueryIndex];
    
    if (displayedQuery.length < targetQuery.length) {
      const timer = setTimeout(() => {
        setDisplayedQuery(targetQuery.slice(0, displayedQuery.length + 1));
      }, 50);
      return () => clearTimeout(timer);
    } else {
      // Query complete, show results
      const timer = setTimeout(() => {
        // Find matching results
        const key = Object.keys(SAMPLE_RESULTS).find(k => 
          targetQuery.toLowerCase().includes(k)
        );
        setResults(key ? SAMPLE_RESULTS[key] : []);
        setShowResults(true);
        
        // After showing results, move to next query
        setTimeout(() => {
          setShowResults(false);
          setDisplayedQuery('');
          setCurrentQueryIndex((prev) => (prev + 1) % SAMPLE_QUERIES.length);
        }, 3000);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [displayedQuery, currentQueryIndex, isTyping]);

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setIsTyping(false);
    // Find matching results for manual query
    const key = Object.keys(SAMPLE_RESULTS).find(k => 
      query.toLowerCase().includes(k)
    );
    setResults(key ? SAMPLE_RESULTS[key] : []);
    setShowResults(true);
    onSearch?.(query);
  };

  return (
    <Box>
      {/* Search Input */}
      <Box component="form" onSubmit={handleManualSearch}>
        <TextField
          fullWidth
          placeholder="Ask anything about prediction markets..."
          value={isTyping ? displayedQuery : query}
          onChange={(e) => {
            setIsTyping(false);
            setQuery(e.target.value);
          }}
          onFocus={() => setIsTyping(false)}
          size="small"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <AutoAwesome sx={{ fontSize: 18, color: theme.palette.primary.main }} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                {isTyping && (
                  <Box
                    sx={{
                      width: 2,
                      height: 16,
                      bgcolor: theme.palette.primary.main,
                      animation: `${typing} 0.8s ease-in-out infinite`,
                      mr: 1,
                    }}
                  />
                )}
                <IconButton size="small" type="submit">
                  <Search sx={{ fontSize: 18 }} />
                </IconButton>
              </InputAdornment>
            ),
            sx: {
              borderRadius: 2,
              bgcolor: alpha(theme.palette.background.paper, 0.5),
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: alpha(theme.palette.primary.main, 0.2),
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: alpha(theme.palette.primary.main, 0.4),
              },
            },
          }}
        />
      </Box>

      {/* Quick suggestions */}
      <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
        {['Politics', 'Crypto', 'Sports', 'Economy'].map((tag) => (
          <Chip
            key={tag}
            label={tag}
            size="small"
            onClick={() => {
              setIsTyping(false);
              setQuery(tag.toLowerCase());
            }}
            sx={{
              height: 20,
              fontSize: '0.65rem',
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              '&:hover': {
                bgcolor: alpha(theme.palette.primary.main, 0.2),
              },
            }}
          />
        ))}
      </Box>

      {/* Results */}
      {showResults && results.length > 0 && (
        <Box 
          sx={{ 
            mt: 2,
            animation: 'fadeIn 0.3s ease-out',
            '@keyframes fadeIn': {
              from: { opacity: 0, transform: 'translateY(-10px)' },
              to: { opacity: 1, transform: 'translateY(0)' },
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
            <AutoAwesome sx={{ fontSize: 12, color: theme.palette.primary.main }} />
            <Typography variant="caption" color="primary" fontWeight={600}>
              AI Found {results.length} relevant markets
            </Typography>
          </Box>
          
          <Stack spacing={1}>
            {results.map((result, index) => (
              <Box
                key={index}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 1,
                  borderRadius: 1,
                  bgcolor: alpha(theme.palette.background.paper, 0.3),
                  border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.05),
                    borderColor: alpha(theme.palette.primary.main, 0.2),
                  },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: PLATFORM_COLORS[result.platform],
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" fontSize="0.6rem">
                      {result.platform.toUpperCase()}
                    </Typography>
                    <Chip
                      label={`${result.relevance}% match`}
                      size="small"
                      sx={{
                        height: 14,
                        fontSize: '0.5rem',
                        bgcolor: alpha(theme.palette.success.main, 0.1),
                        color: theme.palette.success.main,
                      }}
                    />
                  </Box>
                  <Typography 
                    variant="body2" 
                    fontWeight={500}
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {result.title}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1 }}>
                  <Typography 
                    variant="body2" 
                    fontWeight={700}
                    fontFamily="'SF Mono', monospace"
                    sx={{ color: PLATFORM_COLORS[result.platform] }}
                  >
                    {(result.price * 100).toFixed(0)}¢
                  </Typography>
                  <ArrowForward sx={{ fontSize: 14, color: 'text.secondary' }} />
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  );
};

export default SmartSearchPreview;
