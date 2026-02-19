/**
 * Billing API Service
 * Handles Stripe subscription operations
 */
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export interface PricingTier {
  id: string;
  name: string;
  price_usd: number;
  price_label: string;
  status: string;
  features: string[];
  popular: boolean;
  enabled: boolean;
  questions_limit: number;
}

export interface CreateCheckoutSessionRequest {
  tier_id: string;
  wallet_address: string;
  email: string;
  success_url: string;
  cancel_url: string;
}

export interface CreateCheckoutSessionResponse {
  url: string;
  session_id: string;
  customer_id: string;
  tier: PricingTier;
}

export interface SubscriptionStatus {
  is_subscribed: boolean;
  tier_id?: string;
  tier_name?: string;
  status?: string;
  current_period_end?: string;
  cancel_at_period_end: boolean;
}

/**
 * Get all pricing tiers
 */
export async function getTiers(): Promise<PricingTier[]> {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/billing/tiers`);
    return response.data;
  } catch (error) {
    console.error('Error fetching tiers:', error);
    throw error;
  }
}

/**
 * Get details for a specific tier
 */
export async function getTier(tierId: string): Promise<PricingTier> {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/billing/tiers/${tierId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching tier:', error);
    throw error;
  }
}

/**
 * Create Stripe checkout session
 */
export async function createStripeCheckoutSession(
  request: CreateCheckoutSessionRequest
): Promise<CreateCheckoutSessionResponse> {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/billing/stripe/create-checkout-session`,
      request
    );
    return response.data;
  } catch (error) {
    console.error('Error creating Stripe checkout session:', error);
    throw error;
  }
}

/**
 * Get subscription status for a wallet
 */
export async function getSubscriptionStatus(
  walletAddress: string
): Promise<SubscriptionStatus> {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/api/billing/subscription-status`,
      {
        params: { wallet_address: walletAddress }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    throw error;
  }
}

/**
 * Cancel subscription (remains active until period end)
 */
export async function cancelSubscription(walletAddress: string): Promise<void> {
  try {
    await axios.post(`${API_BASE_URL}/api/billing/stripe/cancel-subscription`, {
      wallet_address: walletAddress
    });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw error;
  }
}

/**
 * Get Stripe configuration (publishable key)
 */
export async function getStripeConfig(): Promise<{ publishable_key: string }> {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/billing/stripe/config`);
    return response.data;
  } catch (error) {
    console.error('Error fetching Stripe config:', error);
    throw error;
  }
}
