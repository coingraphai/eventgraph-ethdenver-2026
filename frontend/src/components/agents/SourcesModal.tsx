import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Close as CloseIcon,
  CheckCircle as CheckIcon,
  Link as LinkIcon,
  Schedule as ClockIcon,
} from '@mui/icons-material';

export interface DataSource {
  id: string;
  name: string;
  type: 'api' | 'blockchain' | 'aggregator' | 'oracle' | 'exchange';
  description?: string;
  url?: string;
  lastUpdated?: number;
  status?: 'active' | 'cached' | 'unavailable';
}

export interface SourcesModalData {
  agentName: string;
  sources: DataSource[];
  methodology?: string;
  disclaimer?: string;
}

interface SourcesModalProps {
  open: boolean;
  onClose: () => void;
  data: SourcesModalData;
}

const TYPE_CONFIG = {
  api: { label: 'API', color: '#4FC3F7' },
  blockchain: { label: 'Blockchain', color: '#66BB6A' },
  aggregator: { label: 'Aggregator', color: '#AB47BC' },
  oracle: { label: 'Oracle', color: '#FFA726' },
  exchange: { label: 'Exchange', color: '#BBD977' },
};

const STATUS_CONFIG = {
  active: { label: 'Live', color: '#26a69a' },
  cached: { label: 'Cached', color: '#FFA726' },
  unavailable: { label: 'Unavailable', color: '#ef5350' },
};

const SourcesModal: React.FC<SourcesModalProps> = ({ open, onClose, data }) => {
  const formatTimestamp = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: 'rgba(20, 20, 20, 0.98)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" fontWeight={600}>
          Data Sources & Attribution
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {/* Agent info */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            Data sources used by <strong>{data.agentName}</strong>
          </Typography>
        </Box>

        {/* Sources list */}
        <List sx={{ mb: 3 }}>
          {data.sources.map((source, idx) => (
            <React.Fragment key={source.id}>
              {idx > 0 && <Divider sx={{ my: 1 }} />}
              <ListItem
                sx={{
                  px: 0,
                  py: 2,
                  alignItems: 'flex-start',
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, mt: 0.5 }}>
                  <CheckIcon sx={{ color: STATUS_CONFIG[source.status || 'active'].color }} />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {source.name}
                      </Typography>
                      <Chip
                        label={TYPE_CONFIG[source.type].label}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.65rem',
                          backgroundColor: `${TYPE_CONFIG[source.type].color}20`,
                          color: TYPE_CONFIG[source.type].color,
                        }}
                      />
                      {source.status && (
                        <Chip
                          label={STATUS_CONFIG[source.status].label}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.65rem',
                            backgroundColor: `${STATUS_CONFIG[source.status].color}20`,
                            color: STATUS_CONFIG[source.status].color,
                          }}
                        />
                      )}
                    </Box>
                  }
                  secondary={
                    <Box>
                      {source.description && (
                        <Typography variant="body2" color="text.secondary" paragraph sx={{ mb: 1 }}>
                          {source.description}
                        </Typography>
                      )}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        {source.url && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <LinkIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography
                              variant="caption"
                              component="a"
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{
                                color: '#4FC3F7',
                                textDecoration: 'none',
                                '&:hover': {
                                  textDecoration: 'underline',
                                },
                              }}
                            >
                              {new URL(source.url).hostname}
                            </Typography>
                          </Box>
                        )}
                        {source.lastUpdated && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <ClockIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">
                              Updated {formatTimestamp(source.lastUpdated)}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Box>
                  }
                />
              </ListItem>
            </React.Fragment>
          ))}
        </List>

        {/* Methodology */}
        {data.methodology && (
          <Box
            sx={{
              p: 2,
              borderRadius: '12px',
              backgroundColor: 'rgba(102, 126, 234, 0.1)',
              border: '1px solid rgba(102, 126, 234, 0.3)',
              mb: 2,
            }}
          >
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              📊 Methodology
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {data.methodology}
            </Typography>
          </Box>
        )}

        {/* Disclaimer */}
        {data.disclaimer && (
          <Box
            sx={{
              p: 2,
              borderRadius: '12px',
              backgroundColor: 'rgba(255, 167, 38, 0.1)',
              border: '1px solid rgba(255, 167, 38, 0.3)',
            }}
          >
            <Typography variant="caption" color="text.secondary">
              <strong>⚠️ Disclaimer:</strong> {data.disclaimer}
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SourcesModal;
