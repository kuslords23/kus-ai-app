/**
 * Peer-to-Peer Agent & Model Proxy Tunneling
 * 
 * Securely shares/rent agent/model access without exposing API keys,
 * using a backend proxy for authorized routing and credits.
 * 
 * Architecture:
 * - Agent proxy routes requests through secure backend endpoints
 * - All API keys are stored encrypted on the server (Supabase vault)
 * - Request/response metadata is tracked for credit billing
 * - End-to-end encryption ensures key confidentiality
 */

import { createClient } from '@supabase/supabase-js';
import type { SkillMetadata } from '../configs/skillRegistry';

export interface ProxyConnectionConfig {
  agentId: string;
  modelId: string;
  userId: string;
  sessionId: string;
  expiresAt: Date;
  encryptedKeyRef: string; // Reference to encrypted key in vault
}

export interface ProxyRequestPayload {
  agentId: string;
  model: string;
  prompt: string;
  context?: any;
  taskId: string;
  sessionToken: string;
}

export interface ProxyResponseMetadata {
  requestId: string;
  sessionDurationMs: number;
  tokensUsed: {
    input: number;
    output: number;
    cached: number;
  };
  cost: number;
  creditsEarned: number; // For marketplace agent rentals
  status: 'success' | 'error' | 'rate_limited';
}

export interface MarketplaceListing {
  id: string;
  agentId: string;
  modelId: string;
  name: string;
  description: string;
  hourlyRate: number; // in credits
  isActive: boolean;
  tags: string[];
  createdAt: Date;
  rating: number; // 1-5 star rating from completed tasks
  totalTasksCompleted: number;
}

/**
 * AgentProxy - handles secure peer-to-peer agent/model proxy routing
 * All API key operations go through this proxy to prevent client-side exposure
 */
export class AgentProxy {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  private basePath = '/api/proxy'; // Backend proxy endpoints

  constructor() {}

  /**
   * Route a model request through the secure proxy
   * The proxy fetches the encrypted key from Supabase vault and makes
   * the actual API call server-side, never exposing keys to the client.
   */
  async routeModelRequest(payload: ProxyRequestPayload): Promise<{
    success: boolean;
    response?: any;
    error?: string;
    metadata?: ProxyResponseMetadata;
  }> {
    try {
      // 1. Validate the agent/model access through the proxy system
      const accessCheck = await this.validateAccess(payload);
      if (!accessCheck.allowed) {
        return { success: false, error: accessCheck.reason };
      }

      // 2. Route through the backend proxy endpoint
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}${this.basePath}/route`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...payload,
          encryptedKeyRef: accessCheck.encryptedKeyRef,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'Proxy request failed',
        };
      }

      return {
        success: true,
        response: result.response,
        metadata: result.metadata,
      };
    } catch (error) {
      console.error('Proxy request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown proxy error',
      };
    }
  }

  /**
   * Validate agent/model access rights
   */
  private async validateAccess(payload: ProxyRequestPayload): Promise<{
    allowed: boolean;
    reason?: string;
    encryptedKeyRef?: string;
  }> {
    // In production, this would check:
    // - User has credits/subscribed to this agent/model
    // - Access permissions are valid
    // - Session is active and not expired
    // - Rate limits are respected

    // For now, return a simulated access check
    return {
      allowed: true,
      encryptedKeyRef: `key_ref_${crypto.randomUUID()}`,
    };
  }

  /**
   * List available agents for hire in the marketplace
   */
  async listMarketplaceAgents(): Promise<MarketplaceListing[]> {
    const { data, error } = await this.supabase
      .from('marketplace_agents')
      .select('*')
      .eq('is_active', true)
      .order('rating', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Rent/purchase an agent for a specific task
   */
  async rentAgent(agentId: string, durationMinutes: number): Promise<{
    success: boolean;
    rentalId: string;
    cost: number;
    expiresAt: Date;
  }> {
    // Check user has sufficient credits
    // Create rental record
    // Set expiration
    const rentalId = crypto.randomUUID();
    const hourlyRate = 5; // Default rate - would come from agent listing
    const cost = (hourlyRate / 60) * durationMinutes;

    // In production: validate credits, create rental record, deduct from balance
    return {
      success: true,
      rentalId,
      cost,
      expiresAt: new Date(Date.now() + durationMinutes * 60 * 1000),
    };
  }

  /**
   * Share an agent with another user (P2P)
   */
  async shareAgent(
    agentId: string,
    targetUserId: string,
    durationMinutes: number
  ): Promise<{
    success: boolean;
    shareToken: string;
    cost: number;
  }> {
    // Generate secure share token
    // Track ownership transfer
    // Set duration expiration
    const shareToken = crypto.randomUUID();

    // In production: validate sharing permissions, charge credits, create share record
    return {
      success: true,
      shareToken,
      cost: 2, // Base sharing fee
    };
  }
}

// Export singleton
export const agentProxy = new AgentProxy();