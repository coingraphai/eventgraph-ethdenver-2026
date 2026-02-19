/**
 * Agent Workflow Schema Types
 * Defines all TypeScript interfaces for the Agent Workflow system
 */

// ============================================
// Core Agent Types
// ============================================

export type AgentCategory = 
  | 'blockchains' 
  | 'tokens' 
  | 'cex' 
  | 'dex' 
  | 'derivatives' 
  | 'prediction-markets' 
  | 'nfts' 
  | 'defi';

export type AgentMode = 'simple' | 'advanced';

export type ModeFit = 'simple-friendly' | 'advanced-grade' | 'both';

export type OutputType = 'dashboard' | 'alerts' | 'report' | 'trade-setup' | 'code' | 'simulation' | 'heatmap' | 'comparison';

export type Timeframe = 'realtime' | 'intraday' | 'swing' | 'long-term';

export type DataSource = 'spot' | 'derivatives' | 'onchain' | 'social' | 'news' | 'macro' | 'dex' | 'contract' | 'lending' | 'defi';

export type ChainCoverage = 'evm' | 'evm-chains' | 'solana' | 'btc' | 'multi-chain' | 'agnostic';

export type Runtime = 'instant' | 'fast' | 'medium' | 'heavy';

export type PlanAccess = 'free' | 'advanced' | 'premium';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

// ============================================
// Form Field Types
// ============================================

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormField {
  id?: string;
  name?: string; // legacy support
  label: string;
  type: 'text' | 'select' | 'multiselect' | 'number' | 'date' | 'daterange' | 'token' | 'chain' | 'exchange';
  placeholder?: string;
  required?: boolean;
  options?: FormFieldOption[];
  default_value?: string | number;
  defaultValue?: string | number;
  description?: string;
  showInSimpleMode?: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
  isAdvanced?: boolean; // Hidden behind "Advanced Settings"
}

// ============================================
// Workflow Step Types
// ============================================

export interface WorkflowStep {
  id?: string;
  step?: number;
  name: string;
  description: string;
  estimatedTime?: number | string; // in seconds or formatted string
  status?: StepStatus;
}

// ============================================
// Chart Types
// ============================================

export type ChartType = 
  | 'candlestick'      // TradingView
  | 'line'             // Recharts
  | 'area'             // Recharts
  | 'bar'              // Recharts
  | 'composed'         // Recharts (bar + line)
  | 'pie'              // Recharts
  | 'donut'            // Recharts
  | 'radar'            // Recharts
  | 'treemap'          // Recharts
  | 'heatmap'          // Custom
  | 'scatter'          // Recharts
  | 'funnel'           // Recharts
  | 'gauge'            // Custom
  | 'sparkline'        // Mini inline chart
  | 'histogram'        // Recharts
  | 'bubble';          // Recharts

export type ChartGroup = 'core' | 'market' | 'flow' | 'risk' | 'derivatives' | 'sentiment';

export interface ChartDefinition {
  id: string;
  title: string;
  type: ChartType;
  group: ChartGroup;
  description?: string;
  dataKey: string; // Key in output_json.charts
  showInSimple?: boolean; // Show in Simple mode
  showInSimpleMode?: boolean; // Alias for showInSimple
  showInAdvanced?: boolean; // Show in Advanced mode
  width?: 'full' | 'half';
  height?: number;
  xAxis?: string;
  yAxis?: string[];
  labelKey?: string; // For pie/radar charts
  valueKey?: string; // For pie charts
  max?: number; // For gauge charts
  config?: {
    xAxis?: string;
    yAxis?: string | string[];
    colors?: string[];
    stacked?: boolean;
    showLegend?: boolean;
    showTooltip?: boolean;
    height?: number;
  };
}

// ============================================
// Table Types
// ============================================

export interface TableColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'currency' | 'percent' | 'date' | 'status' | 'change' | 'address' | 'severity';
  sortable?: boolean;
  width?: string;
  format?: string; // e.g., "0.00%" or "$0,0.00"
}

export interface TableDefinition {
  id: string;
  title: string;
  dataKey: string; // Key in output_json.tables
  columns: TableColumn[];
  showInSimple?: boolean;
  showInSimpleMode?: boolean; // Alias
  showInAdvanced?: boolean;
  sortable?: boolean;
  pagination?: boolean;
  pageSize?: number;
}

// ============================================
// Output Types
// ============================================

export interface KPI {
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: string;
  color?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
}

