import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';


export interface PredictionMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  thoughtProcess?: Array<{
    step: number;
    name: string;
    description: string;
    status: 'in_progress' | 'complete' | 'failed' | 'skipped';
    error?: string;
  }>;
  metadata?: {
    markets_count?: number;
    query_type?: string;
    data_source?: string;
  };
}

interface PredictionChatResponse {
  session_id: number;
  message: string;
  timestamp: string;
  thought_process?: any[];
  data_retrieved?: any;
  markets_count?: number;
  query_type?: string;
}

export interface UsePredictionsBotReturn {
  messages: PredictionMessage[];
  sessionId: number | null;
  loading: boolean;
  error: string | null;
  sendMessage: (message: string, deeperResearch?: boolean) => Promise<void>;
  startNewSession: () => void;
  loadHistory: (sessionId: number) => Promise<void>;
}

/**
 * Custom hook for prediction markets chatbot
 * 
 * Completely separate from main crypto chat:
 * - Uses /api/predictions endpoints
 * - Separate session management
 * - Only queries Polymarket data
 * - No SQL queries or crypto prices
 */
export const usePredictionsBot = (
  userId?: string,
  initialSessionId?: number
): UsePredictionsBotReturn => {
  const [messages, setMessages] = useState<PredictionMessage[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(initialSessionId || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load initial history if sessionId is provided, or reset if it becomes undefined
   */
  useEffect(() => {
    if (initialSessionId && initialSessionId !== sessionId) {
      // Load history when a session ID is provided and it's different from current
      loadHistory(initialSessionId);
    } else if (initialSessionId === undefined && sessionId !== null) {
      // Reset when initialSessionId becomes undefined (New Chat clicked)
      setMessages([]);
      setSessionId(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId]);

  /**
   * Send a prediction market query
   */
  const sendMessage = useCallback(
    async (message: string, deeperResearch: boolean = false) => {
      if (!message.trim()) {
        setError('Message cannot be empty');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Add user message to UI immediately
        const userMessage: PredictionMessage = {
          role: 'user',
          content: message,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMessage]);

        // Send to predictions endpoint
        const response = await axios.post<PredictionChatResponse>(
          `${API_BASE_URL}/predictions/chat`,
          {
            message,
            session_id: sessionId || undefined,
            user_id: userId,
            deeper_research: deeperResearch,
          }
        );

        const data = response.data;

        // Update session ID if this is first message
        if (!sessionId) {
          setSessionId(data.session_id);
        }

        // Add AI response to UI with thought process and metadata
        const aiMessage: PredictionMessage = {
          role: 'assistant',
          content: data.message,
          timestamp: new Date(data.timestamp),
          thoughtProcess: data.thought_process,
          metadata: {
            markets_count: data.markets_count,
            query_type: data.query_type,
            data_source: 'polymarket',
          },
        };
        setMessages((prev) => [...prev, aiMessage]);
      } catch (err: any) {
        const errorMessage =
          err.response?.data?.detail ||
          err.message ||
          'Failed to send prediction query. Please try again.';

        setError(errorMessage);
        console.error('Predictions chat error:', err);

        // Remove the user message if the request failed
        setMessages((prev) => prev.slice(0, -1));
      } finally {
        setLoading(false);
      }
    },
    [sessionId, userId]
  );

  /**
   * Start a new prediction chat session
   */
  const startNewSession = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setError(null);
  }, []);

  /**
   * Load prediction chat history from a previous session
   */
  const loadHistory = useCallback(async (sessionId: number) => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(`${API_BASE_URL}/predictions/session/${sessionId}`);
      const history = response.data;

      const loadedMessages: PredictionMessage[] = history.messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp),
        metadata: msg.metadata,
      }));

      setMessages(loadedMessages);
      setSessionId(sessionId);
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.detail ||
        err.message ||
        'Failed to load prediction chat history.';

      setError(errorMessage);
      console.error('Load predictions history error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    messages,
    sessionId,
    loading,
    error,
    sendMessage,
    startNewSession,
    loadHistory,
  };
};
