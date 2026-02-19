import axios from 'axios';

// API base URL - uses proxy in vite.config.ts to avoid CORS
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Thought step in chain-of-thought reasoning
export interface ThoughtStep {
  step: number;
  name: string;
  description: string;
  status: 'in_progress' | 'complete' | 'failed' | 'skipped';
  result?: any;
  error?: string;
  tables_found?: string[];
  total_tables_scanned?: number;
  schemas_retrieved?: string[];
  sql_generated?: string;
  corrected_sql?: string;
  rows_retrieved?: number;
  needs_database?: boolean;
}

// Message interface
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  chartUrl?: string;
  chartData?: string; // Plotly JSON for interactive charts
  thoughtProcess?: ThoughtStep[];
  isThinking?: boolean; // Flag to indicate if AI is still thinking/streaming thoughts
  sqlQuery?: string;
  toolCalls?: ToolCallInfo[]; // MCP tool calls made during response
}

// Tool call tracking
export interface ToolCallInfo {
  tool: string;       // Tool name
  input?: Record<string, any>; // Tool input
  source: 'cache' | 'api'; // Internal (fast) or external (API)
  status: 'calling' | 'complete'; // Current status
  timestamp: number;
}

// Chat request payload
export interface ChatRequest {
  message: string;
  session_id?: number;
  user_id?: string;
  wallet_address?: string;
  anonymous_session_id?: string;
  chart_mode?: boolean;
  deeper_research?: boolean;
}

// Chat response from API
export interface ChatResponse {
  message: string;
  session_id: number;
  timestamp: string;
  chart_url?: string;
  chart_data?: string; // Plotly JSON for interactive charts
  thought_process?: ThoughtStep[];
  sql_query?: string;
  data_summary?: {
    rows_retrieved: number;
    columns: string[];
  };
}

// Chat session
export interface ChatSession {
  id: number;
  user_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

// Chat history response
export interface ChatHistoryResponse {
  session_id: number;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  total_messages: number;
}

// Create axios instance with default config
const chatApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000, // 120 second timeout (2 minutes) for AI responses - Grok can be slow
});

// Axios interceptor to add JWT token to requests
chatApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('wallet_auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Send a chat message and get AI response
 */
export const sendChatMessage = async (
  message: string,
  sessionId?: number,
  userId?: string,
  chartMode?: boolean,
  deeperResearch?: boolean,
  walletAddress?: string
): Promise<ChatResponse> => {
  const payload: ChatRequest = {
    message,
    session_id: sessionId,
    user_id: userId,
    chart_mode: chartMode,
    deeper_research: deeperResearch,
    wallet_address: walletAddress,
  };

  const response = await chatApi.post<ChatResponse>('/chat/', payload);
  return response.data;
};

/**
 * Stream event types from the backend
 */
export interface StreamEvent {
  type: 'session_id' | 'session_created' | 'thinking' | 'thought' | 'sql' | 'token' | 'chart' | 'done' | 'error' | 'tier_info' | 'tool_call' | 'tool_result';
  session_id?: number;
  content?: string;
  step?: ThoughtStep;
  query?: string;
  data?: any;
  message?: string;
  needs_wallet?: boolean;  // Set to true when anonymous user limit is reached
  needs_upgrade?: boolean; // Set to true when free tier user limit is reached
  tier?: string;           // User tier (anonymous, free, premium)
  questions_used?: number;
  questions_remaining?: number | null;
  // Tool call fields
  tool?: string;           // Tool name being called
  input?: Record<string, any>; // Tool input parameters
  source?: 'cache' | 'api'; // Whether tool is internal (cache) or external (api)
}

/**
 * Send a chat message and stream the AI response
 */
export const sendChatMessageStream = async (
  message: string,
  sessionId?: number,
  userId?: string,
  chartMode?: boolean,
  deeperResearch?: boolean,
  walletAddress?: string,
  anonymousSessionId?: string,
  onEvent?: (event: StreamEvent) => void,
  abortController?: AbortController,
  customEndpoint?: string  // NEW: Allow custom endpoint
): Promise<void> => {
  const payload: ChatRequest = {
    message,
    session_id: sessionId,
    user_id: userId,
    chart_mode: chartMode,
    deeper_research: deeperResearch,
    wallet_address: walletAddress,
    anonymous_session_id: anonymousSessionId,
  };

  // Use custom endpoint if provided, otherwise default to crypto chat
  const endpoint = customEndpoint || `${API_BASE_URL}/chat/v2-stream/stream`;
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: abortController?.signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error('Response body is not readable');
  }

  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }

      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });
      
      // Split by double newline (SSE message separator)
      const messages = buffer.split('\n\n');
      
      // Keep the last partial message in the buffer
      buffer = messages.pop() || '';

      for (const message of messages) {
        const lines = message.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6).trim();
            if (data) {
              try {
                const event: StreamEvent = JSON.parse(data);
                if (onEvent) {
                  onEvent(event);
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', data, e);
              }
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
};

/**
 * Create a new chat session
 */
export const createChatSession = async (
  userId?: string,
  title?: string
): Promise<ChatSession> => {
  const response = await chatApi.post<ChatSession>('/chat/session', {
    user_id: userId,
    title,
  });
  return response.data;
};

/**
 * Get chat history for a session
 */
export const getChatHistory = async (
  sessionId: number,
  limit: number = 50,
  walletAddress?: string
): Promise<ChatHistoryResponse> => {
  const params: any = { limit };
  
  // Add wallet_address for security verification if provided
  if (walletAddress) {
    params.wallet_address = walletAddress;
  }
  
  const response = await chatApi.get<ChatHistoryResponse>(
    `/chat/history/${sessionId}`,
    { params }
  );
  return response.data;
};

/**
 * List all chat sessions
 */
export const listChatSessions = async (
  userId?: string,
  limit: number = 20
): Promise<ChatSession[]> => {
  const response = await chatApi.get<ChatSession[]>('/chat/sessions', {
    params: { user_id: userId, limit },
  });
  return response.data;
};

/**
 * Delete a chat session
 */
export const deleteChatSession = async (sessionId: number): Promise<void> => {
  await chatApi.delete(`/chat/session/${sessionId}`);
};
