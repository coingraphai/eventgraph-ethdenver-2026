import axios from 'axios';

// API base URL - uses proxy in vite.config.ts to avoid CORS
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';


// Message interface
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Chat request payload
export interface ChatRequest {
  message: string;
  session_id?: number;
  user_id?: string;
}

// Chat response from API
export interface ChatResponse {
  message: string;
  session_id: number;
  timestamp: string;
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

/**
 * Send a chat message and get AI response
 */
export const sendChatMessage = async (
  message: string,
  sessionId?: number,
  userId?: string
): Promise<ChatResponse> => {
  const payload: ChatRequest = {
    message,
    session_id: sessionId,
    user_id: userId,
  };

  const response = await chatApi.post<ChatResponse>('/chat/', payload);
  return response.data;
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
  limit: number = 50
): Promise<ChatHistoryResponse> => {
  const response = await chatApi.get<ChatHistoryResponse>(
    `/chat/history/${sessionId}`,
    {
      params: { limit },
    }
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
