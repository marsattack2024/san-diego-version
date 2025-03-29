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
import { createToolSet } from '@/lib/tools/registry.tool';
import { prompts } from '@/lib/chat-engine/prompts';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { createClient } from '@/utils/supabase/server';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
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
    let body;
    try {
      body = await req.json();
      edgeLogger.info('Successfully parsed JSON body', {
        operation: 'request_validation',
        bodyKeys: Object.keys(body)
      });
    } catch (error) {
      edgeLogger.error('Failed to parse request JSON', {
        operation: 'request_validation',
        error: error instanceof Error ? error.message : String(error)
      });

      return new Response(
        JSON.stringify({ error: 'Invalid JSON: Failed to parse request body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Handle validation directly instead of using the validator
    // Process the messages from either format (array or single message)
    let clientMessages = [];

    if (body.messages && Array.isArray(body.messages)) {
      clientMessages = body.messages;
      edgeLogger.info('Using messages array format', {
        operation: 'request_validation',
        messageCount: clientMessages.length
      });
    } else if (body.message && typeof body.message === 'object') {
      edgeLogger.info('Using optimized single message format', {
        operation: 'request_validation',
        messageId: body.message.id
      });
      clientMessages = [body.message];
    } else {
      edgeLogger.error('Invalid message format', {
        operation: 'request_validation',
        body: JSON.stringify(body).substring(0, 200) // Log first 200 chars
      });

      return new Response(
        JSON.stringify({ error: 'Invalid request: messages required', bodyProvided: Object.keys(body) }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse deepSearchEnabled flag
    const deepSearchEnabled = parseBooleanValue(body.deepSearchEnabled);

    // Add more detailed logging for the DeepSearch flag
    edgeLogger.info('DeepSearch flag parsed', {
      operation: 'deepsearch_flag',
      rawDeepSearchValue: body.deepSearchEnabled,
      rawValueType: typeof body.deepSearchEnabled,
      parsedDeepSearchValue: deepSearchEnabled,
      parsedValueType: typeof deepSearchEnabled
    });

    // Get sessionId and agentId
    const sessionId = body.id;
    const requestedAgentId = body.agentId || 'default';

    // Basic validation
    if (!clientMessages || !Array.isArray(clientMessages) || clientMessages.length === 0) {
      edgeLogger.error('Empty or invalid messages array', {
        operation: 'request_validation',
        messagesType: typeof clientMessages,
        isArray: Array.isArray(clientMessages),
        length: clientMessages?.length
      });

      return new Response(
        JSON.stringify({ error: 'Invalid request: messages required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!sessionId) {
      edgeLogger.error('Missing session ID', {
        operation: 'request_validation'
      });

      return new Response(
        JSON.stringify({ error: 'Invalid request: session ID required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get the latest user message for agent detection
    const lastUserMessage = clientMessages[clientMessages.length - 1];

    edgeLogger.info('Validation passed', {
      operation: 'request_validation',
      sessionId,
      requestedAgentId,
      messageCount: clientMessages.length,
      lastMessageContent: typeof lastUserMessage.content === 'string'
        ? lastUserMessage.content.substring(0, 50) + '...'
        : typeof lastUserMessage.content
    });

    edgeLogger.info('Chat request received', {
      operation: 'chat_request',
      sessionId,
      deepSearchEnabled,
      requestedAgentId,
      messageCount: clientMessages.length
    });

    // Detect the appropriate agent type based on message content
    try {
      var { agentType, config: agentConfig, reasoning } = await detectAgentType(
        lastUserMessage.content as string,
        requestedAgentId as any
      );

      // Log agent selection with detailed information
      edgeLogger.info('Agent type detected', {
        category: LOG_CATEGORIES.CHAT,
        operation: 'agent_detection',
        sessionId,
        requestedAgent: requestedAgentId,
        detectedAgent: agentType,
        selectionMethod: requestedAgentId === 'default' ? 'automatic' : 'user-selected',
        reason: reasoning ? reasoning.substring(0, 150) + (reasoning.length > 150 ? '...' : '') : undefined,
        messagePreview: (lastUserMessage.content as string).substring(0, 50) + '...',
        messageTokenCount: (lastUserMessage.content as string).length / 4 // Rough estimate
      });
    } catch (agentError) {
      edgeLogger.error('Agent detection failed', {
        category: LOG_CATEGORIES.CHAT,
        operation: 'agent_detection',
        sessionId,
        error: agentError instanceof Error ? agentError.message : String(agentError),
        requestedAgent: requestedAgentId,
        fallbackAgent: 'default',
        important: true
      });

      return new Response(
        JSON.stringify({
          error: 'Agent detection failed',
          message: agentError instanceof Error ? agentError.message : 'Unknown error'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Determine if this agent type can use Deep Search
    const canAgentUseDeepSearch = agentConfig.toolOptions.useDeepSearch;

    // Only enable Deep Search if both the user has toggled it AND the agent supports it
    const shouldUseDeepSearch = canAgentUseDeepSearch && deepSearchEnabled;

    // Create tools object with conditional inclusion of Deep Search
    try {
      var tools = createToolSet({
        useKnowledgeBase: agentConfig.toolOptions.useKnowledgeBase,
        useWebScraper: agentConfig.toolOptions.useWebScraper,
        useDeepSearch: shouldUseDeepSearch // Only include if explicitly enabled
      });

      edgeLogger.info('Tool selection', {
        operation: 'tool_selection',
        toolNames: Object.keys(tools),
        deepSearchEnabled,
        shouldUseDeepSearch,
        deepSearchIncluded: 'deepSearch' in tools
      });
    } catch (toolError) {
      edgeLogger.error('Tool creation failed', {
        operation: 'tool_creation',
        error: toolError instanceof Error ? toolError.message : String(toolError)
      });

      return new Response(
        JSON.stringify({
          error: 'Tool creation failed',
          message: toolError instanceof Error ? toolError.message : 'Unknown error'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // TEMPORARY: Check for bypass_auth flag to help during development
    const bypassAuth = process.env.NODE_ENV !== 'production' ||
      process.env.BYPASS_AUTH === 'true' ||
      parseBooleanValue(body.bypass_auth);

    if (bypassAuth) {
      edgeLogger.warn('Auth requirement bypassed for testing', {
        operation: 'chat_engine_config'
      });
    }

    // Get the authenticated user (if any)
    const authClient = await createClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();

    const userId = user?.id;

    if (!bypassAuth && (!userId || authError)) {
      edgeLogger.warn('Authentication required', {
        operation: 'chat_request',
        authenticated: !!userId,
        authError: authError?.message
      });

      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // For testing: when auth is bypassed, use a default user ID for persistence
    // This ensures messages can still be saved even when auth is bypassed
    const persistenceUserId = userId || (bypassAuth ? '00000000-0000-0000-0000-000000000000' : undefined);

    if (bypassAuth && !userId) {
      edgeLogger.warn('Using default userId for persistence in bypass mode', {
        operation: 'chat_request',
        persistenceUserId
      });
    }

    // Check if message persistence should be disabled
    const disableMessagePersistence = parseBooleanValue(body.disable_persistence);

    if (disableMessagePersistence) {
      edgeLogger.info('Message persistence disabled for this request', {
        operation: 'chat_engine_config',
        sessionId
      });
    }

    // Log authentication and user ID information for debugging
    edgeLogger.info('Authentication status for chat request', {
      operation: 'chat_request_auth',
      hasAuthUser: !!userId,
      bypassAuth,
      persistenceUserId,
      sessionId
    });

    // Create the chat engine with the detected agent configuration
    const engineConfig: ChatEngineConfig = {
      tools, // Tools object built conditionally
      requiresAuth: !bypassAuth, // Allow bypassing auth for testing
      corsEnabled: false,
      model: agentConfig.model || 'gpt-4o',
      temperature: agentConfig.temperature || 0.7,
      maxTokens: 16000,
      operationName: `chat_${agentType}`,
      cacheEnabled: true,
      messageHistoryLimit: 50,
      // Enable DeepSearch at the engine level if supported by the agent
      useDeepSearch: shouldUseDeepSearch,
      // Use enhanced system prompt following AI SDK standards
      systemPrompt: prompts.buildSystemPrompt(agentType, shouldUseDeepSearch),
      // Configure message persistence
      messagePersistenceDisabled: disableMessagePersistence,
      // Pass prompts system
      prompts,
      // Set agent type
      agentType,
      // Pass additional configuration for tools following AI SDK patterns
      body: {
        deepSearchEnabled: shouldUseDeepSearch, // Pass for safety check in execute function
        sessionId,
        userId: persistenceUserId, // Pass the authenticated user ID for message persistence
        agentType,
        // AI SDK standard configuration for multi-step agents
        maxSteps: 5, // Allow up to 5 steps for complex reasoning chains
        toolChoice: shouldUseDeepSearch ? 'auto' : 'none' // Set toolChoice based on DeepSearch availability
      }
    };

    // Log user ID for message persistence
    edgeLogger.info('Chat engine configuration', {
      operation: 'chat_engine_config',
      sessionId,
      userId: persistenceUserId,
      authBypass: bypassAuth,
      persistenceDisabled: disableMessagePersistence
    });

    try {
      var engine = createChatEngine(engineConfig);

      edgeLogger.info('Chat engine created', {
        operation: 'chat_engine_created',
        sessionId,
        agentType,
        deepSearchEnabled: shouldUseDeepSearch,
        toolCount: Object.keys(tools).length,
        elapsedMs: Date.now() - startTime
      });
    } catch (engineError) {
      edgeLogger.error('Chat engine creation failed', {
        operation: 'chat_engine_creation',
        error: engineError instanceof Error ? engineError.message : String(engineError)
      });

      return new Response(
        JSON.stringify({
          error: 'Chat engine creation failed',
          message: engineError instanceof Error ? engineError.message : 'Unknown error'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Clone the request before passing it to handleRequest to preserve it for debugging
    const reqClone = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: JSON.stringify(body)
    });

    edgeLogger.info('Calling handleRequest', {
      operation: 'route_handler',
      requestBody: JSON.stringify(body).substring(0, 200) // Log first 200 chars
    });

    try {
      // Let the engine handle the request
      const response = await engine.handleRequest(reqClone);

      // Log successful handling
      edgeLogger.info('Request handled successfully', {
        operation: 'route_handler',
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('Content-Type'),
        elapsedMs: Date.now() - startTime
      });

      // Consume the response stream to ensure processing continues even if client disconnects
      // This is crucial for ensuring message persistence completes even during disconnects
      if (response.body && 'consumeStream' in response) {
        // Non-awaited call so we don't block the response
        (response as any).consumeStream();

        edgeLogger.info('Stream consumption initiated to handle potential client disconnects', {
          operation: 'route_handler',
          sessionId
        });
      }

      return response;
    } catch (handleRequestError) {
      edgeLogger.error('Handle request failed', {
        operation: 'handle_request',
        error: handleRequestError instanceof Error ? handleRequestError.message : String(handleRequestError),
        stack: handleRequestError instanceof Error ? handleRequestError.stack : undefined
      });

      return new Response(
        JSON.stringify({
          error: 'Request handling failed',
          message: handleRequestError instanceof Error ? handleRequestError.message : 'Unknown error',
          location: 'handle_request'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

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
        message: error instanceof Error ? error.message : 'Unknown error',
        location: 'outer_try_catch'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
} 