import { useState, useCallback, useEffect } from 'react';
import {
  sendChatMessageStream,
  getChatHistory,
  Message,
  StreamEvent,
  ToolCallInfo,
} from '../services/chatApi';
import { useSessionId } from './useSessionId';

export interface UseChatBotReturn {
  messages: Message[];
  sessionId: number | null;
  loading: boolean;
  error: string | null;
  sendMessage: (message: string, chartMode?: boolean, deeperResearch?: boolean) => Promise<void>;
  stopGeneration: () => void;
  startNewSession: () => void;
  loadHistory: (sessionId: number) => Promise<void>;
}

/**
 * Custom hook for chatbot functionality
 * Manages chat state, sends messages to backend, and handles AI responses
 */
export const useChatBot = (
  userId?: string, 
  initialSessionId?: number,
  customEndpoint?: string  // NEW: Allow custom endpoint (e.g., '/api/predictions/stream')
): UseChatBotReturn => {
  const anonymousSessionId = useSessionId();
  const apiEndpoint = customEndpoint || '/api/chat/v2-stream/stream';  // Default to crypto chat
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(initialSessionId || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

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
   * Send a message to the chatbot with streaming response
   */
  const sendMessage = useCallback(
    async (message: string, chartMode: boolean = false, deeperResearch: boolean = false) => {
      if (!message.trim()) {
        setError('Message cannot be empty');
        return;
      }

      // Prevent sending new message while one is in progress
      if (loading) {
        console.log('[useChatBot] Already loading, ignoring new message');
        return;
      }

      setLoading(true);
      setError(null);

      // Create new AbortController for this request
      const controller = new AbortController();
      setAbortController(controller);

      try {
        // Add user message to UI immediately
        const userMessage: Message = {
          role: 'user',
          content: message,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMessage]);

        // Create a placeholder for the AI response that we'll update as tokens stream in
        const aiMessagePlaceholder: Message = {
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          isThinking: true, // Start with thinking state
        };
        setMessages((prev) => [...prev, aiMessagePlaceholder]);

        let streamedContent = '';
        let currentSessionId = sessionId;
        let thoughtSteps: any[] = [];
        let sqlQuery: string | undefined;
        let chartData: string | undefined;
        let toolCalls: ToolCallInfo[] = [];

        // Send to backend with anonymous session ID
        console.log('[useChatBot] Sending streaming message - anonymousSessionId:', anonymousSessionId, 'userId:', userId);
        
        await sendChatMessageStream(
          message,
          sessionId || undefined,
          userId,
          chartMode,
          deeperResearch,
          undefined,
          anonymousSessionId,
          (event: StreamEvent) => {
            // Handle different event types
            switch (event.type) {
              case 'thinking':
                // Show initial thinking state
                console.log('AI is thinking...');
                setMessages((prev) => {
                  const newMessages = [...prev];
                  const lastMessage = newMessages[newMessages.length - 1];
                  if (lastMessage.role === 'assistant') {
                    newMessages[newMessages.length - 1] = {
                      ...lastMessage,
                      isThinking: true
                    };
                  }
                  return newMessages;
                });
                break;
              
              case 'thought':
                if (event.step && event.step.step) {
                  // Find existing step or add new one
                  const existingStepIndex = thoughtSteps.findIndex(s => s.step === event.step!.step);
                  if (existingStepIndex >= 0) {
                    // Update existing step
                    thoughtSteps[existingStepIndex] = event.step;
                  } else {
                    // Add new step
                    thoughtSteps.push(event.step);
                  }
                  
                  // Update the AI message with thought process in real-time
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage.role === 'assistant') {
                      newMessages[newMessages.length - 1] = {
                        ...lastMessage,
                        thoughtProcess: [...thoughtSteps],
                        isThinking: true // Keep thinking state during thought streaming
                      };
                    }
                    return newMessages;
                  });
                }
                break;
              
              case 'sql':
                sqlQuery = event.query;
                setMessages((prev) => {
                  const newMessages = [...prev];
                  const lastMessage = newMessages[newMessages.length - 1];
                  if (lastMessage.role === 'assistant') {
                    newMessages[newMessages.length - 1] = {
                      ...lastMessage,
                      sqlQuery
                    };
                  }
                  return newMessages;
                });
                break;
              
              case 'token':
                // Append token to the streaming content
                if (event.content) {
                  streamedContent += event.content;
                  
                  // Update the AI message with the new content
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    
                    if (lastMessage.role === 'assistant') {
                      newMessages[newMessages.length - 1] = {
                        ...lastMessage,
                        content: streamedContent,
                        isThinking: false // Stop thinking when content starts streaming
                      };
                    }
                    return newMessages;
                  });
                }
                break;
              
              case 'chart':
                chartData = event.data;
                setMessages((prev) => {
                  const newMessages = [...prev];
                  const lastMessage = newMessages[newMessages.length - 1];
                  if (lastMessage.role === 'assistant') {
                    newMessages[newMessages.length - 1] = {
                      ...lastMessage,
                      chartData
                    };
                  }
                  return newMessages;
                });
                break;
              
              case 'tool_call':
                // Tool is being called — add to toolCalls array
                if (event.tool) {
                  const newToolCall: ToolCallInfo = {
                    tool: event.tool,
                    input: event.input,
                    source: (event.source as 'cache' | 'api') || 'api',
                    status: 'calling',
                    timestamp: Date.now(),
                  };
                  toolCalls = [...toolCalls, newToolCall];
                  
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage.role === 'assistant') {
                      newMessages[newMessages.length - 1] = {
                        ...lastMessage,
                        toolCalls: [...toolCalls],
                        isThinking: true,
                      };
                    }
                    return newMessages;
                  });
                }
                break;
              
              case 'tool_result':
                // Tool returned results — mark as complete
                if (event.tool) {
                  toolCalls = toolCalls.map(tc => 
                    tc.tool === event.tool && tc.status === 'calling' 
                      ? { ...tc, status: 'complete' as const }
                      : tc
                  );
                  
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage.role === 'assistant') {
                      newMessages[newMessages.length - 1] = {
                        ...lastMessage,
                        toolCalls: [...toolCalls],
                      };
                    }
                    return newMessages;
                  });
                }
                break;
              
              case 'done':
                console.log('Streaming complete');
                break;
              
              case 'error':
                console.error('Stream error:', event.message);
                throw new Error(event.message || 'Streaming error');
              
              case 'tier_info':
                // Handle tier info updates
                console.log('Tier info received:', event);
                break;
              
              case 'session_created':
                // Handle session_created from predictions/stream endpoint
                if (event.session_id && !currentSessionId) {
                  currentSessionId = event.session_id;
                  setSessionId(event.session_id);
                }
                break;
              
              default:
                // Handle session_id event or any other unknown event types
                if (event.session_id && !currentSessionId) {
                  currentSessionId = event.session_id;
                  setSessionId(event.session_id);
                }
                break;
            }
          },
          controller,
          apiEndpoint  // Pass custom endpoint to API call
        );

      } catch (err: any) {
        // Check if this was an abort
        if (err.name === 'AbortError') {
          console.log('[useChatBot] Request aborted by user');
          
          // Remove the placeholder AI message that shows "Thinking..."
          setMessages((prev) => {
            const newMessages = [...prev];
            // Remove the last message if it's an assistant message with no content
            if (newMessages.length > 0) {
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage.role === 'assistant' && (!lastMessage.content || lastMessage.content.trim() === '')) {
                newMessages.pop();
              }
            }
            return newMessages;
          });
          
          setError('Generation stopped');
          // Clear the error after a short delay
          setTimeout(() => setError(null), 2000);
          // Don't return here - let finally block clean up
        } else {
          const errorMessage =
            err.response?.data?.detail ||
            err.message ||
            'Failed to send message. Please try again.';
          
          setError(errorMessage);
          console.error('Chat error:', err);

          // Remove the user message and placeholder AI message if the request failed
          setMessages((prev) => prev.slice(0, -2));
        }
      } finally {
        setLoading(false);
        setAbortController(null);
      }
    },
    [sessionId, userId, anonymousSessionId, loading]
  );

  /**
   * Stop the current generation
   */
  const stopGeneration = useCallback(() => {
    if (abortController) {
      console.log('[useChatBot] Aborting current request');
      abortController.abort();
      // Don't set loading to false here - let the catch block handle it
      // to avoid race conditions with the finally block
    }
  }, [abortController]);

  /**
   * Start a new chat session
   */
  const startNewSession = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setError(null);
  }, []);

  /**
   * Load chat history from a previous session
   */
  const loadHistory = useCallback(async (sessionId: number) => {
    setLoading(true);
    setError(null);

    try {
      const history = await getChatHistory(sessionId, 50);
      
      const loadedMessages: Message[] = history.messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp),
      }));

      setMessages(loadedMessages);
      setSessionId(sessionId);
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.detail ||
        err.message ||
        'Failed to load chat history.';
      
      setError(errorMessage);
      console.error('Load history error:', err);
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
    stopGeneration,
    startNewSession,
    loadHistory,
  };
};
