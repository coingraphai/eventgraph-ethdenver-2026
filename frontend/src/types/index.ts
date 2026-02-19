// User Types
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  walletAddress?: string;
  googleId?: string;
  subscriptionTier: 'free' | 'basic' | 'plus' | 'premium';
  createdAt: Date;
  updatedAt: Date;
}

// Chat/Copilot Types
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    tradingViewConfig?: TradingViewConfig;
    attachments?: string[];
    mode?: 'normal' | 'deeper_research';
  };
  createdAt: Date;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

// TradingView Types
export interface TradingViewConfig {
  symbol: string;
  interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1D' | '1W' | '1M';
  chartType: 'candlestick' | 'line' | 'area' | 'heatmap';
  indicators?: string[]; // ['RSI', 'MACD', 'Volume']
  theme?: 'dark' | 'light';
}

// Asset/Crypto Types
export interface Asset {
  id: string;
  symbol: string; // 'BTC', 'ETH', 'SOL'
  name: string; // 'Bitcoin', 'Ethereum'
  price: number;
  volume24h: number;
  marketCap: number;
  smi: number; // Smart Money Index (0-100)
  eis: number; // Exchange Intelligence Score (0-100)
  logoUrl?: string;
  priceChange24h?: number;
  updatedAt: Date;
}

export interface PricePoint {
  time: number; // Unix timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Alert Types
export interface Alert {
  id: string;
  userId: string;
  assetId: string;
  condition: {
    type: 'smi' | 'eis' | 'price' | 'volume';
    operator: '>' | '<' | '=' | '>=' | '<=';
    value: number;
  };
  isActive: boolean;
  triggeredAt?: Date;
  createdAt: Date;
}

// Watchlist Types
export interface Watchlist {
  id: string;
  userId: string;
  name: string;
  assets: Asset[];
  createdAt: Date;
  updatedAt: Date;
}

// Exchange & Blockchain Types
export interface Exchange {
  id: string;
  name: string; // 'Binance', 'Coinbase'
  type: 'CEX' | 'DEX';
  logoUrl?: string;
  isActive: boolean;
}

export interface Blockchain {
  id: string;
  name: string; // 'Ethereum', 'Solana'
  chainId?: number;
  logoUrl?: string;
  isActive: boolean;
}

// WebSocket Types
export interface WebSocketMessage {
  type: 'price_update' | 'smi_update' | 'eis_update' | 'alert_triggered' | 'chat_response' | 'tradingview_data';
  data: any;
  timestamp: Date;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Question Category Types (for Explore page)
export interface QuestionCategory {
  id: string;
  name: string;
  icon: string;
  questionCount: number;
  questions: string[];
  badges?: ('trending' | 'new')[];
}

// Upload Types
export interface FileUpload {
  id: string;
  userId: string;
  filename: string;
  fileSize: number;
  s3Url: string;
  status: 'processing' | 'completed' | 'failed';
  createdAt: Date;
}
