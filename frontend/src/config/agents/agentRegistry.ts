/**
 * Agent Registry - Complete Configuration for 16 Agents
 * 
 * This file defines all 16 agents with their:
 * - Input schemas
 * - Workflow steps
 * - Chart definitions (10+ per agent)
 * - Table definitions (2+ per agent)
 * - Tab configurations for Simple/Advanced modes
 */

import { AgentDefinition } from './agentSchema';

// ============================================
// 1. CHAIN HEALTH MONITOR AGENT
// ============================================

const chainHealthMonitor: AgentDefinition = {
  // Identity
  id: 'chain-health-monitor',
  slug: 'chain-health-monitor',
  name: 'Chain Health Monitor',
  icon: '⛓️',
  description: 'Monitor blockchain health metrics including network activity, validator performance, gas fees, and security status across major chains.',
  shortDescription: 'Real-time blockchain health & performance metrics',
  
  // Classification
  category: 'blockchains',
  modeFit: 'both',
  outputType: 'dashboard',
  timeframe: 'intraday',
  dataSources: ['onchain', 'spot'],
  chainCoverage: 'multi-chain',
  runtime: 'fast',
  planAccess: 'free',
  
  // Signals & Features
  signalsUsed: ['Block Time', 'Gas Price', 'Network Hashrate', 'Active Addresses', 'TVL'],
  previewSentence: 'Get comprehensive blockchain health insights with real-time metrics and alerts',
  
  // Form Schema - Minimal required inputs
  formSchema: [
    {
      name: 'chain',
      label: 'Blockchain',
      type: 'select',
      placeholder: 'Select chain',
      required: true,
      options: [
        { value: 'ethereum', label: 'Ethereum' },
        { value: 'bsc', label: 'BNB Chain' },
        { value: 'polygon', label: 'Polygon' },
        { value: 'avalanche', label: 'Avalanche' },
        { value: 'arbitrum', label: 'Arbitrum' },
        { value: 'optimism', label: 'Optimism' },
        { value: 'solana', label: 'Solana' },
      ],
      default_value: 'ethereum',
    },
    {
      name: 'timeRange',
      label: 'Time Range',
      type: 'select',
      placeholder: 'Select time range',
      required: true,
      options: [
        { value: '24h', label: 'Last 24 Hours' },
        { value: '7d', label: 'Last 7 Days' },
        { value: '30d', label: 'Last 30 Days' },
        { value: '90d', label: 'Last 90 Days' },
      ],
      default_value: '24h',
    },
    {
      name: 'compareChains',
      label: 'Compare with other chains',
      type: 'multiselect',
      required: false,
      isAdvanced: true,
      options: [
        { value: 'ethereum', label: 'Ethereum' },
        { value: 'bsc', label: 'BNB Chain' },
        { value: 'polygon', label: 'Polygon' },
      ],
    },
  ],
  
  // Workflow Steps
  workflowSteps: [
    {
      step: 1,
      name: 'Collect On-Chain Data',
      description: 'Fetching blockchain metrics from node providers',
      estimatedTime: '~3s',
    },
    {
      step: 2,
      name: 'Fetch Network Stats',
      description: 'Gathering validator, gas, and transaction data',
      estimatedTime: '~2s',
    },
    {
      step: 3,
      name: 'Compute Health Scores',
      description: 'Calculating performance and security metrics',
      estimatedTime: '~2s',
    },
    {
      step: 4,
      name: 'Generate Charts',
      description: 'Building visualization data',
      estimatedTime: '~1s',
    },
    {
      step: 5,
      name: 'Build Intelligence Report',
      description: 'AI-powered analysis and recommendations',
      estimatedTime: '~3s',
    },
  ],
  
  // Charts - 10+ definitions
  charts: [
    // CORE GROUP (Simple mode)
    {
      id: 'health-score-gauge',
      title: 'Overall Health Score',
      type: 'gauge',
      group: 'core',
      dataKey: 'healthScore',
      showInSimple: true,
      showInAdvanced: true,
      config: { colors: ['#4CAF50', '#FFC107', '#F44336'] },
    },
    {
      id: 'gas-price-trend',
      title: 'Gas Price Trend',
      type: 'area',
      group: 'core',
      dataKey: 'gasPriceTrend',
      showInSimple: true,
      showInAdvanced: true,
      config: { xAxis: 'timestamp', yAxis: ['avgGasPrice'], colors: ['#BBD977'] },
    },
    {
      id: 'active-addresses',
      title: 'Active Addresses',
      type: 'line',
      group: 'core',
      dataKey: 'activeAddresses',
      showInSimple: true,
      showInAdvanced: true,
      config: { xAxis: 'date', yAxis: ['count'], colors: ['#4FC3F7'] },
    },
    
    // MARKET GROUP (Advanced mode)
    {
      id: 'tps-trend',
      title: 'Transactions Per Second',
      type: 'bar',
      group: 'market',
      dataKey: 'tpsTrend',
      showInSimple: false,
      showInAdvanced: true,
      config: { xAxis: 'timestamp', yAxis: ['tps'], colors: ['#AB47BC'] },
    },
    {
      id: 'block-time',
      title: 'Block Time Distribution',
      type: 'histogram',
      group: 'market',
      dataKey: 'blockTime',
      showInSimple: false,
      showInAdvanced: true,
    },
    {
      id: 'network-fees',
      title: 'Network Fee Breakdown',
      type: 'pie',
      group: 'market',
      dataKey: 'feeBreakdown',
      showInSimple: false,
      showInAdvanced: true,
    },
    
    // FLOW GROUP
    {
      id: 'validator-performance',
      title: 'Validator Performance',
      type: 'bar',
      group: 'flow',
      dataKey: 'validators',
      showInSimple: false,
      showInAdvanced: true,
      config: { xAxis: 'validator', yAxis: ['uptime', 'blocks'], stacked: true },
    },
    {
      id: 'tvl-trend',
      title: 'Total Value Locked Trend',
      type: 'area',
      group: 'flow',
      dataKey: 'tvlTrend',
      showInSimple: false,
      showInAdvanced: true,
      config: { xAxis: 'date', yAxis: ['tvl'], colors: ['#26A69A'] },
    },
    
    // RISK GROUP
    {
      id: 'security-incidents',
      title: 'Security Incidents Timeline',
      type: 'scatter',
      group: 'risk',
      dataKey: 'securityIncidents',
      showInSimple: false,
      showInAdvanced: true,
    },
    {
      id: 'network-congestion',
      title: 'Network Congestion Heatmap',
      type: 'heatmap',
      group: 'risk',
      dataKey: 'congestionHeatmap',
      showInSimple: false,
      showInAdvanced: true,
    },
    
    // SENTIMENT GROUP
    {
      id: 'chain-comparison',
      title: 'Multi-Chain Comparison Radar',
      type: 'radar',
      group: 'sentiment',
      dataKey: 'chainComparison',
      showInSimple: false,
      showInAdvanced: true,
    },
  ],
  
  // Tables - 2+ definitions
  tables: [
    {
      id: 'key-metrics',
      title: 'Key Blockchain Metrics',
      dataKey: 'keyMetrics',
      showInSimple: true,
      showInAdvanced: true,
      columns: [
        { key: 'metric', label: 'Metric', type: 'text', sortable: false },
        { key: 'value', label: 'Current Value', type: 'text', sortable: false },
        { key: 'change24h', label: '24h Change', type: 'change', sortable: true },
        { key: 'status', label: 'Status', type: 'status', sortable: false },
      ],
    },
    {
      id: 'validator-list',
      title: 'Top Validators',
      dataKey: 'topValidators',
      showInSimple: false,
      showInAdvanced: true,
      sortable: true,
      pagination: true,
      pageSize: 10,
      columns: [
        { key: 'rank', label: '#', type: 'number', width: '60px' },
        { key: 'address', label: 'Validator', type: 'address', sortable: false },
        { key: 'stake', label: 'Stake', type: 'currency', sortable: true },
        { key: 'uptime', label: 'Uptime', type: 'percent', sortable: true },
        { key: 'blocks', label: 'Blocks Produced', type: 'number', sortable: true },
      ],
    },
  ],
  
  // Tab visibility by mode
  tabs: {
    simple: ['Summary', 'Dashboard', 'Charts'],
    advanced: ['Summary', 'Dashboard', 'Charts', 'Intelligence', 'Report'],
  },
  
  // Metadata
  version: '1.0.0',
  isEnabled: true,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-04',
};

// ============================================
// 2. GAS & FEE INTELLIGENCE AGENT
// ============================================

