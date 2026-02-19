import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Stack,
  Alert,
  CircularProgress,
  IconButton,
  Chip,
} from '@mui/material';
import {
  ChevronLeft,
  ChevronRight,
} from '@mui/icons-material';
import { ChatInput } from '../components/ChatInput';
import { ThoughtStreamingDisplay } from '../components/ThoughtStreamingDisplay';
import MarkdownRenderer from '../components/MarkdownRenderer';
import InteractiveChart from '../components/InteractiveChart';
import ToolCallDisplay from '../components/ToolCallDisplay';
import { useChatBot } from '../hooks/useChatBot';
import { getUserId } from '../utils/userId';

interface PredictionsPageProps {
  activeSessionId?: number | null;
  newChatTrigger?: number;
  onSessionCreated?: () => void;
}

export const Predictions: React.FC<PredictionsPageProps> = ({
  activeSessionId,
  newChatTrigger,
  onSessionCreated,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<string>('');
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);
  const categoriesPerPage = 3;

  const {
    messages,
    sessionId,
    loading,
    error,
    sendMessage,
    stopGeneration,
    startNewSession,
  } = useChatBot(getUserId(), activeSessionId || undefined, '/api/predictions/chat/stream');

  useEffect(() => {
    if (newChatTrigger !== undefined && newChatTrigger > 0) {
      startNewSession();
    }
  }, [newChatTrigger, startNewSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSendMessage = async (
    message: string,
    _files?: File[],
    mode?: string,
    chartMode?: boolean
  ) => {
    if (!message.trim()) return;

    try {
      const deeperResearch = mode === 'deeper_research';
      await sendMessage(message, chartMode, deeperResearch);
      setSelectedSuggestion('');

      if (!sessionId && onSessionCreated) {
        onSessionCreated();
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setSelectedSuggestion(suggestion);
  };

  const suggestionCategories = [
    {
      title: 'Market Overview',
      icon: '�',
      gradient: 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(99,102,241,0.08) 100%)',
      questions: [
        'Give me an overview of all prediction markets',
        'How many total events and markets are active?',
        'What is the total trading volume across all platforms?',
        'Show me a breakdown of markets by category',
      ],
    },
    {
      title: 'Top Markets',
      icon: '🏆',
      gradient: 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(234,88,12,0.08) 100%)',
      questions: [
        'Show me the top 10 markets by volume',
        'What are the most popular markets on Polymarket?',
        'Top markets in the politics category',
        'Which markets have the highest trading activity?',
      ],
    },
    {
      title: 'Platform Comparison',
      icon: '⚖️',
      gradient: 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(5,150,105,0.08) 100%)',
      questions: [
        'Compare Polymarket vs Kalshi vs Limitless',
        'Which platform has the most events?',
        'Compare platform volumes and market counts',
        'What are the top events on each platform?',
      ],
    },
    {
      title: 'Search & Discover',
      icon: '🔍',
      gradient: 'linear-gradient(135deg, rgba(168,85,247,0.12) 0%, rgba(139,92,246,0.08) 100%)',
      questions: [
        'Find markets about Bitcoin or cryptocurrency',
        'Search for election and political markets',
        'Show me all sports prediction markets',
        'Find markets about AI and technology',
      ],
    },
    {
      title: 'Politics & Elections',
      icon: '🗳️',
      gradient: 'linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(220,38,38,0.08) 100%)',
      questions: [
        'Show all 2028 presidential election markets',
        'What are the latest political prediction markets?',
        'Find markets about US policy and legislation',
        'Top political markets by trading volume',
      ],
    },
    {
      title: 'Crypto & Finance',
      icon: '₿',
      gradient: 'linear-gradient(135deg, rgba(14,165,233,0.12) 0%, rgba(6,182,212,0.08) 100%)',
      questions: [
        'Show Bitcoin price prediction markets',
        'Find Ethereum and crypto prediction markets',
        'What are the top crypto markets by volume?',
        'Any markets about Fed rate decisions?',
      ],
    },
  ];

  return (
    <Box
      sx={{
        height: 'calc(100vh - 56px)',
        backgroundColor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Main Content - Scrollable Area */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          position: 'relative',
          minHeight: 0,
        }}
      >
        <Box
          sx={{
            maxWidth: '1100px',
            width: '100%',
            margin: '0 auto',
            padding: messages.length > 0 ? '32px 24px 24px' : '24px 24px 20px',
            paddingTop: messages.length > 0 ? '32px' : '40px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            flex: messages.length > 0 ? 'none' : 1,
            justifyContent: messages.length > 0 ? 'flex-start' : 'flex-start',
          }}
        >
          {/* Initial State - Only show when no messages */}
          {messages.length === 0 && (
            <>
              {/* Headline */}
              <Typography
                variant="h1"
                sx={{
                  color: 'text.primary',
                  fontSize: '36px',
                  fontWeight: 600,
                  textAlign: 'center',
                  mb: 1,
                }}
              >
                🔮 Ask EventGraph AI
              </Typography>

              <Typography
                variant="body1"
                sx={{
                  color: 'text.secondary',
                  fontSize: '15px',
                  textAlign: 'center',
                  mb: 1,
                  maxWidth: '600px',
                }}
              >
                AI-powered prediction market intelligence across Polymarket, Kalshi, Limitless & OpinionTrade
              </Typography>

              {/* Capability Chips */}
              <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" sx={{ mb: 3 }}>
                {[
                  { label: '20,000+ Events', icon: '📈' },
                  { label: 'Instant Search', icon: '⚡' },
                  { label: '4 Platforms', icon: '🌐' },
                  { label: 'Live Data', icon: '🔴' },
                ].map((cap) => (
                  <Chip
                    key={cap.label}
                    label={`${cap.icon} ${cap.label}`}
                    size="small"
                    sx={{
                      fontSize: '12px',
                      fontWeight: 500,
                      backgroundColor: 'rgba(187, 217, 119, 0.08)',
                      border: '1px solid rgba(187, 217, 119, 0.2)',
                      color: 'text.secondary',
                    }}
                  />
                ))}
              </Stack>

              {/* Category Navigation Container */}
              <Box
                sx={{
                  width: '100%',
                  maxWidth: '1100px',
                  position: 'relative',
                }}
              >
                {/* Left Navigation Button */}
                {currentCategoryIndex > 0 && (
                  <IconButton
                    onClick={() => setCurrentCategoryIndex(Math.max(0, currentCategoryIndex - categoriesPerPage))}
                    sx={{
                      position: 'absolute',
                      left: -50,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      backgroundColor: 'primary.main',
                      color: 'background.default',
                      width: 40,
                      height: 40,
                      zIndex: 2,
                      '&:hover': {
                        backgroundColor: 'primary.dark',
                      },
                    }}
                  >
                    <ChevronLeft />
                  </IconButton>
                )}

                {/* Question Categories Grid */}
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 2,
                    width: '100%',
                  }}
                >
                  {suggestionCategories
                    .slice(currentCategoryIndex, currentCategoryIndex + categoriesPerPage)
                    .map((category, idx) => (
                    <Card
                      key={currentCategoryIndex + idx}
                      sx={{
                        background: (theme) =>
                          theme.palette.mode === 'dark'
                            ? (category as any).gradient || 'rgba(30, 30, 30, 0.8)'
                            : (category as any).gradient || 'rgba(255, 255, 255, 0.8)',
                        backdropFilter: 'blur(10px)',
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: '16px',
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          transform: 'translateY(-2px)',
                          boxShadow: `0 8px 30px rgba(187, 217, 119, 0.12)`,
                          borderColor: 'rgba(187, 217, 119, 0.3)',
                        },
                      }}
                    >
                      <CardContent sx={{ p: 2.5 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                          <Box
                            sx={{
                              width: 36,
                              height: 36,
                              borderRadius: '10px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: 'rgba(187, 217, 119, 0.1)',
                              fontSize: '18px',
                            }}
                          >
                            {category.icon}
                          </Box>
                          <Typography
                            variant="h6"
                            sx={{
                              color: 'text.primary',
                              fontSize: '15px',
                              fontWeight: 600,
                            }}
                          >
                            {category.title}
                          </Typography>
                        </Stack>

                        <Stack spacing={1}>
                          {category.questions.map((question, qIdx) => (
                            <Box
                              key={qIdx}
                              onClick={() => handleSuggestionClick(question)}
                              sx={{
                                p: 1.25,
                                borderRadius: '10px',
                                backgroundColor: (theme) =>
                                  theme.palette.mode === 'dark'
                                    ? 'rgba(255, 255, 255, 0.03)'
                                    : 'rgba(0, 0, 0, 0.02)',
                                border: '1px solid',
                                borderColor: 'divider',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                  borderColor: 'rgba(187, 217, 119, 0.5)',
                                  backgroundColor: (theme) =>
                                    theme.palette.mode === 'dark'
                                      ? 'rgba(187, 217, 119, 0.05)'
                                      : 'rgba(187, 217, 119, 0.08)',
                                  transform: 'translateX(4px)',
                                },
                              }}
                            >
                              <Typography
                                variant="body2"
                                sx={{
                                  color: 'text.secondary',
                                  fontSize: '13px',
                                  lineHeight: 1.4,
                                }}
                              >
                                {question}
                              </Typography>
                            </Box>
                          ))}
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Box>

                {/* Right Navigation Button */}
                {currentCategoryIndex + categoriesPerPage < suggestionCategories.length && (
                  <IconButton
                    onClick={() => setCurrentCategoryIndex(Math.min(suggestionCategories.length - categoriesPerPage, currentCategoryIndex + categoriesPerPage))}
                    sx={{
                      position: 'absolute',
                      right: -50,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      backgroundColor: 'primary.main',
                      color: 'background.default',
                      width: 40,
                      height: 40,
                      zIndex: 2,
                      '&:hover': {
                        backgroundColor: 'primary.dark',
                      },
                    }}
                  >
                    <ChevronRight />
                  </IconButton>
                )}
              </Box>

              {/* Category Indicator Dots */}
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 1,
                  mt: 2,
                }}
              >
                {Array.from({ length: Math.ceil(suggestionCategories.length / categoriesPerPage) }).map((_, pageIdx) => (
                  <Box
                    key={pageIdx}
                    onClick={() => setCurrentCategoryIndex(pageIdx * categoriesPerPage)}
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: currentCategoryIndex === pageIdx * categoriesPerPage ? 'primary.main' : 'divider',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      '&:hover': {
                        backgroundColor: 'primary.main',
                        transform: 'scale(1.2)',
                      },
                    }}
                  />
                ))}
              </Box>
            </>
          )}

          {/* Chat Messages - Show when conversation started */}
          {messages.length > 0 && (
            <Box sx={{ width: '100%' }}>
              <Stack spacing={4}>
                {messages.map((msg, index) => (
                  <Box
                    key={index}
                    sx={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: 2,
                      width: '100%',
                    }}
                  >
                    {/* Avatar */}
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: '8px',
                        backgroundColor: msg.role === 'user' 
                          ? 'primary.main' 
                          : 'background.paper',
                        border: 1,
                        borderColor: 'divider',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Typography
                        sx={{
                          color: msg.role === 'user' 
                            ? 'background.default' 
                            : 'primary.main',
                          fontSize: '14px',
                          fontWeight: 600,
                        }}
                      >
                        {msg.role === 'user' ? 'Y' : 'AI'}
                      </Typography>
                    </Box>

                    {/* Message Content */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          fontSize: '12px',
                          fontWeight: 500,
                          mb: 1,
                          display: 'block',
                        }}
                      >
                        {msg.role === 'user' ? 'You' : 'EventGraph AI'}
                      </Typography>
                      
                      {/* Render AI messages with markdown, user messages as plain text */}
                      {msg.role === 'assistant' ? (
                        msg.content ? (
                          <MarkdownRenderer content={msg.content} />
                        ) : (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CircularProgress size={16} sx={{ color: 'primary.main' }} />
                            <Typography sx={{ color: 'text.secondary', fontSize: '14px' }}>
                              Thinking...
                            </Typography>
                          </Box>
                        )
                      ) : (
                        <Typography
                          sx={{
                            color: 'text.primary',
                            fontSize: '15px',
                            lineHeight: 1.6,
                            whiteSpace: 'pre-wrap',
                            wordWrap: 'break-word',
                          }}
                        >
                          {msg.content}
                        </Typography>
                      )}
                      
                      {/* Real-time Streaming Thoughts */}
                      {msg.role === 'assistant' && (msg.isThinking || (msg.thoughtProcess && msg.thoughtProcess.length > 0)) && (
                        <ThoughtStreamingDisplay 
                          steps={msg.thoughtProcess || []} 
                          isStreaming={msg.isThinking || false}
                        />
                      )}
                      
                      {/* Tool Call Indicators */}
                      {msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
                        <ToolCallDisplay toolCalls={msg.toolCalls} />
                      )}
                      
                      {/* Interactive Chart */}
                      {msg.chartData && (
                        <InteractiveChart chartData={msg.chartData} />
                      )}
                      
                      {/* Legacy Chart */}
                      {msg.chartUrl && !msg.chartData && (
                        <Box
                          sx={{
                            mt: 2,
                            p: 2,
                            backgroundColor: 'background.paper',
                            borderRadius: '12px',
                            border: 1,
                            borderColor: 'divider',
                          }}
                        >
                          <img
                            src={msg.chartUrl}
                            alt="Chart visualization"
                            style={{
                              width: '100%',
                              maxWidth: '800px',
                              height: 'auto',
                              display: 'block',
                              borderRadius: '8px',
                            }}
                          />
                        </Box>
                      )}
                    </Box>
                  </Box>
                ))}
                
              </Stack>
              {/* Scroll anchor */}
              <div ref={messagesEndRef} />
            </Box>
          )}

          {/* Error Display */}
          {error && (
            <Alert
              severity="error"
              onClose={() => {}}
              sx={{
                width: '100%',
                mt: 3,
                backgroundColor: 'rgba(244, 67, 54, 0.1)',
                border: '1px solid #f44336',
                borderRadius: '12px',
                '& .MuiAlert-icon': {
                  color: '#f44336',
                },
              }}
            >
              {error}
            </Alert>
          )}
        </Box>
      </Box>

      {/* Chat Input - Always visible at bottom */}
      <Box
        sx={{
          flexShrink: 0,
          backgroundColor: 'background.default',
          zIndex: 10,
          pb: 2,
        }}
      >
        <Box sx={{ maxWidth: '1100px', margin: '0 auto', padding: '16px 24px 8px' }}>
          {/* Footer text */}
          {messages.length === 0 && (
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                fontSize: '11px',
                textAlign: 'center',
                display: 'block',
                mb: 1,
              }}
            >
              Built for insight, not advice. Always verify critical data.
            </Typography>
          )}
          
          <ChatInput 
            onSubmit={handleSendMessage}
            onStop={stopGeneration}
            loading={loading}
            value={selectedSuggestion}
            onChange={setSelectedSuggestion}
          />
        </Box>
      </Box>
    </Box>
  );
};
