/**
 * Agent Packs Configuration
 * 
 * Defines curated collections of agents for different user needs:
 * - Simple Packs: For beginners and casual users
 * - Advanced Packs: For traders and power users
 */

import { AgentPack } from './agentSchema';

// ============================================
// SIMPLE PACKS
// ============================================

export const SIMPLE_PACKS: AgentPack[] = [
  {
    id: 'daily-crypto-brief',
    name: 'Daily Crypto Brief',
    description: 'Essential morning briefing with market overview, gas prices, and trending tokens',
    type: 'simple',
    icon: '📰',
    agentIds: [
      'chain-health-monitor',
      'gas-fee-intelligence',
      'token-deep-dive',
    ],
    isEnabled: true,
  },
  {
    id: 'token-safety-pack',
    name: 'Token Safety Pack',
    description: 'Comprehensive token safety checks before investing',
    type: 'simple',
    icon: '🛡️',
    agentIds: [
      'token-deep-dive',
      'token-safety-checker',
      'dex-liquidity-analyzer',
    ],
    isEnabled: true,
  },
  {
    id: 'newbie-trading-pack',
    name: 'Newbie Trading Pack',
    description: 'Perfect starter pack for new crypto traders',
    type: 'simple',
    icon: '🎓',
    agentIds: [
      'gas-fee-intelligence',
      'best-swap-route',
      'token-deep-dive',
    ],
    isEnabled: true,
  },
  {
    id: 'portfolio-starter',
    name: 'Portfolio Starter Pack',
    description: 'Build and track your first crypto portfolio',
    type: 'simple',
    icon: '💼',
    agentIds: [
      'token-deep-dive',
      'chain-health-monitor',
      'defi-protocol-analyzer',
    ],
    isEnabled: true,
  },
  {
    id: 'defi-starter',
    name: 'DeFi Starter Pack',
    description: 'Start your DeFi journey safely',
    type: 'simple',
    icon: '🏦',
    agentIds: [
      'defi-protocol-analyzer',
      'stablecoin-depeg-risk',
      'best-swap-route',
    ],
    isEnabled: true,
  },
];

// ============================================
// ADVANCED PACKS
// ============================================

export const ADVANCED_PACKS: AgentPack[] = [
  {
    id: 'advanced-trading-terminal',
    name: 'Advanced Trading Terminal',
    description: 'Complete trading toolkit with derivatives, funding, and liquidation data',
    type: 'advanced',
    icon: '📊',
    agentIds: [
      'token-deep-dive',
      'funding-oi-agent',
      'liquidation-heatmap',
      'cex-liquidity-quality',
    ],
    isEnabled: true,
  },
  {
    id: 'derivatives-command',
    name: 'Derivatives Command Pack',
    description: 'Master perpetuals and futures with comprehensive derivatives analytics',
    type: 'advanced',
    icon: '⚡',
    agentIds: [
      'funding-oi-agent',
      'liquidation-heatmap',
      'implied-probability',
    ],
    isEnabled: true,
  },
  {
    id: 'smart-money-pack',
    name: 'Smart Money Pack',
    description: 'Track institutional flows and whale movements',
    type: 'advanced',
    icon: '🐋',
    agentIds: [
      'token-deep-dive',
      'cex-liquidity-quality',
      'listings-delistings',
    ],
    isEnabled: true,
  },
  {
    id: 'dex-mev-pack',
    name: 'DEX + MEV Pack',
    description: 'Optimize swaps and protect against MEV',
    type: 'advanced',
    icon: '🔄',
    agentIds: [
      'best-swap-route',
      'mev-sandwich-protection',
      'dex-liquidity-analyzer',
    ],
    isEnabled: true,
  },
  {
    id: 'defi-alpha-pack',
    name: 'DeFi Alpha Pack',
    description: 'Find yield opportunities and assess protocol risks',
    type: 'advanced',
    icon: '🚀',
    agentIds: [
      'defi-protocol-analyzer',
      'stablecoin-depeg-risk',
      'token-deep-dive',
    ],
    isEnabled: true,
  },
  {
    id: 'prediction-markets-pro',
    name: 'Prediction Markets Pro',
    description: 'Find arbitrage and mispricing opportunities across prediction markets',
    type: 'advanced',
    icon: '🎯',
    agentIds: [
      'implied-probability',
      'mispricing-arbitrage-detector',
    ],
    isEnabled: true,
  },
  {
    id: 'nft-collector-pro',
    name: 'NFT Collector Pro',
    description: 'Comprehensive NFT analysis and scam detection',
    type: 'advanced',
    icon: '🖼️',
    agentIds: [
      'nft-collection-dive',
      'nft-safety-detector',
    ],
    isEnabled: true,
  },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

export const getAllPacks = (): AgentPack[] => {
  return [...SIMPLE_PACKS, ...ADVANCED_PACKS].filter(pack => pack.isEnabled);
};

export const getSimplePacks = (): AgentPack[] => {
  return SIMPLE_PACKS.filter(pack => pack.isEnabled);
};

export const getAdvancedPacks = (): AgentPack[] => {
  return ADVANCED_PACKS.filter(pack => pack.isEnabled);
};

export const getPackById = (id: string): AgentPack | undefined => {
  return getAllPacks().find(pack => pack.id === id);
};

export const getPacksByType = (type: 'simple' | 'advanced'): AgentPack[] => {
  return type === 'simple' ? getSimplePacks() : getAdvancedPacks();
};