const gasFeeIntelligence: AgentDefinition = {
  id: 'gas-fee-intelligence',
  slug: 'gas-fee-intelligence',
  name: 'Gas & Fee Intelligence',
  icon: '⛽',
  description: 'Predict optimal transaction timing with real-time gas price analysis, fee forecasting, and cost optimization recommendations.',
  shortDescription: 'Smart gas price predictions & fee optimization',
  
  category: 'blockchains',
  modeFit: 'simple-friendly',
  outputType: 'alerts',
  timeframe: 'intraday',
  dataSources: ['onchain'],
  chainCoverage: 'multi-chain',
  runtime: 'fast',
  planAccess: 'free',
  
  signalsUsed: ['Gas Price', 'Pending TX', 'Block Fullness', 'MEV Activity'],
  previewSentence: 'Never overpay for gas - get smart fee predictions and timing recommendations',
  
  formSchema: [
    {
      name: 'chain',
      label: 'Blockchain',
      type: 'select',
      required: true,
      options: [
        { value: 'ethereum', label: 'Ethereum' },
        { value: 'bsc', label: 'BNB Chain' },
        { value: 'polygon', label: 'Polygon' },
        { value: 'arbitrum', label: 'Arbitrum' },
        { value: 'optimism', label: 'Optimism' },
      ],
      default_value: 'ethereum',
    },
    {
      name: 'txType',
      label: 'Transaction Type',
      type: 'select',
      required: true,
      options: [
        { value: 'transfer', label: 'Simple Transfer' },
        { value: 'swap', label: 'DEX Swap' },
        { value: 'nft', label: 'NFT Mint/Transfer' },
        { value: 'contract', label: 'Contract Interaction' },
      ],
      default_value: 'transfer',
    },
    {
      name: 'urgency',
      label: 'Transaction Urgency',
      type: 'select',
      required: true,
      options: [
        { value: 'low', label: 'Not Urgent (can wait hours)' },
        { value: 'medium', label: 'Medium (within 30 min)' },
        { value: 'high', label: 'High (ASAP)' },
      ],
      default_value: 'medium',
    },
  ],
  
  workflowSteps: [
    {
      step: 1,
      name: 'Fetch Real-Time Gas Data',
      description: 'Collecting current gas prices from mempool',
      estimatedTime: '~2s',
    },
    {
      step: 2,
      name: 'Analyze Historical Patterns',
      description: 'Processing gas price trends',
      estimatedTime: '~3s',
    },
    {
      step: 3,
      name: 'Generate Forecast',
      description: 'Predicting optimal transaction windows',
      estimatedTime: '~2s',
    },
    {
      step: 4,
      name: 'Calculate Cost Savings',
      description: 'Computing potential savings',
      estimatedTime: '~1s',
    },
    {
      step: 5,
      name: 'Build Recommendations',
      description: 'Creating actionable alerts',
      estimatedTime: '~1s',
    },
  ],
  
  charts: [
    {
      id: 'current-gas',
      title: 'Current Gas Prices',
      type: 'gauge',
      group: 'core',
      dataKey: 'currentGas',
      showInSimple: true,
      showInAdvanced: true,
    },
    {
      id: 'gas-forecast',
      title: 'Gas Price Forecast (24h)',
      type: 'area',
      group: 'core',
      dataKey: 'gasForecast',
      showInSimple: true,
      showInAdvanced: true,
      config: { xAxis: 'time', yAxis: ['predicted', 'low', 'high'], colors: ['#BBD977', '#4FC3F7', '#FF7043'] },
    },
    {
      id: 'optimal-windows',
      title: 'Optimal Transaction Windows',
      type: 'bar',
      group: 'core',
      dataKey: 'optimalWindows',
      showInSimple: true,
      showInAdvanced: true,
    },
    {
      id: 'gas-distribution',
      title: 'Gas Price Distribution',
      type: 'histogram',
      group: 'market',
      dataKey: 'gasDistribution',
      showInSimple: false,
      showInAdvanced: true,
    },
    {
      id: 'mempool-status',
      title: 'Mempool Status',
      type: 'pie',
      group: 'market',
      dataKey: 'mempoolStatus',
      showInSimple: false,
      showInAdvanced: true,
    },
    {
      id: 'block-fullness',
      title: 'Block Fullness Trend',
      type: 'line',
      group: 'flow',
      dataKey: 'blockFullness',
      showInSimple: false,
      showInAdvanced: true,
    },
    {
      id: 'gas-by-hour',
      title: 'Average Gas by Hour of Day',
      type: 'bar',
      group: 'flow',
      dataKey: 'gasByHour',
      showInSimple: false,
      showInAdvanced: true,
    },
    {
      id: 'gas-by-day',
      title: 'Average Gas by Day of Week',
      type: 'bar',
      group: 'flow',
      dataKey: 'gasByDay',
      showInSimple: false,
      showInAdvanced: true,
    },
    {
      id: 'cost-comparison',
      title: 'Cost Comparison Matrix',
      type: 'heatmap',
      group: 'risk',
      dataKey: 'costComparison',
      showInSimple: false,
      showInAdvanced: true,
    },
    {
      id: 'savings-potential',
      title: 'Potential Savings Timeline',
      type: 'area',
      group: 'risk',
      dataKey: 'savingsPotential',
      showInSimple: false,
      showInAdvanced: true,
    },
  ],
  
  tables: [
    {
      id: 'gas-tiers',
      title: 'Gas Price Tiers',
      dataKey: 'gasTiers',
      showInSimple: true,
      showInAdvanced: true,
      columns: [
        { key: 'speed', label: 'Speed', type: 'text' },
        { key: 'gwei', label: 'Gas Price (Gwei)', type: 'number' },
        { key: 'usd', label: 'Est. Cost (USD)', type: 'currency' },
        { key: 'time', label: 'Est. Time', type: 'text' },
        { key: 'savings', label: 'Savings vs Fast', type: 'percent' },
      ],
    },
    {
      id: 'hourly-averages',
      title: 'Hourly Gas Averages (Last 7 Days)',
      dataKey: 'hourlyAverages',
      showInSimple: false,
      showInAdvanced: true,
      sortable: true,
      columns: [
        { key: 'hour', label: 'Hour (UTC)', type: 'text' },
        { key: 'avgGas', label: 'Avg Gas', type: 'number' },
        { key: 'minGas', label: 'Min Gas', type: 'number' },
        { key: 'maxGas', label: 'Max Gas', type: 'number' },
        { key: 'volatility', label: 'Volatility', type: 'percent' },
      ],
    },
  ],
  
  tabs: {
    simple: ['Summary', 'Dashboard', 'Charts'],
    advanced: ['Summary', 'Dashboard', 'Charts', 'Intelligence', 'Forecast'],
  },
  
  version: '1.0.0',
  isEnabled: true,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-04',
};

// ============================================
// 3. TOKEN DEEP DIVE ANALYST
// ============================================

