/**
 * useAlerts Hook
 * Manages price alerts with localStorage persistence
 */

import { useState, useEffect, useCallback } from 'react';

const ALERTS_STORAGE_KEY = 'coingraph_alerts';

export type AlertCondition = 'above' | 'below' | 'change';
export type AlertType = 'price' | 'volume' | 'liquidity';

export interface Alert {
  id: string;
  marketId: string;
  marketTitle: string;
  type: AlertType;
  condition: AlertCondition;
  targetValue: number;
  enabled: boolean;
  createdAt: number;
  triggeredAt?: number;
  notificationSent?: boolean;
}

interface UseAlertsReturn {
  alerts: Alert[];
  activeAlerts: Alert[];
  getAlertsForMarket: (marketId: string) => Alert[];
  createAlert: (alert: Omit<Alert, 'id' | 'createdAt'>) => Alert;
  updateAlert: (id: string, updates: Partial<Alert>) => void;
  deleteAlert: (id: string) => void;
  toggleAlert: (id: string) => void;
  clearAllAlerts: () => void;
  alertsCount: number;
}

function generateAlertId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function useAlerts(): UseAlertsReturn {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(ALERTS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setAlerts(Array.isArray(parsed) ? parsed : []);
      }
    } catch (error) {
      console.error('Failed to load alerts from localStorage:', error);
      setAlerts([]);
    }
  }, []);

  // Save to localStorage when alerts change
  useEffect(() => {
    try {
      localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
    } catch (error) {
      console.error('Failed to save alerts to localStorage:', error);
    }
  }, [alerts]);

  // Get only enabled alerts
  const activeAlerts = alerts.filter(alert => alert.enabled);

  const getAlertsForMarket = useCallback((marketId: string): Alert[] => {
    return alerts.filter(alert => alert.marketId === marketId);
  }, [alerts]);

  const createAlert = useCallback((alertData: Omit<Alert, 'id' | 'createdAt'>): Alert => {
    const newAlert: Alert = {
      ...alertData,
      id: generateAlertId(),
      createdAt: Date.now(),
    };
    
    setAlerts(prev => [...prev, newAlert]);
    return newAlert;
  }, []);

  const updateAlert = useCallback((id: string, updates: Partial<Alert>) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === id ? { ...alert, ...updates } : alert
    ));
  }, []);

  const deleteAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== id));
  }, []);

  const toggleAlert = useCallback((id: string) => {
    setAlerts(prev => prev.map(alert =>
      alert.id === id ? { ...alert, enabled: !alert.enabled } : alert
    ));
  }, []);

  const clearAllAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  return {
    alerts,
    activeAlerts,
    getAlertsForMarket,
    createAlert,
    updateAlert,
    deleteAlert,
    toggleAlert,
    clearAllAlerts,
    alertsCount: alerts.length,
  };
}

export default useAlerts;
