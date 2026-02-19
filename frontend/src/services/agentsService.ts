/**
 * AI Agents API Service
 * Handles all API calls related to AI Agents feature
 */
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export interface Agent {
  id: number;
  slug: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  is_enabled: boolean;
  form_schema: FormField[];
  created_at: string;
  updated_at: string;
}

export interface FormField {
  name: string;
  label: string;
  type: string;
  placeholder?: string;
  required: boolean;
  options?: Array<{ value: string; label: string }>;
  default?: any;
  default_value?: any;
  description?: string;
}

export interface AgentRun {
  id: string;
  user_id?: string;
  agent_slug: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  input_json: Record<string, any>;
  steps_json?: ProcessingStep[];
  output_json?: Record<string, any>;
  ai_summary?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  // Credit info (for updating frontend context)
  tier?: string;
  credits_used?: number;
  credits_remaining?: number;
  credit_limit?: number;
}

export interface ProcessingStep {
  step: number;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  message?: string;
  timestamp?: string;
}

export interface AgentRunCreate {
  agent_slug: string;
  input: Record<string, any>;
  user_id?: string;
  wallet_address?: string;
  anonymous_session_id?: string;
}

/**
 * Fetch all available agents
 */
export const fetchAgents = async (category?: string): Promise<Agent[]> => {
  try {
    const params = category ? { category } : {};
    const response = await axios.get(`${API_BASE_URL}/agents`, { params });
    return response.data.agents;
  } catch (error) {
    console.error('Error fetching agents:', error);
    throw error;
  }
};

/**
 * Fetch a specific agent by slug
 */
export const fetchAgent = async (slug: string): Promise<Agent> => {
  try {
    const response = await axios.get(`${API_BASE_URL}/agents/${slug}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching agent ${slug}:`, error);
    throw error;
  }
};

/**
 * Create a new agent run
 * @param data Agent run data
 * @param paymentPayload Optional x402 payment payload (for retry after payment)
 */
export const createAgentRun = async (
  data: AgentRunCreate, 
  paymentPayload?: any
): Promise<AgentRun> => {
  try {
    const headers: Record<string, string> = {};
    
    // If payment payload provided, add X-Payment header
    if (paymentPayload) {
      headers['X-Payment'] = JSON.stringify(paymentPayload);
    }
    
    const response = await axios.post(`${API_BASE_URL}/agents/runs`, data, { headers });
    return response.data;
  } catch (error) {
    console.error('Error creating agent run:', error);
    throw error;
  }
};

/**
 * Fetch agent run status and results
 */
export const fetchAgentRun = async (runId: string): Promise<AgentRun> => {
  try {
    const response = await axios.get(`${API_BASE_URL}/agents/runs/${runId}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching agent run ${runId}:`, error);
    throw error;
  }
};

/**
 * Fetch agent run history
 */
export const fetchAgentRunHistory = async (
  agentSlug?: string,
  userId?: string,
  limit: number = 20
): Promise<{ runs: AgentRun[]; total: number }> => {
  try {
    const params: Record<string, any> = { limit };
    if (agentSlug) params.agent_slug = agentSlug;
    if (userId) params.user_id = userId;
    
    const response = await axios.get(`${API_BASE_URL}/agents/runs`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching agent run history:', error);
    throw error;
  }
};

/**
 * Poll agent run status until completion
 */
export const pollAgentRun = async (
  runId: string,
  onUpdate: (run: AgentRun) => void,
  interval: number = 2000,
  maxAttempts: number = 180 // 6 minutes max
): Promise<AgentRun> => {
  let attempts = 0;
  
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const run = await fetchAgentRun(runId);
        onUpdate(run);
        
        if (run.status === 'completed' || run.status === 'failed') {
          resolve(run);
          return;
        }
        
        attempts++;
        if (attempts >= maxAttempts) {
          reject(new Error('Polling timeout'));
          return;
        }
        
        setTimeout(poll, interval);
      } catch (error) {
        reject(error);
      }
    };
    
    poll();
  });
};

/**
 * Check user's access to agent workflows
 * Returns access rules based on tier
 */
export interface AgentAccessInfo {
  can_run_agent: boolean;
  access_method: 'none' | 'x402_only' | 'x402_or_credits';
  tier: string;
  requires_wallet: boolean;
  requires_upgrade: boolean;
  agent_credit_balance: number;
  message: string;
  reason: string;
  payment_options: {
    x402_available: boolean;
    credit_topup_available: boolean;
    credit_wallet_available: boolean;
  };
  agent_run_cost: number;
  note: string;
}

export const checkAgentAccess = async (
  walletAddress?: string,
  anonymousSessionId?: string
): Promise<AgentAccessInfo> => {
  try {
    const params: Record<string, string> = {};
    if (walletAddress) params.wallet_address = walletAddress;
    if (anonymousSessionId) params.anonymous_session_id = anonymousSessionId;
    
    const response = await axios.get(`${API_BASE_URL}/agents/access/check`, { params });
    return response.data;
  } catch (error) {
    console.error('Error checking agent access:', error);
    throw error;
  }
};

/**
 * Check if user can top up agent credits
 */
export interface CanTopUpResponse {
  can_topup: boolean;
  reason: string;
  wallet_address: string;
}

export const checkCanTopUp = async (walletAddress: string): Promise<CanTopUpResponse> => {
  try {
    const response = await axios.get(`${API_BASE_URL}/credit-wallet/can-topup/${walletAddress}`);
    return response.data;
  } catch (error) {
    console.error('Error checking top-up access:', error);
    throw error;
  }
};

export default {
  fetchAgents,
  fetchAgent,
  createAgentRun,
  fetchAgentRun,
  fetchAgentRunHistory,
  pollAgentRun,
  checkAgentAccess,
  checkCanTopUp,
};