const tokenDeepDive: AgentDefinition = {
  id: 'token-deep-dive',
  slug: 'token-deep-dive',
  name: 'Token Deep Dive Analyst',
  icon: '🪙',
  description: 'Comprehensive token analysis covering price action, fundamentals, on-chain metrics, holder distribution, liquidity analysis, and market sentiment.',
  shortDescription: 'Complete token analysis with multi-timeframe insights',
  
  category: 'tokens',
  modeFit: 'both',
  outputType: 'report',
  timeframe: 'swing',
  dataSources: ['spot', 'onchain', 'derivatives', 'social'],
  chainCoverage: 'multi-chain',
  runtime: 'medium',
  planAccess: 'free',
  
  signalsUsed: ['Price', 'Volume', 'Holders', 'Liquidity', 'Social Sentiment', 'Whale Activity'],
  previewSentence: 'Deep dive into any token with comprehensive multi-layered analysis',
  
  formSchema: [
    {
      name: 'token',
      label: 'Token Address or Symbol',
      type: 'token',
      placeholder: 'e.g., 0x... or PEPE',
      required: true,
    },
    {
      name: 'chain',
      label: 'Blockchain',
      type: 'select',
      required: true,
      options: [
        { value: 'ethereum', label: 'Ethereum' },
        { value: 'bsc', label: 'BNB Chain' },
        { value: 'polygon', label: 'Polygon' },
        { value: 'arbitrum', label: 'Arbitrum' },
        { value: 'base', label: 'Base' },
        { value: 'solana', label: 'Solana' },
      ],
      default_value: 'ethereum',
    },
    {
      name: 'timeRange',
      label: 'Analysis Timeframe',
      type: 'select',
      required: true,
      options: [
        { value: '24h', label: '24 Hours' },
        { value: '7d', label: '7 Days' },
        { value: '30d', label: '30 Days' },
        { value: '90d', label: '90 Days' },
        { value: 'all', label: 'All Time' },
      ],
      default_value: '7d',
    },
    {
      name: 'includeWhaleTracking',
      label: 'Include Whale Tracking',
      type: 'select',
      required: false,
      isAdvanced: true,
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
      default_value: 'yes',
    },
  ],
  
  workflowSteps: [
    {
      step: 1,
      name: 'Fetch Token Data',
      description: 'Collecting price, volume, and market data',
      estimatedTime: '~4s',
    },
    {
      step: 2,
      name: 'Analyze On-Chain Metrics',
      description: 'Processing holder data and transaction patterns',
      estimatedTime: '~5s',
    },
    {
      step: 3,
      name: 'Evaluate Liquidity',
      description: 'Analyzing DEX pools and market depth',
      estimatedTime: '~3s',
    },
    {
      step: 4,
      name: 'Scan Social Sentiment',
      description: 'Aggregating social signals and news',
      estimatedTime: '~4s',
    },
    {
      step: 5,
      name: 'Compute Risk Scores',
      description: 'Calculating safety and quality metrics',
      estimatedTime: '~2s',
    },
    {
      step: 6,
      name: 'Generate AI Analysis',
      description: 'Building comprehensive intelligence report',
      estimatedTime: '~5s',
    },
  ],
  
  charts: [
    // ===== CORE PRICE & MARKET CHARTS (Simple Mode) =====
    {
      id: 'price-candles',
      title: 'Price Chart (Candlestick)',
      type: 'candlestick',
      group: 'core',
      dataKey: 'priceCandles',
      showInSimple: true,
      showInAdvanced: true,
      height: 400,
    },
    {
      id: 'volume-profile',
      title: 'Volume Profile',
      type: 'bar',
      group: 'core',
      dataKey: 'volumeProfile',
      showInSimple: true,
      showInAdvanced: true,
      config: { xAxis: 'time', yAxis: ['volume'], colors: ['#BBD977'] },
      height: 250,
    },
    {
      id: 'market-cap-chart',
      title: 'Market Cap History',
      type: 'area',
      group: 'core',
      dataKey: 'marketCapChart',
      showInSimple: true,
      showInAdvanced: true,
      config: { xAxis: 'time', yAxis: ['market_cap'], colors: ['#4FC3F7'] },
      height: 250,
    },
    {
      id: 'price-volume-combo',
      title: 'Price + Volume (Dual Axis)',
      type: 'composed',
      group: 'core',
      dataKey: 'priceVolumeCombo',
      showInSimple: true,
      showInAdvanced: true,
      config: { xAxis: 'time', yAxis: ['price', 'volume'], colors: ['#BBD977', '#4FC3F7'] },
      height: 350,
    },
    
    // ===== RETURNS & PERFORMANCE CHARTS =====
    {
      id: 'daily-returns',
      title: 'Daily Returns (%)',
      type: 'bar',
      group: 'market',
      dataKey: 'dailyReturns',
      showInSimple: false,
      showInAdvanced: true,
      config: { xAxis: 'time', yAxis: ['return'], colors: ['#AB47BC'] },
      height: 250,
    },
    {
      id: 'cumulative-returns',
      title: 'Cumulative Returns (Growth of $100)',
      type: 'line',
      group: 'market',
      dataKey: 'cumulativeReturns',
      showInSimple: false,
      showInAdvanced: true,
      config: { xAxis: 'time', yAxis: ['value'], colors: ['#26A69A'] },
      height: 250,
    },
    
    // ===== VOLATILITY & RISK CHARTS =====
    {
      id: 'volatility-band',
      title: 'High-Low Volatility Band',
      type: 'area',
      group: 'risk',
      dataKey: 'volatilityBand',
      showInSimple: false,
      showInAdvanced: true,
      config: { xAxis: 'time', yAxis: ['high', 'low'], colors: ['#4CAF50', '#F44336'] },
      height: 250,
    },
    {
      id: 'rolling-volatility',
      title: 'Rolling Volatility (7D & 30D)',
      type: 'line',
      group: 'risk',
      dataKey: 'rollingVolatility',
      showInSimple: false,
      showInAdvanced: true,
      config: { xAxis: 'time', yAxis: ['vol_7d', 'vol_30d'], colors: ['#FFA726', '#EF5350'] },
      height: 250,
    },
    {
      id: 'max-drawdown',
      title: 'Maximum Drawdown Curve',
      type: 'area',
      group: 'risk',
      dataKey: 'maxDrawdownCurve',
      showInSimple: false,
      showInAdvanced: true,
      config: { xAxis: 'time', yAxis: ['drawdown'], colors: ['#F44336'] },
      height: 250,
    },
    
    // ===== TECHNICAL ANALYSIS CHARTS =====
    {
      id: 'moving-averages',
      title: 'Moving Averages (MA7, MA30, MA90)',
      type: 'line',
      group: 'market',
      dataKey: 'movingAveragesChart',
      showInSimple: false,
      showInAdvanced: true,
      config: { xAxis: 'time', yAxis: ['price', 'ma7', 'ma30', 'ma90'], colors: ['#BBD977', '#4FC3F7', '#AB47BC', '#FF7043'] },
      height: 300,
    },
    {
      id: 'support-resistance',
      title: 'Support & Resistance Levels',
      type: 'bar',
      group: 'market',
      dataKey: 'supportResistanceChart',
      showInSimple: false,
      showInAdvanced: true,
      config: { xAxis: 'level', yAxis: ['price'], colors: ['#4CAF50'] },
      height: 250,
    },
    
    // ===== FUNDAMENTALS CHARTS =====
    {
      id: 'supply-breakdown',
      title: 'Supply Distribution',
      type: 'pie',
      group: 'core',
      dataKey: 'supplyBreakdown',
      showInSimple: true,
      showInAdvanced: true,
      height: 300,
    },
    {
      id: 'ath-gauge',
      title: 'Distance from ATH',
      type: 'gauge',
      group: 'core',
      dataKey: 'athGauge',
      showInSimple: true,
      showInAdvanced: true,
      height: 250,
    },
    
    // ===== MARKET STRUCTURE CHARTS =====
    {
      id: 'exchange-distribution',
      title: 'Exchange Volume Distribution',
      type: 'pie',
      group: 'market',
      dataKey: 'exchangeDistribution',
      showInSimple: false,
      showInAdvanced: true,
      height: 300,
    },
    {
      id: 'risk-radar',
      title: 'Risk Assessment Radar',
      type: 'radar',
      group: 'risk',
      dataKey: 'riskRadar',
      showInSimple: false,
      showInAdvanced: true,
      height: 350,
    },
  ],
  
  tables: [
    {
      id: 'token-info',
      title: 'Token Information',
      dataKey: 'tokenInfo',
      showInSimple: true,
      showInAdvanced: true,
      columns: [
        { key: 'property', label: 'Property', type: 'text' },
        { key: 'value', label: 'Value', type: 'text' },
      ],
    },
    {
      id: 'top-holders',
      title: 'Top 20 Holders',
      dataKey: 'topHolders',
      showInSimple: false,
      showInAdvanced: true,
      sortable: true,
      pagination: true,
      pageSize: 20,
      columns: [
        { key: 'rank', label: '#', type: 'number', width: '60px' },
        { key: 'address', label: 'Address', type: 'address' },
        { key: 'balance', label: 'Balance', type: 'number' },
        { key: 'percentage', label: '% Supply', type: 'percent', sortable: true },
        { key: 'value', label: 'Value (USD)', type: 'currency', sortable: true },
      ],
    },
    {
      id: 'liquidity-pools',
      title: 'Liquidity Pools',
      dataKey: 'liquidityPools',
      showInSimple: false,
      showInAdvanced: true,
      sortable: true,
      columns: [
        { key: 'exchange', label: 'Exchange', type: 'text' },
        { key: 'pair', label: 'Pair', type: 'text' },
        { key: 'liquidity', label: 'Liquidity', type: 'currency', sortable: true },
        { key: 'volume24h', label: '24h Volume', type: 'currency', sortable: true },
        { key: 'apy', label: 'APY', type: 'percent' },
      ],
    },
  ],
  
  tabs: {
    simple: ['Summary', 'Dashboard', 'Charts'],
    advanced: ['Summary', 'Dashboard', 'Charts', 'Intelligence', 'Report'],
  },
  
  version: '1.0.0',
  isEnabled: true,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-04',
};

// ============================================
// 4. TOKEN SAFETY & RUG CHECKER AGENT
// ============================================

const tokenSafetyChecker: AgentDefinition = {
  id: 'token-safety-checker',
  slug: 'token-safety-checker',
  name: 'Token Safety & Rug Checker',
  icon: '🛡️',
  description: 'Analyze token contract security, detect rugpull risks, verify liquidity locks, and assess overall safety score.',
  shortDescription: 'Security audit & rugpull risk detection',
  category: 'tokens',
  modeFit: 'both',
  outputType: 'report',
  timeframe: 'realtime',
  dataSources: ['onchain', 'contract'],
  chainCoverage: 'evm-chains',
  runtime: 'fast',
  planAccess: 'free',
  signalsUsed: ['Contract Verification', 'Liquidity Lock', 'Holder Distribution', 'Honeypot Check'],
  previewSentence: 'Comprehensive token security analysis with rugpull detection',
  
  formSchema: {
    title: 'Token Safety Analysis',
    description: 'Enter token details for security audit',
    fields: [
      {
        id: 'token_address',
        type: 'text',
        label: 'Token Contract Address',
        placeholder: '0x...',
        required: true,
        showInSimpleMode: true,
      },
      {
        id: 'chain',
        type: 'select',
        label: 'Blockchain',
        defaultValue: 'ethereum',
        showInSimpleMode: true,
        options: [
          { value: 'ethereum', label: 'Ethereum' },
          { value: 'bsc', label: 'BSC' },
          { value: 'polygon', label: 'Polygon' },
        ],
      },
    ],
  },
  
  workflowSteps: [
    { id: 'step1', name: 'Fetch Contract Code', description: 'Retrieving smart contract bytecode', estimatedTime: 5, status: 'pending' },
    { id: 'step2', name: 'Verify Contract', description: 'Checking contract verification status', estimatedTime: 3, status: 'pending' },
    { id: 'step3', name: 'Analyze Liquidity', description: 'Checking liquidity locks and pools', estimatedTime: 8, status: 'pending' },
    { id: 'step4', name: 'Check Holder Distribution', description: 'Analyzing token holder concentration', estimatedTime: 5, status: 'pending' },
    { id: 'step5', name: 'Run Security Tests', description: 'Honeypot, mint, and ownership tests', estimatedTime: 10, status: 'pending' },
    { id: 'step6', name: 'Calculate Safety Score', description: 'Computing overall safety rating', estimatedTime: 3, status: 'pending' },
  ],
  
  charts: [
    { id: 'safety_gauge', type: 'gauge', title: 'Safety Score', dataKey: 'safety_score', group: 'core', max: 100, showInSimpleMode: true },
    { id: 'holder_dist', type: 'pie', title: 'Holder Distribution', dataKey: 'holder_distribution', labelKey: 'category', valueKey: 'percentage', group: 'core', showInSimpleMode: true },
    { id: 'liquidity_timeline', type: 'line', title: 'Liquidity Over Time', dataKey: 'liquidity_history', xAxis: 'date', yAxis: ['liquidity_usd'], group: 'market' },
    { id: 'risk_radar', type: 'radar', title: 'Risk Assessment', dataKey: 'risk_metrics', labelKey: 'metric', group: 'risk', showInSimpleMode: true },
  ],
  
  tables: [
    {
      id: 'security_checks',
      title: 'Security Checks',
      dataKey: 'security_checks',
      columns: [
        { key: 'check', label: 'Check', type: 'text' },
        { key: 'status', label: 'Status', type: 'status' },
        { key: 'risk', label: 'Risk Level', type: 'severity' },
        { key: 'details', label: 'Details', type: 'text' },
      ],
    },
    {
      id: 'top_holders',
      title: 'Top Token Holders',
      dataKey: 'top_holders',
      columns: [
        { key: 'address', label: 'Address', type: 'address' },
        { key: 'balance', label: 'Balance', type: 'number' },
        { key: 'percentage', label: '% of Supply', type: 'percent' },
        { key: 'type', label: 'Type', type: 'text' },
      ],
    },
  ],
  
  tabs: {
    simple: ['Summary', 'Dashboard', 'Charts'],
    advanced: ['Summary', 'Dashboard', 'Charts', 'Intelligence', 'Report'],
  },
  
  defaultMode: 'simple',
  version: '1.0.0',
  isEnabled: true,
  createdAt: '2026-01-04',
  updatedAt: '2026-01-04',
};

// ============================================
// 5. BEST ROUTE SWAP AGENT
// ============================================

