/**
 * Agent Chat API Route Handler
 * 
 * This route handler implements the agent routing system following the exact
 * pattern described in the Vercel AI SDK documentation, where the appropriate
 * specialized agent is selected based on message content.
 */

import { createChatEngine } from '@/lib/chat-engine/core';
import { detectAgentType, createAgentToolSet } from '@/lib/chat-engine/agent-router';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

export const runtime = 'edge';

export async function POST(req: Request) {
    try {
        // Parse request body
        const body = await req.json();
        const { message, messages, id: chatId, sessionId = crypto.randomUUID() } = body;

        // Use the ID from the request or sessionId as fallback
        const id = chatId || sessionId;

        // Validate required parameters
        if ((!message && !messages) || !id) {
            return new Response(
                JSON.stringify({ error: 'Missing required parameters' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Get the user message for agent detection
        let userMessage: string;

        if (message && typeof message === 'string') {
            userMessage = message;
        } else if (messages && Array.isArray(messages) && messages.length > 0) {
            // Get the last user message from the array
            const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
            userMessage = lastUserMsg?.content as string || '';
        } else if (message && typeof message === 'object' && message.content) {
            userMessage = message.content as string;
        } else {
            userMessage = '';
        }

        // Detect which specialized agent to use - following Vercel AI SDK pattern
        const { agentType, config } = await detectAgentType(userMessage);

        // Create tool set specific to the agent type
        const tools = createAgentToolSet(agentType);

        // Create a configured chat engine for the detected agent
        const engine = createChatEngine({
            tools,
            requiresAuth: true,
            systemPrompt: config.systemPrompt,
            maxTokens: 4096,
            temperature: config.temperature,
            operationName: `agent_chat_${agentType}`,
            cacheEnabled: true,
            useDeepSearch: config.toolOptions.useDeepSearch,
            useWebScraper: config.toolOptions.useWebScraper
        });

        // Let the engine handle the request - direct routing based on classification
        return engine.handleRequest(req);
    } catch (error) {
        // Log the error
        edgeLogger.error('Error in agent chat route', {
            category: LOG_CATEGORIES.CHAT,
            operation: 'agent_chat_error',
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });

        // Return error response
        return new Response(
            JSON.stringify({
                error: 'Failed to process request',
                message: error instanceof Error ? error.message : 'Unknown error'
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
} 