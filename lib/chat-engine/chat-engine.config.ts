import { Tool } from 'ai';

/**
 * Chat Engine Configuration Interface
 * Defines all configurable aspects of the chat engine
 */
export interface ChatEngineConfig {
    // Basic configuration
    tools?: Record<string, Tool<any, any>>; // Properly typed tools object
    requiresAuth?: boolean;
    corsEnabled?: boolean;

    // AI model configuration
    model?: string;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;

    // Feature flags
    useDeepSearch?: boolean;
    useWebScraper?: boolean;

    // Rate limiting
    rateLimitRequests?: number;
    rateLimitWindow?: number; // in seconds

    // Response formatting
    formatResponse?: (response: any) => any;

    // Logging
    operationName?: string;

    // Cache configuration
    cacheEnabled?: boolean;
    messageHistoryLimit?: number;

    /**
     * Prompts to use with the chat engine.
     */
    prompts?: any;

    /**
     * The agent type being used.
     */
    agentType?: string;

    /**
     * Optional request body parameters that will be passed to tool execution
     * Used for passing feature flags and other configuration options to tools
     */
    body?: Record<string, any>;

    /**
     * Whether to disable persisting messages to the database
     */
    messagePersistenceDisabled?: boolean;
}

// Optional: Add a Zod schema for validation
// import { z } from 'zod';
// export const ChatEngineConfigSchema = z.object({ ... });

// Optional: Add a helper function to create/validate config
// export function createChatEngineConfig(input: Partial<ChatEngineConfig>): ChatEngineConfig {
//     // Apply defaults, validate, etc.
// } 