const bestRouteSwap: AgentDefinition = {
  id: 'best-route-swap',
  slug: 'best-route-swap',
  name: 'Best Route Swap Finder',
  icon: '🔄',
  description: 'Find optimal swap routes across DEXs and aggregators with lowest slippage, best price, and minimal gas costs.',
  shortDescription: 'Optimal DEX routing with price comparison',
  category: 'defi',
  modeFit: 'both',
  outputType: 'comparison',
  timeframe: 'realtime',
  dataSources: ['dex', 'spot'],
  chainCoverage: 'multi-chain',
  runtime: 'instant',
  planAccess: 'free',
  signalsUsed: ['DEX Prices', 'Liquidity Depth', 'Gas Costs', 'Price Impact'],
  previewSentence: 'Compare swap routes and find the best price across all DEXs',
  
  formSchema: {
    title: 'Swap Route Finder',
    description: 'Find the best route for your token swap',
    fields: [
      {
        id: 'token_in',
        type: 'text',
        label: 'Sell Token (Symbol or Address)',
        placeholder: 'ETH, USDC, or 0x...',
        required: true,
        showInSimpleMode: true,
      },
      {
        id: 'token_out',
        type: 'text',
        label: 'Buy Token (Symbol or Address)',
        placeholder: 'USDT, DAI, or 0x...',
        required: true,
        showInSimpleMode: true,
      },
      {
        id: 'amount',
        type: 'text',
        label: 'Amount to Swap',
        placeholder: '1000',
        required: true,
        showInSimpleMode: true,
      },
      {
        id: 'chain',
        type: 'select',
        label: 'Chain',
        defaultValue: 'ethereum',
        showInSimpleMode: true,
        options: [
          { value: 'ethereum', label: 'Ethereum' },
          { value: 'polygon', label: 'Polygon' },
          { value: 'arbitrum', label: 'Arbitrum' },
          { value: 'optimism', label: 'Optimism' },
        ],
      },
    ],
  },
  
  workflowSteps: [
    { id: 'step1', name: 'Resolve Tokens', description: 'Identifying token addresses', estimatedTime: 2, status: 'pending' },
    { id: 'step2', name: 'Query DEX Aggregators', description: 'Fetching routes from 1inch, Paraswap, etc.', estimatedTime: 5, status: 'pending' },
    { id: 'step3', name: 'Direct DEX Queries', description: 'Checking Uniswap, Sushiswap, Curve', estimatedTime: 5, status: 'pending' },
    { id: 'step4', name: 'Calculate Gas Costs', description: 'Estimating gas for each route', estimatedTime: 3, status: 'pending' },
    { id: 'step5', name: 'Rank Routes', description: 'Comparing all routes by output amount', estimatedTime: 2, status: 'pending' },
  ],
  
  charts: [
    { id: 'route_comparison', type: 'bar', title: 'Output Amount by Route', dataKey: 'route_comparison', xAxis: 'route_name', yAxis: ['output_amount'], group: 'core', showInSimpleMode: true, width: 'full' },
    { id: 'gas_costs', type: 'bar', title: 'Gas Costs Comparison', dataKey: 'route_comparison', xAxis: 'route_name', yAxis: ['gas_cost_usd'], group: 'core', showInSimpleMode: true },
    { id: 'price_impact', type: 'bar', title: 'Price Impact by Route', dataKey: 'route_comparison', xAxis: 'route_name', yAxis: ['price_impact'], group: 'risk' },
    { id: 'net_output', type: 'composed', title: 'Net Output (After Gas)', dataKey: 'route_comparison', xAxis: 'route_name', yAxis: ['net_output', 'output_amount'], group: 'core', showInSimpleMode: true },
  ],
  
  tables: [
    {
      id: 'route_details',
      title: 'All Routes Ranked',
      dataKey: 'routes',
      columns: [
        { key: 'rank', label: '#', type: 'number' },
        { key: 'route_name', label: 'Route', type: 'text' },
        { key: 'output_amount', label: 'You Get', type: 'number', sortable: true },
        { key: 'gas_cost_usd', label: 'Gas Cost', type: 'currency' },
        { key: 'price_impact', label: 'Price Impact', type: 'percent' },
        { key: 'net_output', label: 'Net Output', type: 'number', sortable: true },
      ],
    },
  ],
  
  tabs: {
    simple: ['Summary', 'Charts'],
    advanced: ['Summary', 'Dashboard', 'Charts', 'Intelligence'],
  },
  
  defaultMode: 'simple',
  version: '1.0.0',
  isEnabled: true,
  createdAt: '2026-01-04',
  updatedAt: '2026-01-04',
};

// ============================================
// 6. FUNDING + OPEN INTEREST AGENT
// ============================================

const fundingOpenInterest: AgentDefinition = {
  id: 'funding-open-interest',
  slug: 'funding-open-interest',
  name: 'Funding + Open Interest Tracker',
  icon: '📊',
  description: 'Track perpetual futures funding rates and open interest across exchanges to identify market sentiment and potential squeezes.',
  shortDescription: 'Derivatives funding & OI analysis',
  category: 'derivatives',
  modeFit: 'advanced-grade',
  outputType: 'dashboard',
  timeframe: 'intraday',
  dataSources: ['derivatives'],
  chainCoverage: 'agnostic',
  runtime: 'medium',
  planAccess: 'premium',
  signalsUsed: ['Funding Rate', 'Open Interest', 'Long/Short Ratio', 'Basis'],
  previewSentence: 'Analyze funding rates and OI to predict market squeezes',
  
  formSchema: {
    title: 'Funding & OI Analysis',
    description: 'Track derivatives metrics for any asset',
    fields: [
      {
        id: 'symbol',
        type: 'text',
        label: 'Trading Pair',
        placeholder: 'BTC, ETH, SOL',
        required: true,
        showInSimpleMode: true,
      },
    ],
  },
  
  workflowSteps: [
    { id: 'step1', name: 'Fetch Funding Rates', description: 'Getting rates from all exchanges', estimatedTime: 5, status: 'pending' },
    { id: 'step2', name: 'Fetch Open Interest', description: 'Collecting OI data across venues', estimatedTime: 5, status: 'pending' },
    { id: 'step3', name: 'Calculate Aggregates', description: 'Computing weighted averages', estimatedTime: 3, status: 'pending' },
    { id: 'step4', name: 'Identify Anomalies', description: 'Detecting extreme funding/OI levels', estimatedTime: 4, status: 'pending' },
    { id: 'step5', name: 'Generate Signals', description: 'Creating squeeze and sentiment signals', estimatedTime: 3, status: 'pending' },
  ],
  
  charts: [
    { id: 'funding_timeline', type: 'line', title: 'Funding Rate History', dataKey: 'funding_history', xAxis: 'timestamp', yAxis: ['funding_rate'], group: 'derivatives', showInSimpleMode: true, width: 'full' },
    { id: 'oi_timeline', type: 'area', title: 'Open Interest Trend', dataKey: 'oi_history', xAxis: 'timestamp', yAxis: ['open_interest_usd'], group: 'derivatives', showInSimpleMode: true, width: 'full' },
    { id: 'exchange_funding', type: 'bar', title: 'Funding Rate by Exchange', dataKey: 'exchange_funding', xAxis: 'exchange', yAxis: ['funding_rate'], group: 'derivatives' },
    { id: 'exchange_oi', type: 'bar', title: 'OI Distribution', dataKey: 'exchange_oi', xAxis: 'exchange', yAxis: ['oi_usd'], group: 'derivatives' },
    { id: 'long_short', type: 'pie', title: 'Long/Short Ratio', dataKey: 'long_short_ratio', labelKey: 'side', valueKey: 'percentage', group: 'sentiment', showInSimpleMode: true },
  ],
  
  tables: [
    {
      id: 'exchange_metrics',
      title: 'Exchange-wise Metrics',
      dataKey: 'exchanges',
      columns: [
        { key: 'exchange', label: 'Exchange', type: 'text' },
        { key: 'funding_rate', label: 'Funding Rate', type: 'percent', sortable: true },
        { key: 'oi_usd', label: 'Open Interest', type: 'currency', sortable: true },
        { key: 'volume_24h', label: '24h Volume', type: 'currency' },
      ],
    },
  ],
  
  tabs: {
    simple: ['Summary', 'Charts'],
    advanced: ['Summary', 'Dashboard', 'Charts', 'Intelligence'],
  },
  
  defaultMode: 'advanced',
  version: '1.0.0',
  isEnabled: true,
  createdAt: '2026-01-04',
  updatedAt: '2026-01-04',
};

// ============================================
// 7. LIQUIDATION HEATMAP AGENT
// ============================================

