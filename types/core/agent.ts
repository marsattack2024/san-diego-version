import { z } from 'zod';

/**
 * Supported agent types in the system
 */
export type AgentType = 'default' | 'google-ads' | 'facebook-ads' | 'copywriting' | 'quiz';

/**
 * Interface for an agent tool that can be used by agents
 */
export interface AgentTool {
  name: string;
  description: string;
  schema: z.ZodType<any, any>;
  execute: (params: any) => Promise<any>;
}

/**
 * Interface for an agent message in the conversation
 */
export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Interface for agent context that maintains conversation state
 */
export interface AgentContext {
  sessionId: string;
  conversationId: string;
  history: AgentMessage[];
  metadata: Record<string, any>;
}

/**
 * Interface for agent response after processing a message
 */
export interface AgentResponse {
  message: AgentMessage;
  toolCalls?: any[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  processingTimeMs: number;
}

/**
 * Interface for an agent in the system
 */
export interface Agent {
  id: AgentType;
  name: string;
  description: string;
  capabilities: string[];
  icon: string;
  systemPrompt: string;
  tools: AgentTool[];
  
  /**
   * Process a message using this agent
   */
  processMessage(message: string, context: AgentContext): Promise<AgentResponse>;
}