/**
 * Enhanced AI Agent Page
 * Professional trading signals with:
 * - Glassmorphism design
 * - Confidence meters
 * - Animated cards
 * - Modern trading interface
 */

import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  Stack,
  Grid,
  List,
  ListItem,
  ListItemText,
  alpha,
  useTheme,
  keyframes,
  LinearProgress,
  CircularProgress,
} from '@mui/material';
import { 
  TrendingUp, 
  ShowChart, 
  Warning,
  Psychology,
  Speed,
  EmojiEvents,
  Insights,
  CheckCircle,
  AutoGraph,
} from '@mui/icons-material';

// Animations
const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 0 20px rgba(135, 206, 235, 0.2); }
  50% { box-shadow: 0 0 40px rgba(135, 206, 235, 0.4); }
`;

interface AgentOpportunity {
  id: string;
  event: string;
  direction: 'YES' | 'NO';
  edgeSummary: string[];
  entryRange: string;
  riskWarning: string;
  venue: string;
  confidence: number;
  category: string;
}

const mockOpportunities: AgentOpportunity[] = [
  {
    id: '1',
    event: 'Ethereum ETF approval in Q1 2026',
    direction: 'YES',
    edgeSummary: [
      'SEC historically approves ETH products within 90 days of BTC approval',
      'Political pressure mounting from pro-crypto senators',
      'Market pricing appears pessimistic relative to historical precedent',
    ],
    entryRange: '70-75%',
    riskWarning: 'SEC could delay ruling beyond Q1',
    venue: 'Polymarket',
    confidence: 9.1,
    category: 'Crypto',
  },
  {
    id: '2',
    event: 'Democrats win 2026 midterm elections',
    direction: 'NO',
    edgeSummary: [
      'Historical midterm pattern favors party not in White House',
      'Economic indicators showing mild recession risk',
      'Incumbent party polling below 45% approval',
    ],
    entryRange: '45-50%',
    riskWarning: 'Major geopolitical events could shift sentiment',
    venue: 'Kalshi',
    confidence: 7.2,
    category: 'Politics',
  },
  {
    id: '3',
    event: 'Bitcoin to reach $150k by end of 2026',
    direction: 'YES',
    edgeSummary: [
      'Strong correlation with halving cycles (9 months post-halving)',
      'Institutional adoption accelerating with ETF inflows',
      'On-chain metrics showing accumulation phase',
    ],
    entryRange: '65-70%',
    riskWarning: 'Regulatory crackdown or macro recession risk',
    venue: 'Polymarket',
    confidence: 8.5,
    category: 'Crypto',
  },
];

export const Agent: React.FC = () => {
  const theme = useTheme();
  
  const statsCards = [
    {
      title: 'Active Signals',
      value: mockOpportunities.length,
      subtitle: 'Updated 5 min ago',
      icon: Psychology,
      color: theme.palette.primary.main,
      subtitleColor: 'success.main',
    },
    {
      title: 'Avg Confidence',
      value: '8.3/10',
      subtitle: 'High conviction',
      icon: Speed,
      color: theme.palette.success.main,
      subtitleColor: 'text.secondary',
    },
    {
      title: '7-Day Win Rate',
      value: '72%',
      subtitle: '+8% vs baseline',
      icon: EmojiEvents,
      color: theme.palette.warning.main,
      subtitleColor: 'success.main',
    },
    {
      title: 'Avg Edge',
      value: '5.2%',
      subtitle: 'vs market prices',
      icon: Insights,
      color: theme.palette.info.main,
      subtitleColor: 'text.secondary',
    },
  ];

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, minHeight: 'calc(100vh - 56px)' }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <Typography variant="h5" fontWeight={700}>
          AI Agent
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Curated trading opportunities identified by our AI prediction market agent
      </Typography>

      {/* Stats Overview - Enhanced */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {statsCards.map((card, idx) => (
          <Grid item xs={12} sm={6} md={3} key={card.title}>
            <Card
              elevation={0}
              sx={{
                background: `linear-gradient(135deg, ${alpha(card.color, 0.15)} 0%, ${alpha(card.color, 0.05)} 100%)`,
                border: `1px solid ${alpha(card.color, 0.2)}`,
                backdropFilter: 'blur(10px)',
                borderRadius: 3,
                transition: 'all 0.3s ease',
                animation: `${fadeInUp} 0.5s ease-out ${idx * 0.1}s both`,
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: `0 8px 24px ${alpha(card.color, 0.2)}`,
                },
              }}
            >
              <CardContent sx={{ p: 2.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
                  <Typography variant="body2" color="text.secondary" fontWeight={500}>
                    {card.title}
                  </Typography>
                  <Box sx={{ p: 0.75, borderRadius: 1.5, background: alpha(card.color, 0.15) }}>
                    <card.icon sx={{ fontSize: 18, color: card.color }} />
                  </Box>
                </Stack>
                <Typography variant="h4" fontWeight={700} sx={{ fontFamily: 'monospace', mb: 0.5 }}>
                  {card.value}
                </Typography>
                <Typography variant="caption" color={card.subtitleColor}>
                  {card.subtitle}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Opportunity Cards - Enhanced */}
      <Stack spacing={3}>
        {mockOpportunities.map((opp, idx) => (
          <Card 
            key={opp.id} 
            elevation={0}
            sx={{ 
              background: alpha(theme.palette.background.paper, 0.6),
              backdropFilter: 'blur(10px)',
              border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
              borderRadius: 3,
              overflow: 'hidden',
              transition: 'all 0.3s ease',
              animation: `${fadeInUp} 0.5s ease-out ${(idx + 4) * 0.1}s both`,
              '&:hover': {
                borderColor: alpha(theme.palette.primary.main, 0.3),
                boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.15)}`,
              },
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
                  <Box>
                    <Typography variant="h6" fontWeight={700}>
                      {opp.event}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Chip 
                        label={opp.category} 
                        size="small"
                        sx={{
                          height: 22,
                          background: alpha(theme.palette.primary.main, 0.1),
                          border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                        }}
                      />
                      <Chip 
                        label={opp.venue} 
                        size="small" 
                        sx={{
                          height: 22,
                          background: alpha(theme.palette.info.main, 0.1),
                          border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`,
                        }}
                      />
                      <Chip
                        label={opp.direction}
                        size="small"
                        sx={{
                          height: 22,
                          fontWeight: 700,
                          background: opp.direction === 'YES' 
                            ? alpha(theme.palette.success.main, 0.15)
                            : alpha(theme.palette.error.main, 0.15),
                          color: opp.direction === 'YES' 
                            ? theme.palette.success.main
                            : theme.palette.error.main,
                          border: `1px solid ${opp.direction === 'YES' 
                            ? alpha(theme.palette.success.main, 0.3)
                            : alpha(theme.palette.error.main, 0.3)}`,
                        }}
                      />
                    </Stack>
                  </Box>
                  
                  {/* Confidence Meter */}
                  <Box sx={{ textAlign: 'center', minWidth: 100 }}>
                    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                      <CircularProgress
                        variant="determinate"
                        value={opp.confidence * 10}
                        size={60}
                        thickness={4}
                        sx={{
                          color: opp.confidence >= 8 
                            ? theme.palette.success.main 
                            : opp.confidence >= 6 
                              ? theme.palette.warning.main 
                              : theme.palette.error.main,
                          '& .MuiCircularProgress-circle': {
                            strokeLinecap: 'round',
                          },
                        }}
                      />
                      <Box
                        sx={{
                          top: 0,
                          left: 0,
                          bottom: 0,
                          right: 0,
                          position: 'absolute',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Typography variant="body2" fontWeight={700}>
                          {opp.confidence.toFixed(1)}
                        </Typography>
                      </Box>
                    </Box>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                      Confidence
                    </Typography>
                  </Box>
                </Stack>
              </Box>

              <Grid container spacing={3}>
                <Grid item xs={12} md={8}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                    <AutoGraph sx={{ fontSize: 18, color: 'primary.main' }} />
                    <Typography variant="subtitle2" fontWeight={700}>
                      Edge Analysis
                    </Typography>
                  </Stack>
                  <List dense sx={{ py: 0 }}>
                    {opp.edgeSummary.map((point, index) => (
                      <ListItem key={index} sx={{ pl: 0, py: 0.5 }}>
                        <CheckCircle sx={{ fontSize: 16, color: 'success.main', mr: 1.5 }} />
                        <ListItemText
                          primary={
                            <Typography variant="body2" color="text.secondary">
                              {point}
                            </Typography>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </Grid>

                <Grid item xs={12} md={4}>
                  <Stack spacing={2}>
                    <Box 
                      sx={{ 
                        p: 2, 
                        borderRadius: 2,
                        background: alpha(theme.palette.success.main, 0.08),
                        border: `1px solid ${alpha(theme.palette.success.main, 0.15)}`,
                      }}
                    >
                      <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                        Suggested Entry
                      </Typography>
                      <Typography variant="h5" fontWeight={700} color="success.main" fontFamily="monospace">
                        {opp.entryRange}
                      </Typography>
                    </Box>

                    <Box 
                      sx={{ 
                        p: 2, 
                        borderRadius: 2,
                        background: alpha(theme.palette.warning.main, 0.08),
                        border: `1px solid ${alpha(theme.palette.warning.main, 0.15)}`,
                      }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                        <Warning sx={{ fontSize: 16, color: 'warning.main' }} />
                        <Typography variant="caption" color="warning.main" fontWeight={700}>
                          Risk Warning
                        </Typography>
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {opp.riskWarning}
                      </Typography>
                    </Box>
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>

            <CardActions sx={{ px: 3, pb: 2.5, gap: 2 }}>
              <Button
                variant="contained"
                startIcon={<TrendingUp />}
                fullWidth
                sx={{
                  py: 1.25,
                  fontWeight: 600,
                  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                  boxShadow: `0 4px 14px ${alpha(theme.palette.primary.main, 0.4)}`,
                  '&:hover': {
                    transform: 'translateY(-1px)',
                    boxShadow: `0 6px 20px ${alpha(theme.palette.primary.main, 0.5)}`,
                  },
                }}
              >
                Load into Order Ticket
              </Button>
              <Button
                variant="outlined"
                startIcon={<ShowChart />}
                fullWidth
                sx={{
                  py: 1.25,
                  fontWeight: 600,
                  borderColor: alpha(theme.palette.primary.main, 0.5),
                  '&:hover': {
                    background: alpha(theme.palette.primary.main, 0.08),
                    borderColor: theme.palette.primary.main,
                  },
                }}
              >
                View Full Analysis
              </Button>
            </CardActions>
          </Card>
        ))}
      </Stack>

      {/* Agent Info - Enhanced */}
      <Paper 
        elevation={0}
        sx={{ 
          p: 3, 
          mt: 4, 
          background: alpha(theme.palette.primary.main, 0.03),
          border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
          borderRadius: 3,
          animation: `${fadeInUp} 0.5s ease-out 0.8s both`,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <Psychology sx={{ color: 'primary.main' }} />
          <Typography variant="h6" fontWeight={700}>
            About the Agent
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" paragraph>
          Our AI agent continuously monitors prediction markets across all major venues, analyzing:
        </Typography>
        <Grid container spacing={2}>
          {[
            'Historical resolution patterns and outcomes',
            'Real-time news sentiment and information flow',
            'Cross-venue arbitrage opportunities',
            'Order book depth and liquidity dynamics',
            'On-chain data and wallet behavior patterns',
          ].map((item, idx) => (
            <Grid item xs={12} sm={6} key={idx}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <CheckCircle sx={{ fontSize: 16, color: 'success.main' }} />
                <Typography variant="body2" color="text.secondary">
                  {item}
                </Typography>
              </Stack>
            </Grid>
          ))}
        </Grid>
        <Typography 
          variant="caption" 
          color="text.secondary" 
          sx={{ 
            mt: 3, 
            display: 'block',
            p: 1.5,
            background: alpha(theme.palette.warning.main, 0.08),
            borderRadius: 1.5,
            border: `1px solid ${alpha(theme.palette.warning.main, 0.15)}`,
          }}
        >
          ⚠️ Past performance does not guarantee future results. Always do your own research.
        </Typography>
      </Paper>
    </Box>
  );
};