const liquidationHeatmap: AgentDefinition = {
  id: 'liquidation-heatmap',
  slug: 'liquidation-heatmap',
  name: 'Liquidation Heatmap',
  icon: '🔥',
  description: 'Visualize liquidation levels across price ranges to identify support/resistance and potential cascade events.',
  shortDescription: 'Liquidation clustering & cascade alerts',
  category: 'derivatives',
  modeFit: 'advanced-grade',
  outputType: 'heatmap',
  timeframe: 'realtime',
  dataSources: ['derivatives', 'lending'],
  chainCoverage: 'agnostic',
  runtime: 'medium',
  planAccess: 'premium',
  signalsUsed: ['Liquidation Levels', 'Leverage Distribution', 'Cascade Risk'],
  previewSentence: 'Map liquidation clusters to predict volatility zones',
  
  formSchema: {
    title: 'Liquidation Analysis',
    description: 'Analyze liquidation levels for an asset',
    fields: [
      {
        id: 'symbol',
        type: 'text',
        label: 'Asset Symbol',
        placeholder: 'BTC, ETH',
        required: true,
        showInSimpleMode: true,
      },
    ],
  },
  
  workflowSteps: [
    { id: 'step1', name: 'Fetch Liquidation Data', description: 'Getting liquidation levels from exchanges', estimatedTime: 8, status: 'pending' },
    { id: 'step2', name: 'Fetch Lending Positions', description: 'Collecting DeFi lending data', estimatedTime: 10, status: 'pending' },
    { id: 'step3', name: 'Calculate Clusters', description: 'Identifying price level clusters', estimatedTime: 5, status: 'pending' },
    { id: 'step4', name: 'Estimate Cascade Risk', description: 'Computing liquidation cascade probability', estimatedTime: 4, status: 'pending' },
    { id: 'step5', name: 'Generate Heatmap', description: 'Creating visualization data', estimatedTime: 3, status: 'pending' },
  ],
  
  charts: [
    { id: 'liq_heatmap', type: 'heatmap', title: 'Liquidation Heatmap', dataKey: 'heatmap_data', group: 'derivatives', showInSimpleMode: true, width: 'full', height: 400 },
    { id: 'liq_clusters', type: 'bar', title: 'Liquidation Density by Price', dataKey: 'clusters', xAxis: 'price_level', yAxis: ['liq_amount_usd'], group: 'derivatives', showInSimpleMode: true, width: 'full' },
    { id: 'cascade_risk', type: 'gauge', title: 'Cascade Risk Score', dataKey: 'cascade_risk_score', group: 'risk', max: 100, showInSimpleMode: true },
    { id: 'leverage_dist', type: 'pie', title: 'Leverage Distribution', dataKey: 'leverage_distribution', labelKey: 'leverage', valueKey: 'amount_usd', group: 'risk' },
  ],
  
  tables: [
    {
      id: 'key_levels',
      title: 'Key Liquidation Levels',
      dataKey: 'key_levels',
      columns: [
        { key: 'price', label: 'Price Level', type: 'currency', sortable: true },
        { key: 'liq_amount_usd', label: 'Liquidation Amount', type: 'currency', sortable: true },
        { key: 'distance_percent', label: 'Distance from Current', type: 'percent' },
        { key: 'side', label: 'Side', type: 'text' },
      ],
    },
  ],
  
  tabs: {
    simple: ['Summary', 'Charts'],
    advanced: ['Summary', 'Dashboard', 'Charts', 'Intelligence'],
  },
  
  defaultMode: 'advanced',
  version: '1.0.0',
  isEnabled: true,
  createdAt: '2026-01-04',
  updatedAt: '2026-01-04',
};

// ============================================
// 8. CEX LIQUIDITY & MARKET QUALITY AGENT
// ============================================

const cexLiquidityQuality: AgentDefinition = {
  id: 'cex-liquidity-quality',
  slug: 'cex-liquidity-quality',
  name: 'CEX Liquidity & Market Quality',
  icon: '📈',
  description: 'Analyze centralized exchange order book depth, spread, market impact, and overall liquidity quality across major trading pairs.',
  shortDescription: 'Exchange liquidity depth & spread analysis',
  category: 'cex',
  modeFit: 'both',
  outputType: 'dashboard',
  timeframe: 'realtime',
  dataSources: ['spot'],
  chainCoverage: 'agnostic',
  runtime: 'fast',
  planAccess: 'free',
  signalsUsed: ['Order Book Depth', 'Bid-Ask Spread', 'Market Impact', 'Liquidity Score'],
  previewSentence: 'Compare exchange liquidity and find the best venue for large trades',
  
  formSchema: {
    title: 'CEX Liquidity Analysis',
    description: 'Analyze liquidity across exchanges',
    fields: [
      {
        id: 'trading_pair',
        type: 'text',
        label: 'Trading Pair',
        placeholder: 'BTC/USDT',
        required: true,
        showInSimpleMode: true,
      },
      {
        id: 'trade_size',
        type: 'number',
        label: 'Trade Size (USD)',
        placeholder: '100000',
        defaultValue: '100000',
        showInSimpleMode: true,
      },
    ],
  },
  
  workflowSteps: [
    { id: 'step1', name: 'Fetch Order Books', description: 'Getting order book data from major exchanges', estimatedTime: 5, status: 'pending' },
    { id: 'step2', name: 'Calculate Depth', description: 'Computing liquidity at price levels', estimatedTime: 3, status: 'pending' },
    { id: 'step3', name: 'Compute Spread', description: 'Analyzing bid-ask spreads', estimatedTime: 2, status: 'pending' },
    { id: 'step4', name: 'Simulate Market Impact', description: 'Estimating slippage for trade size', estimatedTime: 4, status: 'pending' },
    { id: 'step5', name: 'Rank Exchanges', description: 'Scoring liquidity quality', estimatedTime: 2, status: 'pending' },
  ],
  
  charts: [
    { id: 'depth_comparison', type: 'bar', title: 'Order Book Depth by Exchange', dataKey: 'depth_comparison', xAxis: 'exchange', yAxis: ['bid_depth', 'ask_depth'], group: 'core', showInSimpleMode: true, width: 'full' },
    { id: 'spread_chart', type: 'bar', title: 'Bid-Ask Spread', dataKey: 'spread_data', xAxis: 'exchange', yAxis: ['spread_bps'], group: 'core', showInSimpleMode: true },
    { id: 'market_impact', type: 'line', title: 'Market Impact by Size', dataKey: 'impact_curve', xAxis: 'trade_size_usd', yAxis: ['slippage_percent'], group: 'risk' },
    { id: 'liquidity_score', type: 'radar', title: 'Liquidity Score Breakdown', dataKey: 'liquidity_scores', labelKey: 'metric', group: 'core', showInSimpleMode: true },
  ],
  
  tables: [
    {
      id: 'exchange_metrics',
      title: 'Exchange Comparison',
      dataKey: 'exchanges',
      columns: [
        { key: 'exchange', label: 'Exchange', type: 'text' },
        { key: 'bid_depth', label: 'Bid Depth', type: 'currency', sortable: true },
        { key: 'ask_depth', label: 'Ask Depth', type: 'currency', sortable: true },
        { key: 'spread_bps', label: 'Spread (bps)', type: 'number', sortable: true },
        { key: 'slippage_percent', label: 'Est. Slippage', type: 'percent' },
        { key: 'liquidity_score', label: 'Score', type: 'number', sortable: true },
      ],
    },
  ],
  
  tabs: {
    simple: ['Summary', 'Charts'],
    advanced: ['Summary', 'Dashboard', 'Charts', 'Intelligence'],
  },
  
  defaultMode: 'simple',
  version: '1.0.0',
  isEnabled: true,
  createdAt: '2026-01-04',
  updatedAt: '2026-01-04',
};

// ============================================
// 9. MEV & SANDWICH PROTECTION AGENT
// ============================================

const mevProtection: AgentDefinition = {
  id: 'mev-protection',
  slug: 'mev-protection',
  name: 'MEV & Sandwich Protection',
  icon: '🥪',
  description: 'Detect MEV opportunities and sandwich attack risks for your transaction. Get optimal slippage and gas settings for protection.',
  shortDescription: 'MEV detection & sandwich attack protection',
  category: 'dex',
  modeFit: 'advanced-grade',
  outputType: 'trade-setup',
  timeframe: 'realtime',
  dataSources: ['onchain', 'dex'],
  chainCoverage: 'evm-chains',
  runtime: 'fast',
  planAccess: 'advanced',
  signalsUsed: ['MEV Bot Activity', 'Pool Liquidity', 'Gas Price', 'Block Position'],
  previewSentence: 'Protect your swaps from MEV bots and sandwich attacks',
  
  formSchema: {
    title: 'MEV Protection Analysis',
    description: 'Analyze MEV risk for your transaction',
    fields: [
      {
        id: 'token_in',
        type: 'text',
        label: 'Token You\'re Selling',
        placeholder: 'ETH or 0x...',
        required: true,
        showInSimpleMode: true,
      },
      {
        id: 'token_out',
        type: 'text',
        label: 'Token You\'re Buying',
        placeholder: 'USDC or 0x...',
        required: true,
        showInSimpleMode: true,
      },
      {
        id: 'amount',
        type: 'number',
        label: 'Amount',
        placeholder: '1000',
        required: true,
        showInSimpleMode: true,
      },
      {
        id: 'chain',
        type: 'select',
        label: 'Chain',
        defaultValue: 'ethereum',
        showInSimpleMode: true,
        options: [
          { value: 'ethereum', label: 'Ethereum' },
          { value: 'arbitrum', label: 'Arbitrum' },
          { value: 'optimism', label: 'Optimism' },
        ],
      },
    ],
  },
  
  workflowSteps: [
    { id: 'step1', name: 'Analyze Pool Liquidity', description: 'Checking DEX pool depth', estimatedTime: 3, status: 'pending' },
    { id: 'step2', name: 'Detect MEV Bots', description: 'Scanning for active MEV searchers', estimatedTime: 5, status: 'pending' },
    { id: 'step3', name: 'Simulate Attack', description: 'Estimating sandwich attack profitability', estimatedTime: 4, status: 'pending' },
    { id: 'step4', name: 'Calculate Optimal Settings', description: 'Computing safe slippage and gas', estimatedTime: 3, status: 'pending' },
    { id: 'step5', name: 'Generate Protection Strategy', description: 'Creating execution recommendations', estimatedTime: 2, status: 'pending' },
  ],
  
  charts: [
    { id: 'mev_risk_gauge', type: 'gauge', title: 'MEV Risk Level', dataKey: 'mev_risk_score', group: 'risk', max: 100, showInSimpleMode: true },
    { id: 'slippage_protection', type: 'line', title: 'Slippage vs MEV Risk', dataKey: 'slippage_curve', xAxis: 'slippage_percent', yAxis: ['mev_profit_potential'], group: 'risk', showInSimpleMode: true },
    { id: 'gas_timing', type: 'bar', title: 'Optimal Gas by Time', dataKey: 'gas_recommendations', xAxis: 'time_slot', yAxis: ['gas_price_gwei'], group: 'core' },
    { id: 'bot_activity', type: 'line', title: 'MEV Bot Activity (24h)', dataKey: 'bot_activity_history', xAxis: 'timestamp', yAxis: ['bot_count'], group: 'sentiment' },
  ],
  
  tables: [
    {
      id: 'protection_recommendations',
      title: 'Recommended Settings',
      dataKey: 'recommendations',
      columns: [
        { key: 'strategy', label: 'Strategy', type: 'text' },
        { key: 'slippage', label: 'Slippage', type: 'percent' },
        { key: 'gas_price', label: 'Gas Price', type: 'number' },
        { key: 'mev_risk', label: 'MEV Risk', type: 'severity' },
        { key: 'success_prob', label: 'Success Rate', type: 'percent' },
      ],
    },
  ],
  
  tabs: {
    simple: ['Summary', 'Charts'],
    advanced: ['Summary', 'Dashboard', 'Charts', 'Intelligence'],
  },
  
  defaultMode: 'simple',
  version: '1.0.0',
  isEnabled: true,
  createdAt: '2026-01-04',
  updatedAt: '2026-01-04',
};

