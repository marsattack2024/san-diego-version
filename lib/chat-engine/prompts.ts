/**
 * Chat Engine Prompts Module
 * 
 * This module provides a centralized way to access and manage prompts across
 * different chat implementations while reusing the existing prompt infrastructure.
 * 
 * It leverages the existing prompt definitions from lib/agents/prompts to avoid duplication.
 */

import {
    AgentType,
    buildSystemPrompt,
    enhancePromptWithToolResults,
    type ToolResults
} from '@/lib/agents/prompts';

/**
 * Enhanced prompt types to support both the main chat and widget chat
 */
export type ChatEnginePromptType = AgentType | 'widget' | 'widget-minimal';

/**
 * Defines the base widget chat prompt for embedded chat experiences
 * This is simplified compared to the full agents for better performance
 */
export const WIDGET_BASE_PROMPT = `You are an AI assistant for photography businesses. Your goal is to provide helpful, accurate, and concise information to potential clients.

Core Principles:
1. Clear, readable formatting with proper spacing
2. Actionable, specific advice with concrete examples
3. Utilize the knowledge base to provide accurate information
4. Maintain professional but friendly tone
5. Keep responses concise and to the point
6. Focus on helping photography clients understand services and offerings

When answering questions:
- Use the knowledge base to retrieve accurate information about photography services
- Don't make assumptions about services that aren't explicitly mentioned
- If you don't know something, acknowledge it rather than guessing
- Format responses for easy reading with appropriate structure

Always acknowledge when you've used the Knowledge Base tool at the end of your response.`;

/**
 * Even more minimal prompt for extremely lightweight widget deployments
 */
export const WIDGET_MINIMAL_PROMPT = `You are a helpful AI assistant for a photography business. Provide concise, accurate information based on the knowledge base. Stay friendly and professional, and acknowledge when you've used the Knowledge Base tool.`;

/**
 * Builds a complete system prompt for the specified prompt type
 * For agent types, it delegates to the existing buildSystemPrompt function
 * For widget types, it uses the widget-specific prompts
 */
export function buildChatEnginePrompt(promptType: ChatEnginePromptType): string {
    // Handle agent-based prompt types using the existing infrastructure
    if (promptType === 'default' ||
        promptType === 'copywriting' ||
        promptType === 'google-ads' ||
        promptType === 'facebook-ads' ||
        promptType === 'quiz') {
        return buildSystemPrompt(promptType);
    }

    // Handle widget-specific prompt types
    switch (promptType) {
        case 'widget':
            return WIDGET_BASE_PROMPT;
        case 'widget-minimal':
            return WIDGET_MINIMAL_PROMPT;
        default:
            // Default to the standard agent prompt if type is unrecognized
            return buildSystemPrompt('default');
    }
}

/**
 * Enhances a system prompt with context from various tools
 * This is a direct re-export of the existing function to maintain consistency
 */
export { enhancePromptWithToolResults };

/**
 * Object that provides easy access to all prompt types
 */
export const prompts = {
    // Main chat prompt types (reused from agents)
    mainChat: buildSystemPrompt('default'),
    copywriting: buildSystemPrompt('copywriting'),
    googleAds: buildSystemPrompt('google-ads'),
    facebookAds: buildSystemPrompt('facebook-ads'),
    quiz: buildSystemPrompt('quiz'),

    // Widget-specific prompt types
    widget: WIDGET_BASE_PROMPT,
    widgetMinimal: WIDGET_MINIMAL_PROMPT,

    // Function to build custom prompts with tool results
    withToolResults: (
        basePrompt: string,
        toolResults: ToolResults
    ) => enhancePromptWithToolResults(basePrompt, toolResults)
}; 