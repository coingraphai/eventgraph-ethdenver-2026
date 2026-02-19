/**
 * EventGraph AI - Interactive Onboarding Tour
 * Professional spotlight tour that navigates to actual tabs
 * Highlights sidebar items and shows contextual tooltips
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  Paper,
  alpha,
  useTheme,
  IconButton,
  Fade,
  Chip,
  LinearProgress,
} from '@mui/material';
import {
  Close,
  ArrowForward,
  ArrowBack,
  ShowChart,
  SwapHoriz,
  FilterList,
  AutoAwesome,
  Rocket,
  TrendingUp,
  CheckCircle,
  NotificationsActive,
  AttachMoney,
} from '@mui/icons-material';
import { keyframes } from '@mui/system';
import { useNavigate, useLocation } from 'react-router-dom';

// ─── Animations ───────────────────────────────────────────────────────────────

const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const spotlightPulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.3), 0 0 0 8px rgba(99, 102, 241, 0.1); }
  50% { box-shadow: 0 0 0 6px rgba(99, 102, 241, 0.4), 0 0 0 12px rgba(99, 102, 241, 0.15); }
`;

// ─── Tour Step Definition ─────────────────────────────────────────────────────

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  route: string;
  targetId: string;
  tip?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'home',
    title: 'Home Dashboard',
    description: 'Your command center. See real-time platform stats, trending markets, and intelligence summaries across all prediction market platforms.',
    icon: <TrendingUp />,
    route: '/',
    targetId: 'nav-home',
    tip: 'The homepage refreshes automatically with live data from Polymarket, Kalshi, Limitless & OpinionTrade.',
  },
  {
    id: 'markets',
    title: 'Markets',
    description: 'Browse and explore events across all platforms. Filter by category — politics, crypto, sports, and more. Click any event to see deep analytics.',
    icon: <ShowChart />,
    route: '/events',
    targetId: 'nav-markets',
    tip: 'Click on any event card to see price history, volume trends, and cross-platform comparison.',
  },
  {
    id: 'screener',
    title: 'Screener',
    description: 'A powerful market screener that aggregates thousands of individual markets across platforms. Sort by volume, filter by platform, and find hidden opportunities.',
    icon: <FilterList />,
    route: '/screener',
    targetId: 'nav-screener',
    tip: 'Use the platform filter to compare market depth across Polymarket, Kalshi, and Limitless.',
  },
  {
    id: 'arbitrage',
    title: 'Arbitrage Scanner',
    description: 'Automatically detects price discrepancies across platforms. Find markets where you can buy low on one venue and sell high on another.',
    icon: <SwapHoriz />,
    route: '/arbitrage',
    targetId: 'nav-arbitrage',
    tip: 'Green highlights indicate profitable opportunities — the bigger the spread, the better the arb.',
  },
  {
    id: 'alerts',
    title: 'Alerts',
    description: 'Set custom price and volume alerts on any market. Get notified when markets move, new arb opportunities appear, or events reach your target probability.',
    icon: <NotificationsActive />,
    route: '/alerts',
    targetId: 'nav-alerts',
    tip: 'Create alerts on any market detail page by clicking the bell icon.',
  },
  {
    id: 'pricing',
    title: 'Pricing',
    description: 'Explore EventGraph plans — from free access with core features to Pro with unlimited alerts, AI queries, and real-time data across all platforms.',
    icon: <AttachMoney />,
    route: '/pricing',
    targetId: 'nav-pricing',
    tip: 'Start free and upgrade anytime. Pro unlocks unlimited AI queries and real-time alerts.',
  },
  {
    id: 'ai',
    title: 'Ask AI',
    description: 'Your intelligent research assistant. Ask anything about prediction markets — probabilities, market movements, historical analysis, or trading strategies.',
    icon: <AutoAwesome />,
    route: '/ask-predictions',
    targetId: 'nav-ai',
    tip: `Press ${typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl+K'} from anywhere to instantly open the AI assistant.`,
  },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const TOUR_COMPLETED_KEY = 'eventgraph_tour_completed';
const TOOLTIP_WIDTH = 380;
const TOOLTIP_OFFSET = 20;

// ─── Component ────────────────────────────────────────────────────────────────

interface OnboardingTourProps {
  forceShow?: boolean;
  onClose?: () => void;
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ forceShow = false, onClose }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [showWelcome, setShowWelcome] = useState(true);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  const step = TOUR_STEPS[currentStep];
  const isLastStep = currentStep === TOUR_STEPS.length - 1;
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  // ─── Auto-show for first-time users ───────────────────────────────────────
  useEffect(() => {
    const completed = localStorage.getItem(TOUR_COMPLETED_KEY);
    if (forceShow) {
      setOpen(true);
      setShowWelcome(true);
      setCurrentStep(0);
    } else if (!completed && location.pathname === '/') {
      const timer = setTimeout(() => {
        setOpen(true);
        setShowWelcome(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [forceShow, location.pathname]);

  // ─── Find and track the spotlight target ──────────────────────────────────
  const updateSpotlight = useCallback(() => {
    if (!open || showWelcome) return;
    const el = document.querySelector(`[data-tour-id="${step.targetId}"]`);
    if (el) {
      const rect = el.getBoundingClientRect();
      setSpotlightRect(rect);
    }
  }, [open, showWelcome, step?.targetId]);

  useEffect(() => {
    if (!open || showWelcome) return;
    updateSpotlight();
    const onResize = () => updateSpotlight();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, showWelcome, currentStep, updateSpotlight]);

  // ─── Navigate to the route for the current step ──────────────────────────
  useEffect(() => {
    if (!open || showWelcome) return;
    if (step.route && step.route !== location.pathname) {
      navigate(step.route);
    }
    const timer = setTimeout(() => {
      setTransitioning(false);
      updateSpotlight();
    }, 300);
    return () => clearTimeout(timer);
  }, [currentStep, open, showWelcome]);

  // ─── Navigation handlers ─────────────────────────────────────────────────
  const handleStartTour = () => {
    setShowWelcome(false);
    setCurrentStep(0);
    if (TOUR_STEPS[0].route !== location.pathname) {
      navigate(TOUR_STEPS[0].route);
    }
    setTimeout(updateSpotlight, 350);
  };

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setTransitioning(true);
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setTransitioning(true);
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleStepClick = (index: number) => {
    setTransitioning(true);
    setCurrentStep(index);
  };

  const handleComplete = () => {
    localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
    setOpen(false);
    setShowWelcome(true);
    setCurrentStep(0);
    navigate('/');
    onClose?.();
  };

  const handleSkip = () => {
    localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
    setOpen(false);
    setShowWelcome(true);
    setCurrentStep(0);
    navigate('/');
    onClose?.();
  };

  // ─── Keyboard navigation ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkip();
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (showWelcome) handleStartTour();
        else handleNext();
      }
      if (e.key === 'ArrowLeft' && !showWelcome) handleBack();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, showWelcome, currentStep]);

  if (!open) return null;

  // ─── WELCOME SCREEN ──────────────────────────────────────────────────────
  if (showWelcome) {
    return (
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: alpha(theme.palette.common.black, 0.75),
          backdropFilter: 'blur(8px)',
        }}
        onClick={handleSkip}
      >
        <Paper
          elevation={24}
          onClick={(e) => e.stopPropagation()}
          sx={{
            width: { xs: '92%', sm: 460 },
            maxWidth: 460,
            borderRadius: 4,
            overflow: 'hidden',
            animation: `${fadeInUp} 0.4s ease`,
            border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
          }}
        >
          {/* Gradient header */}
          <Box
            sx={{
              p: 4,
              pb: 3,
              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.12)} 0%, ${alpha(theme.palette.primary.dark, 0.06)} 100%)`,
              textAlign: 'center',
            }}
          >
            <Box
              sx={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 2.5,
                boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.3)}`,
              }}
            >
              <Rocket sx={{ fontSize: 36, color: 'white' }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
              Welcome to EventGraph AI
            </Typography>
            <Typography color="text.secondary" sx={{ lineHeight: 1.6 }}>
              The Bloomberg Terminal for Prediction Markets. Let's take a quick tour of the platform.
            </Typography>
          </Box>

          {/* Step preview chips */}
          <Box sx={{ px: 3, pt: 2.5, pb: 1 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1.5, display: 'block' }}>
              What you'll see
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {TOUR_STEPS.map((s) => (
                <Chip
                  key={s.id}
                  icon={<Box sx={{ display: 'flex', color: 'inherit' }}>{s.icon}</Box>}
                  label={s.title}
                  size="small"
                  variant="outlined"
                  sx={{
                    borderRadius: 2,
                    borderColor: alpha(theme.palette.divider, 0.3),
                    fontSize: '0.75rem',
                    '& .MuiChip-icon': { fontSize: 16, ml: 0.5 },
                  }}
                />
              ))}
            </Stack>
          </Box>

          {/* Actions */}
          <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button onClick={handleSkip} sx={{ color: 'text.secondary', fontSize: '0.8rem', textTransform: 'none' }}>
              Skip Tour
            </Button>
            <Button
              variant="contained"
              endIcon={<ArrowForward />}
              onClick={handleStartTour}
              sx={{
                borderRadius: 2.5,
                px: 3,
                py: 1,
                fontWeight: 600,
                textTransform: 'none',
                fontSize: '0.9rem',
                background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.3)}`,
                '&:hover': {
                  boxShadow: `0 6px 20px ${alpha(theme.palette.primary.main, 0.4)}`,
                },
              }}
            >
              Start Tour
            </Button>
          </Box>

          {/* Keyboard hint */}
          <Box sx={{ px: 3, pb: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              Use{' '}
              <kbd style={{ padding: '1px 5px', borderRadius: 3, border: `1px solid ${alpha(theme.palette.divider, 0.3)}`, fontSize: '0.65rem', fontFamily: 'inherit' }}>←</kbd>{' '}
              <kbd style={{ padding: '1px 5px', borderRadius: 3, border: `1px solid ${alpha(theme.palette.divider, 0.3)}`, fontSize: '0.65rem', fontFamily: 'inherit' }}>→</kbd>{' '}
              arrow keys to navigate •{' '}
              <kbd style={{ padding: '1px 5px', borderRadius: 3, border: `1px solid ${alpha(theme.palette.divider, 0.3)}`, fontSize: '0.65rem', fontFamily: 'inherit' }}>Esc</kbd>{' '}
              to skip
            </Typography>
          </Box>
        </Paper>
      </Box>
    );
  }

  // ─── SPOTLIGHT TOUR (actual interactive tour) ─────────────────────────────

  // Clamp tooltip so it never goes below viewport
  const TOOLTIP_HEIGHT_ESTIMATE = 320; // approximate height of the tooltip card
  const tooltipTop = spotlightRect
    ? Math.min(
        Math.max(16, spotlightRect.top - 20),
        window.innerHeight - TOOLTIP_HEIGHT_ESTIMATE - 16
      )
    : '50%';
  const tooltipLeft = spotlightRect
    ? spotlightRect.right + TOOLTIP_OFFSET
    : 120;

  return (
    <>
      {/* Overlay with cutout for the spotlight target */}
      {spotlightRect ? (
        <Box
          onClick={handleSkip}
          sx={{
            position: 'fixed',
            top: spotlightRect.top - 6,
            left: spotlightRect.left - 6,
            width: spotlightRect.width + 12,
            height: spotlightRect.height + 12,
            zIndex: 9998,
            borderRadius: '10px',
            boxShadow: `0 0 0 9999px ${alpha(theme.palette.common.black, 0.55)}`,
            pointerEvents: 'none',
            transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      ) : (
        <Box
          onClick={handleSkip}
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            backgroundColor: alpha(theme.palette.common.black, 0.55),
            backdropFilter: 'blur(3px)',
          }}
        />
      )}

      {/* Spotlight cutout on the sidebar item */}
      {spotlightRect && (
        <Box
          sx={{
            position: 'fixed',
            top: spotlightRect.top - 6,
            left: spotlightRect.left - 6,
            width: spotlightRect.width + 12,
            height: spotlightRect.height + 12,
            zIndex: 9999,
            borderRadius: 2.5,
            border: `2px solid ${alpha(theme.palette.primary.main, 0.6)}`,
            backgroundColor: 'transparent',
            animation: `${spotlightPulse} 2s ease-in-out infinite`,
            transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Tooltip card */}
      <Fade in={!transitioning} timeout={250}>
        <Paper
          elevation={16}
          onClick={(e) => e.stopPropagation()}
          sx={{
            position: 'fixed',
            top: tooltipTop,
            left: tooltipLeft,
            width: TOOLTIP_WIDTH,
            zIndex: 10000,
            borderRadius: 3,
            overflow: 'hidden',
            border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
            animation: `${fadeInUp} 0.3s ease`,
            transition: 'top 0.35s cubic-bezier(0.4, 0, 0.2, 1), left 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {/* Progress bar */}
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              height: 3,
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
              '& .MuiLinearProgress-bar': {
                background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.primary.light})`,
                borderRadius: 2,
                transition: 'transform 0.4s ease',
              },
            }}
          />

          {/* Header row */}
          <Box sx={{ px: 2.5, pt: 2, pb: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.15)} 0%, ${alpha(theme.palette.primary.dark, 0.08)} 100%)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'primary.main',
                  flexShrink: 0,
                }}
              >
                {step.icon}
              </Box>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {step.title}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  Step {currentStep + 1} of {TOUR_STEPS.length}
                </Typography>
              </Box>
            </Stack>
            <IconButton
              size="small"
              onClick={handleSkip}
              sx={{ color: 'text.secondary', mt: -0.5, mr: -1, '&:hover': { color: 'text.primary' } }}
            >
              <Close sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>

          {/* Description */}
          <Box sx={{ px: 2.5, py: 1.5 }}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ lineHeight: 1.65, fontSize: '0.82rem' }}
            >
              {step.description}
            </Typography>
          </Box>

          {/* Pro tip */}
          {step.tip && (
            <Box
              sx={{
                mx: 2.5,
                mb: 1.5,
                p: 1.5,
                borderRadius: 2,
                backgroundColor: alpha(theme.palette.primary.main, 0.06),
                border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
              }}
            >
              <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600, fontSize: '0.72rem', lineHeight: 1.5 }}>
                💡 {step.tip}
              </Typography>
            </Box>
          )}

          {/* Step indicators (clickable dots) */}
          <Box sx={{ px: 2.5, display: 'flex', gap: 0.75, justifyContent: 'center', mb: 1 }}>
            {TOUR_STEPS.map((s, i) => (
              <Box
                key={s.id}
                onClick={() => handleStepClick(i)}
                sx={{
                  width: i === currentStep ? 20 : 8,
                  height: 8,
                  borderRadius: 4,
                  cursor: 'pointer',
                  backgroundColor: i === currentStep
                    ? theme.palette.primary.main
                    : i < currentStep
                      ? alpha(theme.palette.primary.main, 0.4)
                      : alpha(theme.palette.text.secondary, 0.2),
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    backgroundColor: i === currentStep
                      ? theme.palette.primary.main
                      : alpha(theme.palette.primary.main, 0.5),
                    transform: 'scale(1.2)',
                  },
                }}
              />
            ))}
          </Box>

          {/* Actions */}
          <Box
            sx={{
              px: 2.5,
              py: 1.5,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
            }}
          >
            <Button
              onClick={handleSkip}
              size="small"
              sx={{
                color: 'text.secondary',
                fontSize: '0.75rem',
                textTransform: 'none',
                '&:hover': { color: 'text.primary' },
              }}
            >
              Skip
            </Button>

            <Stack direction="row" spacing={1}>
              {currentStep > 0 && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<ArrowBack sx={{ fontSize: 16 }} />}
                  onClick={handleBack}
                  sx={{
                    borderRadius: 2,
                    textTransform: 'none',
                    fontSize: '0.8rem',
                    borderColor: alpha(theme.palette.divider, 0.3),
                    color: 'text.secondary',
                    '&:hover': {
                      borderColor: 'primary.main',
                      color: 'primary.main',
                    },
                  }}
                >
                  Back
                </Button>
              )}
              <Button
                variant="contained"
                size="small"
                endIcon={isLastStep ? <CheckCircle sx={{ fontSize: 16 }} /> : <ArrowForward sx={{ fontSize: 16 }} />}
                onClick={handleNext}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontSize: '0.8rem',
                  px: 2,
                  fontWeight: 600,
                  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                  boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.25)}`,
                  '&:hover': {
                    boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.35)}`,
                  },
                }}
              >
                {isLastStep ? 'Finish' : 'Next'}
              </Button>
            </Stack>
          </Box>
        </Paper>
      </Fade>
    </>
  );
};

// ─── Hook to trigger tour from anywhere ─────────────────────────────────────

export const useTour = () => {
  const resetTour = () => {
    localStorage.removeItem(TOUR_COMPLETED_KEY);
    window.location.href = '/';
  };

  const isTourCompleted = () => {
    return localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
  };

  return { resetTour, isTourCompleted };
};

export default OnboardingTour;
