import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';


export interface PredictionChatSession {
  id: number;
  user_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface PredictionMessageHistory {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: any;
}

export interface PredictionChatHistoryResponse {
  session_id: number;
  messages: PredictionMessageHistory[];
  total_messages: number;
}

// Create axios instance with default config
const predictionsApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000,
});

/**
 * List prediction chat sessions
 */
export const listPredictionSessions = async (
  userId?: string,
  limit: number = 50
): Promise<PredictionChatSession[]> => {
  const params: any = { limit };
  if (userId) {
    params.user_id = userId;
  }
  
  const response = await predictionsApi.get('/predictions/history', { params });
  return response.data;
};

/**
 * Get specific prediction session messages
 */
export const getPredictionSession = async (
  sessionId: number
): Promise<PredictionChatHistoryResponse> => {
  const response = await predictionsApi.get(`/predictions/session/${sessionId}`);
  return response.data;
};

/**
 * Delete a prediction session
 */
export const deletePredictionSession = async (sessionId: number): Promise<void> => {
  await predictionsApi.delete(`/predictions/session/${sessionId}`);
};
