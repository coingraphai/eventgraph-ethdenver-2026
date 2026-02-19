import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Grid,
  LinearProgress,
  Alert,
} from '@mui/material';
import {
  TrendingUp as BullishIcon,
  TrendingDown as BearishIcon,
  Remove as NeutralIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Info as InfoIcon,
} from '@mui/icons-material';

export interface InsightItem {
  id: string;
  category: 'market' | 'technical' | 'onchain' | 'sentiment' | 'risk';
  title: string;
  description: string;
  sentiment?: 'bullish' | 'bearish' | 'neutral';
  confidence?: number; // 0-100
  severity?: 'info' | 'warning' | 'critical';
  sources?: string[];
}

export interface IntelligenceData {
  summary: string;
  keyInsights: InsightItem[];
  riskFactors?: InsightItem[];
  opportunities?: InsightItem[];
  timestamp?: number;
}

interface IntelligencePanelProps {
  data: IntelligenceData;
}

const CATEGORY_CONFIG = {
  market: { label: 'Market Analysis', color: '#4FC3F7' },
  technical: { label: 'Technical', color: '#AB47BC' },
  onchain: { label: 'On-Chain', color: '#66BB6A' },
  sentiment: { label: 'Sentiment', color: '#FFA726' },
  risk: { label: 'Risk', color: '#FF7043' },
};

const SENTIMENT_ICONS = {
  bullish: <BullishIcon sx={{ color: '#26a69a' }} />,
  bearish: <BearishIcon sx={{ color: '#ef5350' }} />,
  neutral: <NeutralIcon sx={{ color: '#9e9e9e' }} />,
};

const SEVERITY_CONFIG = {
  info: { icon: <InfoIcon />, color: '#4FC3F7' },
  warning: { icon: <WarningIcon />, color: '#FFA726' },
  critical: { icon: <WarningIcon />, color: '#ef5350' },
};

const IntelligencePanel: React.FC<IntelligencePanelProps> = ({ data }) => {
  const renderInsight = (insight: InsightItem) => (
    <Card
      key={insight.id}
      sx={{
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        height: '100%',
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
          {/* Sentiment indicator */}
          {insight.sentiment && (
            <Box sx={{ mt: 0.5 }}>
              {SENTIMENT_ICONS[insight.sentiment]}
            </Box>
          )}
          
          {/* Severity indicator */}
          {insight.severity && (
            <Box sx={{ mt: 0.5, color: SEVERITY_CONFIG[insight.severity].color }}>
              {SEVERITY_CONFIG[insight.severity].icon}
            </Box>
          )}

          <Box sx={{ flex: 1 }}>
            {/* Category chip */}
            <Chip
              label={CATEGORY_CONFIG[insight.category].label}
              size="small"
              sx={{
                backgroundColor: `${CATEGORY_CONFIG[insight.category].color}20`,
                color: CATEGORY_CONFIG[insight.category].color,
                height: 20,
                fontSize: '0.7rem',
                mb: 1,
              }}
            />

            {/* Title */}
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              {insight.title}
            </Typography>

            {/* Description */}
            <Typography variant="body2" color="text.secondary" paragraph>
              {insight.description}
            </Typography>

            {/* Confidence score */}
            {insight.confidence !== undefined && (
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Confidence
                  </Typography>
                  <Typography variant="caption" fontWeight={600}>
                    {insight.confidence}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={insight.confidence}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 3,
                      backgroundColor:
                        insight.confidence > 75
                          ? '#26a69a'
                          : insight.confidence > 50
                          ? '#FFA726'
                          : '#ef5350',
                    },
                  }}
                />
              </Box>
            )}

            {/* Sources */}
            {insight.sources && insight.sources.length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Sources: {insight.sources.join(', ')}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  return (
    <Box>
      {/* AI Summary */}
      <Alert
        icon={<CheckIcon />}
        severity="success"
        sx={{
          mb: 3,
          borderRadius: '12px',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          border: '1px solid rgba(102, 126, 234, 0.3)',
        }}
      >
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          AI-Generated Intelligence Summary
        </Typography>
        <Typography variant="body2">{data.summary}</Typography>
        {data.timestamp && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Generated {new Date(data.timestamp).toLocaleString()}
          </Typography>
        )}
      </Alert>

      {/* Key Insights */}
      {data.keyInsights && data.keyInsights.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Key Insights
          </Typography>
          <Grid container spacing={2}>
            {data.keyInsights.map((insight) => (
              <Grid item xs={12} md={6} key={insight.id}>
                {renderInsight(insight)}
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Risk Factors */}
      {data.riskFactors && data.riskFactors.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom sx={{ color: '#FF7043' }}>
            ⚠️ Risk Factors
          </Typography>
          <Grid container spacing={2}>
            {data.riskFactors.map((insight) => (
              <Grid item xs={12} md={6} key={insight.id}>
                {renderInsight(insight)}
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Opportunities */}
      {data.opportunities && data.opportunities.length > 0 && (
        <Box>
          <Typography variant="h6" fontWeight={600} gutterBottom sx={{ color: '#26a69a' }}>
            🎯 Opportunities
          </Typography>
          <Grid container spacing={2}>
            {data.opportunities.map((insight) => (
              <Grid item xs={12} md={6} key={insight.id}>
                {renderInsight(insight)}
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
    </Box>
  );
};

export default IntelligencePanel;