// ============================================
// 10. MISPRICING / ARBITRAGE DETECTOR
// ============================================

const arbitrageDetector: AgentDefinition = {
  id: 'arbitrage-detector',
  slug: 'arbitrage-detector',
  name: 'Mispricing / Arbitrage Detector',
  icon: '💰',
  description: 'Find arbitrage opportunities across CEXs, DEXs, and derivatives markets with real-time price discrepancies and execution paths.',
  shortDescription: 'Cross-exchange arbitrage finder',
  category: 'defi',
  modeFit: 'advanced-grade',
  outputType: 'trade-setup',
  timeframe: 'realtime',
  dataSources: ['spot', 'derivatives', 'dex'],
  chainCoverage: 'multi-chain',
  runtime: 'fast',
  planAccess: 'premium',
  signalsUsed: ['Price Spreads', 'Funding Arbitrage', 'Triangular Arb', 'Cross-Chain Opportunities'],
  previewSentence: 'Discover profitable arbitrage across all markets in real-time',
  
  formSchema: {
    title: 'Arbitrage Scanner',
    description: 'Scan for arbitrage opportunities',
    fields: [
      {
        id: 'asset',
        type: 'text',
        label: 'Asset',
        placeholder: 'BTC, ETH, or any token',
        required: true,
        showInSimpleMode: true,
      },
      {
        id: 'min_profit_percent',
        type: 'number',
        label: 'Min Profit %',
        placeholder: '0.5',
        defaultValue: '0.5',
        showInSimpleMode: true,
      },
    ],
  },
  
  workflowSteps: [
    { id: 'step1', name: 'Fetch All Prices', description: 'Getting prices from CEXs, DEXs, derivatives', estimatedTime: 6, status: 'pending' },
    { id: 'step2', name: 'Detect Spreads', description: 'Finding price discrepancies', estimatedTime: 3, status: 'pending' },
    { id: 'step3', name: 'Calculate Costs', description: 'Factoring in gas, fees, slippage', estimatedTime: 4, status: 'pending' },
    { id: 'step4', name: 'Validate Liquidity', description: 'Checking if arb is executable', estimatedTime: 3, status: 'pending' },
    { id: 'step5', name: 'Rank Opportunities', description: 'Sorting by net profitability', estimatedTime: 2, status: 'pending' },
  ],
  
  charts: [
    { id: 'arb_opportunities', type: 'bar', title: 'Top Arbitrage Opportunities', dataKey: 'opportunities', xAxis: 'route', yAxis: ['net_profit_percent'], group: 'core', showInSimpleMode: true, width: 'full' },
    { id: 'price_comparison', type: 'bar', title: 'Price by Venue', dataKey: 'price_comparison', xAxis: 'venue', yAxis: ['price'], group: 'market', showInSimpleMode: true },
    { id: 'profit_timeline', type: 'line', title: 'Profit Trend (1h)', dataKey: 'profit_history', xAxis: 'timestamp', yAxis: ['max_profit_percent'], group: 'core' },
    { id: 'triangular_arb', type: 'scatter', title: 'Triangular Opportunities', dataKey: 'triangular_arbs', xAxis: 'complexity', yAxis: ['profit_percent'], group: 'market' },
  ],
  
  tables: [
    {
      id: 'arb_details',
      title: 'Arbitrage Opportunities',
      dataKey: 'arbitrage_list',
      columns: [
        { key: 'type', label: 'Type', type: 'text' },
        { key: 'route', label: 'Route', type: 'text' },
        { key: 'gross_profit', label: 'Gross Profit', type: 'percent', sortable: true },
        { key: 'costs', label: 'Total Costs', type: 'percent' },
        { key: 'net_profit', label: 'Net Profit', type: 'percent', sortable: true },
        { key: 'executable', label: 'Executable', type: 'status' },
      ],
    },
  ],
  
  tabs: {
    simple: ['Summary', 'Charts'],
    advanced: ['Summary', 'Dashboard', 'Charts', 'Intelligence'],
  },
  
  defaultMode: 'advanced',
  version: '1.0.0',
  isEnabled: true,
  createdAt: '2026-01-04',
  updatedAt: '2026-01-04',
};

// ============================================
// 11. IMPLIED PROBABILITY AGENT
// ============================================

const impliedProbability: AgentDefinition = {
  id: 'implied-probability',
  slug: 'implied-probability',
  name: 'Implied Probability Calculator',
  icon: '🎲',
  description: 'Calculate implied probabilities from options, prediction markets, and futures to identify mispriced events and opportunities.',
  shortDescription: 'Options & prediction market probabilities',
  category: 'prediction-markets',
  modeFit: 'advanced-grade',
  outputType: 'report',
  timeframe: 'swing',
  dataSources: ['derivatives', 'spot'],
  chainCoverage: 'agnostic',
  runtime: 'medium',
  planAccess: 'premium',
  signalsUsed: ['Options IV', 'Put/Call Ratio', 'Futures Basis', 'Prediction Market Odds'],
  previewSentence: 'Extract market probabilities from derivatives pricing',
  
  formSchema: {
    title: 'Probability Analysis',
    description: 'Calculate implied probabilities for events',
    fields: [
      {
        id: 'asset',
        type: 'text',
        label: 'Asset',
        placeholder: 'BTC, ETH',
        required: true,
        showInSimpleMode: true,
      },
      {
        id: 'event_date',
        type: 'date',
        label: 'Event Date',
        placeholder: 'Select date',
        showInSimpleMode: true,
      },
    ],
  },
  
  workflowSteps: [
    { id: 'step1', name: 'Fetch Options Chain', description: 'Getting options data', estimatedTime: 5, status: 'pending' },
    { id: 'step2', name: 'Calculate Implied Vol', description: 'Computing IV from options prices', estimatedTime: 4, status: 'pending' },
    { id: 'step3', name: 'Extract Probabilities', description: 'Deriving probability distributions', estimatedTime: 5, status: 'pending' },
    { id: 'step4', name: 'Check Prediction Markets', description: 'Comparing with prediction market odds', estimatedTime: 3, status: 'pending' },
    { id: 'step5', name: 'Identify Mispricings', description: 'Finding probability discrepancies', estimatedTime: 3, status: 'pending' },
  ],
  
  charts: [
    { id: 'prob_distribution', type: 'area', title: 'Implied Probability Distribution', dataKey: 'probability_curve', xAxis: 'price', yAxis: ['probability'], group: 'core', showInSimpleMode: true, width: 'full' },
    { id: 'iv_skew', type: 'line', title: 'Volatility Skew', dataKey: 'iv_skew', xAxis: 'strike', yAxis: ['implied_vol'], group: 'derivatives' },
    { id: 'put_call_ratio', type: 'bar', title: 'Put/Call Ratio by Strike', dataKey: 'put_call_data', xAxis: 'strike', yAxis: ['ratio'], group: 'sentiment', showInSimpleMode: true },
    { id: 'event_odds', type: 'pie', title: 'Event Probability Breakdown', dataKey: 'event_probabilities', labelKey: 'scenario', valueKey: 'probability', group: 'core', showInSimpleMode: true },
  ],
  
  tables: [
    {
      id: 'key_strikes',
      title: 'Key Strike Levels',
      dataKey: 'strikes',
      columns: [
        { key: 'strike', label: 'Strike', type: 'currency', sortable: true },
        { key: 'probability', label: 'Probability', type: 'percent' },
        { key: 'implied_move', label: 'Implied Move', type: 'percent' },
        { key: 'open_interest', label: 'Open Interest', type: 'number' },
      ],
    },
  ],
  
  tabs: {
    simple: ['Summary', 'Charts'],
    advanced: ['Summary', 'Dashboard', 'Charts', 'Intelligence'],
  },
  
  defaultMode: 'advanced',
  version: '1.0.0',
  isEnabled: true,
  createdAt: '2026-01-04',
  updatedAt: '2026-01-04',
};

// ============================================
// 12. NFT COLLECTION DEEP DIVE
// ============================================

