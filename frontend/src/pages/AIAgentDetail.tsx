import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Chip,
  Stepper,
  Step,
  StepLabel,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  AlertTitle,
  IconButton,
  Paper,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  TableHead,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  PlayArrow as PlayIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Timeline as TimelineIcon,
  Description as DescriptionIcon,
  ShowChart as ChartIcon,
  TrendingUp as TrendingUpIcon,
  AccountBalance as InstitutionalIcon,
  SwapHoriz as DerivativesIcon,
  PieChart as PieChartIcon,
  Download as DownloadIcon,
  Public as GlobalIcon,
  Speed as SpeedIcon,
  Warning as WarningIcon,
  HealthAndSafety as HealthIcon,
  CompareArrows as CompareIcon,
  Close as CloseIcon,
  AccountBalanceWallet as WalletIcon,
  Bolt as BoltIcon,
  Construction as ConstructionIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Area,
  AreaChart,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import agentsService, { Agent, AgentRun } from '../services/agentsService';
import { useSessionId } from '../hooks/useSessionId';

import ProgressPanel from '../components/agents/ProgressPanel';
import OutputTabs from '../components/agents/OutputTabs';
import ChartLibrary from '../components/agents/ChartLibrary';
import { agentRegistry } from '../config/agents/agentRegistry';
import { AgentDefinition } from '../config/agents/agentSchema';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

// Chart colors - harmonized with app theme
const CHART_COLORS = ['#87CEEB', '#22C55E', '#F59E0B', '#A78BFA', '#14B8A6', '#00BFFF', '#CE93D8'];

// Get health score color
const getHealthColor = (score: number): string => {
  if (score >= 80) return '#22C55E'; // Green - Excellent
  if (score >= 60) return '#14B8A6'; // Teal - Good
  if (score >= 40) return '#F59E0B'; // Amber - Fair
  if (score >= 20) return '#FFA500'; // Orange - Poor
  return '#EF4444'; // Red - Critical
};

// Format number with proper suffixes
const formatNumber = (num: number | string): string => {
  const numValue = typeof num === 'string' ? parseFloat(num) : num;
  if (!numValue || isNaN(numValue)) return '$0';
  if (numValue >= 1e12) return `$${(numValue / 1e12).toFixed(2)}T`;
  if (numValue >= 1e9) return `$${(numValue / 1e9).toFixed(2)}B`;
  if (numValue >= 1e6) return `$${(numValue / 1e6).toFixed(2)}M`;
  if (numValue >= 1e3) return `$${(numValue / 1e3).toFixed(2)}K`;
  return `$${numValue.toFixed(2)}`;
};

const formatPrice = (price: number | string): string => {
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  if (!numPrice || isNaN(numPrice)) return '$0';
  if (numPrice < 0.01) return `$${numPrice.toFixed(6)}`;
  if (numPrice < 1) return `$${numPrice.toFixed(4)}`;
  return `$${numPrice.toFixed(2)}`;
};

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Agents that are fully functional - all others show "Coming Soon"
const ACTIVE_AGENTS = ['token-deep-dive', 'whale-movement'];

// X402 payment flow steps
const X402_STEPS = [
  'Connecting to Base Network',
  'Creating Payment Request',
  'Signing Transaction',
  'Processing Payment',
  'Verifying on Chain',
  'Running Agent',
];

