import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Declare gtag function for TypeScript
declare global {
  interface Window {
    gtag: (
      command: 'config' | 'event' | 'js' | 'set',
      targetId: string | Date,
      config?: Record<string, any>
    ) => void;
    dataLayer: any[];
  }
}

const GA_MEASUREMENT_ID = 'G-S5ZR4P5V4P';

/**
 * Hook to track page views automatically
 */
export const usePageTracking = () => {
  const location = useLocation();

  useEffect(() => {
    if (typeof window.gtag !== 'undefined') {
      window.gtag('config', GA_MEASUREMENT_ID, {
        page_path: location.pathname + location.search,
      });
    }
  }, [location]);
};

/**
 * Track custom events
 * @param eventName - Name of the event
 * @param eventParams - Additional parameters for the event
 */
export const trackEvent = (eventName: string, eventParams?: Record<string, any>) => {
  if (typeof window.gtag !== 'undefined') {
    window.gtag('event', eventName, eventParams);
  }
};

/**
 * Track specific user actions
 */
export const analytics = {
  // Chat interactions
  chatMessage: (mode: 'normal' | 'deeper_research', hasChart: boolean) => {
    trackEvent('chat_message_sent', {
      mode,
      chart_enabled: hasChart,
    });
  },

  // Question interactions
  exploreQuestionClick: (category: string) => {
    trackEvent('explore_question_click', {
      category,
    });
  },

  categoryQuestionClick: (category: string, question: string) => {
    trackEvent('category_question_click', {
      category,
      question,
    });
  },

  // Subscription actions
  upgradeClick: (source: string) => {
    trackEvent('upgrade_button_click', {
      source,
    });
  },

  paymentInitiated: (plan: string) => {
    trackEvent('payment_initiated', {
      plan,
    });
  },

  paymentSuccess: (plan: string) => {
    trackEvent('payment_success', {
      plan,
    });
  },

  // Wallet actions
  walletConnect: (walletType: string) => {
    trackEvent('wallet_connected', {
      wallet_type: walletType,
    });
  },

  walletDisconnect: () => {
    trackEvent('wallet_disconnected');
  },

  // Chart interactions
  chartGenerated: (chartType: string) => {
    trackEvent('chart_generated', {
      chart_type: chartType,
    });
  },

  chartDownload: (format: string) => {
    trackEvent('chart_downloaded', {
      format,
    });
  },

  // Navigation
  categoryView: (category: string) => {
    trackEvent('category_viewed', {
      category,
    });
  },

  // Theme toggle
  themeToggle: (theme: 'light' | 'dark') => {
    trackEvent('theme_changed', {
      theme,
    });
  },

  // Chat history
  chatHistoryView: () => {
    trackEvent('chat_history_viewed');
  },

  newChatStarted: () => {
    trackEvent('new_chat_started');
  },

  chatDeleted: () => {
    trackEvent('chat_deleted');
  },
};

export default usePageTracking;