const nftCollectionDeepDive: AgentDefinition = {
  id: 'nft-collection-deep-dive',
  slug: 'nft-collection-deep-dive',
  name: 'NFT Collection Deep Dive',
  icon: '🖼️',
  description: 'Comprehensive NFT collection analysis including floor price trends, holder distribution, trait rarity, wash trading detection, and collection health metrics.',
  shortDescription: 'Complete NFT collection analytics',
  category: 'nfts',
  modeFit: 'both',
  outputType: 'dashboard',
  timeframe: 'intraday',
  dataSources: ['onchain', 'spot'],
  chainCoverage: 'multi-chain',
  runtime: 'medium',
  planAccess: 'free',
  signalsUsed: ['Floor Price', 'Volume', 'Holder Count', 'Trait Rarity', 'Wash Trading'],
  previewSentence: 'Deep analysis of NFT collections with rarity and market insights',
  
  formSchema: {
    title: 'NFT Collection Analysis',
    description: 'Analyze any NFT collection',
    fields: [
      {
        id: 'collection_address',
        type: 'text',
        label: 'Collection Address',
        placeholder: '0x...',
        required: true,
        showInSimpleMode: true,
      },
      {
        id: 'chain',
        type: 'select',
        label: 'Chain',
        defaultValue: 'ethereum',
        showInSimpleMode: true,
        options: [
          { value: 'ethereum', label: 'Ethereum' },
          { value: 'polygon', label: 'Polygon' },
          { value: 'solana', label: 'Solana' },
        ],
      },
    ],
  },
  
  workflowSteps: [
    { id: 'step1', name: 'Fetch Collection Data', description: 'Getting collection metadata', estimatedTime: 5, status: 'pending' },
    { id: 'step2', name: 'Analyze Floor Price', description: 'Tracking price trends', estimatedTime: 4, status: 'pending' },
    { id: 'step3', name: 'Calculate Trait Rarity', description: 'Computing rarity scores', estimatedTime: 6, status: 'pending' },
    { id: 'step4', name: 'Check Holder Distribution', description: 'Analyzing holder concentration', estimatedTime: 4, status: 'pending' },
    { id: 'step5', name: 'Detect Wash Trading', description: 'Identifying suspicious activity', estimatedTime: 5, status: 'pending' },
    { id: 'step6', name: 'Generate Health Score', description: 'Computing collection metrics', estimatedTime: 2, status: 'pending' },
  ],
  
  charts: [
    { id: 'floor_price_trend', type: 'line', title: 'Floor Price Trend', dataKey: 'floor_price_history', xAxis: 'date', yAxis: ['floor_price_eth'], group: 'market', showInSimpleMode: true, width: 'full' },
    { id: 'volume_trend', type: 'bar', title: 'Volume Trend', dataKey: 'volume_history', xAxis: 'date', yAxis: ['volume_eth'], group: 'market', showInSimpleMode: true },
    { id: 'holder_distribution', type: 'pie', title: 'Holder Distribution', dataKey: 'holder_breakdown', labelKey: 'category', valueKey: 'percentage', group: 'core', showInSimpleMode: true },
    { id: 'trait_rarity', type: 'bar', title: 'Trait Rarity Distribution', dataKey: 'trait_distribution', xAxis: 'trait', yAxis: ['count'], group: 'core' },
    { id: 'health_score', type: 'gauge', title: 'Collection Health Score', dataKey: 'health_score', group: 'core', max: 100, showInSimpleMode: true },
  ],
  
  tables: [
    {
      id: 'top_sales',
      title: 'Recent Top Sales',
      dataKey: 'top_sales',
      columns: [
        { key: 'token_id', label: 'Token ID', type: 'text' },
        { key: 'price_eth', label: 'Price', type: 'number', sortable: true },
        { key: 'buyer', label: 'Buyer', type: 'address' },
        { key: 'date', label: 'Date', type: 'date' },
      ],
    },
    {
      id: 'trait_analysis',
      title: 'Valuable Traits',
      dataKey: 'valuable_traits',
      columns: [
        { key: 'trait_type', label: 'Trait Type', type: 'text' },
        { key: 'trait_value', label: 'Value', type: 'text' },
        { key: 'rarity_percent', label: 'Rarity', type: 'percent' },
        { key: 'avg_price_premium', label: 'Price Premium', type: 'percent', sortable: true },
      ],
    },
  ],
  
  tabs: {
    simple: ['Summary', 'Dashboard', 'Charts'],
    advanced: ['Summary', 'Dashboard', 'Charts', 'Intelligence'],
  },
  
  defaultMode: 'simple',
  version: '1.0.0',
  isEnabled: true,
  createdAt: '2026-01-04',
  updatedAt: '2026-01-04',
};

// ============================================
// 13. NFT SAFETY & SCAM DETECTOR
// ============================================

const nftSafetyChecker: AgentDefinition = {
  id: 'nft-safety-checker',
  slug: 'nft-safety-checker',
  name: 'NFT Safety & Scam Detector',
  icon: '🛡️',
  description: 'Detect NFT scams, rugpulls, and suspicious collections. Verify contract safety, check team legitimacy, and identify red flags.',
  shortDescription: 'NFT scam detection & safety audit',
  category: 'nfts',
  modeFit: 'both',
  outputType: 'report',
  timeframe: 'realtime',
  dataSources: ['onchain', 'social'],
  chainCoverage: 'multi-chain',
  runtime: 'fast',
  planAccess: 'free',
  signalsUsed: ['Contract Verification', 'Team Doxx', 'Social Signals', 'Holder Patterns'],
  previewSentence: 'Protect yourself from NFT scams and rugpulls',
  
  formSchema: {
    title: 'NFT Safety Check',
    description: 'Verify NFT collection safety',
    fields: [
      {
        id: 'collection_address',
        type: 'text',
        label: 'Collection Address',
        placeholder: '0x...',
        required: true,
        showInSimpleMode: true,
      },
      {
        id: 'chain',
        type: 'select',
        label: 'Chain',
        defaultValue: 'ethereum',
        showInSimpleMode: true,
        options: [
          { value: 'ethereum', label: 'Ethereum' },
          { value: 'polygon', label: 'Polygon' },
        ],
      },
    ],
  },
  
  workflowSteps: [
    { id: 'step1', name: 'Verify Contract', description: 'Checking contract verification status', estimatedTime: 3, status: 'pending' },
    { id: 'step2', name: 'Analyze Minting', description: 'Reviewing mint mechanics', estimatedTime: 4, status: 'pending' },
    { id: 'step3', name: 'Check Team', description: 'Verifying team legitimacy', estimatedTime: 5, status: 'pending' },
    { id: 'step4', name: 'Social Analysis', description: 'Analyzing social signals', estimatedTime: 4, status: 'pending' },
    { id: 'step5', name: 'Detect Red Flags', description: 'Identifying scam indicators', estimatedTime: 3, status: 'pending' },
  ],
  
  charts: [
    { id: 'safety_gauge', type: 'gauge', title: 'Safety Score', dataKey: 'safety_score', group: 'risk', max: 100, showInSimpleMode: true },
    { id: 'risk_breakdown', type: 'radar', title: 'Risk Assessment', dataKey: 'risk_metrics', labelKey: 'category', group: 'risk', showInSimpleMode: true },
    { id: 'mint_pattern', type: 'line', title: 'Minting Pattern', dataKey: 'mint_history', xAxis: 'block', yAxis: ['mints_count'], group: 'core' },
  ],
  
  tables: [
    {
      id: 'safety_checks',
      title: 'Safety Checks',
      dataKey: 'safety_checks',
      columns: [
        { key: 'check', label: 'Check', type: 'text' },
        { key: 'status', label: 'Status', type: 'status' },
        { key: 'severity', label: 'Risk', type: 'severity' },
        { key: 'details', label: 'Details', type: 'text' },
      ],
    },
  ],
  
  tabs: {
    simple: ['Summary', 'Charts'],
    advanced: ['Summary', 'Dashboard', 'Charts', 'Intelligence'],
  },
  
  defaultMode: 'simple',
  version: '1.0.0',
  isEnabled: true,
  createdAt: '2026-01-04',
  updatedAt: '2026-01-04',
};

// ============================================
// 14. DEFI PROTOCOL DEEP DIVE
// ============================================

const defiProtocolDeepDive: AgentDefinition = {
  id: 'defi-protocol-deep-dive',
  slug: 'defi-protocol-deep-dive',
  name: 'DeFi Protocol Deep Dive',
  icon: '🏦',
  description: 'Comprehensive DeFi protocol analysis including TVL trends, yields, security audits, tokenomics, governance, and protocol health metrics.',
  shortDescription: 'Complete DeFi protocol analytics',
  category: 'defi',
  modeFit: 'both',
  outputType: 'dashboard',
  timeframe: 'swing',
  dataSources: ['onchain', 'defi'],
  chainCoverage: 'multi-chain',
  runtime: 'medium',
  planAccess: 'free',
  signalsUsed: ['TVL', 'APY', 'Security Score', 'Token Price', 'Governance Activity'],
  previewSentence: 'Deep analysis of DeFi protocols with risk and yield insights',
  
  formSchema: {
    title: 'DeFi Protocol Analysis',
    description: 'Analyze any DeFi protocol',
    fields: [
      {
        id: 'protocol_name',
        type: 'text',
        label: 'Protocol Name',
        placeholder: 'Aave, Uniswap, Curve',
        required: true,
        showInSimpleMode: true,
      },
    ],
  },
  
  workflowSteps: [
    { id: 'step1', name: 'Fetch Protocol Data', description: 'Getting protocol metrics', estimatedTime: 5, status: 'pending' },
    { id: 'step2', name: 'Analyze TVL', description: 'Tracking TVL trends', estimatedTime: 4, status: 'pending' },
    { id: 'step3', name: 'Calculate Yields', description: 'Computing real yields', estimatedTime: 4, status: 'pending' },
    { id: 'step4', name: 'Check Security', description: 'Reviewing audits and exploits', estimatedTime: 5, status: 'pending' },
    { id: 'step5', name: 'Analyze Tokenomics', description: 'Reviewing token metrics', estimatedTime: 4, status: 'pending' },
    { id: 'step6', name: 'Health Assessment', description: 'Computing protocol health', estimatedTime: 2, status: 'pending' },
  ],
  
  charts: [
    { id: 'tvl_trend', type: 'area', title: 'TVL Trend', dataKey: 'tvl_history', xAxis: 'date', yAxis: ['tvl_usd'], group: 'market', showInSimpleMode: true, width: 'full' },
    { id: 'yield_comparison', type: 'bar', title: 'Yield by Pool', dataKey: 'pool_yields', xAxis: 'pool_name', yAxis: ['apy'], group: 'core', showInSimpleMode: true },
    { id: 'token_price', type: 'line', title: 'Token Price', dataKey: 'token_price_history', xAxis: 'date', yAxis: ['price_usd'], group: 'market' },
    { id: 'health_score', type: 'gauge', title: 'Protocol Health', dataKey: 'health_score', group: 'core', max: 100, showInSimpleMode: true },
    { id: 'revenue_breakdown', type: 'pie', title: 'Revenue Sources', dataKey: 'revenue_breakdown', labelKey: 'source', valueKey: 'amount_usd', group: 'market' },
  ],
  
  tables: [
    {
      id: 'top_pools',
      title: 'Top Yield Pools',
      dataKey: 'pools',
      columns: [
        { key: 'pool_name', label: 'Pool', type: 'text' },
        { key: 'tvl_usd', label: 'TVL', type: 'currency', sortable: true },
        { key: 'apy', label: 'APY', type: 'percent', sortable: true },
        { key: 'volume_24h', label: '24h Volume', type: 'currency' },
        { key: 'risk_score', label: 'Risk', type: 'severity' },
      ],
    },
  ],
  
  tabs: {
    simple: ['Summary', 'Dashboard', 'Charts'],
    advanced: ['Summary', 'Dashboard', 'Charts', 'Intelligence'],
  },
  
  defaultMode: 'simple',
  version: '1.0.0',
  isEnabled: true,
  createdAt: '2026-01-04',
  updatedAt: '2026-01-04',
};