export const AIAgentDetail: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const anonymousSessionId = useSessionId();
  
  // Check if this agent is active or coming soon
  const isAgentActive = ACTIVE_AGENTS.includes(slug || '');
  const [showComingSoonDialog, setShowComingSoonDialog] = useState(false);
  
  const [agent, setAgent] = useState<Agent | null>(null);
  const [agentDefinition, setAgentDefinition] = useState<AgentDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formInputs, setFormInputs] = useState<Record<string, string>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [currentRun, setCurrentRun] = useState<AgentRun | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [tabValue, setTabValue] = useState(0);
  
  // Simplified state (removed X402 and payment states)
  const [errorModal, setErrorModal] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: ''
  });
  
  // Payment & wallet state
  const isConnected = false; // TODO: integrate with wallet provider
  const [paymentMethod, setPaymentMethod] = useState<'credits' | 'x402'>('credits');
  const [isX402Running, setIsX402Running] = useState(false);
  const [x402Error, setX402Error] = useState<string | null>(null);
  const [x402Step, setX402Step] = useState(0);
  const [x402Status, setX402Status] = useState<string | null>(null);
  const [x402TxHash, setX402TxHash] = useState<string | null>(null);
  const [showCreditPaymentModal, setShowCreditPaymentModal] = useState(false);
  const [creditWalletInfo, setCreditWalletInfo] = useState<{ balance: number; required: number } | null>(null);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [processingPayment, setProcessingPayment] = useState<string | null>(null);
  const creditPackages: Array<{ id: string; name: string; credits_amount: number; bonus_percentage: number; popular: boolean; price: number }> = [];

  const handleRunAgentWithX402 = async () => {
    // TODO: implement X402 payment flow
    console.log('X402 payment not yet implemented');
  };

  const handleCreditPackagePurchase = async (pkg: any) => {
    // TODO: implement credit package purchase
    console.log('Credit package purchase not yet implemented', pkg);
  };

  const handleTopUpPayment = async (pkg: any) => {
    // TODO: implement top-up payment
    console.log('Top-up payment not yet implemented', pkg);
  };

  // User tier info state
  const [userTier, setUserTier] = useState<string>('anonymous');
  const [isLoadingTier, setIsLoadingTier] = useState(false);

  useEffect(() => {
    if (slug) {
      loadAgent();
    }
  }, [slug]);

  const loadAgent = async () => {
    try {
      setLoading(true);
      const data = await agentsService.fetchAgent(slug!);
      setAgent(data);
      
      // Load agent definition from registry
      const definition = agentRegistry.find(a => a.slug === slug);
      if (definition) {
        setAgentDefinition(definition);
      }
      
      const initialInputs: Record<string, string> = {};
      if (data.form_schema) {
        data.form_schema.forEach(field => {
          initialInputs[field.name] = field.default_value || '';
        });
      }
      setFormInputs(initialInputs);
    } catch (err: any) {
      setError(err.message || 'Failed to load agent');
    } finally {
      setLoading(false);
    }
  };

  const handleRunAgent = async () => {
    if (!agent) return;
    
    try {
      // Clear previous state
      setError(null);
      setActiveStep(0);
      setCurrentRun(null);
      setTabValue(0);
      setIsRunning(true);
      
      // Use anonymous session ID for all users
      const anonSessionId = anonymousSessionId;
      
      const agentRun = await agentsService.createAgentRun({
        agent_slug: agent.slug,
        input: formInputs,
        user_id: undefined,
        wallet_address: undefined,
        anonymous_session_id: anonSessionId
      });
      
      const completedRun = await agentsService.pollAgentRun(agentRun.id, (run) => {
        setCurrentRun(run);
        if (run.steps_json) {
          const completedSteps = run.steps_json.filter(s => s.status === 'completed').length;
          setActiveStep(completedSteps);
        }
      });
      
      setCurrentRun(completedRun);
    } catch (err: any) {
      console.error('Agent run error:', err);
      setError(err.message || 'Failed to run agent');
    } finally {
      setIsRunning(false);
    }
  };

  const handleInputChange = (name: string, value: string) => {
    setFormInputs(prev => ({ ...prev, [name]: value }));
  };
  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleDownloadJson = () => {
    if (!currentRun?.output_json) return;
    const blob = new Blob([JSON.stringify(currentRun.output_json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agent?.slug || 'agent'}_results_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderInputForm = () => {
    const schemaFields = agentDefinition?.formSchema 
      ? (Array.isArray(agentDefinition.formSchema) ? agentDefinition.formSchema : agentDefinition.formSchema.fields)
      : [];
    if (!agent?.form_schema?.length && !schemaFields?.length) {
      return <Typography color="text.secondary">No configuration required</Typography>;
    }

    // Use registry definition if available for better UX
    const formFields = schemaFields.length ? schemaFields : 
      agent?.form_schema?.map(f => ({
        id: f.name,
        type: f.type as any,
        label: f.label,
        placeholder: f.placeholder || '',
        defaultValue: f.default_value || '',
        required: f.required || false,
        description: f.description,
        options: f.options?.map(o => ({ value: o.value, label: o.label })),
      })) || [];

    // Show all fields
    const allFields = formFields;

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {allFields.map((field: any) => {
          if (field.type === 'select' && field.options) {
            return (
              <FormControl key={field.id} fullWidth size="medium">
                <InputLabel>{field.label}</InputLabel>
                <Select
                  value={formInputs[field.id] || field.defaultValue || ''}
                  onChange={(e) => handleInputChange(field.id, e.target.value)}
                  label={field.label}
                >
                  {field.options.map((opt: any) => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
                {field.description && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                    {field.description}
                  </Typography>
                )}
              </FormControl>
            );
          }
          return (
            <TextField
              key={field.id}
              label={field.label}
              value={formInputs[field.id] || field.defaultValue || ''}
              onChange={(e) => handleInputChange(field.id, e.target.value)}
              required={field.required}
              placeholder={field.placeholder}
              helperText={field.description}
              fullWidth
              size="medium"
            />
          );
        })}
      </Box>
    );
  };

  // ============ DASHBOARD TAB ============
  const renderDashboard = () => {
    const output = currentRun?.output_json;
    if (!output) return null;

    const metrics = output.key_metrics || {};
    const chartData = output.chart_data || {};
    const globalCtx = output.global_context || {};

    const priceChartData = (chartData.price_chart || []).map((item: any) => ({
      date: formatDate(item.timestamp),
      price: item.price,
    }));

    const volumeChartData = (chartData.volume_chart || []).map((item: any) => ({
      date: formatDate(item.timestamp),
      volume: item.volume,
    }));

    return (
      <Box>
        {/* API Calls Badge */}
        <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Chip label={`${output.api_calls_made || 0} API Calls`} color="primary" size="small" />
          <Chip label={output.time_range || '7d'} variant="outlined" size="small" />
          {output.is_trending && <Chip label={`🔥 #${output.trending_rank} Trending`} color="warning" size="small" />}
        </Box>

        {/* Key Metrics Cards */}
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {[
            { label: 'Price', value: formatPrice(metrics.current_price), color: '#BBD977' },
            { label: '24h Change', value: `${metrics.price_change_24h?.toFixed(2) || 0}%`, color: (metrics.price_change_24h || 0) >= 0 ? '#4caf50' : '#f44336' },
            { label: '7d Change', value: `${metrics.price_change_7d?.toFixed(2) || 0}%`, color: (metrics.price_change_7d || 0) >= 0 ? '#4caf50' : '#f44336' },
            { label: 'Market Cap', value: formatNumber(metrics.market_cap), color: '#fff' },
            { label: '24h Volume', value: formatNumber(metrics.volume_24h), color: '#4FC3F7' },
            { label: 'Volatility', value: `${metrics.volatility?.toFixed(2) || 0}%`, color: '#FF7043' },
          ].map((item, i) => (
            <Grid item xs={6} sm={4} md={2} key={i}>
              <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                <Typography variant="h6" fontWeight={600} sx={{ color: item.color }}>{item.value}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>

        {/* Global Market Context */}
        {globalCtx.total_market_cap && (
          <Paper sx={{ p: 2, mb: 3, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
            <Typography variant="subtitle2" fontWeight={600} mb={1} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <GlobalIcon fontSize="small" /> Global Market Context
            </Typography>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <Typography variant="body2">Total Market Cap: <strong>{formatNumber(globalCtx.total_market_cap)}</strong></Typography>
              <Typography variant="body2">BTC Dominance: <strong>{globalCtx.btc_dominance?.toFixed(1)}%</strong></Typography>
              <Typography variant="body2">ETH Dominance: <strong>{globalCtx.eth_dominance?.toFixed(1)}%</strong></Typography>
              <Typography variant="body2" sx={{ color: (globalCtx.market_cap_change_24h || 0) >= 0 ? '#4caf50' : '#f44336' }}>
                24h Change: <strong>{globalCtx.market_cap_change_24h?.toFixed(2)}%</strong>
              </Typography>
            </Box>
          </Paper>
        )}

        {/* Charts */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} md={8}>
            <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
              <Typography variant="h6" fontWeight={600} mb={2}>Price Chart</Typography>
              {priceChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={priceChartData}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#BBD977" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#BBD977" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 11 }} />
                    <YAxis stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 11 }} tickFormatter={(v) => formatPrice(v)} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px' }} formatter={(value: number) => [formatPrice(value), 'Price']} />
                    <Area type="monotone" dataKey="price" stroke="#BBD977" strokeWidth={2} fill="url(#colorPrice)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <Typography color="text.secondary" sx={{ py: 8, textAlign: 'center' }}>No data</Typography>}
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', height: '100%' }}>
              <Typography variant="h6" fontWeight={600} mb={2}>Key Statistics</Typography>
              <TableContainer>
                <Table size="small">
                  <TableBody>
                    {(output.summary_table || []).map((row: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell sx={{ borderColor: 'rgba(255,255,255,0.1)', color: 'text.secondary', py: 1 }}>{row.metric}</TableCell>
                        <TableCell sx={{ borderColor: 'rgba(255,255,255,0.1)', fontWeight: 600, py: 1 }} align="right">{row.value}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        </Grid>

        {/* Volume Chart */}
        {volumeChartData.length > 0 && (
          <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', mb: 3 }}>
            <Typography variant="h6" fontWeight={600} mb={2}>Trading Volume</Typography>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={volumeChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 11 }} />
                <YAxis stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 11 }} tickFormatter={(v) => formatNumber(v).replace('$', '')} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.2)' }} formatter={(value: number) => [formatNumber(value), 'Volume']} />
                <Bar dataKey="volume" fill="#4FC3F7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        )}

        {/* Enhanced Dashboard Insights */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {/* Supply Metrics */}
          {metrics.circulating_supply && (
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', height: '100%' }}>
                <Typography variant="h6" fontWeight={600} mb={2}>Supply Distribution</Typography>
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">Circulating</Typography>
                    <Typography variant="body2" fontWeight={600}>{formatNumber(metrics.circulating_supply)}</Typography>
                  </Box>
                  {metrics.total_supply && (
                    <>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2" color="text.secondary">Total Supply</Typography>
                        <Typography variant="body2" fontWeight={600}>{formatNumber(metrics.total_supply)}</Typography>
                      </Box>
                      <LinearProgress 
                        variant="determinate" 
                        value={(metrics.circulating_supply / metrics.total_supply) * 100} 
                        sx={{ 
                          height: 8, 
                          borderRadius: 4,
                          backgroundColor: 'rgba(255,255,255,0.1)',
                          '& .MuiLinearProgress-bar': { backgroundColor: '#BBD977' }
                        }} 
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                        {((metrics.circulating_supply / metrics.total_supply) * 100).toFixed(1)}% in circulation
                      </Typography>
                    </>
                  )}
                  {metrics.max_supply && (
                    <Box sx={{ mt: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2" color="text.secondary">Max Supply</Typography>
                        <Typography variant="body2" fontWeight={600}>{formatNumber(metrics.max_supply)}</Typography>
                      </Box>
                      <LinearProgress 
                        variant="determinate" 
                        value={(metrics.circulating_supply / metrics.max_supply) * 100} 
                        sx={{ 
                          height: 8, 
                          borderRadius: 4,
                          backgroundColor: 'rgba(255,255,255,0.1)',
                          '& .MuiLinearProgress-bar': { backgroundColor: '#4FC3F7' }
                        }} 
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                        {((metrics.circulating_supply / metrics.max_supply) * 100).toFixed(1)}% minted
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Paper>
            </Grid>
          )}

          {/* ATH Distance & Price Levels */}
          {metrics.ath && metrics.current_price && (
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', height: '100%' }}>
                <Typography variant="h6" fontWeight={600} mb={2}>Price Levels</Typography>
                <Box>
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="caption" color="text.secondary">All-Time High</Typography>
                    <Typography variant="h5" fontWeight={700} color="#BBD977">
                      ${metrics.ath.toLocaleString()}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {metrics.ath_change_percentage ? `${metrics.ath_change_percentage.toFixed(1)}%` : 'N/A'} from ATH
                    </Typography>
                  </Box>
                  {metrics.atl && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">All-Time Low</Typography>
                      <Typography variant="h5" fontWeight={700} color="#f44336">
                        ${metrics.atl.toLocaleString()}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {metrics.atl_change_percentage ? `+${metrics.atl_change_percentage.toFixed(0)}%` : 'N/A'} from ATL
                      </Typography>
                    </Box>
                  )}
                  <Box sx={{ mt: 2, p: 2, backgroundColor: 'rgba(187, 217, 119, 0.1)', borderRadius: '8px' }}>
                    <Typography variant="caption" color="text.secondary">Distance to ATH</Typography>
                    <LinearProgress 
                      variant="determinate" 
                      value={Math.min(100, ((metrics.current_price / metrics.ath) * 100))} 
                      sx={{ 
                        height: 10, 
                        borderRadius: 5,
                        mt: 1,
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        '& .MuiLinearProgress-bar': { backgroundColor: '#BBD977' }
                      }} 
                    />
                    <Typography variant="h6" fontWeight={700} sx={{ mt: 1 }}>
                      {((metrics.current_price / metrics.ath) * 100).toFixed(1)}%
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            </Grid>
          )}

          {/* Institutional Holdings */}
          {output.institutional_holdings && output.institutional_holdings.length > 0 && (
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', height: '100%' }}>
                <Typography variant="h6" fontWeight={600} mb={2}>Top Institutional Holders</Typography>
                <Box>
                  {output.institutional_holdings.slice(0, 5).map((holder: any, index: number) => (
                    <Box key={index} sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="body2" fontWeight={600}>{holder.company}</Typography>
                        <Typography variant="caption" sx={{ 
                          px: 1, 
                          py: 0.25, 
                          backgroundColor: 'rgba(187, 217, 119, 0.2)', 
                          borderRadius: '4px',
                          color: '#BBD977'
                        }}>
                          {holder.country}
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        ${formatNumber(holder.total_value_usd)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {holder.total_holdings?.toLocaleString()} {output.token_name || 'tokens'} 
                        ({holder.percentage_of_total_supply?.toFixed(2)}% of supply)
                      </Typography>
                    </Box>
                  ))}
                  {output.total_institutional_value && (
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                      <Typography variant="caption" color="text.secondary">Total Institutional Value</Typography>
                      <Typography variant="h6" fontWeight={700} color="#BBD977">
                        ${formatNumber(output.total_institutional_value)}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Paper>
            </Grid>
          )}

          {/* Risk Assessment Radar */}
          {output.riskRadar && output.riskRadar.length > 0 && (
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', height: '100%' }}>
                <Typography variant="h6" fontWeight={600} mb={2}>Risk & Health Assessment</Typography>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={output.riskRadar}>
                    <PolarGrid stroke="rgba(255,255,255,0.2)" />
                    <PolarAngleAxis dataKey="metric" stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis stroke="rgba(255,255,255,0.3)" domain={[0, 100]} />
                    <Radar name="Score" dataKey="value" stroke="#BBD977" fill="#BBD977" fillOpacity={0.5} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.2)' }}
                      formatter={(value: number) => [`${value.toFixed(0)}/100`, 'Score']}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          )}

          {/* Arbitrage Opportunities */}
          {output.arbitrage_opportunities && output.arbitrage_opportunities.length > 0 && (
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', height: '100%' }}>
                <Typography variant="h6" fontWeight={600} mb={2}>
                  Arbitrage Opportunities
                  <Chip 
                    label={`${output.arbitrage_opportunities.length} found`} 
                    size="small" 
                    sx={{ ml: 1, backgroundColor: 'rgba(187, 217, 119, 0.2)', color: '#BBD977' }}
                  />
                </Typography>
                <Box>
                  {output.arbitrage_opportunities.slice(0, 4).map((arb: any, index: number) => (
                    <Box key={index} sx={{ 
                      mb: 2, 
                      p: 2, 
                      backgroundColor: 'rgba(255,255,255,0.03)', 
                      borderRadius: '8px',
                      borderLeft: '3px solid #BBD977'
                    }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="body2" fontWeight={600}>
                          {arb.buy_from} → {arb.sell_to}
                        </Typography>
                        <Chip 
                          label={`+${arb.spread_percent?.toFixed(2)}%`} 
                          size="small" 
                          sx={{ 
                            backgroundColor: arb.spread_percent > 1 ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 193, 7, 0.2)',
                            color: arb.spread_percent > 1 ? '#4caf50' : '#ffc107',
                            fontWeight: 700
                          }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption" color="text.secondary">
                          Buy: ${arb.buy_price?.toFixed(6)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Sell: ${arb.sell_price?.toFixed(6)}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Paper>
            </Grid>
          )}
        </Grid>

        {/* Supply Metrics */}
        {output.supply_metrics && (
          <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
            <Typography variant="h6" fontWeight={600} mb={2}>Supply Metrics</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Typography variant="body2" color="text.secondary">Circulating Supply</Typography>
                <Typography variant="h6">{output.supply_metrics.circulating_supply?.toLocaleString() || 'N/A'}</Typography>
                <LinearProgress variant="determinate" value={output.supply_metrics.circulating_percent || 0} sx={{ mt: 1, height: 8, borderRadius: 4 }} />
                <Typography variant="caption" color="text.secondary">{output.supply_metrics.circulating_percent?.toFixed(1)}% of total</Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="body2" color="text.secondary">Total Supply</Typography>
                <Typography variant="h6">{output.supply_metrics.total_supply?.toLocaleString() || 'N/A'}</Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="body2" color="text.secondary">Max Supply</Typography>
                <Typography variant="h6">{output.supply_metrics.max_supply ? output.supply_metrics.max_supply.toLocaleString() : 'Unlimited'}</Typography>
              </Grid>
            </Grid>
          </Paper>
        )}
      </Box>
    );
  };

  // ============ TRADING TAB ============
  const renderTrading = () => {
    const output = currentRun?.output_json;
    if (!output) return null;

    const tickers = output.exchange_tickers || [];

    // Prepare pie chart data
    const volumeByExchange = tickers.slice(0, 6).map((t: any, i: number) => ({
      name: t.exchange,
      value: t.volume_24h || 0,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));

    return (
      <Box>
        <Typography variant="h6" fontWeight={600} mb={3}>Exchange & Trading Data</Typography>

        <Grid container spacing={3}>
          {/* Volume by Exchange Pie Chart */}
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
              <Typography variant="subtitle1" fontWeight={600} mb={2}>Volume by Exchange (Top 6)</Typography>
              {volumeByExchange.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={volumeByExchange} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(entry) => entry.name}>
                      {volumeByExchange.map((entry: any, i: number) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatNumber(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No exchange data</Typography>}
            </Paper>
          </Grid>

          {/* Exchange Tickers Table */}
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
              <Typography variant="subtitle1" fontWeight={600} mb={2}>Trading Pairs ({tickers.length})</Typography>
              <TableContainer sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ backgroundColor: '#1a1a1a' }}>Exchange</TableCell>
                      <TableCell sx={{ backgroundColor: '#1a1a1a' }}>Pair</TableCell>
                      <TableCell sx={{ backgroundColor: '#1a1a1a' }} align="right">Price</TableCell>
                      <TableCell sx={{ backgroundColor: '#1a1a1a' }} align="right">24h Vol</TableCell>
                      <TableCell sx={{ backgroundColor: '#1a1a1a' }} align="right">Spread</TableCell>
                      <TableCell sx={{ backgroundColor: '#1a1a1a' }}>Trust</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tickers.map((t: any, i: number) => (
                      <TableRow key={i} hover>
                        <TableCell>{t.exchange}</TableCell>
                        <TableCell><Chip label={t.pair} size="small" sx={{ backgroundColor: 'rgba(187,217,119,0.2)', color: '#BBD977', fontSize: '0.7rem' }} /></TableCell>
                        <TableCell align="right">{formatPrice(t.price || 0)}</TableCell>
                        <TableCell align="right">{formatNumber(t.volume_24h || 0)}</TableCell>
                        <TableCell align="right" sx={{ color: (t.bid_ask_spread || 0) < 0.1 ? '#4caf50' : (t.bid_ask_spread || 0) < 0.5 ? '#ffc107' : '#f44336' }}>
                          {(t.bid_ask_spread || 0).toFixed(3)}%
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={t.trust_score || 'N/A'} 
                            size="small" 
                            sx={{ 
                              backgroundColor: t.trust_score === 'green' ? 'rgba(76,175,80,0.2)' : t.trust_score === 'yellow' ? 'rgba(255,193,7,0.2)' : 'rgba(255,255,255,0.1)',
                              color: t.trust_score === 'green' ? '#4caf50' : t.trust_score === 'yellow' ? '#ffc107' : '#999',
                              fontSize: '0.7rem'
                            }} 
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    );
  };

  // ============ DERIVATIVES TAB ============
  const renderDerivatives = () => {
    const output = currentRun?.output_json;
    if (!output) return null;

    const derivatives = output.derivatives || [];

    if (derivatives.length === 0) {
      return (
        <Paper sx={{ p: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', textAlign: 'center' }}>
          <DerivativesIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">Derivatives data available for BTC and ETH only</Typography>
          <Typography variant="body2" color="text.secondary">Try analyzing Bitcoin or Ethereum to see futures and perpetuals data.</Typography>
        </Paper>
      );
    }

    const avgFunding = derivatives.reduce((sum: number, d: any) => sum + (d.funding_rate || 0), 0) / derivatives.length * 100;
    const totalOI = derivatives.reduce((sum: number, d: any) => sum + (d.open_interest || 0), 0);

    return (
      <Box>
        <Box sx={{ mb: 4 }}>
          <Typography 
            variant="h5" 
            fontWeight={600} 
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 1.5, 
              mb: 2,
              color: '#BBD977'
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>📊</span>
            DERIVATIVES DATA
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
            Futures and perpetual contracts with funding rates and open interest
          </Typography>
        </Box>

        {/* Summary Cards */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} md={3}>
            <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
              <Typography variant="caption" color="text.secondary">Contracts Found</Typography>
              <Typography variant="h5" fontWeight={600}>{derivatives.length}</Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} md={3}>
            <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
              <Typography variant="caption" color="text.secondary">Avg Funding Rate</Typography>
              <Typography variant="h5" fontWeight={600} sx={{ color: avgFunding >= 0 ? '#4caf50' : '#f44336' }}>{avgFunding.toFixed(4)}%</Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} md={3}>
            <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
              <Typography variant="caption" color="text.secondary">Total Open Interest</Typography>
              <Typography variant="h5" fontWeight={600}>{formatNumber(totalOI)}</Typography>
            </Paper>
          </Grid>
        </Grid>

        {/* Derivatives Table */}
        <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Symbol</TableCell>
                  <TableCell>Exchange</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell align="right">Index</TableCell>
                  <TableCell align="right">Funding Rate</TableCell>
                  <TableCell align="right">Open Interest</TableCell>
                  <TableCell align="right">24h Volume</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {derivatives.map((d: any, i: number) => (
                  <TableRow key={i} hover>
                    <TableCell><strong>{d.symbol}</strong></TableCell>
                    <TableCell>{d.exchange}</TableCell>
                    <TableCell align="right">{formatPrice(d.price || 0)}</TableCell>
                    <TableCell align="right">{formatPrice(d.index_price || 0)}</TableCell>
                    <TableCell align="right" sx={{ color: (parseFloat(d.funding_rate) || 0) >= 0 ? '#4caf50' : '#f44336' }}>
                      {((parseFloat(d.funding_rate) || 0) * 100).toFixed(4)}%
                    </TableCell>
                    <TableCell align="right">{formatNumber(d.open_interest || 0)}</TableCell>
                    <TableCell align="right">{formatNumber(d.volume_24h || 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    );
  };

  // ============ INSTITUTIONAL TAB ============
  const renderInstitutional = () => {
    const output = currentRun?.output_json;
    if (!output) return null;

    const holdings = output.institutional_holdings || [];
    const totalValue = output.total_institutional_value || 0;

    if (holdings.length === 0) {
      return (
        <Paper sx={{ p: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', textAlign: 'center' }}>
          <InstitutionalIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">Corporate treasury data available for BTC and ETH only</Typography>
          <Typography variant="body2" color="text.secondary">Companies like MicroStrategy, Tesla, and others publicly report their crypto holdings.</Typography>
        </Paper>
      );
    }

    // Prepare pie chart
    const holdingsChart = holdings.slice(0, 5).map((h: any, i: number) => ({
      name: h.company,
      value: h.total_holdings || 0,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));

    return (
      <Box>
        <Box sx={{ mb: 4 }}>
          <Typography 
            variant="h5" 
            fontWeight={600} 
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 1.5, 
              mb: 2,
              color: '#BBD977'
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>🏢</span>
            INSTITUTIONAL HOLDINGS
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
            Corporate treasury holdings from publicly traded companies
          </Typography>
        </Box>

        {/* Summary */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} md={4}>
            <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
              <Typography variant="caption" color="text.secondary">Companies Holding</Typography>
              <Typography variant="h4" fontWeight={600}>{holdings.length}</Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} md={4}>
            <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
              <Typography variant="caption" color="text.secondary">Total Value</Typography>
              <Typography variant="h4" fontWeight={600} color="primary.main">{formatNumber(totalValue)}</Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
              <Typography variant="caption" color="text.secondary">Total Holdings</Typography>
              <Typography variant="h4" fontWeight={600}>{holdings.reduce((s: number, h: any) => s + (h.total_holdings || 0), 0).toLocaleString()}</Typography>
            </Paper>
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          {/* Holdings Chart */}
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
              <Typography variant="subtitle1" fontWeight={600} mb={2}>Top 5 Holders</Typography>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={holdingsChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(e) => e.name}>
                    {holdingsChart.map((entry: any, i: number) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => v.toLocaleString()} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          {/* Holdings Table */}
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
              <Typography variant="subtitle1" fontWeight={600} mb={2}>Company Details</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Company</TableCell>
                      <TableCell>Symbol</TableCell>
                      <TableCell>Country</TableCell>
                      <TableCell align="right">Holdings</TableCell>
                      <TableCell align="right">Value</TableCell>
                      <TableCell align="right">% of Supply</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {holdings.map((h: any, i: number) => (
                      <TableRow key={i} hover>
                        <TableCell><strong>{h.company}</strong></TableCell>
                        <TableCell>{h.symbol}</TableCell>
                        <TableCell>{h.country}</TableCell>
                        <TableCell align="right">{(parseFloat(h.total_holdings) || 0).toLocaleString()}</TableCell>
                        <TableCell align="right">{formatNumber(h.total_value_usd || 0)}</TableCell>
                        <TableCell align="right">{(parseFloat(h.percentage_of_total_supply) || 0).toFixed(4)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    );
  };

  // ============ RAW DATA TAB ============
  const renderRawData = () => {
    const output = currentRun?.output_json;
    if (!output) return null;

    const jsonStr = JSON.stringify(output, null, 2);
    const fileSize = new Blob([jsonStr]).size;

    return (
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight={600}>Raw JSON Data</Typography>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Chip label={`${(fileSize / 1024).toFixed(1)} KB`} size="small" variant="outlined" />
            <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={handleDownloadJson}>
              Download JSON
            </Button>
          </Box>
        </Box>
        <Paper sx={{ p: 2, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '12px', maxHeight: 500, overflow: 'auto' }}>
          <pre style={{ fontSize: '0.75rem', margin: 0, whiteSpace: 'pre-wrap' }}>
            {jsonStr.slice(0, 5000)}
            {jsonStr.length > 5000 && '\n... (truncated, download for full data)'}
          </pre>
        </Paper>
      </Box>
    );
  };

  // ============ TECHNICAL ANALYSIS TAB ============
  const renderTechnical = () => {
    const output = currentRun?.output_json;
    if (!output) return null;

    const technical = output.technical_indicators || {};
    const multiTimeframe = output.multi_timeframe || {};

    if (Object.keys(technical).length === 0 && Object.keys(multiTimeframe).length === 0) {
      return (
        <Paper sx={{ p: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', textAlign: 'center' }}>
          <SpeedIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">No technical analysis data available</Typography>
        </Paper>
      );
    }

    const rsi = technical.rsi || 0;
    const macd = technical.macd || {};
    const trend = technical.trend || {};
    const ma = technical.moving_averages || {};
    const bb = technical.bollinger_bands || {};

    // RSI color
    const getRsiColor = (val: number) => {
      if (val > 70) return '#f44336';
      if (val < 30) return '#4caf50';
      return '#ffc107';
    };

    // Multi-timeframe color
    const getChangeColor = (val: number) => val >= 0 ? '#4caf50' : '#f44336';

    return (
      <Box>
        <Box sx={{ mb: 4 }}>
          <Typography 
            variant="h5" 
            fontWeight={600} 
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 1.5, 
              mb: 2,
              color: '#BBD977'
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>📈</span>
            TECHNICAL ANALYSIS
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
            Price trends, momentum indicators, and trading signals across multiple timeframes
          </Typography>
        </Box>

        {/* Multi-Timeframe Overview */}
        {Object.keys(multiTimeframe).length > 0 && (
          <Paper sx={{ p: 3, mb: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle1" fontWeight={600}>Multi-Timeframe Performance</Typography>
              <Typography variant="caption" color="text.secondary">Price changes across 7 timeframes - shows trend consistency</Typography>
            </Box>
            <Grid container spacing={2}>
              {['1h', '4h', '1d', '7d', '30d', '90d', '1y'].map((tf) => {
                const data = multiTimeframe[tf];
                if (!data) return null;
                return (
                  <Grid item xs={6} sm={4} md={3} lg={1.7} key={tf}>
                    <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '8px' }}>
                      <Typography variant="caption" color="text.secondary">{tf.toUpperCase()}</Typography>
                      <Typography variant="h6" fontWeight={600} sx={{ color: getChangeColor(data.change_pct || 0) }}>
                        {(data.change_pct || 0) > 0 ? '+' : ''}{(data.change_pct || 0).toFixed(2)}%
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{data.data_points} pts</Typography>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
          </Paper>
        )}

        {/* Indicators Grid */}
        <Grid container spacing={3}>
          {/* RSI Gauge */}
          {rsi > 0 && (
            <Grid item xs={12} md={6} lg={4}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle1" fontWeight={600}>RSI (14)</Typography>
                  <Typography variant="caption" color="text.secondary">Relative Strength Index - measures momentum (0-100)</Typography>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <Box sx={{ position: 'relative', width: 200, height: 100 }}>
                    <LinearProgress 
                      variant="determinate" 
                      value={rsi} 
                      sx={{ 
                        height: 20, 
                        borderRadius: 10,
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        '& .MuiLinearProgress-bar': { backgroundColor: getRsiColor(rsi) }
                      }} 
                    />
                    <Typography variant="h4" fontWeight={700} sx={{ textAlign: 'center', mt: 2, color: getRsiColor(rsi) }}>
                      {rsi.toFixed(1)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', mt: 2 }}>
                    <Chip label="Oversold (<30)" size="small" sx={{ backgroundColor: 'rgba(76,175,80,0.2)', color: '#4caf50' }} />
                    <Chip label="Neutral (30-70)" size="small" sx={{ backgroundColor: 'rgba(255,193,7,0.2)', color: '#ffc107' }} />
                    <Chip label="Overbought (>70)" size="small" sx={{ backgroundColor: 'rgba(244,67,54,0.2)', color: '#f44336' }} />
                  </Box>
                </Box>
              </Paper>
            </Grid>
          )}

          {/* MACD */}
          {macd.macd && (
            <Grid item xs={12} md={6} lg={4}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Typography variant="subtitle1" fontWeight={600} mb={2}>MACD</Typography>
                <Box>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary">MACD Line</Typography>
                    <Typography variant="h5" fontWeight={600}>{macd.macd.toFixed(2)}</Typography>
                  </Box>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary">Signal Line</Typography>
                    <Typography variant="h5" fontWeight={600}>{macd.signal.toFixed(2)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Histogram</Typography>
                    <Typography variant="h5" fontWeight={600} sx={{ color: macd.histogram >= 0 ? '#4caf50' : '#f44336' }}>
                      {macd.histogram >= 0 ? '+' : ''}{macd.histogram.toFixed(2)}
                    </Typography>
                    <Chip 
                      label={macd.histogram >= 0 ? "Bullish" : "Bearish"} 
                      size="small" 
                      sx={{ mt: 1, backgroundColor: macd.histogram >= 0 ? 'rgba(76,175,80,0.2)' : 'rgba(244,67,54,0.2)', color: macd.histogram >= 0 ? '#4caf50' : '#f44336' }} 
                    />
                  </Box>
                </Box>
              </Paper>
            </Grid>
          )}

          {/* Trend Detection */}
          {trend.direction && (
            <Grid item xs={12} md={6} lg={4}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Typography variant="subtitle1" fontWeight={600} mb={2}>Trend Analysis</Typography>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary">Direction</Typography>
                  <Typography variant="h5" fontWeight={600} sx={{ mb: 2, textTransform: 'capitalize' }}>
                    {trend.direction.replace('_', ' ')}
                  </Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={Math.abs(trend.strength || 0) * 20} 
                    sx={{ 
                      height: 10, 
                      borderRadius: 5, 
                      mb: 1,
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      '& .MuiLinearProgress-bar': { backgroundColor: '#BBD977' }
                    }} 
                  />
                  <Typography variant="caption" color="text.secondary">
                    Strength: {Math.abs(trend.strength || 0)}/5
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          )}

          {/* Moving Averages */}
          {ma.ma20 && (
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Typography variant="subtitle1" fontWeight={600} mb={2}>Moving Averages</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">MA20</Typography>
                    <Typography variant="h6">{formatPrice(ma.ma20)}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">MA50</Typography>
                    <Typography variant="h6">{formatPrice(ma.ma50)}</Typography>
                  </Grid>
                  {ma.ma100 && (
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">MA100</Typography>
                      <Typography variant="h6">{formatPrice(ma.ma100)}</Typography>
                    </Grid>
                  )}
                  {ma.ma200 && (
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">MA200</Typography>
                      <Typography variant="h6">{formatPrice(ma.ma200)}</Typography>
                    </Grid>
                  )}
                </Grid>
              </Paper>
            </Grid>
          )}

          {/* Bollinger Bands */}
          {bb.upper && (
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Typography variant="subtitle1" fontWeight={600} mb={2}>Bollinger Bands</Typography>
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="caption" color="text.secondary">Upper Band</Typography>
                    <Typography variant="body2" fontWeight={600}>{formatPrice(bb.upper)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="caption" color="text.secondary">Middle Band</Typography>
                    <Typography variant="body2" fontWeight={600}>{formatPrice(bb.middle)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="caption" color="text.secondary">Lower Band</Typography>
                    <Typography variant="body2" fontWeight={600}>{formatPrice(bb.lower)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">Bandwidth</Typography>
                    <Typography variant="body2" fontWeight={600}>{bb.bandwidth?.toFixed(2)}%</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">%B Position</Typography>
                    <Typography variant="body2" fontWeight={600}>{bb.percent_b?.toFixed(2)}</Typography>
                  </Box>
                </Box>
              </Paper>
            </Grid>
          )}

          {/* Support & Resistance */}
          {technical.support_resistance && (
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Typography variant="subtitle1" fontWeight={600} mb={2}>Support & Resistance</Typography>
                <Box>
                  <Box sx={{ mb: 2, p: 2, backgroundColor: 'rgba(244,67,54,0.1)', borderRadius: '8px' }}>
                    <Typography variant="caption" color="text.secondary">Resistance</Typography>
                    <Typography variant="h5" fontWeight={600} color="#f44336">
                      {formatPrice(technical.support_resistance.resistance)}
                    </Typography>
                  </Box>
                  <Box sx={{ mb: 2, p: 2, backgroundColor: 'rgba(255,193,7,0.1)', borderRadius: '8px' }}>
                    <Typography variant="caption" color="text.secondary">Pivot Point</Typography>
                    <Typography variant="h5" fontWeight={600} color="#ffc107">
                      {formatPrice(technical.support_resistance.pivot)}
                    </Typography>
                  </Box>
                  <Box sx={{ p: 2, backgroundColor: 'rgba(76,175,80,0.1)', borderRadius: '8px' }}>
                    <Typography variant="caption" color="text.secondary">Support</Typography>
                    <Typography variant="h5" fontWeight={600} color="#4caf50">
                      {formatPrice(technical.support_resistance.support)}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            </Grid>
          )}

          {/* ATR */}
          {technical.atr && (
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Typography variant="subtitle1" fontWeight={600} mb={2}>Average True Range (ATR)</Typography>
                <Typography variant="h4" fontWeight={600} color="primary.main">
                  {formatPrice(technical.atr)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Measures market volatility
                </Typography>
              </Paper>
            </Grid>
          )}
        </Grid>
      </Box>
    );
  };

  // ============ RISK METRICS TAB ============
  const renderRiskMetrics = () => {
    const output = currentRun?.output_json;
    if (!output) return null;

    const risk = output.risk_metrics || {};

    if (Object.keys(risk).length === 0) {
      return (
        <Paper sx={{ p: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', textAlign: 'center' }}>
          <WarningIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">No risk analysis data available</Typography>
        </Paper>
      );
    }

    const riskScore = risk.risk_score || 0;
    const riskLevel = risk.risk_level || 'Unknown';
    const getRiskColor = (score: number) => {
      if (score >= 70) return '#4caf50'; // Low risk
      if (score >= 40) return '#ffc107'; // Medium risk
      return '#f44336'; // High risk
    };

    return (
      <Box>
        <Box sx={{ mb: 4 }}>
          <Typography 
            variant="h5" 
            fontWeight={600} 
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 1.5, 
              mb: 2,
              color: '#BBD977'
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            RISK ANALYSIS
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
            Volatility, drawdown, and risk-adjusted return metrics for investment decisions
          </Typography>
        </Box>

        {/* Risk Score Card */}
        <Paper sx={{ p: 4, mb: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', textAlign: 'center' }}>
          <Typography variant="h3" fontWeight={700} sx={{ color: getRiskColor(riskScore), mb: 1 }}>
            {riskScore}/100
          </Typography>
          <Typography variant="h6" color="text.secondary" mb={2}>Overall Risk Score</Typography>
          <Chip 
            label={riskLevel} 
            sx={{ 
              fontSize: '1rem', 
              fontWeight: 600, 
              px: 3, 
              py: 2, 
              height: 'auto',
              backgroundColor: `${getRiskColor(riskScore)}20`,
              color: getRiskColor(riskScore)
            }} 
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            Higher score = Lower risk
          </Typography>
        </Paper>

        {/* Risk Metrics Grid */}
        <Grid container spacing={3}>
          {/* Volatility */}
          {risk.volatility_annual && (
            <Grid item xs={12} md={6} lg={4}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Typography variant="subtitle1" fontWeight={600} mb={2}>Volatility</Typography>
                <Typography variant="h4" fontWeight={600} color="primary.main" mb={1}>
                  {risk.volatility_annual.toFixed(1)}%
                </Typography>
                <Typography variant="caption" color="text.secondary">Annualized</Typography>
                {risk.volatility_30d && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      30-day: <strong>{risk.volatility_30d.toFixed(1)}%</strong>
                    </Typography>
                  </Box>
                )}
              </Paper>
            </Grid>
          )}

          {/* Sharpe Ratio */}
          {risk.sharpe_ratio !== undefined && (
            <Grid item xs={12} md={6} lg={4}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle1" fontWeight={600}>Sharpe Ratio</Typography>
                  <Typography variant="caption" color="text.secondary">Return per unit of risk - higher is better (above 1 = excellent)</Typography>
                </Box>
                <Typography variant="h4" fontWeight={600} sx={{ color: risk.sharpe_ratio > 1 ? '#4caf50' : risk.sharpe_ratio > 0 ? '#ffc107' : '#f44336', mb: 1 }}>
                  {risk.sharpe_ratio.toFixed(2)}
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <Chip 
                    label={risk.sharpe_ratio > 1 ? "Excellent" : risk.sharpe_ratio > 0 ? "Good" : "Poor"} 
                    size="small" 
                    sx={{ backgroundColor: `${risk.sharpe_ratio > 1 ? '#4caf50' : risk.sharpe_ratio > 0 ? '#ffc107' : '#f44336'}20` }}
                  />
                </Box>
              </Paper>
            </Grid>
          )}

          {/* Sortino Ratio */}
          {risk.sortino_ratio !== undefined && (
            <Grid item xs={12} md={6} lg={4}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Typography variant="subtitle1" fontWeight={600} mb={2}>Sortino Ratio</Typography>
                <Typography variant="h4" fontWeight={600} color="primary.main" mb={1}>
                  {risk.sortino_ratio.toFixed(2)}
                </Typography>
                <Typography variant="caption" color="text.secondary">Downside risk focus</Typography>
              </Paper>
            </Grid>
          )}

          {/* Max Drawdown */}
          {risk.max_drawdown && (
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Typography variant="subtitle1" fontWeight={600} mb={2}>Maximum Drawdown</Typography>
                <Typography variant="h4" fontWeight={700} color="#f44336" mb={2}>
                  {risk.max_drawdown.max_drawdown_pct?.toFixed(1)}%
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Peak Price</Typography>
                    <Typography variant="body2" fontWeight={600}>{formatPrice(risk.max_drawdown.peak_price || 0)}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Trough Price</Typography>
                    <Typography variant="body2" fontWeight={600}>{formatPrice(risk.max_drawdown.trough_price || 0)}</Typography>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>
          )}

          {/* Value at Risk */}
          {risk.value_at_risk_95 && (
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle1" fontWeight={600}>Value at Risk (VaR)</Typography>
                  <Typography variant="caption" color="text.secondary">Maximum expected loss over 1 day (statistical estimate)</Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" color="text.secondary">95% Confidence</Typography>
                  <Typography variant="h5" fontWeight={600} color="#f44336">
                    {risk.value_at_risk_95.toFixed(2)}%
                  </Typography>
                </Box>
                {risk.value_at_risk_99 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">99% Confidence</Typography>
                    <Typography variant="h5" fontWeight={600} color="#f44336">
                      {risk.value_at_risk_99.toFixed(2)}%
                    </Typography>
                  </Box>
                )}
              </Paper>
            </Grid>
          )}

          {/* Expected Shortfall */}
          {risk.expected_shortfall && (
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Typography variant="subtitle1" fontWeight={600} mb={2}>Expected Shortfall (CVaR)</Typography>
                <Typography variant="h4" fontWeight={600} color="#f44336" mb={1}>
                  {risk.expected_shortfall.toFixed(2)}%
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Average loss beyond VaR threshold
                </Typography>
              </Paper>
            </Grid>
          )}
        </Grid>
      </Box>
    );
  };

  // ============ HEALTH SCORE TAB ============
  const renderHealthScore = () => {
    const output = currentRun?.output_json;
    if (!output) return null;

    const health = output.health_scores || {};

    if (Object.keys(health).length === 0) {
      return (
        <Paper sx={{ p: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', textAlign: 'center' }}>
          <HealthIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">No health score data available</Typography>
        </Paper>
      );
    }

    const overallScore = health.overall_score || 0;
    const grade = health.grade || 'N/A';
    const status = health.status || 'Unknown';
    const components = health.component_scores || {};

    const getHealthColor = (score: number) => {
      if (score >= 80) return '#4caf50';
      if (score >= 60) return '#8bc34a';
      if (score >= 40) return '#ffc107';
      if (score >= 20) return '#ff9800';
      return '#f44336';
    };

    return (
      <Box>
        <Box sx={{ mb: 4 }}>
          <Typography 
            variant="h5" 
            fontWeight={600} 
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 1.5, 
              mb: 2,
              color: '#BBD977'
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>💪</span>
            TOKEN HEALTH SCORE
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
            Composite score (0-100) evaluating liquidity, volatility, trend, market cap, volume, derivatives & institutional interest
          </Typography>
        </Box>

        {/* Overall Score Card */}
        <Paper sx={{ p: 4, mb: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', textAlign: 'center' }}>
          <Typography variant="h1" fontWeight={700} sx={{ color: getHealthColor(overallScore), mb: 2 }}>
            {overallScore}
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2 }}>
            <Chip 
              label={`Grade: ${grade}`} 
              sx={{ 
                fontSize: '1.2rem', 
                fontWeight: 600, 
                px: 3, 
                py: 2.5, 
                height: 'auto',
                backgroundColor: `${getHealthColor(overallScore)}30`,
                color: getHealthColor(overallScore)
              }} 
            />
            <Chip 
              label={status} 
              sx={{ 
                fontSize: '1.2rem', 
                fontWeight: 600, 
                px: 3, 
                py: 2.5, 
                height: 'auto',
                backgroundColor: `${getHealthColor(overallScore)}30`,
                color: getHealthColor(overallScore)
              }} 
            />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Overall Token Health Assessment (0-100)
          </Typography>
        </Paper>

        {/* Component Scores */}
        <Grid container spacing={3}>
          {Object.entries(components).map(([key, value]) => {
            const score = value as number;
            return (
              <Grid item xs={12} sm={6} md={4} lg={3} key={key}>
                <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: 'capitalize', mb: 2 }}>
                    {key}
                  </Typography>
                  <Box sx={{ position: 'relative', display: 'inline-flex', width: '100%', justifyContent: 'center' }}>
                    <CircularProgress
                      variant="determinate"
                      value={score}
                      size={100}
                      thickness={5}
                      sx={{ 
                        color: getHealthColor(score),
                        '& .MuiCircularProgress-circle': { strokeLinecap: 'round' }
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
                      <Typography variant="h5" fontWeight={700} sx={{ color: getHealthColor(score) }}>
                        {score}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              </Grid>
            );
          })}
        </Grid>

        {/* Quality Scores */}
        {(health.trade_quality_score || health.investment_quality_score) && (
          <Grid container spacing={3} sx={{ mt: 2 }}>
            {health.trade_quality_score && (
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                  <Typography variant="subtitle1" fontWeight={600} mb={2}>Trade Quality</Typography>
                  <Typography variant="h3" fontWeight={700} sx={{ color: getHealthColor(health.trade_quality_score) }}>
                    {health.trade_quality_score}/100
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Suitability for short-term trading
                  </Typography>
                </Paper>
              </Grid>
            )}
            {health.investment_quality_score && (
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                  <Typography variant="subtitle1" fontWeight={600} mb={2}>Investment Quality</Typography>
                  <Typography variant="h3" fontWeight={700} sx={{ color: getHealthColor(health.investment_quality_score) }}>
                    {health.investment_quality_score}/100
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Suitability for long-term holding
                  </Typography>
                </Paper>
              </Grid>
            )}
          </Grid>
        )}
      </Box>
    );
  };

  // ============ COMPARISON & MARKET MOVERS TAB ============
  const renderComparison = () => {
    const output = currentRun?.output_json;
    if (!output) return null;

    const categoryComp = output.category_comparison || {};
    const isMarketMover = output.is_market_mover || false;
    const moverInfo = output.market_mover_info || {};
    const arbitrage = output.arbitrage_opportunities || [];

    if (Object.keys(categoryComp).length === 0 && !isMarketMover && arbitrage.length === 0) {
      return (
        <Paper sx={{ p: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', textAlign: 'center' }}>
          <CompareIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">No comparison data available</Typography>
        </Paper>
      );
    }

    return (
      <Box>
        <Box sx={{ mb: 4 }}>
          <Typography 
            variant="h5" 
            fontWeight={600} 
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 1.5, 
              mb: 2,
              color: '#BBD977'
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>🔍</span>
            MARKET COMPARISON & OPPORTUNITIES
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
            Category rankings, market mover status, and cross-exchange arbitrage opportunities
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {/* Market Mover Badge */}
          {isMarketMover && (
            <Grid item xs={12}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(187,217,119,0.1)', borderRadius: '12px', border: '2px solid #BBD977' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <TrendingUpIcon sx={{ fontSize: 48, color: '#BBD977' }} />
                  <Box>
                    <Typography variant="h5" fontWeight={700} sx={{ color: '#BBD977', mb: 1 }}>
                      🔥 Top Market Mover!
                    </Typography>
                    <Typography variant="body1">
                      Ranked <strong>#{moverInfo.rank}</strong> {moverInfo.type === 'gainer' ? 'Gainer' : 'Loser'} (Top {moverInfo.list_size})
                    </Typography>
                    {moverInfo.peers && moverInfo.peers.length > 0 && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="caption" color="text.secondary">Also moving:</Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                          {moverInfo.peers.slice(0, 5).map((peer: any) => (
                            <Chip 
                              key={peer.id} 
                              label={`${peer.symbol.toUpperCase()} ${peer.price_change_percentage_24h > 0 ? '+' : ''}${peer.price_change_percentage_24h?.toFixed(1)}%`}
                              size="small"
                              sx={{ backgroundColor: peer.price_change_percentage_24h > 0 ? 'rgba(76,175,80,0.2)' : 'rgba(244,67,54,0.2)' }}
                            />
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Box>
                </Box>
              </Paper>
            </Grid>
          )}

          {/* Category Dominance */}
          {categoryComp.category_name && (
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Typography variant="subtitle1" fontWeight={600} mb={2}>Category Dominance</Typography>
                <Typography variant="h6" color="primary.main" mb={2}>
                  {categoryComp.category_name}
                </Typography>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" color="text.secondary">Market Cap Dominance</Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={Math.min(categoryComp.market_cap_dominance || 0, 100)} 
                    sx={{ 
                      height: 10, 
                      borderRadius: 5, 
                      mt: 1,
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      '& .MuiLinearProgress-bar': { backgroundColor: '#BBD977' }
                    }} 
                  />
                  <Typography variant="h6" fontWeight={600} sx={{ mt: 1 }}>
                    {categoryComp.market_cap_dominance?.toFixed(2)}%
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Volume Dominance</Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={Math.min(categoryComp.volume_dominance || 0, 100)} 
                    sx={{ 
                      height: 10, 
                      borderRadius: 5, 
                      mt: 1,
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      '& .MuiLinearProgress-bar': { backgroundColor: '#BBD977' }
                    }} 
                  />
                  <Typography variant="h6" fontWeight={600} sx={{ mt: 1 }}>
                    {categoryComp.volume_dominance?.toFixed(2)}%
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          )}

          {/* Category Performance */}
          {categoryComp.category_change_24h !== undefined && (
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Typography variant="subtitle1" fontWeight={600} mb={2}>Category Performance (24h)</Typography>
                <Typography variant="h3" fontWeight={700} sx={{ color: categoryComp.category_change_24h >= 0 ? '#4caf50' : '#f44336', mb: 2 }}>
                  {categoryComp.category_change_24h >= 0 ? '+' : ''}{categoryComp.category_change_24h?.toFixed(2)}%
                </Typography>
                {categoryComp.top_3_coins && categoryComp.top_3_coins.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" mb={1}>Top 3 in Category:</Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                      {categoryComp.top_3_coins.map((coin: string) => (
                        <Chip key={coin} label={coin.toUpperCase()} size="small" sx={{ backgroundColor: 'rgba(187,217,119,0.2)', color: '#BBD977' }} />
                      ))}
                    </Box>
                  </Box>
                )}
              </Paper>
            </Grid>
          )}

          {/* Arbitrage Opportunities */}
          {arbitrage.length > 0 && (
            <Grid item xs={12}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Typography variant="subtitle1" fontWeight={600} mb={2}>
                  💰 Arbitrage Opportunities ({arbitrage.length} found)
                </Typography>
                <Typography variant="caption" color="text.secondary" mb={2} sx={{ display: 'block' }}>
                  Potential profit from price differences across exchanges
                </Typography>
                <Box sx={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ padding: '12px', textAlign: 'left', color: '#aaa', fontWeight: 600 }}>Buy From</th>
                        <th style={{ padding: '12px', textAlign: 'left', color: '#aaa', fontWeight: 600 }}>Sell To</th>
                        <th style={{ padding: '12px', textAlign: 'right', color: '#aaa', fontWeight: 600 }}>Buy Price</th>
                        <th style={{ padding: '12px', textAlign: 'right', color: '#aaa', fontWeight: 600 }}>Sell Price</th>
                        <th style={{ padding: '12px', textAlign: 'right', color: '#aaa', fontWeight: 600 }}>Profit %</th>
                        <th style={{ padding: '12px', textAlign: 'center', color: '#aaa', fontWeight: 600 }}>Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {arbitrage.map((opp: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '12px' }}>{opp.buy_exchange}</td>
                          <td style={{ padding: '12px' }}>{opp.sell_exchange}</td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>{formatPrice(opp.buy_price)}</td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>{formatPrice(opp.sell_price)}</td>
                          <td style={{ padding: '12px', textAlign: 'right', color: '#4caf50', fontWeight: 600 }}>
                            +{opp.profit_percentage?.toFixed(2)}%
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <Chip 
                              label={opp.confidence_rating || 'Medium'} 
                              size="small" 
                              sx={{ 
                                backgroundColor: opp.confidence_rating === 'High' ? 'rgba(76,175,80,0.2)' : 'rgba(255,193,7,0.2)',
                                color: opp.confidence_rating === 'High' ? '#4caf50' : '#ffc107'
                              }} 
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                  ⚠️ Note: Actual profit may be lower after fees, slippage, and transfer times
                </Typography>
              </Paper>
            </Grid>
          )}
        </Grid>
      </Box>
    );
  };

  // ============ INTELLIGENCE TAB ============
  const renderIntelligence = () => {
    const output = currentRun?.output_json;
    if (!output) return null;

    const technical = output.technical_indicators || {};
    const risk = output.risk_metrics || {};
    const health = output.health_scores || {};
    const multiTimeframe = output.multi_timeframe || {};

    return (
      <Box>
        <Box sx={{ mb: 4 }}>
          <Typography 
            variant="h5" 
            fontWeight={600} 
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 1.5, 
              mb: 2,
              color: '#BBD977'
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>🧠</span>
            ADVANCED INTELLIGENCE
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
            Deep analysis with technical indicators, risk metrics, and health scores
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {/* Health Score Overview */}
          {health.overall_score && (
            <Grid item xs={12}>
              <Paper sx={{ p: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', textAlign: 'center' }}>
                <Typography variant="h3" fontWeight={700} sx={{ color: getHealthColor(health.overall_score), mb: 1 }}>
                  {health.overall_score}/100
                </Typography>
                <Typography variant="h6" color="text.secondary" mb={1}>Overall Health Score</Typography>
                <Chip 
                  label={health.grade || 'N/A'} 
                  sx={{ 
                    fontSize: '1rem', 
                    fontWeight: 600, 
                    px: 3, 
                    py: 2, 
                    height: 'auto',
                    backgroundColor: `${getHealthColor(health.overall_score)}20`,
                    color: getHealthColor(health.overall_score)
                  }} 
                />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  Status: {health.status || 'Unknown'}
                </Typography>
              </Paper>
            </Grid>
          )}

          {/* Multi-Timeframe Analysis */}
          {Object.keys(multiTimeframe).length > 0 && (
            <Grid item xs={12}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Typography variant="h6" fontWeight={600} mb={3}>Multi-Timeframe Performance</Typography>
                <Grid container spacing={2}>
                  {Object.entries(multiTimeframe).map(([tf, data]: [string, any]) => {
                    const change = typeof data === 'object' ? data.change_pct : data;
                    return (
                      <Grid item xs={6} sm={4} md={3} lg={2} key={tf}>
                        <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                          <Typography variant="caption" color="text.secondary">{tf.toUpperCase()}</Typography>
                          <Typography 
                            variant="h6" 
                            fontWeight={700} 
                            sx={{ color: change >= 0 ? '#4caf50' : '#f44336' }}
                          >
                            {change >= 0 ? '+' : ''}{change?.toFixed(2)}%
                          </Typography>
                        </Paper>
                      </Grid>
                    );
                  })}
                </Grid>
              </Paper>
            </Grid>
          )}

          {/* Technical Indicators Detail */}
          {technical.rsi && (
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Typography variant="h6" fontWeight={600} mb={2}>RSI Analysis</Typography>
                <Box sx={{ textAlign: 'center', mb: 2 }}>
                  <Typography variant="h2" fontWeight={700} sx={{ 
                    color: technical.rsi > 70 ? '#f44336' : technical.rsi < 30 ? '#4caf50' : '#ffc107'
                  }}>
                    {technical.rsi.toFixed(1)}
                  </Typography>
                  <Typography variant="subtitle1" color="text.secondary">
                    {technical.rsi > 70 ? 'Overbought' : technical.rsi < 30 ? 'Oversold' : 'Neutral'}
                  </Typography>
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={technical.rsi} 
                  sx={{ 
                    height: 12, 
                    borderRadius: 6,
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    '& .MuiLinearProgress-bar': { 
                      backgroundColor: technical.rsi > 70 ? '#f44336' : technical.rsi < 30 ? '#4caf50' : '#ffc107'
                    }
                  }} 
                />
              </Paper>
            </Grid>
          )}

          {/* MACD */}
          {technical.macd && (
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Typography variant="h6" fontWeight={600} mb={2}>MACD Indicator</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={4}>
                    <Typography variant="caption" color="text.secondary">MACD</Typography>
                    <Typography variant="h5" fontWeight={600}>{technical.macd.macd?.toFixed(2) || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="caption" color="text.secondary">Signal</Typography>
                    <Typography variant="h5" fontWeight={600}>{technical.macd.signal?.toFixed(2) || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="caption" color="text.secondary">Histogram</Typography>
                    <Typography variant="h5" fontWeight={600} sx={{ 
                      color: (technical.macd.histogram || 0) >= 0 ? '#4caf50' : '#f44336'
                    }}>
                      {technical.macd.histogram?.toFixed(2) || 'N/A'}
                    </Typography>
                  </Grid>
                </Grid>
                <Box sx={{ mt: 2, p: 2, backgroundColor: (technical.macd.histogram || 0) >= 0 ? 'rgba(76,175,80,0.1)' : 'rgba(244,67,54,0.1)', borderRadius: '8px' }}>
                  <Typography variant="body2" fontWeight={600}>
                    {(technical.macd.histogram || 0) >= 0 ? '📈 Bullish Signal' : '📉 Bearish Signal'}
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          )}

          {/* Risk Score Summary */}
          {risk.risk_score && (
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Typography variant="h6" fontWeight={600} mb={2}>Risk Assessment</Typography>
                <Box sx={{ textAlign: 'center', mb: 2 }}>
                  <Typography variant="h2" fontWeight={700} sx={{ 
                    color: risk.risk_score >= 70 ? '#4caf50' : risk.risk_score >= 40 ? '#ffc107' : '#f44336'
                  }}>
                    {risk.risk_score}/100
                  </Typography>
                  <Typography variant="subtitle1" color="text.secondary">
                    {risk.risk_level || 'Unknown'} Risk
                  </Typography>
                </Box>
                <Grid container spacing={1}>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Volatility</Typography>
                    <Typography variant="body2" fontWeight={600}>{risk.volatility_annual?.toFixed(1)}%</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Sharpe Ratio</Typography>
                    <Typography variant="body2" fontWeight={600}>{risk.sharpe_ratio?.toFixed(2)}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Max Drawdown</Typography>
                    <Typography variant="body2" fontWeight={600}>{risk.max_drawdown?.toFixed(1)}%</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">VaR (95%)</Typography>
                    <Typography variant="body2" fontWeight={600}>{risk.var_95?.toFixed(2)}%</Typography>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>
          )}

          {/* Health Component Scores */}
          {health.component_scores && (
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Typography variant="h6" fontWeight={600} mb={2}>Health Components</Typography>
                {Object.entries(health.component_scores).map(([key, value]: [string, any]) => (
                  <Box key={key} sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" color="text.secondary">
                        {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>{value.toFixed(1)}/100</Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={value} 
                      sx={{ 
                        height: 8, 
                        borderRadius: 4,
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        '& .MuiLinearProgress-bar': { 
                          backgroundColor: getHealthColor(value)
                        }
                      }} 
                    />
                  </Box>
                ))}
              </Paper>
            </Grid>
          )}
        </Grid>
      </Box>
    );
  };

  // ============ FORECAST TAB ============
  const renderForecast = () => {
    const summary = currentRun?.ai_summary || '';
    const output = currentRun?.output_json || {};
    
    if (!summary) {
      return (
        <Alert severity="info">
          AI analysis is being generated. Forecasts will be available once complete.
        </Alert>
      );
    }

    // Parse forecast scenarios from AI summary
    const sections = summary.split(/(?=##\s)/g);
    const forecastSection = sections.find(s => s.toLowerCase().includes('scenario') || s.toLowerCase().includes('forecast'));
    
    // Extract scenarios
    const bullMatch = forecastSection?.match(/\*\*BULL CASE[^\*]*\*\*[\s\S]*?(?=\*\*(?:BASE|BEAR)|$)/i);
    const baseMatch = forecastSection?.match(/\*\*BASE CASE[^\*]*\*\*[\s\S]*?(?=\*\*(?:BEAR|RISK)|$)/i);
    const bearMatch = forecastSection?.match(/\*\*BEAR CASE[^\*]*\*\*[\s\S]*?(?=\*\*(?:RISK)|$)/i);

    return (
      <Box>
        <Box sx={{ mb: 4 }}>
          <Typography 
            variant="h5" 
            fontWeight={600} 
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 1.5, 
              mb: 2,
              color: '#BBD977'
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>🔮</span>
            SCENARIO-BASED FORECAST
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
            AI-powered price projections with probability-weighted scenarios
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {/* Bull Case */}
          {bullMatch && (
            <Grid item xs={12} md={4}>
              <Paper sx={{ 
                p: 3, 
                backgroundColor: 'rgba(76,175,80,0.05)', 
                borderRadius: '12px',
                border: '2px solid rgba(76,175,80,0.3)'
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <Typography variant="h6" fontWeight={700} sx={{ color: '#4caf50' }}>
                    🚀 Bull Case
                  </Typography>
                  <Chip label="30%" size="small" sx={{ backgroundColor: 'rgba(76,175,80,0.2)', color: '#4caf50' }} />
                </Box>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-line', color: 'text.secondary' }}>
                  {bullMatch[0].replace(/\*\*/g, '').replace(/BULL CASE[^\n]*\n/i, '')}
                </Typography>
              </Paper>
            </Grid>
          )}

          {/* Base Case */}
          {baseMatch && (
            <Grid item xs={12} md={4}>
              <Paper sx={{ 
                p: 3, 
                backgroundColor: 'rgba(255,193,7,0.05)', 
                borderRadius: '12px',
                border: '2px solid rgba(255,193,7,0.3)'
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <Typography variant="h6" fontWeight={700} sx={{ color: '#ffc107' }}>
                    📊 Base Case
                  </Typography>
                  <Chip label="50%" size="small" sx={{ backgroundColor: 'rgba(255,193,7,0.2)', color: '#ffc107' }} />
                </Box>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-line', color: 'text.secondary' }}>
                  {baseMatch[0].replace(/\*\*/g, '').replace(/BASE CASE[^\n]*\n/i, '')}
                </Typography>
              </Paper>
            </Grid>
          )}

          {/* Bear Case */}
          {bearMatch && (
            <Grid item xs={12} md={4}>
              <Paper sx={{ 
                p: 3, 
                backgroundColor: 'rgba(244,67,54,0.05)', 
                borderRadius: '12px',
                border: '2px solid rgba(244,67,54,0.3)'
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <Typography variant="h6" fontWeight={700} sx={{ color: '#f44336' }}>
                    📉 Bear Case
                  </Typography>
                  <Chip label="20%" size="small" sx={{ backgroundColor: 'rgba(244,67,54,0.2)', color: '#f44336' }} />
                </Box>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-line', color: 'text.secondary' }}>
                  {bearMatch[0].replace(/\*\*/g, '').replace(/BEAR CASE[^\n]*\n/i, '')}
                </Typography>
              </Paper>
            </Grid>
          )}
        </Grid>

        {/* Current Metrics Reference */}
        {output.key_metrics && (
          <Paper sx={{ p: 3, mt: 3, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
            <Typography variant="h6" fontWeight={600} mb={2}>Current Price Reference</Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="text.secondary">Current Price</Typography>
                <Typography variant="h6" fontWeight={600}>{formatPrice(output.key_metrics.current_price)}</Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="text.secondary">ATH</Typography>
                <Typography variant="h6" fontWeight={600}>{formatPrice(output.key_metrics.ath)}</Typography>
                <Typography variant="caption" sx={{ color: '#f44336' }}>
                  {output.key_metrics.ath_change_percent?.toFixed(1)}% from ATH
                </Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="text.secondary">ATL</Typography>
                <Typography variant="h6" fontWeight={600}>{formatPrice(output.key_metrics.atl)}</Typography>
                <Typography variant="caption" sx={{ color: '#4caf50' }}>
                  {output.key_metrics.atl_change_percent?.toFixed(1)}% from ATL
                </Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="text.secondary">Volatility</Typography>
                <Typography variant="h6" fontWeight={600}>{output.key_metrics.volatility?.toFixed(1)}%</Typography>
              </Grid>
            </Grid>
          </Paper>
        )}

        {/* Disclaimer */}
        <Alert severity="warning" sx={{ mt: 3 }}>
          ⚠️ <strong>Disclaimer:</strong> These forecasts are AI-generated based on historical data and current market conditions. 
          Cryptocurrency prices are highly volatile and unpredictable. Always conduct your own research and never invest more than you can afford to lose.
        </Alert>
      </Box>
    );
  };

  // ============ SUMMARY CARDS RENDERING ============
  const renderSummaryCards = () => {
    const summary = currentRun?.ai_summary || '';
    const output = currentRun?.output_json || {};
    
    if (!summary) {
      return (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">No summary available</Typography>
        </Box>
      );
    }

    // Remove the main title (single # heading) if present
    let cleanedSummary = summary;
    const mainTitleMatch = summary.match(/^#\s+(.+?)[\n\r]/);
    let mainTitle = '';
    if (mainTitleMatch) {
      mainTitle = mainTitleMatch[1].trim();
      cleanedSummary = summary.replace(/^#\s+.+?[\n\r]+/, '').trim();
    }

    // Parse sections from markdown summary (## headers)
    const sections = cleanedSummary.split(/(?=##\s)/g).filter(s => s.trim());
    
    // Function to get emoji based on section title
    const getSectionEmoji = (title: string) => {
      const upper = title.toUpperCase();
      if (upper.includes('POSITION') || upper.includes('FUNDAMENTAL')) return '📊';
      if (upper.includes('TECHNICAL')) return '📈';
      if (upper.includes('RISK')) return '⚠️';
      if (upper.includes('HEALTH')) return '💪';
      if (upper.includes('COMPARISON') || upper.includes('MARKET')) return '🔍';
      if (upper.includes('ARBITRAGE')) return '💰';
      if (upper.includes('FORECAST')) return '🔮';
      return '📌';
    };

    return (
      <Box>
        {/* Header with Stats */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box 
              sx={{ 
                p: 1.5, 
                backgroundColor: 'rgba(187,217,119,0.2)', 
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <DescriptionIcon sx={{ fontSize: 32, color: '#BBD977' }} />
            </Box>
            <Box>
              <Typography variant="h4" fontWeight={700} sx={{ color: '#BBD977' }}>
                {mainTitle || 'AI Analysis Summary'}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <Chip 
              label={`${output?.api_calls_made || 0} API Calls`} 
              size="medium" 
              sx={{ backgroundColor: 'rgba(33,150,243,0.2)', color: '#2196f3', fontWeight: 600 }}
            />
            {output.token_name && (
              <Chip 
                label={output.token_name} 
                size="medium" 
                sx={{ backgroundColor: 'rgba(76,175,80,0.2)', color: '#4caf50', fontWeight: 600 }}
              />
            )}
          </Box>
        </Box>

        <Divider sx={{ mb: 3, borderColor: 'rgba(255,255,255,0.1)' }} />

        {/* Content Sections */}
        <Box sx={{ mt: 2 }}>
          {sections.map((section, idx) => {
            // Extract title and content
            const titleMatch = section.match(/##\s+(.+)/);
            const title = titleMatch ? titleMatch[1].trim() : '';
            const content = section.replace(/##\s+.+/, '').trim();
            
            // Skip empty sections or sections without title
            if (!content || !title) return null;

            // Parse bullet points and paragraphs
            const lines = content.split('\n').filter(l => l.trim());
            const bullets: string[] = [];
            const paragraphs: string[] = [];
            
            lines.forEach(line => {
              if (line.trim().startsWith('-')) {
                bullets.push(line.replace(/^-\s*/, '').trim());
              } else if (line.trim()) {
                paragraphs.push(line.trim());
              }
            });

            const emoji = getSectionEmoji(title);

            return (
              <Box key={idx} sx={{ mb: 3 }}>
                {/* Section Title */}
                <Typography 
                  variant="h5" 
                  fontWeight={600} 
                  sx={{ 
                    mb: 2,
                    color: '#BBD977',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5
                  }}
                >
                  <span style={{ fontSize: '1.5rem' }}>{emoji}</span>
                  {title.toUpperCase()}
                </Typography>

                {/* Paragraphs */}
                {paragraphs.map((para, pIdx) => (
                  <Typography 
                    key={`p-${pIdx}`}
                    variant="body1" 
                    sx={{ 
                      mb: 1.5, 
                      lineHeight: 1.8,
                      color: 'rgba(255,255,255,0.9)',
                      fontSize: '1rem',
                      pl: 1
                    }}
                    dangerouslySetInnerHTML={{
                      __html: para
                        .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#BBD977;font-weight:700">$1</strong>')
                        .replace(/\*(.*?)\*/g, '<em style="color:#2196f3">$1</em>')
                    }}
                  />
                ))}

                {/* Bullet Points */}
                {bullets.length > 0 && (
                  <Box sx={{ mt: 1.5, mb: 2, pl: 1 }}>
                    {bullets.map((bullet, bIdx) => (
                      <Box 
                        key={`b-${bIdx}`}
                        sx={{ 
                          display: 'flex', 
                          alignItems: 'flex-start', 
                          gap: 1.5, 
                          mb: 1,
                          pl: 1
                        }}
                      >
                        <Typography 
                          sx={{ 
                            color: '#BBD977',
                            fontSize: '1rem',
                            lineHeight: 1.5,
                            flexShrink: 0
                          }}
                        >
                          •
                        </Typography>
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            flex: 1, 
                            lineHeight: 1.7,
                            color: 'rgba(255,255,255,0.85)',
                            fontSize: '0.95rem'
                          }}
                          dangerouslySetInnerHTML={{
                            __html: bullet
                              .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#BBD977;font-weight:700">$1</strong>')
                              .replace(/\*(.*?)\*/g, '<em style="color:#2196f3">$1</em>')
                          }}
                        />
                      </Box>
                    ))}
                  </Box>
                )}

                {/* Divider between sections (except last) */}
                {idx < sections.length - 1 && (
                  <Divider sx={{ mt: 2.5, mb: 2.5, borderColor: 'rgba(255,255,255,0.08)' }} />
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  };

  // ============ RESULTS SECTION ============
  const renderResults = () => {
    if (!currentRun?.output_json && !currentRun?.ai_summary) {
      return <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No results yet</Typography>;
    }

    // If agent definition is available, use enhanced OutputTabs + ChartLibrary
    if (agentDefinition?.charts) {
      return renderEnhancedResults();
    }

    // Fallback to legacy rendering for agents without definitions
    return renderLegacyResults();
  };

  // ============ ENHANCED RESULTS (with agent definition) ============
  const renderEnhancedResults = () => {
    if (!agentDefinition || !currentRun?.output_json) return null;

    const availableTabs: string[] = [];
    
    // Determine which tabs to show
    if (currentRun?.ai_summary) availableTabs.push('summary');
    if (agentDefinition.charts.length > 0) {
      availableTabs.push('dashboard');
      availableTabs.push('charts');
    }
    availableTabs.push('intelligence');
    availableTabs.push('forecast');

    return (
      <OutputTabs
        mode={'advanced'}
        availableTabs={availableTabs}
        onExportJson={handleDownloadJson}
        onViewSources={() => {
          // TODO: implement sources modal
          console.log('View sources');
        }}
      >
        {/* Summary Tab */}
        {availableTabs.includes('summary') && (
          <Box>{renderSummaryCards()}</Box>
        )}

        {/* Dashboard Tab */}
        {availableTabs.includes('dashboard') && (
          <Box>{renderDashboard()}</Box>
        )}

        {/* Charts Tab - Using ChartLibrary */}
        {availableTabs.includes('charts') && (
          <ChartLibrary
            charts={agentDefinition.charts}
            data={currentRun.output_json}
            mode={'advanced'}
          />
        )}

        {/* Intelligence Tab */}
        {availableTabs.includes('intelligence') && (
          <Box>{renderIntelligence()}</Box>
        )}

        {/* Forecast Tab */}
        {availableTabs.includes('forecast') && (
          <Box>{renderForecast()}</Box>
        )}
      </OutputTabs>
    );
  };

  // ============ NEW AGENT RESULTS (whale movement, liquidity radar, etc with charts/tables) ============
  const renderNewAgentResults = () => {
    const output = currentRun?.output_json || {};
    const { charts = {}, tables = {}, insights = [], summary = {}, netflows = {} } = output;

    return (
      <Box>
        <Tabs value={tabValue} onChange={handleTabChange} variant="scrollable" scrollButtons="auto" sx={{ borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { textTransform: 'none', fontWeight: 500, minWidth: 'auto', px: 2 } }}>
          <Tab icon={<DescriptionIcon />} label="Summary" iconPosition="start" />
          {Object.keys(charts).length > 0 && <Tab icon={<ChartIcon />} label="Charts" iconPosition="start" />}
          {Object.keys(tables).length > 0 && <Tab icon={<PieChartIcon />} label="Tables" iconPosition="start" />}
          <Tab icon={<TimelineIcon />} label="Raw Data" iconPosition="start" />
        </Tabs>

        {/* Summary Tab */}
        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            {/* AI Summary */}
            {currentRun?.ai_summary && (
              <Grid item xs={12}>
                <Card sx={{ backgroundColor: 'rgba(187, 217, 119, 0.1)', borderLeft: '4px solid #BBD977' }}>
                  <CardContent>
                    <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      🤖 AI Analysis
                    </Typography>
                    <Typography sx={{ whiteSpace: 'pre-wrap' }}>{currentRun.ai_summary}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* Key Insights */}
            {insights.length > 0 && (
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" fontWeight={600} gutterBottom>💡 Key Insights</Typography>
                    <Box component="ul" sx={{ pl: 2, m: 0 }}>
                      {insights.map((insight: string, i: number) => (
                        <Typography component="li" key={i} sx={{ mb: 1 }}>{insight}</Typography>
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* Summary Metrics */}
            {Object.keys(summary).length > 0 && (
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" fontWeight={600} gutterBottom>📊 Summary Metrics</Typography>
                    <Grid container spacing={2}>
                      {Object.entries(summary).filter(([key]) => !key.startsWith('_')).map(([key, value]) => (
                        <Grid item xs={6} key={key}>
                          <Typography variant="caption" color="text.secondary">{key.replace(/_/g, ' ').toUpperCase()}</Typography>
                          <Typography variant="h6" fontWeight={600}>
                            {typeof value === 'number' ? (key.includes('usd') || key.includes('value') ? `$${value.toLocaleString()}` : value.toLocaleString()) : String(value)}
                          </Typography>
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* Netflows (if available) */}
            {Object.keys(netflows).length > 0 && (
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" fontWeight={600} gutterBottom>💱 Net Flows Analysis</Typography>
                    <Grid container spacing={2}>
                      {Object.entries(netflows).filter(([key]) => !key.startsWith('_')).map(([key, value]) => (
                        <Grid item xs={6} md={3} key={key}>
                          <Typography variant="caption" color="text.secondary">{key.replace(/_/g, ' ').toUpperCase()}</Typography>
                          <Typography variant="body1" fontWeight={600}>
                            {typeof value === 'number' ? `$${value.toLocaleString()}` : String(value)}
                          </Typography>
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>
        </TabPanel>

        {/* Charts Tab */}
        {Object.keys(charts).length > 0 && (
          <TabPanel value={tabValue} index={1}>
            <Grid container spacing={3}>
              {/* Volume Trend Chart */}
              {charts.volume_trend && Array.isArray(charts.volume_trend) && charts.volume_trend.length > 0 && (
                <Grid item xs={12}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" fontWeight={600} gutterBottom>📈 Volume Trend Over Time</Typography>
                      <Box sx={{ height: 300 }}>
                        <ResponsiveContainer>
                          <LineChart data={charts.volume_trend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="time" stroke="#fff" />
                            <YAxis stroke="#fff" />
                            <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: 'none' }} />
                            <Legend />
                            <Line type="monotone" dataKey="volume_usd" stroke="#BBD977" strokeWidth={2} name="Volume (USD)" />
                          </LineChart>
                        </ResponsiveContainer>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* Flow Distribution Pie Chart */}
              {charts.flow_distribution && Array.isArray(charts.flow_distribution) && charts.flow_distribution.length > 0 && (
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" fontWeight={600} gutterBottom>🔄 Flow Distribution</Typography>
                      <Box sx={{ height: 300 }}>
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie data={charts.flow_distribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} fill="#BBD977" label>
                              {charts.flow_distribution.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={['#BBD977', '#4FC3F7', '#FF7043', '#9C27B0', '#FF9800'][index % 5]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: 'none' }} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* CEX Flows Bar Chart */}
              {charts.cex_flows && Array.isArray(charts.cex_flows) && charts.cex_flows.length > 0 && (
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" fontWeight={600} gutterBottom>🏦 CEX Flow Analysis</Typography>
                      <Box sx={{ height: 300 }}>
                        <ResponsiveContainer>
                          <BarChart data={charts.cex_flows}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="name" stroke="#fff" />
                            <YAxis stroke="#fff" />
                            <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: 'none' }} />
                            <Bar dataKey="value" fill="#BBD977">
                              {charts.cex_flows.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={entry.color || '#BBD977'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* Whale Behavior Donut Chart */}
              {charts.whale_behavior && Array.isArray(charts.whale_behavior) && charts.whale_behavior.length > 0 && (
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" fontWeight={600} gutterBottom>🐋 Whale Behavior</Typography>
                      <Box sx={{ height: 300 }}>
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie data={charts.whale_behavior} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} fill="#4FC3F7" label>
                              {charts.whale_behavior.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={entry.color || ['#2196F3', '#FF9800'][index % 2]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: 'none' }} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* Transfer Size Histogram */}
              {charts.transfer_sizes && Array.isArray(charts.transfer_sizes) && charts.transfer_sizes.length > 0 && (
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" fontWeight={600} gutterBottom>📊 Transfer Size Distribution</Typography>
                      <Box sx={{ height: 300 }}>
                        <ResponsiveContainer>
                          <BarChart data={charts.transfer_sizes}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="bucket" stroke="#fff" />
                            <YAxis stroke="#fff" />
                            <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: 'none' }} />
                            <Bar dataKey="count" fill="#FF7043" />
                          </BarChart>
                        </ResponsiveContainer>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              )}
            </Grid>
          </TabPanel>
        )}

        {/* Tables Tab */}
        {Object.keys(tables).length > 0 && (
          <TabPanel value={tabValue} index={Object.keys(charts).length > 0 ? 2 : 1}>
            <Grid container spacing={3}>
              {/* Top Transfers Table */}
              {tables.top_transfers && Array.isArray(tables.top_transfers) && tables.top_transfers.length > 0 && (
                <Grid item xs={12}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" fontWeight={600} gutterBottom>🔝 Top Transfers</Typography>
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>From</TableCell>
                              <TableCell>To</TableCell>
                              <TableCell align="right">Amount (USD)</TableCell>
                              <TableCell>Type</TableCell>
                              <TableCell>Time</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {tables.top_transfers.slice(0, 10).map((transfer: any, i: number) => (
                              <TableRow key={i}>
                                <TableCell>{transfer.from_address?.substring(0, 10)}...</TableCell>
                                <TableCell>{transfer.to_address?.substring(0, 10)}...</TableCell>
                                <TableCell align="right">${transfer.amount_usd?.toLocaleString()}</TableCell>
                                <TableCell>{transfer.flow_type}</TableCell>
                                <TableCell>{new Date(transfer.timestamp).toLocaleString()}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* Top Whales Table */}
              {tables.top_whales_table && Array.isArray(tables.top_whales_table) && tables.top_whales_table.length > 0 && (
                <Grid item xs={12}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" fontWeight={600} gutterBottom>🐋 Top Whales</Typography>
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Address</TableCell>
                              <TableCell align="right">Total Volume</TableCell>
                              <TableCell align="right">Sent</TableCell>
                              <TableCell align="right">Received</TableCell>
                              <TableCell>Behavior</TableCell>
                              <TableCell align="right">Transfers</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {tables.top_whales_table.map((whale: any, i: number) => (
                              <TableRow key={i}>
                                <TableCell>{whale.address?.substring(0, 10)}... {whale.label && `(${whale.label})`}</TableCell>
                                <TableCell align="right">${whale.total_volume_usd?.toLocaleString()}</TableCell>
                                <TableCell align="right">${whale.total_sent_usd?.toLocaleString()}</TableCell>
                                <TableCell align="right">${whale.total_received_usd?.toLocaleString()}</TableCell>
                                <TableCell>{whale.behavior}</TableCell>
                                <TableCell align="right">{whale.transfer_count}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* CEX Summary Table */}
              {tables.cex_summary && Array.isArray(tables.cex_summary) && tables.cex_summary.length > 0 && (
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" fontWeight={600} gutterBottom>🏦 CEX Summary</Typography>
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Metric</TableCell>
                              <TableCell align="right">Value</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {tables.cex_summary.map((row: any, i: number) => (
                              <TableRow key={i}>
                                <TableCell>{row.metric}</TableCell>
                                <TableCell align="right">{row.value}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </CardContent>
                  </Card>
                </Grid>
              )}
            </Grid>
          </TabPanel>
        )}

        {/* Raw Data Tab */}
        <TabPanel value={tabValue} index={[0, Object.keys(charts).length > 0 ? 1 : null, Object.keys(tables).length > 0 ? 1 : null].filter(v => v !== null).length}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>Raw JSON Output</Typography>
              <Box component="pre" sx={{ backgroundColor: '#0a0a0a', p: 2, borderRadius: 1, overflow: 'auto', maxHeight: 600, fontSize: '0.85rem' }}>
                {JSON.stringify(output, null, 2)}
              </Box>
            </CardContent>
          </Card>
        </TabPanel>
      </Box>
    );
  };

  // ============ LEGACY RESULTS (without agent definition) ============
  const renderLegacyResults = () => {
    // Check if this is whale movement, liquidity radar, or other new agents with charts/tables structure
    const output = currentRun?.output_json || {};
    if (output.charts || output.tables || (output.insights && Array.isArray(output.insights))) {
      return renderNewAgentResults();
    }
    
    const hasTokenData = currentRun?.output_json?.chart_data;
    const derivativesData = currentRun?.output_json?.derivatives || [];
    const institutionalData = currentRun?.output_json?.institutional_holdings || [];
    const hasDerivatives = derivativesData.length > 0;
    const hasInstitutional = institutionalData.length > 0;
    
    // New feature flags
    const hasTechnicalData = !!currentRun?.output_json?.technical_indicators?.rsi || !!currentRun?.output_json?.multi_timeframe;
    const hasRiskData = !!currentRun?.output_json?.risk_metrics?.risk_score;
    const hasHealthData = !!currentRun?.output_json?.health_scores?.overall_score;
    const hasComparisonData = !!currentRun?.output_json?.category_comparison?.category_name || 
                               currentRun?.output_json?.is_market_mover || 
                               (currentRun?.output_json?.arbitrage_opportunities?.length > 0);
    
    // Debug logging
    console.log('🔍 Token Deep-Dive Results:', {
      hasTokenData: !!hasTokenData,
      derivativesCount: derivativesData.length,
      institutionalCount: institutionalData.length,
      hasDerivatives,
      hasInstitutional,
      hasTechnicalData,
      hasRiskData,
      hasHealthData,
      hasComparisonData,
      outputKeys: Object.keys(currentRun?.output_json || {})
    });

    return (
      <Box>
        <Tabs value={tabValue} onChange={handleTabChange} variant="scrollable" scrollButtons="auto" sx={{ borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { textTransform: 'none', fontWeight: 500, minWidth: 'auto', px: 2 } }}>
          <Tab icon={<DescriptionIcon />} label="Summary" iconPosition="start" />
          {hasTokenData && <Tab icon={<ChartIcon />} label="Analytics" iconPosition="start" />}
          {hasTokenData && <Tab icon={<TrendingUpIcon />} label="Market Intelligence" iconPosition="start" />}
          {(hasTokenData || hasDerivatives || hasInstitutional) && <Tab icon={<PieChartIcon />} label="Trading Data" iconPosition="start" />}
          <Tab icon={<TimelineIcon />} label="Raw Data" iconPosition="start" />
        </Tabs>

        {/* Summary Tab */}
        <TabPanel value={tabValue} index={0}>
          {renderSummaryCards()}
        </TabPanel>

        {/* Analytics Tab: Dashboard + Technical + Risk */}
        {hasTokenData && (
          <TabPanel value={tabValue} index={1}>
            <Box>
              {/* Price Dashboard */}
              <Box sx={{ mb: 4 }}>
                <Typography 
                  variant="h5" 
                  fontWeight={600} 
                  sx={{ 
                    mb: 3,
                    color: '#BBD977',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5
                  }}
                >
                  <span style={{ fontSize: '1.5rem' }}>💰</span>
                  PRICE OVERVIEW
                </Typography>
                {renderDashboard()}
              </Box>
              
              {/* Technical Analysis Section */}
              {hasTechnicalData && (
                <Box sx={{ mt: 5 }}>
                  <Divider sx={{ mb: 4, borderColor: 'rgba(255,255,255,0.08)' }} />
                  {renderTechnical()}
                </Box>
              )}
              
              {/* Risk Analysis Section */}
              {hasRiskData && (
                <Box sx={{ mt: 5 }}>
                  <Divider sx={{ mb: 4, borderColor: 'rgba(255,255,255,0.08)' }} />
                  {renderRiskMetrics()}
                </Box>
              )}
            </Box>
          </TabPanel>
        )}

        {/* Market Intelligence Tab: Health + Comparison + Market Movers */}
        {hasTokenData && (
          <TabPanel value={tabValue} index={2}>
            <Box>
              {/* Token Health Score */}
              {hasHealthData && (
                <Box sx={{ mb: 4 }}>
                  {renderHealthScore()}
                </Box>
              )}
              
              {/* Category Comparison & Market Movers */}
              {hasComparisonData && (
                <Box sx={{ mt: 5 }}>
                  <Divider sx={{ mb: 4, borderColor: 'rgba(255,255,255,0.08)' }} />
                  {renderComparison()}
                </Box>
              )}
            </Box>
          </TabPanel>
        )}

        {/* Trading Data Tab: Markets + Derivatives + Institutional */}
        {(hasTokenData || hasDerivatives || hasInstitutional) && (
          <TabPanel value={tabValue} index={3}>
            <Box>
              {/* Exchange Markets */}
              {hasTokenData && (
                <Box sx={{ mb: 4 }}>
                  <Typography 
                    variant="h5" 
                    fontWeight={600} 
                    sx={{ 
                      mb: 3,
                      color: '#BBD977',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5
                    }}
                  >
                    <span style={{ fontSize: '1.5rem' }}>🏛️</span>
                    EXCHANGE MARKETS
                  </Typography>
                  {renderTrading()}
                </Box>
              )}
              
              {/* Derivatives */}
              {hasDerivatives && (
                <Box sx={{ mt: 5 }}>
                  <Divider sx={{ mb: 4, borderColor: 'rgba(255,255,255,0.08)' }} />
                  {renderDerivatives()}
                </Box>
              )}
              
              {/* Institutional Holdings */}
              {hasInstitutional && (
                <Box sx={{ mt: 5 }}>
                  <Divider sx={{ mb: 4, borderColor: 'rgba(255,255,255,0.08)' }} />
                  {renderInstitutional()}
                </Box>
              )}
            </Box>
          </TabPanel>
        )}

        {/* Raw Data Tab */}
        <TabPanel value={tabValue} index={(hasTokenData ? 4 : 1)}>
          {renderRawData()}
        </TabPanel>
      </Box>
    );
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}><CircularProgress /></Box>;
  }

  if (!agent) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">Agent not found</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/agent-workflows')} sx={{ mt: 2 }}>Back to Agents</Button>
      </Box>
    );
  }

  const runSteps = currentRun?.steps_json?.map(s => s.name) || ['Validate Input', 'Resolve Token', 'Fetch Token Metadata', 'Fetch Current Price', 'Fetch Historical Data', 'Fetch OHLC Data', 'Fetch Exchange Tickers', 'Fetch Global Market', 'Check Trending', 'Fetch Derivatives', 'Fetch Corporate Holdings', 'Fetch Categories', 'Compute Metrics', 'Generate AI Analysis'];

  return (
    <Box sx={{ p: 3, maxWidth: '1400px', mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <IconButton onClick={() => navigate('/agent-workflows')}><ArrowBackIcon /></IconButton>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
            <Typography variant="h4" fontWeight={700}>{agent.name}</Typography>
            <Chip label={agent.category} size="small" color="primary" />
          </Box>
          <Typography color="text.secondary">{agent.description}</Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Configure & Run + Progress */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, mb: 4 }}>
        <Card sx={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600} mb={3}>Configure & Run</Typography>
            {renderInputForm()}
            
            {/* Payment Method Selection */}
            <Box sx={{ mt: 3, mb: 2 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: 'rgba(255,255,255,0.8)' }}>
                Choose Payment Method:
              </Typography>
              
              {/* Wallet connection warning - show first if not connected */}
              {!isConnected && (
                <Alert severity="warning" icon={<WalletIcon />} sx={{ mb: 2, borderRadius: '12px' }}>
                  <AlertTitle sx={{ fontWeight: 600 }}>Connect Wallet Required</AlertTitle>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    Agent workflows require a connected wallet to run.
                  </Typography>
                  <Button 
                    variant="contained" 
                    size="small"
                    sx={{ 
                      backgroundColor: '#BBD977',
                      color: '#000',
                      fontWeight: 600,
                      '&:hover': { backgroundColor: '#9BC45A' }
                    }}
                  >
                    Connect Wallet
                  </Button>
                </Alert>
              )}
              
              {/* Payment Method Buttons */}
              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                {/* Prepaid Credits Option */}
                <Box 
                  onClick={() => {
                    if (!isConnected) return;
                    if (userTier === 'anonymous' || userTier === 'free') {
                      setShowUpgradeModal(true);
                      return;
                    }
                    setPaymentMethod('credits');
                  }}
                  sx={{ 
                    flex: 1,
                    p: 2,
                    border: '2px solid',
                    borderColor: paymentMethod === 'credits' && isConnected && userTier !== 'free' && userTier !== 'anonymous' 
                      ? '#BBD977' 
                      : 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    cursor: !isConnected ? 'not-allowed' : 'pointer',
                    opacity: !isConnected ? 0.5 : 1,
                    backgroundColor: paymentMethod === 'credits' && isConnected && userTier !== 'free' && userTier !== 'anonymous'
                      ? 'rgba(187, 217, 119, 0.08)'
                      : 'rgba(255,255,255,0.02)',
                    transition: 'all 0.2s',
                    '&:hover': {
                      backgroundColor: !isConnected ? 'rgba(255,255,255,0.02)' : 'rgba(187, 217, 119, 0.05)',
                      borderColor: !isConnected ? 'rgba(255,255,255,0.1)' : '#BBD977'
                    }
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Box sx={{ fontSize: '1.5rem' }}>💰</Box>
                    <Typography variant="body1" fontWeight={600}>Prepaid Credits</Typography>
                    {(userTier === 'anonymous' || userTier === 'free') && isConnected && (
                      <Chip label="Upgrade" size="small" color="warning" sx={{ ml: 'auto', height: 20, fontSize: '0.7rem' }} />
                    )}
                  </Box>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mb: 0.5 }}>
                    Buy credits in bulk with discounts
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip label="✓ Instant" size="small" sx={{ height: 18, fontSize: '0.65rem', backgroundColor: 'rgba(76,175,80,0.2)' }} />
                    <Chip label="✓ No expiry" size="small" sx={{ height: 18, fontSize: '0.65rem', backgroundColor: 'rgba(76,175,80,0.2)' }} />
                    <Chip label="✓ Bulk savings" size="small" sx={{ height: 18, fontSize: '0.65rem', backgroundColor: 'rgba(76,175,80,0.2)' }} />
                  </Box>
                </Box>
                
                {/* X402 Pay-per-use Option */}
                <Box 
                  onClick={() => {
                    if (!isConnected) return;
                    setPaymentMethod('x402');
                  }}
                  sx={{ 
                    flex: 1,
                    p: 2,
                    border: '2px solid',
                    borderColor: paymentMethod === 'x402' && isConnected ? '#ffc107' : 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    cursor: !isConnected ? 'not-allowed' : 'pointer',
                    opacity: !isConnected ? 0.5 : 1,
                    backgroundColor: paymentMethod === 'x402' && isConnected
                      ? 'rgba(255, 193, 7, 0.08)'
                      : 'rgba(255,255,255,0.02)',
                    transition: 'all 0.2s',
                    '&:hover': {
                      backgroundColor: !isConnected ? 'rgba(255,255,255,0.02)' : 'rgba(255, 193, 7, 0.05)',
                      borderColor: !isConnected ? 'rgba(255,255,255,0.1)' : '#ffc107'
                    }
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Box sx={{ fontSize: '1.5rem' }}>⚡</Box>
                    <Typography variant="body1" fontWeight={600}>X402 Pay-Per-Use</Typography>
                    <Chip label="NEW" size="small" color="success" sx={{ ml: 'auto', height: 20, fontSize: '0.7rem' }} />
                  </Box>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mb: 0.5 }}>
                    Pay exactly $0.20 per run (USDC on Base)
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip label="✓ No upfront" size="small" sx={{ height: 18, fontSize: '0.65rem', backgroundColor: 'rgba(76,175,80,0.2)' }} />
                    <Chip label="✓ One click" size="small" sx={{ height: 18, fontSize: '0.65rem', backgroundColor: 'rgba(76,175,80,0.2)' }} />
                    <Chip label="ℹ USDC needed" size="small" sx={{ height: 18, fontSize: '0.65rem', backgroundColor: 'rgba(33,150,243,0.2)' }} />
                  </Box>
                </Box>
              </Box>
              
              {/* Free tier notice - only show if connected and free tier */}
              {isConnected && (userTier === 'anonymous' || userTier === 'free') && (
                <Alert 
                  severity="info" 
                  icon={<InfoIcon />}
                  sx={{ borderRadius: '12px', backgroundColor: 'rgba(33, 150, 243, 0.08)' }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                    <strong>Free Tier:</strong> X402 pay-per-use only ($0.20/run)
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 1.5 }}>
                    Want prepaid credits with bulk discounts? Upgrade to unlock more value.
                  </Typography>
                  <Button 
                    variant="contained" 
                    size="small" 
                    sx={{ 
                      backgroundColor: '#BBD977',
                      color: '#000',
                      fontWeight: 600,
                      textTransform: 'none',
                      '&:hover': { backgroundColor: '#9BC45A' }
                    }}
                    onClick={() => setShowUpgradeModal(true)}
                  >
                    View Plans: Basic $9 • Plus $29 • Premium $99
                  </Button>
                </Alert>
              )}
            </Box>

            {/* Run Button */}
            {!isAgentActive ? (
              <Button 
                variant="contained" 
                fullWidth 
                size="large" 
                startIcon={<ConstructionIcon />}
                onClick={() => setShowComingSoonDialog(true)}
                sx={{ 
                  mt: 2, 
                  py: 1.5, 
                  borderRadius: '12px', 
                  textTransform: 'none', 
                  fontWeight: 600,
                  backgroundColor: 'rgba(187, 217, 119, 0.15)',
                  color: 'rgba(187, 217, 119, 0.9)',
                  border: '1px solid rgba(187, 217, 119, 0.4)',
                  '&:hover': {
                    backgroundColor: 'rgba(187, 217, 119, 0.25)',
                  }
                }}
              >
                🚧 Coming Soon
              </Button>
            ) : paymentMethod === 'credits' ? (
              <Button 
                variant="contained" 
                fullWidth 
                size="large" 
                startIcon={isRunning ? <CircularProgress size={20} color="inherit" /> : <PlayIcon />} 
                onClick={handleRunAgent} 
                disabled={isRunning || !isConnected} 
                sx={{ mt: 2, py: 1.5, borderRadius: '12px', textTransform: 'none', fontWeight: 600 }}
              >
                {isRunning ? 'Running...' : !isConnected ? 'Connect Wallet' : 'Run with Credits'}
              </Button>
            ) : (
              <Button 
                variant="contained" 
                fullWidth 
                size="large" 
                color="secondary"
                startIcon={isX402Running ? <CircularProgress size={20} color="inherit" /> : <BoltIcon />} 
                onClick={handleRunAgentWithX402} 
                disabled={isX402Running || !isConnected} 
                sx={{ mt: 2, py: 1.5, borderRadius: '12px', textTransform: 'none', fontWeight: 600 }}
              >
                {isX402Running ? 'Processing X402...' : !isConnected ? 'Connect Wallet' : 'Run with X402 ($0.20)'}
              </Button>
            )}
            
            {x402Error && paymentMethod === 'x402' && (
              <Alert severity="error" sx={{ mt: 2 }} onClose={() => setX402Error(null)}>
                {x402Error}
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Progress Panel */}
        {/* Progress Panel - Shows either payment UI or execution progress */}
        <Card sx={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <CardContent sx={{ p: 3 }}>
            {/* Show Payment UI when credits needed */}
            {showCreditPaymentModal && creditWalletInfo ? (
              <>
                <Typography variant="h6" fontWeight={600} mb={3}>💳 Add Credits to Run</Typography>
                
                {/* Balance Info */}
                <Box sx={{ 
                  backgroundColor: 'rgba(255,100,100,0.1)', 
                  border: '1px solid rgba(255,100,100,0.3)',
                  borderRadius: '12px', 
                  p: 2, 
                  mb: 3 
                }}>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                    Current Balance: <strong style={{ color: '#ff6b6b' }}>${creditWalletInfo.balance?.toFixed(2) || '0.00'}</strong>
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
                    Required: <strong style={{ color: '#BBD977' }}>${creditWalletInfo.required?.toFixed(2) || '0.25'}</strong>
                  </Typography>
                </Box>

                {/* Package Selection */}
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2, color: 'rgba(255,255,255,0.8)' }}>
                  Choose a Credit Package:
                </Typography>
                
                <Button
                  variant="contained"
                  fullWidth
                  onClick={() => {
                    setShowCreditPaymentModal(false);
                    setShowTopUpModal(true);
                  }}
                  sx={{
                    backgroundColor: '#BBD977',
                    color: '#000',
                    fontWeight: 600,
                    py: 1.5,
                    mb: 2,
                    '&:hover': {
                      backgroundColor: '#9BC45A',
                    }
                  }}
                >
                  💳 Top Up Credits
                </Button>
                
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {creditPackages.map((pkg) => (
                    <Box
                      key={pkg.id}
                      sx={{
                        p: 1.5,
                        borderRadius: '10px',
                        border: pkg.popular ? '2px solid #BBD977' : '1px solid rgba(255,255,255,0.2)',
                        backgroundColor: pkg.popular ? 'rgba(187, 217, 119, 0.1)' : 'rgba(255,255,255,0.03)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        position: 'relative',
                        '&:hover': {
                          backgroundColor: pkg.popular ? 'rgba(187, 217, 119, 0.15)' : 'rgba(255,255,255,0.08)',
                          transform: 'translateY(-1px)',
                        },
                      }}
                      onClick={() => handleCreditPackagePurchase(pkg)}
                    >
                      {pkg.popular && (
                        <Chip 
                          label="BEST VALUE" 
                          size="small" 
                          sx={{ 
                            position: 'absolute', 
                            top: -8, 
                            right: 8, 
                            backgroundColor: '#BBD977', 
                            color: '#000',
                            fontWeight: 700,
                            fontSize: '0.6rem',
                            height: 18,
                          }} 
                        />
                      )}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                          <Typography variant="body2" fontWeight={600} sx={{ color: '#fff' }}>
                            {pkg.name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                            ${pkg.credits_amount.toFixed(2)} credits • ~{Math.floor(pkg.credits_amount / 0.25)} runs
                            {pkg.bonus_percentage > 0 && (
                              <span style={{ color: '#BBD977', marginLeft: 4 }}>+{pkg.bonus_percentage}%</span>
                            )}
                          </Typography>
                        </Box>
                        <Button
                          variant="contained"
                          size="small"
                          sx={{
                            minWidth: 50,
                            backgroundColor: pkg.popular ? '#BBD977' : 'rgba(255,255,255,0.2)',
                            color: pkg.popular ? '#000' : '#fff',
                            fontWeight: 600,
                            borderRadius: '8px',
                            textTransform: 'none',
                            fontSize: '0.8rem',
                            py: 0.5,
                            '&:hover': {
                              backgroundColor: pkg.popular ? '#9fc55f' : 'rgba(255,255,255,0.3)',
                            },
                          }}
                        >
                          ${pkg.price}
                        </Button>
                      </Box>
                    </Box>
                  ))}
                </Box>

                <Button 
                  variant="text" 
                  size="small" 
                  onClick={() => setShowCreditPaymentModal(false)}
                  sx={{ mt: 2, color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}
                >
                  Cancel
                </Button>
              </>
            ) : agentDefinition?.workflowSteps ? (
              <ProgressPanel
                steps={agentDefinition.workflowSteps}
                currentStepIndex={activeStep}
                isRunning={isRunning}
                status={currentRun?.status as any}
                errorMessage={currentRun?.error_message}
              />
            ) : isX402Running || (x402Step > 0 && x402Step < 6) ? (
              /* X402 Payment Progress */
              <>
                <Typography variant="h6" fontWeight={600} mb={1}>⚡ X402 Payment Progress</Typography>
                <Typography variant="caption" color="text.secondary" display="block" mb={3}>
                  Pay-per-use • $0.20 USDC on Base network
                </Typography>
                <Stepper activeStep={x402Step} orientation="vertical" sx={{ '& .MuiStepConnector-line': { minHeight: 16 } }}>
                  {X402_STEPS.map((label, index) => (
                    <Step key={label}>
                      <StepLabel 
                        StepIconComponent={() => {
                          if (index < x402Step) return <CheckCircleIcon sx={{ color: '#00D4FF' }} />;
                          if (index === x402Step && isX402Running) return <CircularProgress size={24} sx={{ color: '#00D4FF' }} />;
                          return <Box sx={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid', borderColor: index === x402Step ? '#00D4FF' : 'rgba(255,255,255,0.3)' }} />;
                        }}
                      >
                        <Typography variant="caption" sx={{ color: index <= x402Step ? '#00D4FF' : 'text.secondary' }}>{label}</Typography>
                      </StepLabel>
                    </Step>
                  ))}
                </Stepper>
                {x402Status && (
                  <Box sx={{ mt: 2, p: 2, backgroundColor: 'rgba(0, 212, 255, 0.1)', borderRadius: '8px', border: '1px solid rgba(0, 212, 255, 0.2)' }}>
                    <Typography variant="body2" color="#00D4FF">
                      {x402Status}
                    </Typography>
                  </Box>
                )}
                {isX402Running && <LinearProgress sx={{ mt: 3, borderRadius: '4px', '& .MuiLinearProgress-bar': { backgroundColor: '#00D4FF' } }} />}
                {x402Step === 6 && (
                  <Alert 
                    severity="success" 
                    icon={<CheckCircleIcon />} 
                    sx={{ mt: 3, borderRadius: '8px', backgroundColor: 'rgba(0, 212, 255, 0.1)', color: '#00D4FF', '& .MuiAlert-icon': { color: '#00D4FF' } }}
                  >
                    <Typography variant="body2" fontWeight={600}>Payment confirmed! Agent completed.</Typography>
                    {x402TxHash && (
                      <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                        {x402TxHash.startsWith('0x') ? (
                          <>
                            TX: <a 
                              href={`https://basescan.org/tx/${x402TxHash}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              style={{ color: '#00D4FF', textDecoration: 'underline' }}
                            >
                              {x402TxHash.slice(0, 10)}...{x402TxHash.slice(-8)}
                            </a>
                          </>
                        ) : (
                          <>Transaction ID: {x402TxHash.slice(0, 20)}...</>
                        )}
                      </Typography>
                    )}
                  </Alert>
                )}
              </>
            ) : (
              <>
                <Typography variant="h6" fontWeight={600} mb={3}>Execution Progress</Typography>
                {currentRun ? (
                  <>
                    <Stepper activeStep={activeStep} orientation="vertical" sx={{ '& .MuiStepConnector-line': { minHeight: 16 } }}>
                      {runSteps.slice(0, 8).map((label, index) => {
                        const step = currentRun.steps_json?.[index];
                        return (
                          <Step key={label}>
                            <StepLabel 
                              error={step?.status === 'failed'} 
                              StepIconComponent={() => {
                                if (step?.status === 'completed') return <CheckCircleIcon sx={{ color: '#BBD977' }} />;
                                if (step?.status === 'failed') return <ErrorIcon sx={{ color: 'error.main' }} />;
                                return <Box sx={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid', borderColor: activeStep === index ? '#BBD977' : 'rgba(255,255,255,0.3)' }} />;
                              }}
                            >
                              <Typography variant="caption">{label}</Typography>
                              {step?.message && <Typography variant="caption" color="text.secondary" display="block">{step.message}</Typography>}
                            </StepLabel>
                          </Step>
                        );
                      })}
                    </Stepper>
                    {runSteps.length > 8 && <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>+{runSteps.length - 8} more steps...</Typography>}
                    {isRunning && <LinearProgress sx={{ mt: 3, borderRadius: '4px' }} />}
                    {currentRun?.status === 'completed' && <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mt: 3, borderRadius: '8px' }}>Agent completed successfully!</Alert>}
                    {currentRun?.status === 'failed' && <Alert severity="error" icon={<ErrorIcon />} sx={{ mt: 3, borderRadius: '8px' }}>Agent failed: {currentRun.error_message}</Alert>}
                  </>
                ) : (
                  <Typography color="text.secondary" sx={{ textAlign: 'center', py: 8 }}>Click "Run Agent" to start</Typography>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Results */}
      {(currentRun?.output_json || currentRun?.ai_summary) && (
        <Card sx={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', mb: 4 }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" fontWeight={600}>Results</Typography>
              <Button variant="outlined" size="small" onClick={() => { setCurrentRun(null); setActiveStep(0); setTabValue(0); }}>Run Again</Button>
            </Box>
            {renderResults()}
          </CardContent>
        </Card>
      )}
      
      {/* Coming Soon Dialog */}
      <Dialog 
        open={showComingSoonDialog} 
        onClose={() => setShowComingSoonDialog(false)}
        PaperProps={{
          sx: {
            backgroundColor: 'rgba(30, 30, 40, 0.98)',
            borderRadius: '20px',
            border: '1px solid rgba(187, 217, 119, 0.3)',
            maxWidth: '450px',
          }
        }}
      >
        <DialogTitle sx={{ 
          textAlign: 'center', 
          pt: 4,
          pb: 2,
        }}>
          <Box sx={{ fontSize: '64px', mb: 2 }}>🚧</Box>
          <Typography variant="h5" fontWeight={700} sx={{ color: 'rgba(187, 217, 119, 1)' }}>
            Coming Soon!
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center', px: 4 }}>
          <Typography variant="h6" fontWeight={600} mb={2}>
            {agent?.name}
          </Typography>
          <Typography variant="body1" color="text.secondary" mb={2}>
            {agent?.description}
          </Typography>
          <Box sx={{ 
            backgroundColor: 'rgba(187, 217, 119, 0.1)', 
            borderRadius: '12px', 
            p: 2, 
            mt: 2,
            border: '1px solid rgba(187, 217, 119, 0.2)'
          }}>
            <Typography variant="body2" sx={{ color: 'rgba(187, 217, 119, 0.9)' }}>
              ⚡ This agent is currently under development. We're working hard to bring you powerful AI-driven insights!
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            Check back soon or explore our active agents: <strong>Token Deep-Dive</strong> and <strong>Whale Movement</strong>
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 4, px: 4 }}>
          <Button 
            variant="outlined" 
            onClick={() => setShowComingSoonDialog(false)}
            sx={{ 
              borderRadius: '12px', 
              px: 4,
              borderColor: 'rgba(255,255,255,0.3)',
              color: 'text.primary',
              mr: 1
            }}
          >
            Close
          </Button>
          <Button 
            variant="contained" 
            onClick={() => navigate('/agent-workflows/token-deep-dive')}
            sx={{ 
              borderRadius: '12px', 
              px: 4,
              backgroundColor: 'primary.main'
            }}
          >
            Try Token Deep-Dive
          </Button>
        </DialogActions>
      </Dialog>

      {/* Top-Up Credits Modal */}
      <Dialog 
        open={showTopUpModal} 
        onClose={() => setShowTopUpModal(false)}
        maxWidth="sm"
        fullWidth
        BackdropProps={{
          sx: {
            backdropFilter: 'blur(10px)',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
          }
        }}
        PaperProps={{
          sx: {
            background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
            borderRadius: '16px',
            border: '1px solid rgba(255,255,255,0.1)',
          }
        }}
      >
        <DialogTitle sx={{ background: 'transparent' }}>
          💳 Top Up Agent Credits
        </DialogTitle>
        <DialogContent sx={{ background: 'transparent', pt: 3 }}>
          <Alert severity="info" sx={{ mb: 3, backgroundColor: 'rgba(187, 217, 119, 0.1)', border: '1px solid rgba(187, 217, 119, 0.3)' }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>Payment Method:</strong> USDC on Base Network
            </Typography>
            <Typography variant="body2">
              • MetaMask will open for approval<br/>
              • You need USDC in your wallet on Base network<br/>
              • Transaction takes ~5 seconds to confirm<br/>
              • Credits added automatically after confirmation
            </Typography>
          </Alert>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              { name: 'Starter', price: 2, credits: 2, runs: 8, bonus: 0 },
              { name: 'Popular', price: 5, credits: 5.5, runs: 22, bonus: 10 },
              { name: 'Power', price: 10, credits: 11.5, runs: 46, bonus: 15 },
            ].map((pkg, index) => (
              <Card 
                key={pkg.name}
                sx={{ 
                  p: 2, 
                  cursor: processingPayment ? 'wait' : 'pointer',
                  border: index === 1 ? '2px solid #BBD977' : '1px solid rgba(255,255,255,0.1)',
                  background: index === 1 ? 'rgba(187, 217, 119, 0.1)' : 'rgba(255,255,255,0.03)',
                  opacity: processingPayment && processingPayment !== pkg.name ? 0.5 : 1,
                  '&:hover': {
                    background: processingPayment ? undefined : (index === 1 ? 'rgba(187, 217, 119, 0.15)' : 'rgba(255,255,255,0.06)'),
                  }
                }}
                onClick={() => !processingPayment && handleTopUpPayment(pkg)}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h6" fontWeight={600}>
                      {pkg.name}
                      {index === 1 && <Chip label="BEST VALUE" size="small" sx={{ ml: 1, backgroundColor: '#BBD977', color: '#000', height: 20, fontSize: '0.65rem' }} />}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      ${pkg.credits} credits • ~{pkg.runs} runs
                      {pkg.bonus > 0 && <span style={{ color: '#BBD977', marginLeft: 4 }}>+{pkg.bonus}%</span>}
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    disabled={!!processingPayment}
                    sx={{
                      backgroundColor: index === 1 ? '#BBD977' : 'rgba(255,255,255,0.2)',
                      color: index === 1 ? '#000' : '#fff',
                      '&:hover': {
                        backgroundColor: index === 1 ? '#9BC45A' : 'rgba(255,255,255,0.3)',
                      }
                    }}
                  >
                    {processingPayment === pkg.name ? <CircularProgress size={16} sx={{ color: index === 1 ? '#000' : '#fff' }} /> : `$${pkg.price}`}
                  </Button>
                </Box>
              </Card>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ background: 'transparent' }}>
          <Button onClick={() => setShowTopUpModal(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Error/Success Modal */}
      <Dialog
        open={errorModal.open}
        onClose={() => setErrorModal({ ...errorModal, open: false })}
        maxWidth="sm"
        fullWidth
        BackdropProps={{
          sx: {
            backdropFilter: 'blur(10px)',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
          }
        }}
        PaperProps={{
          sx: {
            background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
            borderRadius: '16px',
            border: '1px solid rgba(255,255,255,0.1)',
          }
        }}
      >
        <DialogTitle sx={{ background: 'transparent' }}>
          {errorModal.title}
        </DialogTitle>
        <DialogContent sx={{ background: 'transparent' }}>
          <Typography sx={{ whiteSpace: 'pre-line' }}>
            {errorModal.message}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ background: 'transparent' }}>
          <Button onClick={() => setErrorModal({ ...errorModal, open: false })}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
      
    </Box>
  );
};

export default AIAgentDetail;
