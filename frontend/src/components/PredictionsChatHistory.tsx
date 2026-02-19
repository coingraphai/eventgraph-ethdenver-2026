import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  IconButton,
  CircularProgress,
  Alert,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  TrendingUp as PredictionsIcon,
} from '@mui/icons-material';
import { 
  listPredictionSessions, 
  deletePredictionSession, 
  PredictionChatSession 
} from '../services/predictionsApi';

interface PredictionsChatHistoryProps {
  userId: string;
  currentSessionId: number | null;
  onSessionSelect: (sessionId: number) => void;
  onNewChat: () => void;
  refreshTrigger?: number;
}

export const PredictionsChatHistory: React.FC<PredictionsChatHistoryProps> = ({
  userId,
  currentSessionId,
  onSessionSelect,
  onNewChat,
  refreshTrigger = 0,
}) => {
  const theme = useTheme();
  const [sessions, setSessions] = useState<PredictionChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load prediction sessions
  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listPredictionSessions(userId, 50);
      setSessions(data);
    } catch (err: any) {
      console.error('Error loading prediction sessions:', err);
      setError('Failed to load prediction history');
    } finally {
      setLoading(false);
    }
  };

  // Load sessions on mount and when refreshTrigger changes
  useEffect(() => {
    loadSessions();
  }, [userId, refreshTrigger]);

  // Handle session deletion
  const handleDelete = async (sessionId: number, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (!confirm('Delete this prediction conversation?')) {
      return;
    }

    try {
      await deletePredictionSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      
      if (sessionId === currentSessionId) {
        onNewChat();
      }
    } catch (err: any) {
      console.error('Error deleting prediction session:', err);
      alert('Failed to delete conversation');
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      {/* Header */}
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          px: 1.5,
          py: 0.5,
          flexShrink: 0,
        }}
      >
        Prediction History
      </Typography>

      {/* Sessions List */}
      <Box
        sx={{
          flex: 1,
        }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ m: 2 }}>
            {error}
          </Alert>
        ) : sessions.length === 0 ? (
          <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
            <PredictionsIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No prediction conversations yet
            </Typography>
            <Typography variant="caption" color="text.disabled">
              Start by asking about prediction markets
            </Typography>
          </Box>
        ) : (
          <List sx={{ px: 1 }}>
            {sessions.map((session) => (
              <ListItemButton
                key={session.id}
                selected={session.id === currentSessionId}
                onClick={() => onSessionSelect(session.id)}
                sx={{
                  borderRadius: '8px',
                  mb: 0.5,
                  py: 1.5,
                  px: 2,
                  '&:hover': {
                    backgroundColor: alpha(theme.palette.text.primary, 0.05),
                    '& .delete-icon': {
                      opacity: 1,
                    },
                  },
                  '&.Mui-selected': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.1),
                    borderLeft: '3px solid',
                    borderColor: 'primary.main',
                    '&:hover': {
                      backgroundColor: alpha(theme.palette.primary.main, 0.15),
                    },
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
                  <PredictionsIcon 
                    sx={{ 
                      fontSize: 16, 
                      color: session.id === currentSessionId ? 'primary.main' : 'text.secondary',
                      flexShrink: 0
                    }} 
                  />
                  <ListItemText
                    primary={session.title || 'Prediction Market Query'}
                    secondary={formatDate(session.created_at)}
                    primaryTypographyProps={{
                      fontSize: '13px',
                      fontWeight: session.id === currentSessionId ? 600 : 400,
                      color: session.id === currentSessionId ? 'primary.main' : 'text.primary',
                      noWrap: true,
                      sx: { mb: 0.25 }
                    }}
                    secondaryTypographyProps={{
                      fontSize: '11px',
                      color: 'text.secondary',
                    }}
                    sx={{ my: 0, mr: 1 }}
                  />
                  <IconButton
                    className="delete-icon"
                    size="small"
                    onClick={(e) => handleDelete(session.id, e)}
                    sx={{
                      opacity: 0,
                      transition: 'opacity 0.2s',
                      flexShrink: 0,
                      '&:hover': {
                        color: 'error.main',
                      },
                    }}
                  >
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
};