// ============================================
// 15. STABLECOIN DEPEG RISK AGENT
// ============================================

const stablecoinDepegRisk: AgentDefinition = {
  id: 'stablecoin-depeg-risk',
  slug: 'stablecoin-depeg-risk',
  name: 'Stablecoin Depeg Risk Monitor',
  icon: '⚖️',
  description: 'Monitor stablecoin peg stability, collateral health, redemption risks, and early warning signals for potential depegs.',
  shortDescription: 'Stablecoin peg health & depeg alerts',
  category: 'defi',
  modeFit: 'both',
  outputType: 'alerts',
  timeframe: 'realtime',
  dataSources: ['onchain', 'spot', 'dex'],
  chainCoverage: 'multi-chain',
  runtime: 'fast',
  planAccess: 'free',
  signalsUsed: ['Peg Deviation', 'Collateral Ratio', 'Redemption Volume', 'DEX Liquidity'],
  previewSentence: 'Real-time stablecoin peg monitoring with depeg alerts',
  
  formSchema: {
    title: 'Stablecoin Monitor',
    description: 'Monitor stablecoin peg health',
    fields: [
      {
        id: 'stablecoin',
        type: 'select',
        label: 'Stablecoin',
        showInSimpleMode: true,
        options: [
          { value: 'usdt', label: 'USDT' },
          { value: 'usdc', label: 'USDC' },
          { value: 'dai', label: 'DAI' },
          { value: 'frax', label: 'FRAX' },
          { value: 'lusd', label: 'LUSD' },
        ],
      },
    ],
  },
  
  workflowSteps: [
    { id: 'step1', name: 'Fetch Peg Data', description: 'Getting price across exchanges', estimatedTime: 3, status: 'pending' },
    { id: 'step2', name: 'Check Collateral', description: 'Analyzing backing assets', estimatedTime: 5, status: 'pending' },
    { id: 'step3', name: 'Monitor Redemptions', description: 'Tracking redemption activity', estimatedTime: 3, status: 'pending' },
    { id: 'step4', name: 'Analyze Liquidity', description: 'Checking DEX liquidity depth', estimatedTime: 4, status: 'pending' },
    { id: 'step5', name: 'Calculate Risk Score', description: 'Computing depeg risk', estimatedTime: 2, status: 'pending' },
  ],
  
  charts: [
    { id: 'peg_deviation', type: 'line', title: 'Peg Deviation (24h)', dataKey: 'peg_history', xAxis: 'timestamp', yAxis: ['price_usd'], group: 'core', showInSimpleMode: true, width: 'full' },
    { id: 'exchange_prices', type: 'bar', title: 'Price by Exchange', dataKey: 'exchange_prices', xAxis: 'exchange', yAxis: ['price'], group: 'market', showInSimpleMode: true },
    { id: 'collateral_ratio', type: 'gauge', title: 'Collateral Ratio', dataKey: 'collateral_ratio', group: 'risk', max: 150, showInSimpleMode: true },
    { id: 'liquidity_depth', type: 'bar', title: 'DEX Liquidity Depth', dataKey: 'dex_liquidity', xAxis: 'dex', yAxis: ['liquidity_usd'], group: 'market' },
    { id: 'redemption_volume', type: 'line', title: 'Redemption Volume', dataKey: 'redemption_history', xAxis: 'date', yAxis: ['volume_usd'], group: 'flow' },
  ],
  
  tables: [
    {
      id: 'risk_indicators',
      title: 'Risk Indicators',
      dataKey: 'risk_indicators',
      columns: [
        { key: 'indicator', label: 'Indicator', type: 'text' },
        { key: 'value', label: 'Current Value', type: 'text' },
        { key: 'threshold', label: 'Safe Threshold', type: 'text' },
        { key: 'status', label: 'Status', type: 'status' },
        { key: 'risk', label: 'Risk Level', type: 'severity' },
      ],
    },
  ],
  
  tabs: {
    simple: ['Summary', 'Charts'],
    advanced: ['Summary', 'Dashboard', 'Charts', 'Intelligence'],
  },
  
  defaultMode: 'simple',
  version: '1.0.0',
  isEnabled: true,
  createdAt: '2026-01-04',
  updatedAt: '2026-01-04',
};

// ============================================
// 16. LISTINGS & DELISTINGS MONITOR
// ============================================

const listingsMonitor: AgentDefinition = {
  id: 'listings-monitor',
  slug: 'listings-monitor',
  name: 'Listings & Delistings Monitor',
  icon: '📋',
  description: 'Track upcoming exchange listings, delisting risks, and volume migration patterns to capture listing pumps and avoid delisting dumps.',
  shortDescription: 'Exchange listing & delisting tracker',
  category: 'cex',
  modeFit: 'both',
  outputType: 'alerts',
  timeframe: 'intraday',
  dataSources: ['spot', 'news', 'social'],
  chainCoverage: 'agnostic',
  runtime: 'fast',
  planAccess: 'free',
  signalsUsed: ['Listing Announcements', 'Volume Changes', 'Exchange Additions', 'Delisting Warnings'],
  previewSentence: 'Get early alerts on listings and delistings before the market reacts',
  
  formSchema: {
    title: 'Listings Monitor',
    description: 'Track listings for any asset',
    fields: [
      {
        id: 'asset',
        type: 'text',
        label: 'Asset Symbol',
        placeholder: 'BTC, ETH, any token',
        required: true,
        showInSimpleMode: true,
      },
    ],
  },
  
  workflowSteps: [
    { id: 'step1', name: 'Scan Announcements', description: 'Monitoring exchange announcements', estimatedTime: 4, status: 'pending' },
    { id: 'step2', name: 'Check Volume Distribution', description: 'Analyzing exchange volumes', estimatedTime: 3, status: 'pending' },
    { id: 'step3', name: 'Detect Migrations', description: 'Tracking volume shifts', estimatedTime: 3, status: 'pending' },
    { id: 'step4', name: 'Assess Delisting Risk', description: 'Identifying at-risk exchanges', estimatedTime: 4, status: 'pending' },
    { id: 'step5', name: 'Generate Alerts', description: 'Creating actionable signals', estimatedTime: 2, status: 'pending' },
  ],
  
  charts: [
    { id: 'exchange_count', type: 'line', title: 'Exchange Count Over Time', dataKey: 'exchange_history', xAxis: 'date', yAxis: ['exchange_count'], group: 'market', showInSimpleMode: true, width: 'full' },
    { id: 'volume_distribution', type: 'pie', title: 'Volume by Exchange', dataKey: 'volume_breakdown', labelKey: 'exchange', valueKey: 'volume_percent', group: 'market', showInSimpleMode: true },
    { id: 'listing_impact', type: 'line', title: 'Price Impact of Listings', dataKey: 'listing_events', xAxis: 'date', yAxis: ['price_change_percent'], group: 'market' },
  ],
  
  tables: [
    {
      id: 'upcoming_listings',
      title: 'Upcoming Listings',
      dataKey: 'upcoming_listings',
      columns: [
        { key: 'exchange', label: 'Exchange', type: 'text' },
        { key: 'listing_date', label: 'Date', type: 'date', sortable: true },
        { key: 'trading_pairs', label: 'Pairs', type: 'text' },
        { key: 'exchange_tier', label: 'Tier', type: 'text' },
        { key: 'expected_impact', label: 'Expected Impact', type: 'severity' },
      ],
    },
    {
      id: 'delisting_risks',
      title: 'Delisting Risks',
      dataKey: 'delisting_risks',
      columns: [
        { key: 'exchange', label: 'Exchange', type: 'text' },
        { key: 'volume_24h', label: '24h Volume', type: 'currency' },
        { key: 'risk_score', label: 'Risk Score', type: 'severity', sortable: true },
        { key: 'reason', label: 'Reason', type: 'text' },
      ],
    },
  ],
  
  tabs: {
    simple: ['Summary', 'Charts'],
    advanced: ['Summary', 'Dashboard', 'Charts', 'Intelligence'],
  },
  
  defaultMode: 'simple',
  version: '1.0.0',
  isEnabled: true,
  createdAt: '2026-01-04',
  updatedAt: '2026-01-04',
};

// ============================================
// EXPORT ALL AGENTS
// ============================================

export const AGENT_REGISTRY: Record<string, AgentDefinition> = {
  'chain-health-monitor': chainHealthMonitor,
  'gas-fee-intelligence': gasFeeIntelligence,
  'token-deep-dive': tokenDeepDive,
  'token-safety-checker': tokenSafetyChecker,
  'best-route-swap': bestRouteSwap,
  'funding-open-interest': fundingOpenInterest,
  'liquidation-heatmap': liquidationHeatmap,
  'cex-liquidity-quality': cexLiquidityQuality,
  'mev-protection': mevProtection,
  'arbitrage-detector': arbitrageDetector,
  'implied-probability': impliedProbability,
  'nft-collection-deep-dive': nftCollectionDeepDive,
  'nft-safety-checker': nftSafetyChecker,
  'defi-protocol-deep-dive': defiProtocolDeepDive,
  'stablecoin-depeg-risk': stablecoinDepegRisk,
  'listings-monitor': listingsMonitor,
};

// Export as array for AIAgents.tsx
export const agentRegistry: AgentDefinition[] = Object.values(AGENT_REGISTRY).filter(agent => agent.isEnabled);

export const getAgentBySlug = (slug: string): AgentDefinition | undefined => {
  return AGENT_REGISTRY[slug];
};

export const getAllAgents = (): AgentDefinition[] => {
  return Object.values(AGENT_REGISTRY).filter(agent => agent.isEnabled);
};

export const getAgentsByCategory = (category: string): AgentDefinition[] => {
  return getAllAgents().filter(agent => agent.category === category);
};

export const getAgentsByModeFit = (modeFit: string): AgentDefinition[] => {
  return getAllAgents().filter(agent => agent.modeFit === modeFit || agent.modeFit === 'both');
};
