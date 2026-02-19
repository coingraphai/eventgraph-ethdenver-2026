/**
 * Execution & Vault Management Page
 * Smart contract execution for arbitrage opportunities and copy trading
 * Features: Vault deposits, auto-execution, execution history, wallet connection
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Grid,
  Card,
  CardContent,
  Switch,
  FormControlLabel,
  TextField,
  Chip,
  alpha,
  useTheme,
  Divider,
  Alert,
  AlertTitle,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Tab,
  Tabs,
} from '@mui/material';
import {
  AccountBalanceWallet,
  Settings,
  History,
  PlayArrow,
  Pause,
  TrendingUp,
  SwapHoriz,
  CheckCircle,
  Warning,
  Info,
  Refresh,
  OpenInNew,
  ContentCopy,
  Launch,
  Security,
  Speed,
  AutoAwesome,
} from '@mui/icons-material';
import { formatVolume } from '../services/unifiedMarketsApi';
import { TRADING_COLORS, PLATFORM_COLORS } from '../utils/colors';

interface VaultStats {
  totalDeposited: number;
  availableBalance: number;
  lockedInTrades: number;
  totalProfitLoss: number;
  executedTrades: number;
  successRate: number;
}

interface ExecutionHistory {
  id: string;
  timestamp: string;
  type: 'arbitrage' | 'copy_trade';
  status: 'success' | 'failed' | 'pending';
  buyPlatform: string;
  sellPlatform: string;
  market: string;
  amount: number;
  profitLoss: number;
  txHash?: string;
}

export function Execution() {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);
  
  // Wallet State
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  
  // Vault State
  const [vaultStats, setVaultStats] = useState<VaultStats>({
    totalDeposited: 0,
    availableBalance: 0,
    lockedInTrades: 0,
    totalProfitLoss: 0,
    executedTrades: 0,
    successRate: 0,
  });
  
  // Execution Settings
  const [autoExecutionEnabled, setAutoExecutionEnabled] = useState(false);
  const [minProfitPercent, setMinProfitPercent] = useState('5');
  const [maxTradeSize, setMaxTradeSize] = useState('1000');
  const [maxDailyTrades, setMaxDailyTrades] = useState('10');
  const [enabledPlatforms, setEnabledPlatforms] = useState({
    polymarket: true,
    kalshi: true,
    limitless: true,
    opiniontrade: false,
  });
  
  // Execution History
  const [executionHistory, setExecutionHistory] = useState<ExecutionHistory[]>([]);
  
  // Dummy Data for Demo
  useEffect(() => {
    // Simulate dummy data
    setVaultStats({
      totalDeposited: 10000,
      availableBalance: 8500,
      lockedInTrades: 1500,
      totalProfitLoss: 847.32,
      executedTrades: 23,
      successRate: 87.5,
    });
    
    setExecutionHistory([
      {
        id: '1',
        timestamp: new Date().toISOString(),
        type: 'arbitrage',
        status: 'success',
        buyPlatform: 'polymarket',
        sellPlatform: 'kalshi',
        market: 'Trump wins 2024',
        amount: 500,
        profitLoss: 42.50,
        txHash: '0x1234...5678',
      },
      {
        id: '2',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        type: 'arbitrage',
        status: 'success',
        buyPlatform: 'limitless',
        sellPlatform: 'polymarket',
        market: 'Bitcoin >$100k',
        amount: 750,
        profitLoss: 67.80,
        txHash: '0xabcd...efgh',
      },
      {
        id: '3',
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        type: 'copy_trade',
        status: 'pending',
        buyPlatform: 'polymarket',
        sellPlatform: 'kalshi',
        market: 'S&P 500 ATH',
        amount: 300,
        profitLoss: 0,
      },
    ]);
  }, []);
  
  const handleConnectWallet = async () => {
    // TODO: Implement Web3 wallet connection
    setWalletConnected(true);
    setWalletAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
  };
  
  const handleDisconnectWallet = () => {
    setWalletConnected(false);
    setWalletAddress('');
  };
  
  const handleDeposit = () => {
    // TODO: Implement deposit logic
    setDepositDialogOpen(false);
  };
  
  const handleWithdraw = () => {
    // TODO: Implement withdraw logic
    setWithdrawDialogOpen(false);
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return TRADING_COLORS.YES;
      case 'failed': return TRADING_COLORS.NO;
      case 'pending': return theme.palette.warning.main;
      default: return theme.palette.text.secondary;
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1600, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Stack direction="row" alignItems="center" spacing={2} mb={1}>
          <AccountBalanceWallet sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" fontWeight={700}>
            Execution Vault
          </Typography>
          <Chip 
            label="BETA" 
            size="small" 
            color="warning"
            sx={{ fontWeight: 600 }}
          />
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Automated execution for arbitrage opportunities and copy trading strategies
        </Typography>
      </Box>

      {/* Wallet Connection Banner */}
      {!walletConnected && (
        <Alert 
          severity="info" 
          sx={{ mb: 3 }}
          action={
            <Button 
              color="inherit" 
              size="small"
              startIcon={<AccountBalanceWallet />}
              onClick={handleConnectWallet}
            >
              Connect Wallet
            </Button>
          }
        >
          <AlertTitle>Wallet Not Connected</AlertTitle>
          Connect your wallet to deposit funds and enable auto-execution
        </Alert>
      )}

      {walletConnected && (
        <>
          {/* Wallet Info Bar */}
          <Paper sx={{ p: 2, mb: 3, background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.primary.main, 0.05)} 100%)` }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Stack direction="row" spacing={2} alignItems="center">
                <AccountBalanceWallet sx={{ color: 'primary.main' }} />
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Connected Wallet
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" fontFamily="monospace">
                      {walletAddress}
                    </Typography>
                    <IconButton size="small" onClick={() => navigator.clipboard.writeText(walletAddress)}>
                      <ContentCopy sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Stack>
                </Box>
              </Stack>
              <Button 
                variant="outlined" 
                size="small"
                onClick={handleDisconnectWallet}
              >
                Disconnect
              </Button>
            </Stack>
          </Paper>

          {/* Main Grid */}
          <Grid container spacing={3}>
            {/* Left Column - Stats & Controls */}
            <Grid item xs={12} md={4}>
              {/* Vault Balance Card */}
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h6" fontWeight={600}>
                      Vault Balance
                    </Typography>
                    <Security color="primary" />
                  </Stack>
                  
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="h3" fontWeight={700} color="primary.main">
                      ${formatVolume(vaultStats.availableBalance)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Available Balance
                    </Typography>
                  </Box>
                  
                  <Stack spacing={1.5} mb={3}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Total Deposited</Typography>
                      <Typography variant="body2" fontWeight={600}>${formatVolume(vaultStats.totalDeposited)}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Locked in Trades</Typography>
                      <Typography variant="body2" fontWeight={600}>${formatVolume(vaultStats.lockedInTrades)}</Typography>
                    </Stack>
                    <Divider />
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Total P&L</Typography>
                      <Typography 
                        variant="body2" 
                        fontWeight={700}
                        color={vaultStats.totalProfitLoss >= 0 ? TRADING_COLORS.YES : TRADING_COLORS.NO}
                      >
                        {vaultStats.totalProfitLoss >= 0 ? '+' : ''}${vaultStats.totalProfitLoss.toFixed(2)}
                      </Typography>
                    </Stack>
                  </Stack>
                  
                  <Stack spacing={1}>
                    <Button 
                      fullWidth 
                      variant="contained"
                      startIcon={<TrendingUp />}
                      onClick={() => setDepositDialogOpen(true)}
                    >
                      Deposit
                    </Button>
                    <Button 
                      fullWidth 
                      variant="outlined"
                      onClick={() => setWithdrawDialogOpen(true)}
                    >
                      Withdraw
                    </Button>
                  </Stack>
                </CardContent>
              </Card>

              {/* Performance Card */}
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="h6" fontWeight={600} mb={2}>
                    Performance
                  </Typography>
                  
                  <Stack spacing={2}>
                    <Box>
                      <Stack direction="row" justifyContent="space-between" mb={1}>
                        <Typography variant="body2" color="text.secondary">Executed Trades</Typography>
                        <Typography variant="h6" fontWeight={700}>{vaultStats.executedTrades}</Typography>
                      </Stack>
                    </Box>
                    
                    <Box>
                      <Stack direction="row" justifyContent="space-between" mb={1}>
                        <Typography variant="body2" color="text.secondary">Success Rate</Typography>
                        <Typography variant="h6" fontWeight={700} color={TRADING_COLORS.YES}>
                          {vaultStats.successRate}%
                        </Typography>
                      </Stack>
                      <LinearProgress 
                        variant="determinate" 
                        value={vaultStats.successRate}
                        sx={{ 
                          height: 8, 
                          borderRadius: 1,
                          backgroundColor: alpha(TRADING_COLORS.YES, 0.2),
                          '& .MuiLinearProgress-bar': {
                            backgroundColor: TRADING_COLORS.YES,
                          }
                        }}
                      />
                    </Box>
                  </Stack>
                </CardContent>
              </Card>

              {/* Auto-Execution Toggle */}
              <Card>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <AutoAwesome color="primary" />
                      <Typography variant="h6" fontWeight={600}>
                        Auto-Execution
                      </Typography>
                    </Stack>
                    <Switch 
                      checked={autoExecutionEnabled}
                      onChange={(e) => setAutoExecutionEnabled(e.target.checked)}
                      color="success"
                    />
                  </Stack>
                  
                  {autoExecutionEnabled ? (
                    <Alert severity="success" icon={<CheckCircle />}>
                      Auto-execution is active. The keeper bot will monitor and execute profitable opportunities.
                    </Alert>
                  ) : (
                    <Alert severity="warning" icon={<Pause />}>
                      Auto-execution is paused. Enable to start automated trading.
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Right Column - Tabs */}
            <Grid item xs={12} md={8}>
              <Paper sx={{ height: '100%' }}>
                <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
                  <Tab label="Execution Settings" icon={<Settings />} iconPosition="start" />
                  <Tab label="Execution History" icon={<History />} iconPosition="start" />
                  <Tab label="Smart Contracts" icon={<Security />} iconPosition="start" />
                </Tabs>

                <Box sx={{ p: 3 }}>
                  {/* Tab 0: Execution Settings */}
                  {activeTab === 0 && (
                    <Stack spacing={3}>
                      <Typography variant="h6" fontWeight={600}>
                        Execution Parameters
                      </Typography>

                      <TextField
                        label="Minimum Profit %"
                        type="number"
                        value={minProfitPercent}
                        onChange={(e) => setMinProfitPercent(e.target.value)}
                        fullWidth
                        helperText="Only execute trades with profit above this threshold"
                        InputProps={{
                          endAdornment: '%',
                        }}
                      />

                      <TextField
                        label="Maximum Trade Size"
                        type="number"
                        value={maxTradeSize}
                        onChange={(e) => setMaxTradeSize(e.target.value)}
                        fullWidth
                        helperText="Maximum amount per trade in USD"
                        InputProps={{
                          startAdornment: '$',
                        }}
                      />

                      <TextField
                        label="Maximum Daily Trades"
                        type="number"
                        value={maxDailyTrades}
                        onChange={(e) => setMaxDailyTrades(e.target.value)}
                        fullWidth
                        helperText="Limit number of executions per day"
                      />

                      <Divider />

                      <Typography variant="subtitle1" fontWeight={600}>
                        Enabled Platforms
                      </Typography>

                      <Stack spacing={1}>
                        {Object.entries(enabledPlatforms).map(([platform, enabled]) => (
                          <FormControlLabel
                            key={platform}
                            control={
                              <Switch
                                checked={enabled}
                                onChange={(e) => setEnabledPlatforms({ ...enabledPlatforms, [platform]: e.target.checked })}
                              />
                            }
                            label={
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Box 
                                  sx={{ 
                                    width: 12, 
                                    height: 12, 
                                    borderRadius: '50%', 
                                    backgroundColor: PLATFORM_COLORS[platform as keyof typeof PLATFORM_COLORS] || '#888'
                                  }} 
                                />
                                <Typography textTransform="capitalize">{platform}</Typography>
                              </Stack>
                            }
                          />
                        ))}
                      </Stack>

                      <Button 
                        variant="contained" 
                        size="large"
                        startIcon={<CheckCircle />}
                      >
                        Save Settings
                      </Button>
                    </Stack>
                  )}

                  {/* Tab 1: Execution History */}
                  {activeTab === 1 && (
                    <Box>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                        <Typography variant="h6" fontWeight={600}>
                          Recent Executions
                        </Typography>
                        <IconButton>
                          <Refresh />
                        </IconButton>
                      </Stack>

                      <TableContainer>
                        <Table>
                          <TableHead>
                            <TableRow>
                              <TableCell>Time</TableCell>
                              <TableCell>Type</TableCell>
                              <TableCell>Market</TableCell>
                              <TableCell>Route</TableCell>
                              <TableCell align="right">Amount</TableCell>
                              <TableCell align="right">P&L</TableCell>
                              <TableCell>Status</TableCell>
                              <TableCell></TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {executionHistory.map((execution) => (
                              <TableRow key={execution.id}>
                                <TableCell>
                                  <Typography variant="caption">
                                    {new Date(execution.timestamp).toLocaleTimeString()}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Chip 
                                    label={execution.type.replace('_', ' ')}
                                    size="small"
                                    variant="outlined"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Typography variant="body2">{execution.market}</Typography>
                                </TableCell>
                                <TableCell>
                                  <Stack direction="row" spacing={0.5} alignItems="center">
                                    <Chip 
                                      label={execution.buyPlatform} 
                                      size="small"
                                      sx={{ 
                                        backgroundColor: alpha(PLATFORM_COLORS[execution.buyPlatform as keyof typeof PLATFORM_COLORS] || '#888', 0.2),
                                        fontSize: 10
                                      }}
                                    />
                                    <SwapHoriz sx={{ fontSize: 16 }} />
                                    <Chip 
                                      label={execution.sellPlatform} 
                                      size="small"
                                      sx={{ 
                                        backgroundColor: alpha(PLATFORM_COLORS[execution.sellPlatform as keyof typeof PLATFORM_COLORS] || '#888', 0.2),
                                        fontSize: 10
                                      }}
                                    />
                                  </Stack>
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="body2" fontWeight={600}>
                                    ${execution.amount.toLocaleString()}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right">
                                  <Typography 
                                    variant="body2" 
                                    fontWeight={700}
                                    color={execution.profitLoss >= 0 ? TRADING_COLORS.YES : TRADING_COLORS.NO}
                                  >
                                    {execution.profitLoss > 0 ? '+' : ''}${execution.profitLoss.toFixed(2)}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Chip 
                                    label={execution.status}
                                    size="small"
                                    sx={{ 
                                      backgroundColor: alpha(getStatusColor(execution.status), 0.2),
                                      color: getStatusColor(execution.status),
                                      fontWeight: 600
                                    }}
                                  />
                                </TableCell>
                                <TableCell>
                                  {execution.txHash && (
                                    <Tooltip title="View on Explorer">
                                      <IconButton size="small">
                                        <OpenInNew sx={{ fontSize: 16 }} />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  )}

                  {/* Tab 2: Smart Contracts */}
                  {activeTab === 2 && (
                    <Stack spacing={3}>
                      <Typography variant="h6" fontWeight={600}>
                        Deployed Contracts
                      </Typography>

                      <Alert severity="info">
                        <AlertTitle>Smart Contracts</AlertTitle>
                        The execution vault uses audited smart contracts deployed on Base network.
                      </Alert>

                      <Card variant="outlined">
                        <CardContent>
                          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                            <Typography variant="subtitle1" fontWeight={600}>
                              ArbitrageVault.sol
                            </Typography>
                            <Chip label="Base Mainnet" size="small" color="primary" />
                          </Stack>
                          <Typography variant="body2" color="text.secondary" mb={2}>
                            Main vault contract for holding funds and executing cross-platform arbitrage trades
                          </Typography>
                          <Stack direction="row" spacing={1}>
                            <Button 
                              size="small" 
                              variant="outlined"
                              startIcon={<OpenInNew />}
                              href="https://basescan.org/address/0x0000000000000000000000000000000000000000"
                              target="_blank"
                            >
                              View on BaseScan
                            </Button>
                            <Button 
                              size="small" 
                              variant="outlined"
                              startIcon={<Code />}
                            >
                              View Source
                            </Button>
                          </Stack>
                        </CardContent>
                      </Card>

                      <Card variant="outlined">
                        <CardContent>
                          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                            <Typography variant="subtitle1" fontWeight={600}>
                              CopyTrading.sol
                            </Typography>
                            <Chip label="Base Mainnet" size="small" color="primary" />
                          </Stack>
                          <Typography variant="body2" color="text.secondary" mb={2}>
                            Copy trading contract for following successful traders automatically
                          </Typography>
                          <Stack direction="row" spacing={1}>
                            <Button 
                              size="small" 
                              variant="outlined"
                              startIcon={<OpenInNew />}
                              href="https://basescan.org/address/0x0000000000000000000000000000000000000000"
                              target="_blank"
                            >
                              View on BaseScan
                            </Button>
                            <Button 
                              size="small" 
                              variant="outlined"
                              startIcon={<Code />}
                            >
                              View Source
                            </Button>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Stack>
                  )}
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </>
      )}

      {/* Deposit Dialog */}
      <Dialog open={depositDialogOpen} onClose={() => setDepositDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Deposit Funds</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField
              label="Amount (USD)"
              type="number"
              fullWidth
              placeholder="1000"
              InputProps={{
                startAdornment: '$',
              }}
            />
            <Alert severity="info">
              Funds will be deposited into the ArbitrageVault smart contract on Base network.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDepositDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleDeposit}>Deposit</Button>
        </DialogActions>
      </Dialog>

      {/* Withdraw Dialog */}
      <Dialog open={withdrawDialogOpen} onClose={() => setWithdrawDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Withdraw Funds</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Alert severity="warning">
              Available balance: ${formatVolume(vaultStats.availableBalance)}
            </Alert>
            <TextField
              label="Amount (USD)"
              type="number"
              fullWidth
              placeholder="500"
              InputProps={{
                startAdornment: '$',
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWithdrawDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleWithdraw}>Withdraw</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
