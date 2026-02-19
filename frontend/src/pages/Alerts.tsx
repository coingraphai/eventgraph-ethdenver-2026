/**
 * Alerts Page - User notification management
 * Create and manage alerts for arbitrage opportunities
 */

import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, Button, Stack, TextField, Select, MenuItem,
  FormControl, InputLabel, Alert as MuiAlert, IconButton, Chip, Grid,
  Dialog, DialogTitle, DialogContent, DialogActions, alpha, useTheme, Divider,
} from '@mui/material';
import {
  Add, Delete, Notifications, NotificationsActive, Email, Telegram,
  TrendingUp, ShowChart, AccessTime, CheckCircle,
} from '@mui/icons-material';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface Alert {
  id: number;
  user_email: string;
  alert_type: string;
  alert_name: string;
  conditions: Record<string, any>;
  status: string;
  email_enabled: boolean;
  telegram_enabled: boolean;
  created_at: string;
  last_triggered_at: string | null;
  trigger_count: number;
}

const ALERT_TYPES = [
  { value: 'arbitrage', label: 'Arbitrage Opportunities', icon: <TrendingUp /> },
  { value: 'price_movement', label: 'Price Movement', icon: <ShowChart /> },
  { value: 'market_close', label: 'Market Closing Soon', icon: <AccessTime /> },
];

