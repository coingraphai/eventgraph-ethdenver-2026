/**
 * MetaMask API Service
 * Handles communication with MetaMask MCP backend
 */
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';


export interface MetaMaskChatRequest {
  user_id: string;
  message: string;
  session_id?: number;
  wallet_address?: string;
  chain_id?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface MetaMaskChatResponse {
  session_id: number;
  message: string;
  tool_calls?: ToolCall[];
}

export interface MetaMaskSession {
  id: number;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface MetaMaskMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface MetaMaskHistory {
  session_id: number;
  title: string;
  messages: MetaMaskMessage[];
}

export interface ExecuteToolRequest {
  tool_name: string;
  arguments: Record<string, any>;
  session_id: number;
}

class MetaMaskApiService {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = `${API_BASE_URL}/metamask`;
  }

  /**
   * Send a chat message to MetaMask assistant
   */
  async sendMessage(
    userId: string,
    message: string,
    sessionId?: number,
    walletAddress?: string,
    chainId?: number
  ): Promise<MetaMaskChatResponse> {
    const response = await axios.post<MetaMaskChatResponse>(`${this.baseUrl}/chat`, {
      user_id: userId,
      message,
      session_id: sessionId,
    }, {
      params: {
        wallet_address: walletAddress,
        chain_id: chainId,
      }
    });
    return response.data;
  }

  /**
   * Execute a MetaMask MCP tool
   */
  async executeTool(
    toolName: string,
    toolArguments: Record<string, any>,
    sessionId: number
  ): Promise<any> {
    const response = await axios.post(`${this.baseUrl}/execute-tool`, {
      tool_name: toolName,
      arguments: toolArguments,
      session_id: sessionId,
    });
    return response.data;
  }

  /**
   * Get all MetaMask sessions for a user
   */
  async getSessions(userId: string): Promise<MetaMaskSession[]> {
    const response = await axios.get<MetaMaskSession[]>(`${this.baseUrl}/sessions/${userId}`);
    return response.data;
  }

  /**
   * Get chat history for a session
   */
  async getHistory(sessionId: number): Promise<MetaMaskHistory> {
    const response = await axios.get<MetaMaskHistory>(`${this.baseUrl}/history/${sessionId}`);
    return response.data;
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: number): Promise<void> {
    await axios.delete(`${this.baseUrl}/sessions/${sessionId}`);
  }

  /**
   * Get available tools
   */
  async getTools(): Promise<any> {
    const response = await axios.get(`${this.baseUrl}/tools`);
    return response.data;
  }
}

export const metamaskApi = new MetaMaskApiService();
