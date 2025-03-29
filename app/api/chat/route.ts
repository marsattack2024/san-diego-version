/**
 * Main Chat API Route
 * 
 * This route handler uses the unified chat engine to process chat requests.
 * It handles agent selection, authentication, and delegates core functionality
 * to the chat engine components.
 */

import { NextRequest } from 'next/server';
import { createChatEngine, ChatEngineConfig } from '@/lib/chat-engine/core';
import { detectAgentType } from '@/lib/chat-engine/agent-router';
import { createToolSet } from '@/lib/chat-engine/tools/registry';
import { prompts } from '@/lib/chat-engine/prompts';
import { edgeLogger } from '@/lib/logger/edge-logger';
// Remove validator import
// import { validateChatRequest } from '@/lib/chat/validator';

// Maintain existing runtime directives
export const runtime = 'edge';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * Helper to safely convert various representations of boolean values
 * Handles true/false, "true"/"false", 1/0, "1"/"0" and similar variations
 */
function parseBooleanValue(value: any): boolean {
  // Handle direct boolean values
  if (typeof value === 'boolean') {
    return value;
  }

  // Handle string representations ("true", "false", "1", "0")
  if (typeof value === 'string') {
    const lowercaseValue = value.toLowerCase().trim();
    return lowercaseValue === 'true' || lowercaseValue === '1' || lowercaseValue === 'yes';
  }

  // Handle numeric values (1, 0)
  if (typeof value === 'number') {
    return value === 1;
  }

  // Default to false for null, undefined, or any other type
  return false;
}

export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    // Extract the request body
    const body = await req.json();

    // Handle validation directly instead of using the validator
    // Process the messages from either format (array or single message)
    let clientMessages = [];

    if (body.messages && Array.isArray(body.messages)) {
      clientMessages = body.messages;
    } else if (body.message && typeof body.message === 'object') {
      edgeLogger.info('Using optimized single message format', {
        category: 'chat',
        messageId: body.message.id
      });
      clientMessages = [body.message];
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid request: messages required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse deepSearchEnabled flag
    const deepSearchEnabled = parseBooleanValue(body.deepSearchEnabled);

    // Get sessionId and agentId
    const sessionId = body.id;
    const requestedAgentId = body.agentId || 'default';

    // Basic validation
    if (!clientMessages || !Array.isArray(clientMessages) || clientMessages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: messages required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: session ID required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get the latest user message for agent detection
    const lastUserMessage = clientMessages[clientMessages.length - 1];

    edgeLogger.info('Chat request received', {
      operation: 'chat_request',
      sessionId,
      deepSearchEnabled,
      requestedAgentId,
      messageCount: clientMessages.length
    });

    // Detect the appropriate agent type based on message content
    const { agentType, config: agentConfig } = await detectAgentType(
      lastUserMessage.content as string,
      requestedAgentId as any
    );

    edgeLogger.info('Agent type detected', {
      operation: 'agent_detection',
      sessionId,
      detectedAgent: agentType,
      requestedAgent: requestedAgentId,
      selectionMethod: requestedAgentId === 'default' ? 'automatic' : 'user-selected'
    });

    // Determine if this agent type can use Deep Search
    const canAgentUseDeepSearch = agentConfig.toolOptions.useDeepSearch;

    // Only enable Deep Search if both the user has toggled it AND the agent supports it
    const shouldUseDeepSearch = canAgentUseDeepSearch && deepSearchEnabled;

    // Create tools object with conditional inclusion of Deep Search
    const tools = createToolSet({
      useKnowledgeBase: agentConfig.toolOptions.useKnowledgeBase,
      useWebScraper: agentConfig.toolOptions.useWebScraper,
      useDeepSearch: shouldUseDeepSearch, // Only include if explicitly enabled
      useRagTool: agentConfig.toolOptions.useRagTool
    });

    edgeLogger.info('Tool selection', {
      operation: 'tool_selection',
      toolNames: Object.keys(tools),
      deepSearchEnabled,
      shouldUseDeepSearch,
      deepSearchIncluded: 'deepSearch' in tools
    });

    // Create the chat engine with the detected agent configuration
    const engineConfig: ChatEngineConfig = {
      tools, // Tools object built conditionally
      requiresAuth: true,
      corsEnabled: false,
      model: agentConfig.model || 'gpt-4o',
      temperature: agentConfig.temperature || 0.7,
      maxTokens: 16000,
      operationName: `chat_${agentType}`,
      cacheEnabled: true,
      messageHistoryLimit: 50,
      // Pass prompts system
      prompts,
      // Set agent type
      agentType,
      // Pass additional configuration for tools
      body: {
        deepSearchEnabled: shouldUseDeepSearch, // Pass for safety check in execute function
        sessionId,
        agentType
      }
    };

    const engine = createChatEngine(engineConfig);

    edgeLogger.info('Chat engine created', {
      operation: 'chat_engine_created',
      sessionId,
      agentType,
      deepSearchEnabled: shouldUseDeepSearch,
      toolCount: Object.keys(tools).length,
      elapsedMs: Date.now() - startTime
    });

    // Let the engine handle the request
    return engine.handleRequest(req);

  } catch (error) {
    // Log the error
    edgeLogger.error('Unhandled error in chat route', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    // Return a user-friendly error response
    return new Response(
      JSON.stringify({
        error: 'An error occurred processing your request',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
} 