export const Alerts: React.FC = () => {
  const theme = useTheme();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    user_email: '',
    alert_type: 'arbitrage',
    alert_name: '',
    min_spread: 15,
    min_confidence: 'medium',
    email_enabled: true,
    telegram_enabled: false,
  });

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/alerts/`);
      if (!response.ok) throw new Error('Failed to fetch alerts');
      const data = await response.json();
      setAlerts(data);
    } catch (err: any) {
      // Silently fail - show empty alerts list
      console.warn('Could not fetch alerts:', err.message);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  const createAlert = async () => {
    try {
      const payload = {
        user_email: formData.user_email,
        alert_type: formData.alert_type,
        alert_name: formData.alert_name,
        conditions: { min_spread: formData.min_spread, min_confidence: formData.min_confidence },
        email_enabled: formData.email_enabled,
        telegram_enabled: formData.telegram_enabled,
      };

      const response = await fetch(`${API_BASE}/api/alerts/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create alert');
      }

      setSuccess('Alert created successfully!');
      setCreateDialogOpen(false);
      fetchAlerts();
      setFormData({
        user_email: '',
        alert_type: 'arbitrage',
        alert_name: '',
        min_spread: 15,
        min_confidence: 'medium',
        email_enabled: true,
        telegram_enabled: false,
      });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const deleteAlert = async (alertId: number) => {
    try {
      const response = await fetch(`${API_BASE}/api/alerts/${alertId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete alert');
      setSuccess('Alert deleted successfully');
      fetchAlerts();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getAlertTypeLabel = (type: string) => {
    return ALERT_TYPES.find(t => t.value === type)?.label || type;
  };

  return (
    <Box sx={{ p: 3, minHeight: '100vh', backgroundColor: 'background.default' }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <NotificationsActive sx={{ color: 'primary.main', fontSize: 32 }} />
            Alerts
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Get notified when market conditions match your criteria • Email notifications working
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => setCreateDialogOpen(true)} size="large">
          Create Alert
        </Button>
      </Box>

      {/* Status Messages */}
      {error && <MuiAlert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</MuiAlert>}
      {success && <MuiAlert severity="success" onClose={() => setSuccess(null)} sx={{ mb: 2 }}>{success}</MuiAlert>}

      {/* Alerts List */}
      {loading ? (
        <Typography>Loading alerts...</Typography>
      ) : alerts.length === 0 ? (
        <Paper elevation={0} sx={{ p: 6, textAlign: 'center', backgroundColor: alpha(theme.palette.background.paper, 0.6), borderRadius: 2, border: `1px solid ${alpha(theme.palette.divider, 0.1)}` }}>
          <Notifications sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No alerts configured
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Create your first alert to get notified about arbitrage opportunities
          </Typography>
          <Button variant="contained" startIcon={<Add />} onClick={() => setCreateDialogOpen(true)}>
            Create Your First Alert
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {alerts.map((alert) => (
            <Grid item xs={12} md={6} key={alert.id}>
              <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2, backgroundColor: alpha(theme.palette.background.paper, 0.8), border: `1px solid ${alpha(theme.palette.divider, 0.1)}`, transition: 'all 0.2s ease', '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.03), boxShadow: `0 4px 12px ${alpha(theme.palette.common.black, 0.08)}` }}}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>{alert.alert_name}</Typography>
                    <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                      <Chip label={getAlertTypeLabel(alert.alert_type)} size="small" sx={{ backgroundColor: alpha(theme.palette.primary.main, 0.1) }} />
                      <Chip label={alert.status} size="small" color={alert.status === 'active' ? 'success' : 'default'} />
                    </Stack>
                  </Box>
                  <IconButton size="small" onClick={() => deleteAlert(alert.id)} sx={{ color: 'error.main' }}>
                    <Delete />
                  </IconButton>
                </Box>

                <Divider sx={{ my: 1.5 }} />

                {/* Conditions */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                    Conditions:
                  </Typography>
                  {alert.alert_type === 'arbitrage' && (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip label={`Min Spread: ${alert.conditions.min_spread || 10}%`} size="small" variant="outlined" />
                      {alert.conditions.min_confidence && (
                        <Chip label={`Confidence: ${alert.conditions.min_confidence}`} size="small" variant="outlined" />
                      )}
                    </Stack>
                  )}
                </Box>

                {/* Notification Channels */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                    Notification Channels:
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    {alert.email_enabled && <Chip icon={<Email />} label={alert.user_email} size="small" color="primary" />}
                    {alert.telegram_enabled && <Chip icon={<Telegram />} label="Telegram" size="small" color="info" />}
                  </Stack>
                </Box>

                {/* Stats */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary">
                    {alert.trigger_count > 0 ? (
                      <>
                        <CheckCircle sx={{ fontSize: 14, verticalAlign: 'middle', mr: 0.5 }} />
                        Triggered {alert.trigger_count} time{alert.trigger_count > 1 ? 's' : ''}
                      </>
                    ) : 'Not triggered yet'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Created {new Date(alert.created_at).toLocaleDateString()}
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create Alert Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Alert</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField label="Alert Name" fullWidth value={formData.alert_name} onChange={(e) => setFormData({ ...formData, alert_name: e.target.value })} placeholder="e.g., High Spread Arbitrage" />
            <TextField label="Your Email" type="email" fullWidth value={formData.user_email} onChange={(e) => setFormData({ ...formData, user_email: e.target.value })} placeholder="your@email.com" />
            
            <FormControl fullWidth>
              <InputLabel>Alert Type</InputLabel>
              <Select value={formData.alert_type} label="Alert Type" onChange={(e) => setFormData({ ...formData, alert_type: e.target.value })}>
                {ALERT_TYPES.map((type) => (
                  <MenuItem key={type.value} value={type.value}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{type.icon}{type.label}</Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {formData.alert_type === 'arbitrage' && (
              <>
                <TextField label="Minimum Spread (%)" type="number" fullWidth value={formData.min_spread} onChange={(e) => setFormData({ ...formData, min_spread: Number(e.target.value) })} helperText="Alert when arbitrage spread exceeds this percentage" />
                <FormControl fullWidth>
                  <InputLabel>Minimum Confidence</InputLabel>
                  <Select value={formData.min_confidence} label="Minimum Confidence" onChange={(e) => setFormData({ ...formData, min_confidence: e.target.value })}>
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                  </Select>
                </FormControl>
              </>
            )}

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Notification Channels (Email working, Telegram coming soon):
              </Typography>
              <Stack direction="row" spacing={1}>
                <Chip icon={<Email />} label="Email" color={formData.email_enabled ? 'primary' : 'default'} onClick={() => setFormData({ ...formData, email_enabled: !formData.email_enabled })} clickable />
                <Chip icon={<Telegram />} label="Telegram (Coming Soon)" disabled onClick={() => setFormData({ ...formData, telegram_enabled: !formData.telegram_enabled })} />
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={createAlert} disabled={!formData.alert_name || !formData.user_email}>
            Create Alert
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Alerts;
