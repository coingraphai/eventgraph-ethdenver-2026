import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Box } from '@mui/material';
import { ThemeProvider } from './contexts/ThemeContext';
import { PremiumSidebar, SIDEBAR_WIDTH_EXPORT } from './layouts/PremiumSidebar';
import { AppHeader } from './layouts/AppHeader';
import { Home } from './pages/Home';
import { Predictions } from './pages/Predictions';
import { Screener } from './pages/Screener';
import { EventsPage } from './pages/EventsPage';
import { EventDetailDBPage } from './pages/EventDetailDBPage';
import { EventAnalyticsPageV2 } from './pages/EventAnalyticsPageV2';
import { Arbitrage } from './pages/Arbitrage';
import { CrossVenue } from './pages/CrossVenue';
import { Leaderboard } from './pages/Leaderboard';
import { Alerts } from './pages/Alerts';
import { Execution } from './pages/Execution';
import { Pricing } from './pages/Pricing';
import { Terms } from './pages/Terms';
import { Privacy } from './pages/Privacy';
import { NotFound } from './pages/NotFound';
import { OnboardingTour } from './components/OnboardingTour';
import { Footer } from './components/Footer';
import { useSessionId } from './hooks/useSessionId';
import usePageTracking from './hooks/useGoogleAnalytics';
import { initializeGlobalPrefetch } from './services/globalPrefetch';

function AppContent() {
  // Track page views automatically
  usePageTracking();
  
  const sessionId = useSessionId();
  const [activePredictionSessionId, setActivePredictionSessionId] = useState<number | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [newChatTrigger, setNewChatTrigger] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  
  // Use sessionId as userId
  const userId = sessionId;

  // Initialize global data prefetch on app load
  useEffect(() => {
    initializeGlobalPrefetch();
  }, []);

  // Keyboard shortcuts - ⌘K for AI (like Bloomberg command line)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        handleNewChat();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNewChat = () => {
    setActivePredictionSessionId(null);
    navigate('/ask-predictions');
    setRefreshTrigger(prev => prev + 1);
    setNewChatTrigger(prev => prev + 1);
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Premium Sidebar Navigation */}
      <PremiumSidebar onNewChat={handleNewChat} />
      
      {/* Main Content Area */}
      <Box
        sx={{
          flexGrow: 1,
          marginLeft: `${SIDEBAR_WIDTH_EXPORT}px`,
          minHeight: '100vh',
          maxWidth: `calc(100vw - ${SIDEBAR_WIDTH_EXPORT}px)`,
          backgroundColor: 'background.default',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Global Header */}
        <AppHeader onAskAI={handleNewChat} />
        
        {/* Page Content */}
        <Box
          component="main"
          sx={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          <Routes>
            {/* Home Dashboard */}
            <Route path="/" element={<Home />} />
            
            {/* Core Terminal Routes */}
            {/* TODO: re-enable when Events page is complete */}
            {/* <Route path="/events" element={<EventsPage />} /> */}
            {/* <Route path="/events/:platform/:eventId" element={<EventDetailDBPage />} /> */}
            <Route path="/event/:platform/:eventId" element={<EventAnalyticsPageV2 />} />
            <Route path="/screener" element={<Screener />} />
            <Route path="/arbitrage" element={<Arbitrage />} />
            <Route path="/cross-venue" element={<CrossVenue />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/execution" element={<Execution />} />
            <Route path="/vault" element={<Execution />} />
            
            {/* Legal & Info Pages */}
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            
            {/* AI Assistant */}
            <Route 
              path="/ask-predictions" 
              element={
                <Predictions 
                  activeSessionId={activePredictionSessionId}
                  newChatTrigger={newChatTrigger}
                  onSessionCreated={() => setRefreshTrigger(prev => prev + 1)} 
                />
              } 
            />
            
            {/* 404 Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Box>
        
        {/* Onboarding Tour for first-time users */}
        <OnboardingTour />
      </Box>
    </Box>
  );
}

function App() {
  return (
    <ThemeProvider>
      <Router>
        <AppContent />
      </Router>
    </ThemeProvider>
  );
}

export default App;
