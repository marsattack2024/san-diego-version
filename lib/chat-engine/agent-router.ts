/**
 * Chat Engine Agent Router
 * 
 * This module integrates agent routing capabilities with the chat engine,
 * following Vercel AI SDK patterns for seamless integration with the
 * AI SDK's tool-based approach.
 */

import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { AgentType, buildSystemPrompt } from './prompts';
import { createToolSet } from '@/lib/tools/registry.tool';

// Agent types and their configurations
interface AgentConfig {
    systemPrompt: string;
    temperature: number;
    model?: string;
    toolOptions: {
        useKnowledgeBase: boolean;
        useWebScraper: boolean;
        useDeepSearch: boolean;
        useRagTool: boolean;
    };
}

/**
 * Agent routing schema for the LLM using Zod
 * This follows exactly the pattern in the Vercel AI SDK routing example
 */
export const agentRoutingSchema = z.object({
    reasoning: z.string().describe('Reasoning for why this agent type is most appropriate'),
    agentType: z.enum(['default', 'copywriting', 'google-ads', 'facebook-ads', 'quiz'])
        .describe('The type of agent that should handle this query')
});

/**
 * Detect which specialized agent to use for a given message
 * Following the Vercel AI SDK pattern for routing decisions
 * @param message User message to analyze
 * @param currentAgentType Currently selected agent type (if any)
 * @returns The detected agent type and configuration
 */
export async function detectAgentType(message: string, currentAgentType: AgentType = 'default'): Promise<{
    agentType: AgentType;
    config: AgentConfig;
    reasoning?: string;
}> {
    // If a specific agent is already selected (not default), keep using it
    if (currentAgentType !== 'default') {
        edgeLogger.info('Using explicitly selected agent', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'agent_routing',
            requestedAgent: currentAgentType,
            selectedAgent: currentAgentType,
            selectionMethod: 'user-selected'
        });

        return {
            agentType: currentAgentType,
            config: getAgentConfig(currentAgentType)
        };
    }

    try {
        // Use the LLM to classify the message content, following Vercel AI SDK pattern
        const routingResult = await generateObject({
            model: openai('gpt-4o'),
            schema: agentRoutingSchema,
            prompt: `Analyze this user message and determine which specialized agent should handle it:
      
      "${message}"
      
      Select from these agent types:
      - default: General marketing assistant for photographers
      - copywriting: Specialized in website, email, and marketing copy
      - google-ads: Expert in creating and optimizing Google Ads campaigns
      - facebook-ads: Focused on social media advertising strategies
      - quiz: Creates interactive quizzes and questionnaires for lead generation
      
      Provide detailed reasoning for your selection.`,
            temperature: 0.3
        });

        const selectedAgent = routingResult.object.agentType as AgentType;
        const reasoning = routingResult.object.reasoning;

        // Log the AI routing decision with detailed reasoning
        edgeLogger.info('Agent routing decision', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'agent_routing_decision',
            requestedAgent: 'default',
            selectedAgent,
            selectionMethod: 'automatic',
            reasoning: reasoning.substring(0, 150) + (reasoning.length > 150 ? '...' : ''),
            keywordScores: {}, // Could be populated if using keyword scoring
            confidenceScore: 1.0 // Could be calculated if using confidence scoring
        });

        return {
            agentType: selectedAgent,
            config: getAgentConfig(selectedAgent),
            reasoning
        };
    } catch (error) {
        // If AI routing fails, fall back to default agent
        edgeLogger.error('AI agent routing failed, falling back to default agent', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'agent_routing_fallback',
            requestedAgent: 'default',
            selectedAgent: 'default',
            selectionMethod: 'automatic',
            error: error instanceof Error ? error.message : String(error),
            reason: 'routing_error'
        });

        return {
            agentType: 'default',
            config: getAgentConfig('default'),
            reasoning: 'Fallback to default agent due to routing error'
        };
    }
}

/**
 * Get the configuration for a specific agent type
 * @param agentType The agent type to get configuration for
 * @returns Configuration for the specified agent
 */
function getAgentConfig(agentType: AgentType): AgentConfig {
    // Get system prompt using the new prompts module
    const systemPrompt = buildSystemPrompt(agentType);

    // Map agent types directly to configurations 
    // Following Vercel's pattern of direct mapping based on classification
    const configurations: Record<AgentType, Omit<AgentConfig, 'systemPrompt'>> = {
        'copywriting': {
            temperature: 0.7, // More creative for copywriting
            model: 'gpt-4o',
            toolOptions: {
                useKnowledgeBase: true,
                useWebScraper: true,
                useDeepSearch: true,
                useRagTool: true
            }
        },
        'google-ads': {
            temperature: 0.4, // More focused for ads
            model: 'gpt-4o',
            toolOptions: {
                useKnowledgeBase: true,
                useWebScraper: true,
                useDeepSearch: true,
                useRagTool: true
            }
        },
        'facebook-ads': {
            temperature: 0.4, // More focused for ads
            model: 'gpt-4o',
            toolOptions: {
                useKnowledgeBase: true,
                useWebScraper: true,
                useDeepSearch: true,
                useRagTool: true
            }
        },
        'quiz': {
            temperature: 0.6, // Balanced creativity for quiz creation
            model: 'gpt-4o',
            toolOptions: {
                useKnowledgeBase: true,
                useWebScraper: false, // Reduced tool set for quiz agent
                useDeepSearch: false,
                useRagTool: true
            }
        },
        'default': {
            temperature: 0.5, // Balanced temperature for general purposes
            model: 'gpt-4o',
            toolOptions: {
                useKnowledgeBase: true,
                useWebScraper: true,
                useDeepSearch: true, // Allow deep search by default
                useRagTool: true
            }
        }
    };

    return {
        systemPrompt,
        ...configurations[agentType]
    };
}

/**
 * Create a configured tool set based on the detected agent type
 * @param agentType The detected agent type
 * @returns A properly configured tool set for the agent
 */
export function createAgentToolSet(agentType: AgentType): Record<string, any> {
    const config = getAgentConfig(agentType);

    return createToolSet(config.toolOptions);
} 