export interface KeyLevel {
  label: string;
  value: number;
  type: 'support' | 'resistance' | 'pivot' | 'target' | 'stop';
}

export interface RiskWarning {
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  action?: string;
}

export interface SummaryOutput {
  kpis: KPI[];
  keyTakeaways: string[];
  keyLevels?: KeyLevel[];
  riskWarnings: RiskWarning[];
}

export interface DashboardModule {
  id: string;
  title: string;
  type: 'metrics' | 'table' | 'list' | 'status';
  data: any;
}

export interface DashboardOutput {
  metricCards: KPI[];
  modules: DashboardModule[];
}

export interface IntelligenceOutput {
  narrative: string;
  risks: RiskWarning[];
  tradeLens?: {
    bias: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    reasoning: string;
    entry?: number;
    stopLoss?: number;
    takeProfit?: number[];
  };
}

export interface ForecastScenario {
  name: string;
  probability: number;
  priceTarget?: number;
  timeframe?: string;
  description: string;
}

export interface ForecastOutput {
  scenarios: ForecastScenario[];
  verdict: string;
  confidence: number;
}

export interface DataSourceInfo {
  name: string;
  type: string;
  lastUpdated?: string;
  url?: string;
}

export interface SourcesOutput {
  dataSources: DataSourceInfo[];
  methodology?: string;
}

// ============================================
// Full Agent Output
// ============================================

export interface AgentOutput {
  summary: SummaryOutput;
  dashboard: DashboardOutput;
  charts: Record<string, any[]>; // Chart data keyed by chartId
  tables: Record<string, any[]>; // Table data keyed by tableId
  intelligence: IntelligenceOutput;
  forecast?: ForecastOutput;
  sources: SourcesOutput;
  generatedAt: string;
}

// ============================================
// Agent Definition
// ============================================

export interface AgentDefinition {
  // Identity
  id: string;
  slug: string;
  name: string;
  icon: string;
  description: string;
  shortDescription: string;
  
  // Classification
  category: AgentCategory;
  modeFit: ModeFit;
  outputType: OutputType;
  timeframe: Timeframe;
  dataSources: DataSource[];
  chainCoverage: ChainCoverage;
  runtime: Runtime;
  planAccess: PlanAccess;
  
  // Signals & Features
  signalsUsed: string[];
  previewSentence: string;
  
  // Configuration
  formSchema: FormField[] | {
    title?: string;
    description?: string;
    fields: FormField[];
  };
  workflowSteps: WorkflowStep[];
  charts: ChartDefinition[];
  tables: TableDefinition[];
  
  // Tabs visibility by mode
  tabs: {
    simple: string[];  // Tab names visible in simple mode
    advanced: string[]; // Tab names visible in advanced mode
  };
  
  // Mode configuration
  defaultMode?: AgentMode;
  
  // Metadata
  version: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Agent Pack Types
// ============================================

export interface AgentPack {
  id: string;
  name: string;
  description: string;
  type: 'simple' | 'advanced';
  icon: string;
  agentIds: string[]; // References to agent slugs
  previewImage?: string;
  isEnabled: boolean;
}

// ============================================
// Agent Run Types (Extended)
// ============================================

export interface AgentRunStep {
  step: number;
  name: string;
  status: StepStatus;
  message?: string;
  timestamp?: string;
  duration?: number; // ms
}

export interface AgentRun {
  id: string;
  agentSlug: string;
  userId?: string;
  walletAddress?: string;
  anonymousSessionId?: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  mode: AgentMode;
  inputJson: Record<string, any>;
  stepsJson: AgentRunStep[];
  outputJson?: AgentOutput;
  aiSummary?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  
  // Credit tracking
  creditsUsed: number;
  creditsRemaining: number;
  creditLimit: number;
  tier: string;
}

// ============================================
// Saved Run Types
// ============================================

export interface SavedRun {
  id: string;
  agentSlug: string;
  name: string;
  inputJson: Record<string, any>;
  mode: AgentMode;
  savedAt: string;
  isFavorite: boolean;
}

// ============================================
// Filter Types
// ============================================

export interface AgentFilters {
  search: string;
  category: AgentCategory | 'all';
  modeFit: ModeFit | 'all';
  outputType: OutputType | 'all';
  timeframe: Timeframe | 'all';
  dataSource: DataSource | 'all';
  chainCoverage: ChainCoverage | 'all';
  runtime: Runtime | 'all';
  planAccess: PlanAccess | 'all';
}
