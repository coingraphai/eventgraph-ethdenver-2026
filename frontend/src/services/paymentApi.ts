import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export interface SubscriptionStatus {
  is_premium: boolean;
  premium_expires_at: string | null;
  questions_used_today: number;
  questions_remaining: number;
  free_limit: number;
  can_ask_question: boolean;
  tier: 'anonymous' | 'free_tier' | 'premium';
}

export interface PaymentConfig {
  free_question_limit: number;
  anonymous_question_limit: number;
  premium_price_usd: number;
  premium_duration_days: number;
  coinbase_commerce_checkout_id: string;
  facilitator_wallet?: string;
  payment_amount_usdc?: number;
  payment_amount_eth?: number;
  chain_id?: number;
  usdc_contract?: string;
  chain_name?: string;
  is_testnet?: boolean;
}

export interface CoinbaseCheckoutData {
  checkout_url: string;
  charge_id: string;
  charge_code: string;
  price_usd: number;
  duration_days: number;
  description: string;
  tier_id: number;  // Tier ID (1=Basic, 2=Plus, 3=Premium)
  expires_at?: string;
  is_existing?: boolean;  // Flag indicating if this is a reused pending charge
}

export interface ChargeStatusResponse {
  status: string;
  charge_id: string;
  confirmed: boolean;
  instant_upgrade?: boolean;
  transaction_hash?: string;
  confirmed_at?: string;
  wallet_address?: string;
  created_at?: string;
  expires_at?: string;
  metadata?: Record<string, any>;
}

export interface QuestionLimitCheck {
  can_ask: boolean;
  questions_remaining: number;
  needs_wallet: boolean;
  needs_upgrade: boolean;
  tier: string;
}

/**
 * Get payment configuration
 */
export const getPaymentConfig = async (): Promise<PaymentConfig> => {
  const response = await axios.get(`${API_BASE_URL}/api/payment/config`);
  return response.data;
};

/**
 * Get subscription status for a wallet address
 */
export const getSubscriptionStatus = async (walletAddress: string): Promise<SubscriptionStatus> => {
  const response = await axios.get(`${API_BASE_URL}/api/payment/status/${walletAddress}`);
  return response.data;
};

/**
 * Check if user can ask a question (updates question count if allowed)
 */
export const checkQuestionLimit = async (
  walletAddress?: string,
  sessionId?: string
): Promise<QuestionLimitCheck> => {
  // First, get the current status to check if user can ask
  const statusData = await getQuestionLimitStatus(walletAddress, sessionId);
  
  return {
    can_ask: statusData.can_ask,
    questions_remaining: statusData.questions_remaining,
    needs_wallet: statusData.needs_wallet,
    needs_upgrade: statusData.needs_upgrade,
    tier: statusData.tier,
  };
};

/**
 * Get Coinbase Commerce checkout URL
 */
export const getCoinbaseCheckout = async (
  walletAddress: string, 
  tierId: string = 'basic'
): Promise<CoinbaseCheckoutData> => {
  const response = await axios.get(
    `${API_BASE_URL}/api/payment/coinbase-commerce/checkout/${walletAddress}`,
    { params: { tier_id: tierId } }
  );
  return response.data;
};

/**
 * Check Coinbase Commerce charge status
 */
export const getChargeStatus = async (
  chargeId: string,
  walletAddress?: string
): Promise<ChargeStatusResponse> => {
  const params = walletAddress ? { wallet_address: walletAddress } : {};
  const response = await axios.get(
    `${API_BASE_URL}/api/payment/coinbase-commerce/charge-status/${chargeId}`,
    { params }
  );
  return response.data;
};

/**
 * Increment question count for anonymous or free tier users
 */
export const incrementQuestionCount = async (
  walletAddress?: string,
  sessionId?: string
): Promise<void> => {
  const params: any = {};
  if (walletAddress) {
    params.wallet_address = walletAddress;
  } else if (sessionId) {
    params.session_id = sessionId;
  }

  await axios.post(`${API_BASE_URL}/api/payment/increment-question`, null, { params });
};

/**
 * Get subscription status for anonymous or free tier users
 */
export const getQuestionLimitStatus = async (
  walletAddress?: string,
  sessionId?: string
): Promise<{
  tier: 'anonymous' | 'free_tier' | 'premium';
  can_ask: boolean;
  questions_used: number;
  questions_remaining: number;
  limit: number;
  is_premium: boolean;
  needs_wallet: boolean;
  needs_upgrade: boolean;
  premium_expires_at?: string;
}> => {
  const params: any = {};
  if (walletAddress) {
    params.wallet_address = walletAddress;
  } else if (sessionId) {
    params.session_id = sessionId;
  }

  const response = await axios.get(`${API_BASE_URL}/api/payment/subscription-status`, { params });
  return response.data;
};
