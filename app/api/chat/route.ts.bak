import { validateChatRequest } from '@/lib/chat/validator';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES, type LogCategory } from '@/lib/logger/constants';
import { type AgentType } from '@/lib/agents/prompts';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { PostgrestError, PostgrestSingleResponse, User } from '@supabase/supabase-js';
import { OpenAI } from 'openai';

// Import only validation & utility modules at the top level
import { extractUrls } from '@/lib/chat/url-utils';
import { toolManager } from '@/lib/chat/tool-manager';
import { streamText, appendClientMessage, appendResponseMessages, tool } from 'ai';
import { chatTools } from '@/lib/chat/tools';

// Import schema types
import { getInformationSchema, webScraperSchema, detectAndScrapeUrlsSchema } from '@/lib/chat/tool-schemas';

// Allow streaming responses up to 120 seconds instead of 60
export const maxDuration = 120;
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Define tool schemas using Zod for better type safety
// This schema is no longer needed since we don't use this tool
// const addResourceSchema = z.object({
//   content: z.string().describe('The information to store')
// });

// Removed comprehensiveScraperSchema since we're not using it anymore with the middleware approach

// Add at the top of the file after imports
function formatError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : JSON.stringify(error));
}

function checkEnvironment() {
  const servicesConfig = {
    database: process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'configured' : 'missing',
    ai: process.env.OPENAI_API_KEY && process.env.PERPLEXITY_API_KEY ? 'configured' : 'missing'
  };

  const valid = servicesConfig.database === 'configured' && servicesConfig.ai === 'configured';

  return {
    valid,
    summary: `services=${Object.entries(servicesConfig).map(([k, v]) => `${k}:${v}`).join(',')}`
  };
}

// Define a timeout type to use instead of NodeJS.Timeout
type TimeoutId = ReturnType<typeof setTimeout>;

// Add this helper function near the top of the file, after imports
function maskUserId(userId: string): string {
  if (!userId) return 'unknown';
  if (userId.length <= 8) return userId;
  return `${userId.substring(0, 4)}...${userId.substring(userId.length - 4)}`;
}

export async function POST(req: Request) {
  try {
    const startTime = Date.now();
    const body = await req.json();

    // Add detailed logging to track the deepSearchEnabled flag state
    edgeLogger.info('Chat API received request with Deep Search settings', {
      operation: 'deep_search_request_received',
      deepSearchEnabled: !!body.deepSearchEnabled,
      deepSearchEnabledType: typeof body.deepSearchEnabled,
      bodyKeys: Object.keys(body),
      hasMessage: !!body.message,
      requestId: crypto.randomUUID().substring(0, 8)
    });

    // Use the validated chat request which now handles both formats
    const { messages: chatMessages, id, deepSearchEnabled = false, agentId = 'default' } = validateChatRequest(body);

    // Get the last message (which is the one we need to process)
    const lastUserMessage = chatMessages[chatMessages.length - 1];

    // Additional logging after validation to see if the flag changed
    edgeLogger.debug('Request validated with Deep Search settings', {
      operation: 'deep_search_request_validated',
      deepSearchEnabled,
      validatedDeepSearchEnabled: !!deepSearchEnabled,
      chatId: id || 'new-chat'
    });

    // Check required environment variables
    if (!process.env.OPENAI_API_KEY) {
      edgeLogger.error('Missing OpenAI API key', { operation: 'system' });
      return new Response('Missing OpenAI API key', { status: 500 });
    }

    const timeoutThreshold = 110000; // 110 seconds (just under our maxDuration)
    let operationTimeoutId: TimeoutId | undefined = undefined;

    // Simplified environment check
    const envCheck = checkEnvironment();
    edgeLogger.info('Environment check', {
      operation: 'environment_check',
      valid: envCheck.valid,
      summary: envCheck.summary
    });

    // Set up a timeout for the entire operation
    // Create the async function outside the Promise constructor
    const processRequest = async (resolve: (value: Response) => void, reject: (reason?: any) => void) => {
      // Set timeout to abort operation before Edge runtime timeout
      operationTimeoutId = setTimeout(() => {
        edgeLogger.error('Operation timeout triggered', {
          durationMs: Date.now() - startTime,
          threshold: timeoutThreshold,
          operation: 'chat_request'
        });
        // Return a helpful timeout message that the client can handle
        resolve(new Response(JSON.stringify({
          error: 'Request timeout',
          message: 'The request took too long to process. Please try a simpler query or disable Deep Search.',
          code: 'TIMEOUT'
        }), {
          status: 408,
          headers: { 'Content-Type': 'application/json' }
        }));
      }, timeoutThreshold);

      // Regular request processing starts here
      // Use the validated data instead of re-extracting from body
      const modelName = 'gpt-4o';

      // Create Supabase client for auth
      const cookieStore = await cookies();
      const authClient = await createClient();

      // Get user ID from session
      const { data: { user } } = await authClient.auth.getUser();
      const userId = user?.id;

      edgeLogger.info('Processing chat request', {
        chatId: id,
        messageId: lastUserMessage?.id,
        agentId: agentId,
        deepSearchEnabled,
        userAuthenticated: !!userId
      });

      if (!userId) {
        clearTimeout(operationTimeoutId);
        operationTimeoutId = undefined;
        return resolve(new Response('Unauthorized', { status: 401 }));
      }

      // Validate the message format
      if (!lastUserMessage || !lastUserMessage.role || !lastUserMessage.content) {
        clearTimeout(operationTimeoutId);
        operationTimeoutId = undefined;
        return resolve(new Response('Invalid message format', { status: 400 }));
      }

      // Fetch previous messages from the database for this chat
      const { data: previousMessages, error: messagesError } = await authClient
        .from('sd_chat_histories')
        .select('role, content, id, created_at')
        .eq('session_id', id)
        .order('created_at', { ascending: true });

      if (messagesError) {
        edgeLogger.error('Error fetching previous messages', {
          error: formatError(messagesError),
          chatId: id
        });
      }

      // Convert previous messages to AI SDK format
      const previousAIMessages = (previousMessages || []).map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
        createdAt: new Date(msg.created_at)
      }));

      // Append the new client message to previous messages
      const messages = appendClientMessage({
        messages: previousAIMessages,
        message: lastUserMessage
      });

      // Save the user message immediately to ensure it's persisted
      try {
        // First ensure the session exists
        const { data: sessionData, error: sessionError } = await authClient
          .from('sd_chat_sessions')
          .select('id')
          .eq('id', id)
          .maybeSingle();

        if (!sessionData || sessionError) {
          // Create the session if it doesn't exist
          const { error: createError } = await authClient
            .from('sd_chat_sessions')
            .insert({
              id,
              user_id: userId,
              title: lastUserMessage.content.substring(0, 50), // Always use the current message content as title for new sessions
              agent_id: agentId
            });

          if (createError) {
            edgeLogger.error('Failed to create chat session', {
              error: formatError(createError),
              chatId: id
            });
          } else {
            edgeLogger.info('Created new chat session', { chatId: id });
          }
        }

        // Save the user message
        const { error: saveError } = await authClient
          .from('sd_chat_histories')
          .insert({
            id: lastUserMessage.id,
            session_id: id,
            role: lastUserMessage.role,
            content: lastUserMessage.content,
            user_id: userId
          });

        if (saveError) {
          edgeLogger.error('Failed to save user message', {
            error: formatError(saveError),
            chatId: id,
            messageId: lastUserMessage.id
          });
        } else {
          edgeLogger.info('Saved user message', {
            chatId: id,
            messageId: lastUserMessage.id
          });
        }
      } catch (error) {
        edgeLogger.error('Error in user message saving process', {
          error: formatError(error),
          chatId: id
        });
      }

      // Extract URLs from the user message
      const urls = extractUrls(lastUserMessage.content);

      // Dynamically import dependencies only when needed
      const [
        { AgentRouter },
        { streamText },
        { createResponseValidator },
        { buildAIMessages }
      ] = await Promise.all([
        import('@/lib/agents/agent-router'),
        import('ai'),
        import('@/lib/chat/response-validator'),
        import('@/lib/chat/prompt-builder')
      ]);

      // Log the time taken for dynamic imports
      edgeLogger.debug('Dynamic imports completed', {
        durationMs: Date.now() - startTime
      });

      const agentRouter = new AgentRouter();

      // Apply auto-routing only when the default agent is selected
      // This ensures explicit agent selections from UI are respected
      const routedAgentId = agentId === 'default'
        ? agentRouter.routeMessage(agentId, messages)
        : agentId;

      edgeLogger.info('Agent routing decision', {
        originalAgentId: agentId,
        finalAgentId: routedAgentId,
        wasAutoRouted: agentId === 'default' && routedAgentId !== 'default',
        method: agentId === 'default' ? 'auto-routing' : 'user-selected'
      });

      // Memory optimization: Check message size early
      const totalMessageSize = JSON.stringify(messages).length;
      edgeLogger.info('Message size assessment', {
        totalSizeBytes: totalMessageSize,
        messageCount: messages.length,
        isLarge: totalMessageSize > 100000 // Flag if over 100KB
      });

      // Use the final (potentially routed) agent ID for building the system prompt
      const systemPrompt = agentRouter.getSystemPrompt(routedAgentId as AgentType, deepSearchEnabled);

      // Process resources in the correct hybrid approach:
      // 1. Deep Search - Preprocessed when enabled by user toggle
      // 2. Knowledge Base & Web Scraper - Implemented as AI SDK tools

      // 1. Deep Search (Perplexity) - ONLY when enabled
      if (deepSearchEnabled === true) {
        edgeLogger.info('Deep Search is enabled, preparing to run', {
          category: 'tools',
          operation: 'deep_search_entering_block',
          deepSearchEnabled: true,
          deepSearchEnabledType: typeof deepSearchEnabled,
          deepSearchEnabledValue: String(deepSearchEnabled),
          userId: user?.id ? maskUserId(user.id) : 'anonymous',
          chatId: id || 'new-chat',
          messageCount: chatMessages.length
        });

        // Skip Deep Search if we already have a substantial amount of context
        const toolResults = toolManager.getToolResults();
        const hasExtensiveContent = false; // Modified to always run when enabled

        if (hasExtensiveContent) {
          edgeLogger.info('Skipping Deep Search due to sufficient existing context', {
            operation: 'deep_search_skipped',
            reason: 'sufficient_context',
            category: 'tools',
            deepSearchEnabled: true
          });
        } else {
          const deepSearchStartTime = Date.now();

          // Create a meaningful operation ID for tracing
          const operationId = `deepsearch-${Date.now().toString(36)}`;

          edgeLogger.info('Running Deep Search', {
            operation: 'deep_search_start',
            operationId,
            queryLength: lastUserMessage.content.length,
            queryPreview: lastUserMessage.content.substring(0, 20) + '...',
            deepSearchEnabled: true
          });

          try {
            // Import events manager utility
            const { sendEventToClients, triggerDeepSearchEvent } = await import('@/lib/api/events-manager');

            // Send event to client that DeepSearch has started
            triggerDeepSearchEvent('started', `Query length: ${lastUserMessage.content.length} characters`);

            // Dynamically import Perplexity API
            const { callPerplexityAPI } = await import('@/lib/agents/tools/perplexity/api');

            edgeLogger.info('Starting Perplexity DeepSearch call', {
              operation: 'deep_search_api_call',
              operationId,
              queryLength: lastUserMessage.content.length
            });

            // Check for Perplexity API key before proceeding
            if (!process.env.PERPLEXITY_API_KEY) {
              edgeLogger.error('PERPLEXITY_API_KEY not found in environment', {
                operation: 'deep_search_error',
                operationId,
                reason: 'missing_api_key'
              });

              // Skip DeepSearch and log a clear message
              toolManager.registerToolUsage('Deep Search');
              toolManager.registerToolResult('deepSearch', 'DeepSearch is unavailable due to missing API key configuration.');

              // Send event to client that DeepSearch failed
              const handleEvent = (eventData: any) => {
                // Event handling logic here
              };

              handleEvent({
                type: 'deepSearch',
                status: 'failed',
                details: 'DeepSearch unavailable - missing API key configuration'
              });

              // Create a fallback response
              const deepSearchResponse = {
                content: "DeepSearch is unavailable due to missing API key configuration. Processing with internal knowledge only.",
                model: "unavailable",
                timing: { total: 0 }
              };

              // Extract the content from the response object
              const deepSearchContent = deepSearchResponse.content;

              // Register the unavailability message as a result
              toolManager.registerToolResult('Deep Search', deepSearchContent);

              // Log that we're skipping DeepSearch with fallback content
              edgeLogger.info('Using fallback DeepSearch content due to missing API key', {
                operation: 'deep_search_fallback',
                operationId,
                contentLength: deepSearchContent.length,
                durationMs: Date.now() - deepSearchStartTime
              });

              // Skip the rest of the DeepSearch implementation
            } else {
              // Set up environment variables for Perplexity
              // This helps ensure we're using web search on DeepSearch calls
              if (!process.env.PERPLEXITY_MODEL) {
                process.env.PERPLEXITY_MODEL = 'sonar';
              }

              // Redis caching for DeepSearch
              let deepSearchContent = null;
              let deepSearchResponse: { content: string; model: string; timing: { total: number } } | undefined;
              const redis = Redis.fromEnv();
              const deepSearchQuery = lastUserMessage.content.trim();
              const cacheKey = `deepsearch:${deepSearchQuery.substring(0, 200)}`; // Limit key size for very long queries

              // Check cache first
              try {
                const cachedContentStr = await redis.get(cacheKey);

                if (cachedContentStr) {
                  try {
                    // Ensure we're working with a string before parsing
                    const parsedContent = typeof cachedContentStr === 'string'
                      ? JSON.parse(cachedContentStr)
                      : cachedContentStr; // If it's already an object, use it directly

                    // Validate the parsed content has the required structure
                    if (parsedContent &&
                      typeof parsedContent === 'object' &&
                      typeof parsedContent.content === 'string' &&
                      typeof parsedContent.model === 'string' &&
                      typeof parsedContent.timestamp === 'number') {

                      deepSearchContent = parsedContent.content;

                      edgeLogger.info('DeepSearch cache hit', {
                        operation: 'deep_search_cache_hit',
                        operationId,
                        contentLength: deepSearchContent.length,
                        model: parsedContent.model,
                        cacheAge: Date.now() - parsedContent.timestamp,
                        cacheSource: 'redis'
                      });

                      // Send event to client that DeepSearch was retrieved from cache
                      triggerDeepSearchEvent('completed', `Retrieved ${deepSearchContent.length} characters from cache`);

                      // Register the cached result in the tool manager
                      toolManager.registerToolResult('Deep Search', deepSearchContent);
                    } else {
                      edgeLogger.warn('Invalid DeepSearch cache structure', {
                        operation: 'deep_search_cache_invalid',
                        operationId,
                        fields: parsedContent ? Object.keys(parsedContent) : 'none'
                      });
                    }
                  } catch (parseError) {
                    edgeLogger.error('Error parsing DeepSearch cached content', {
                      operation: 'deep_search_cache_parse_error',
                      operationId,
                      error: parseError instanceof Error ? parseError.message : String(parseError),
                      cachedContentSample: typeof cachedContentStr === 'string'
                        ? cachedContentStr.substring(0, 100) + '...'
                        : `type: ${typeof cachedContentStr}`
                    });
                  }
                }
              } catch (cacheError) {
                edgeLogger.error('Error checking DeepSearch Redis cache', {
                  operation: 'deep_search_cache_error',
                  operationId,
                  error: cacheError instanceof Error ? cacheError.message : String(cacheError)
                });
              }

              // If no valid cached content, perform DeepSearch
              if (!deepSearchContent) {
                // Note: Direct API testing has been removed as we now use the serverless endpoint

                // Set a 20-second timeout for Deep Search operations
                const deepSearchPromise = callPerplexityAPI(deepSearchQuery);

                // Create a properly cancellable timeout using a more robust pattern
                let timeoutId: NodeJS.Timeout;
                const timeoutPromise = new Promise<{
                  content: string;
                  model: string;
                  timing: { total: number };
                }>(resolve => {
                  timeoutId = setTimeout(() => {
                    edgeLogger.warn('Deep Search operation timed out', {
                      operation: 'deep_search_timeout',
                      operationId,
                      durationMs: Date.now() - deepSearchStartTime,
                      threshold: 20000
                    });
                    resolve({
                      content: "Deep Search timed out after 20 seconds. The AI will continue without these results and use only internal knowledge and any other available sources.",
                      model: "timeout",
                      timing: { total: Date.now() - deepSearchStartTime }
                    });
                  }, 20000);
                });

                // When the real promise resolves, clear the timeout to prevent redundant logs
                // Use a separate variable to track if timeout already happened
                let timeoutOccurred = false;
                let apiCallCompleted = false;

                // Add handlers to track state without affecting the promise chain
                deepSearchPromise.then(() => {
                  apiCallCompleted = true;
                  if (!timeoutOccurred) {
                    clearTimeout(timeoutId);
                    edgeLogger.debug('Cleared DeepSearch timeout after successful API call', {
                      operation: 'deep_search_timeout_cleared',
                      operationId
                    });
                  }
                }).catch(() => {
                  // Still clear timeout on error to avoid redundant logs
                  if (!timeoutOccurred) {
                    clearTimeout(timeoutId);
                  }
                });

                const deepSearchResponse = await Promise.race([
                  deepSearchPromise,
                  timeoutPromise.then(result => {
                    timeoutOccurred = true;
                    return result;
                  })
                ]);

                // Extract the content from the response object
                deepSearchContent = deepSearchResponse.content;

                edgeLogger.info('DeepSearch response received', {
                  operation: 'deep_search_response',
                  operationId,
                  responseLength: deepSearchContent.length,
                  model: deepSearchResponse.model,
                  timingMs: deepSearchResponse.timing.total,
                  isError: deepSearchResponse.model === 'error'
                });

                // Store successful DeepSearch results in Redis cache
                if (deepSearchContent &&
                  deepSearchContent.length > 0 &&
                  !deepSearchContent.includes("timed out") &&
                  !deepSearchResponse.model.includes("error")) {

                  try {
                    // Create a cache-friendly structure
                    const cacheableResult = {
                      content: deepSearchContent,
                      model: deepSearchResponse.model,
                      timestamp: Date.now(),
                      query: deepSearchQuery.substring(0, 200) // Store truncated query for reference
                    };

                    // Store in Redis cache with explicit JSON stringification
                    const jsonString = JSON.stringify(cacheableResult);

                    // Use a shorter TTL for DeepSearch results (1 hour)
                    await redis.set(cacheKey, jsonString, { ex: 60 * 60 }); // 1 hour TTL

                    edgeLogger.info('Stored DeepSearch content in Redis cache', {
                      operation: 'deep_search_cache_set',
                      operationId,
                      contentLength: deepSearchContent.length,
                      jsonStringLength: jsonString.length,
                      ttl: 60 * 60,
                      model: deepSearchResponse.model
                    });
                  } catch (storageError) {
                    edgeLogger.error('Error storing DeepSearch in Redis cache', {
                      operation: 'deep_search_cache_store_error',
                      operationId,
                      error: storageError instanceof Error ? storageError.message : String(storageError)
                    });
                  }
                }
              }

              if (deepSearchContent &&
                deepSearchContent.length > 0 &&
                !deepSearchContent.includes("timed out")) {
                // Register the result in the tool manager
                toolManager.registerToolResult('Deep Search', deepSearchContent);

                edgeLogger.info('Deep Search results found', {
                  operation: 'deep_search_success',
                  operationId,
                  contentLength: deepSearchContent.length,
                  firstChars: deepSearchContent.substring(0, 100) + '...',
                  fromCache: !deepSearchResponse || deepSearchResponse.timing.total < 100, // If response is missing or timing is very low, it was from cache
                  durationMs: Date.now() - deepSearchStartTime
                });

                // Send event to client that DeepSearch has completed
                triggerDeepSearchEvent('completed', `Retrieved ${deepSearchContent.length} characters of information`);
              } else {
                // When no useful results are found or search timed out
                edgeLogger.info('No Deep Search results found or timed out', {
                  operation: 'deep_search_empty',
                  operationId,
                  reason: deepSearchContent.includes("timed out") ? 'timeout' : 'no_results',
                  durationMs: Date.now() - deepSearchStartTime
                });

                // Send event to client that DeepSearch has failed
                triggerDeepSearchEvent('failed', deepSearchContent.includes("timed out")
                  ? 'Search timed out after 20 seconds'
                  : 'No relevant results found');
              }
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            edgeLogger.error('Error running Deep Search', {
              operation: 'deep_search_error',
              operationId,
              error: formatError(error),
              durationMs: Date.now() - deepSearchStartTime
            });

            // Send event to client that DeepSearch has failed
            try {
              const { triggerDeepSearchEvent } = await import('@/lib/api/events-manager');
              triggerDeepSearchEvent('failed', `Error: ${errorMessage}`);
            } catch (e) {
              edgeLogger.error('Failed to send event for DeepSearch error', {
                operation: 'deep_search_event_error',
                error: formatError(e)
              });
            }
          }
        }
      } else {
        edgeLogger.info('Deep Search skipped (UI toggle disabled)', {
          operation: 'deep_search_disabled',
          category: 'tools',
          deepSearchEnabled: false,
          deepSearchEnabledType: typeof deepSearchEnabled,
          rawDeepSearchValue: deepSearchEnabled,
          deepSearchEnabledStringValue: String(deepSearchEnabled),
          bodyDeepSearchEnabledType: typeof body.deepSearchEnabled,
          bodyDeepSearchEnabledValue: String(body.deepSearchEnabled),
          chatId: id || 'new-chat'
        });
      }

      // Memory usage checkpoint after Deep Search
      edgeLogger.debug('Memory checkpoint after tools setup', {
        elapsedMs: Date.now() - startTime
      });

      /**
       * Generate a summary of preprocessing operations
       * This helps with logging and debugging what happened before AI response generation
       */
      function generatePreprocessingSummary(toolMgr: any) {
        const toolResults = toolMgr.getToolResults();
        const toolsUsed = toolMgr.getToolsUsed();

        const summary = {
          operation: 'preprocessing_summary',
          toolsCount: toolsUsed.length,
          toolsUsed,
          contentSizes: {
            deepSearch: toolResults.deepSearch?.length || 0
          },
          webSearch: {
            enabled: deepSearchEnabled,
            used: toolsUsed.includes('Deep Search'),
            reason: !deepSearchEnabled ? 'ui_toggle_disabled' :
              (toolsUsed.includes('Deep Search') ? 'search_completed' : 'skipped_sufficient_context')
          },
          timings: {
            preprocessingMs: Date.now() - startTime
          }
        };

        edgeLogger.info('Preprocessing summary before AI response generation', summary);
        return summary;
      }

      // Log the preprocessing summary
      generatePreprocessingSummary(toolManager);

      // Build AI messages with Deep Search results and user profile data
      const aiMessageStartTime = Date.now();
      edgeLogger.info('Building AI messages', {
        operation: 'build_ai_messages',
        toolsUsed: toolManager.getToolsUsed().length
      });

      const aiMessages = await buildAIMessages({
        basePrompt: systemPrompt,
        toolResults: toolManager.getToolResults(),
        toolsUsed: toolManager.getToolsUsed(),
        userMessages: messages,
        userId
      });

      edgeLogger.info('AI messages built', {
        operation: 'ai_messages_built',
        durationMs: Date.now() - aiMessageStartTime,
        messageCount: aiMessages.length,
        systemPromptSize: aiMessages[0]?.content?.length || 0,
        deepSearchIncluded: toolManager.getToolsUsed().includes('Deep Search'),
        toolsUsed: toolManager.getToolsUsed()
      });

      // Will hold our AI SDK tools
      let aiSdkTools = {};

      // Initialize AI SDK tools
      try {
        // Import tool schemas
        const { webScraperSchema, detectAndScrapeUrlsSchema, getInformationSchema } = await import('@/lib/chat/tool-schemas');
        const { formatScrapedContent } = await import('@/lib/chat/tools');

        // Import the vectorSearchTool
        const { vectorSearchTool } = await import('@/lib/agents/tools/vector-search-tool');

        // Import the toolManager singleton
        const { toolManager } = await import('@/lib/chat/tool-manager');

        // Define AI SDK tools
        aiSdkTools = {
          // Use the comprehensive vectorSearchTool for knowledge base search
          getInformation: tool({
            description: 'Search the photography knowledge base for relevant information on marketing and business topics',
            parameters: getInformationSchema,
            execute: async ({ query }) => {
              const startTime = performance.now();
              const operationId = `kbsearch-${Date.now().toString(36)}`;

              try {
                edgeLogger.info('Knowledge base search starting via vectorSearchTool', {
                  operation: 'kb_search_start',
                  operationId,
                  queryLength: query.length,
                  queryPreview: query.substring(0, 20) + '...'
                });

                // Call the proper vectorSearchTool which has all the caching and metrics
                const result = await vectorSearchTool.execute({
                  query,
                  limit: 5,
                  similarityThreshold: 0.65,
                  formatOption: 'llm',
                  includeMetadata: true
                }, {
                  toolCallId: operationId,
                  messages: []
                });

                const formattedResults = result.content || '';
                const duration = Math.round(performance.now() - startTime);

                // Get metrics with defaults if not available
                const metrics = result.metrics || {};
                const fromCache = 'fromCache' in metrics ? metrics.fromCache : false;
                const avgSimilarity = 'averageSimilarity' in metrics ?
                  metrics.averageSimilarity.toFixed(2) : 'N/A';

                edgeLogger.info('Knowledge base search completed via vectorSearchTool', {
                  operation: 'kb_search_complete',
                  operationId,
                  queryLength: query.length,
                  durationMs: duration,
                  documentCount: result.documents?.length || 0,
                  resultLength: formattedResults.length,
                  fromCache,
                  avgSimilarity
                });

                // Register the tool usage for validation
                toolManager.registerToolUsage('Knowledge Base');
                toolManager.registerToolResult('Knowledge Base', formattedResults);

                return formattedResults;
              } catch (error) {
                const duration = Math.round(performance.now() - startTime);
                edgeLogger.error('Knowledge base search failed', {
                  operation: 'kb_search_error',
                  operationId,
                  queryLength: query.length,
                  durationMs: duration,
                  error: formatError(error),
                  important: true
                });

                throw error;
              }
            }
          }),

          webScraper: tool({
            description: 'Scrape and extract content from a webpage to get detailed information from the specified URL. Use this tool when a URL is mentioned and you need to access its content.',
            parameters: webScraperSchema,
            execute: async ({ url }) => {
              const startTime = performance.now();

              try {
                // Import the web scraper tool
                const { callPuppeteerScraper, validateAndSanitizeUrl } = await import('@/lib/agents/tools/web-scraper-tool');
                const { ensureProtocol } = await import('@/lib/chat/url-utils');

                // Process URL
                const fullUrl = ensureProtocol(url);
                const validUrl = validateAndSanitizeUrl(fullUrl);

                // Import the required type
                type PuppeteerResponseData = {
                  url: string;
                  title: string;
                  description: string;
                  content: string;
                  [key: string]: any;
                };

                // Initialize Redis client
                const redis = Redis.fromEnv();

                // Normalize URL for consistent cache keys
                const normalizedUrl = validUrl.toLowerCase().trim().replace(/\/$/, '');
                const cacheKey = `scrape:${normalizedUrl}`;
                const operationId = `webscraper-${Date.now().toString(36)}`;

                // Check if we have a cache entry for this URL
                edgeLogger.info('Checking Redis cache for URL', {
                  category: LOG_CATEGORIES.SYSTEM,
                  operation: 'web_scraper_cache_check',
                  operationId,
                  url: validUrl,
                  cacheKey
                });

                let scraperResult: PuppeteerResponseData | null = null;
                let cachedContentStr: string | null = null;

                try {
                  cachedContentStr = await redis.get(cacheKey);

                  if (cachedContentStr) {
                    edgeLogger.info('Redis cache hit for URL', {
                      category: LOG_CATEGORIES.SYSTEM,
                      operation: 'web_scraper_cache_hit',
                      operationId,
                      url: validUrl,
                      contentLength: typeof cachedContentStr === 'string' ? cachedContentStr.length : 'unknown',
                      valueType: typeof cachedContentStr,
                      cacheHit: true,
                      cacheSource: 'redis'
                    });

                    try {
                      // Only attempt to parse if it's actually a string
                      if (typeof cachedContentStr === 'string') {
                        const parsedContent = JSON.parse(cachedContentStr);
                        if (parsedContent &&
                          typeof parsedContent === 'object' &&
                          typeof parsedContent.content === 'string') {
                          scraperResult = parsedContent;
                          edgeLogger.info('Successfully parsed cached scraper result', {
                            category: LOG_CATEGORIES.SYSTEM,
                            operation: 'web_scraper_cache_parse',
                            operationId,
                            contentLength: parsedContent.content.length,
                            resultFields: Object.keys(parsedContent),
                            cacheHit: true,
                            fromCache: true
                          });
                        } else {
                          edgeLogger.warn('Invalid scraper cache structure', {
                            category: LOG_CATEGORIES.SYSTEM,
                            operation: 'web_scraper_cache_invalid',
                            operationId,
                            fields: parsedContent ? Object.keys(parsedContent) : 'none'
                          });
                        }
                      } else if (typeof cachedContentStr === 'object' && cachedContentStr !== null) {
                        // Redis might have auto-parsed the JSON already
                        const objWithContent = cachedContentStr as { content?: string };
                        if (objWithContent && typeof objWithContent.content === 'string') {
                          scraperResult = cachedContentStr as PuppeteerResponseData;
                          edgeLogger.info('Using pre-parsed cached scraper result', {
                            category: LOG_CATEGORIES.SYSTEM,
                            operation: 'web_scraper_cache_auto_parsed',
                            operationId,
                            contentLength: objWithContent.content.length,
                            cacheHit: true,
                            fromCache: true
                          });
                        }
                      }
                    } catch (parseError) {
                      edgeLogger.error('Error parsing cached scraper content', {
                        category: LOG_CATEGORIES.SYSTEM,
                        operation: 'web_scraper_cache_parse_error',
                        operationId,
                        error: formatError(parseError),
                        cachedContentSample: typeof cachedContentStr === 'string'
                          ? cachedContentStr.substring(0, 100) + '...'
                          : `type: ${typeof cachedContentStr}`,
                        important: true
                      });
                    }
                  } else {
                    edgeLogger.warn('Redis cache miss for URL', {
                      category: LOG_CATEGORIES.SYSTEM,
                      operation: 'web_scraper_cache_miss',
                      operationId,
                      url: validUrl
                    });
                  }
                } catch (cacheError) {
                  edgeLogger.error('Error checking Redis cache for URL', {
                    category: LOG_CATEGORIES.SYSTEM,
                    operation: 'web_scraper_cache_error',
                    operationId,
                    error: formatError(cacheError),
                    important: true
                  });
                }

                // If not in cache, scrape the URL
                if (!scraperResult) {
                  try {
                    // User is authenticated and content is not in cache, so scrape it
                    scraperResult = await callPuppeteerScraper(validUrl);

                    // Store the scraperResult in Redis cache (6 hour TTL)
                    try {
                      if (scraperResult && typeof scraperResult === 'object' &&
                        typeof (scraperResult as any).content === 'string' && (scraperResult as any).content.length > 0) {

                        // Create a cache-friendly structure
                        const cacheableResult = {
                          content: (scraperResult as any).content,
                          title: (scraperResult as any).title || 'No title',
                          description: (scraperResult as any).description || 'No description',
                          url: validUrl,
                          timestamp: Date.now()
                        };

                        // Store in Redis cache with explicit JSON stringification
                        const jsonString = JSON.stringify(cacheableResult);
                        const ttl = 6 * 60 * 60; // 6 hours in seconds

                        await redis.set(cacheKey, jsonString, { ex: ttl });

                        edgeLogger.info('Stored URL content in Redis cache', {
                          category: LOG_CATEGORIES.SYSTEM,
                          operation: 'web_scraper_cache_store',
                          operationId,
                          url: validUrl,
                          contentLength: (scraperResult as any).content.length,
                          jsonStringLength: jsonString.length,
                          ttl
                        });

                        // Verify the cache entry was stored correctly
                        const verifyCacheEntry = await redis.get(cacheKey);
                        edgeLogger.debug('Verified cache storage', {
                          category: LOG_CATEGORIES.SYSTEM,
                          operation: 'web_scraper_cache_verify',
                          operationId,
                          stored: !!verifyCacheEntry,
                          storedType: typeof verifyCacheEntry
                        });
                      }
                    } catch (storageError) {
                      edgeLogger.error('Error storing URL content in Redis cache', {
                        category: LOG_CATEGORIES.SYSTEM,
                        operation: 'web_scraper_cache_store_error',
                        operationId,
                        error: formatError(storageError),
                        important: true
                      });
                    }
                  } catch (scrapeError) {
                    edgeLogger.error('Error scraping URL', {
                      category: LOG_CATEGORIES.SYSTEM,
                      operation: 'web_scraper_error',
                      operationId,
                      error: formatError(scrapeError),
                      important: true
                    });
                    // Return an error message to be included in the tool response
                    return {
                      error: true,
                      content: `Error scraping URL: ${url} - ${scrapeError instanceof Error ? scrapeError.message : String(scrapeError)}`
                    };
                  }
                }

                // Format the content for the AI
                const formattedContent = formatScrapedContent(scraperResult as any);

                const duration = Math.round(performance.now() - startTime);
                edgeLogger.info('Web scraper tool completed', {
                  operation: 'web_scraper_complete',
                  operationId,
                  url: validUrl,
                  durationMs: duration,
                  contentLength: formattedContent.length,
                  fromCache: !!cachedContentStr
                });

                // Register the tool as used for validation purposes
                toolManager.registerToolUsage('Web Scraper');
                toolManager.registerToolResult('Web Scraper', formattedContent);

                return formattedContent;
              } catch (error) {
                const duration = Math.round(performance.now() - startTime);
                edgeLogger.error('Web scraper tool failed', {
                  url,
                  durationMs: duration,
                  error: formatError(error)
                });

                throw error;
              }
            }
          }),

          detectAndScrapeUrls: tool({
            description: 'Automatically detects URLs in text and scrapes their content',
            parameters: detectAndScrapeUrlsSchema,
            execute: async ({ text }) => {
              const startTime = performance.now();

              try {
                const result = await chatTools.detectAndScrapeUrls.execute({ text }, {
                  toolCallId: 'ai-initiated-url-detection',
                  messages: []
                });

                const duration = Math.round(performance.now() - startTime);
                edgeLogger.info('URL detection completed', {
                  textLength: text.length,
                  durationMs: duration,
                  urlsFound: result.urls.length
                });

                // Register the tool as used for validation purposes
                if (result.urls.length > 0) {
                  toolManager.registerToolUsage('Web Scraper');
                }

                return result;
              } catch (error) {
                const duration = Math.round(performance.now() - startTime);
                edgeLogger.error('URL detection failed', {
                  textLength: text.length,
                  durationMs: duration,
                  error: formatError(error)
                });

                throw error;
              }
            }
          })
        };
      } catch (error) {
        edgeLogger.error('Error initializing tools', { error: formatError(error) });
      }

      // Create a response validator function
      const validateResponse = createResponseValidator({
        toolsUsed: toolManager.getToolsUsed(),
        toolResults: toolManager.getToolResults(),
        urls
      });

      // Log the final system prompt size
      edgeLogger.info('Final AI messages prepared', {
        messageCount: aiMessages.length,
        toolsUsed: toolManager.getToolsUsed(),
        toolsCount: Object.keys(aiSdkTools).length,
        includesUserProfile: !!userId,
        elapsedTimeMs: Date.now() - startTime
      });

      // Log the final AI configuration with tools
      edgeLogger.info('AI configuration prepared', {
        model: modelName,
        availableTools: Object.keys(aiSdkTools),
        maxSteps: 10,
        temperature: 0.4,
        elapsedTimeMs: Date.now() - startTime
      });

      try {
        // Dynamically import the OpenAI model directly
        const { openai } = await import('@ai-sdk/openai');

        edgeLogger.info('Starting LLM request', {
          model: modelName,
          elapsedTimeMs: Date.now() - startTime,
          systemPromptSize: aiMessages[0]?.content?.length || 0
        });

        // Instead of preprocessing URLs directly, we'll use the AI SDK tools approach
        // Remove the "Processing detected URLs directly" section and let the AI model decide when to use the tools

        // If there are detected URLs, add a hint to the system prompt about them but don't scrape them yet
        if (urls.length > 0) {
          edgeLogger.info('URLs detected in user message', {
            urlCount: urls.length,
            urls: urls.slice(0, 3) // Log up to 3 URLs
          });

          // If there's a system message, add a note about the URLs but don't include content
          if (aiMessages.length > 0 && aiMessages[0].role === 'system' && typeof aiMessages[0].content === 'string') {
            aiMessages[0].content += `\n\n${'='.repeat(80)}\n` +
              `## NOTE: URLS DETECTED IN USER MESSAGE\n` +
              `The user message contains the following URLs that may be relevant to their query:\n` +
              urls.map(url => `- ${url}`).join('\n') + `\n` +
              `You can use the webScraper tool to get content from these URLs if needed for your response.\n` +
              `${'='.repeat(80)}\n\n`;

            edgeLogger.info('Added URL hint to system prompt', {
              urlCount: urls.length,
              hintedPromptLength: aiMessages[0].content.length
            });
          }
        }

        // Use the Vercel AI SDK's streamText function with the raw model (no middleware)
        const result = await streamText({
          model: openai('gpt-4o'),
          messages: aiMessages,
          temperature: 0.4,
          maxTokens: 16000,
          tools: aiSdkTools,
          maxSteps: 10,
          toolChoice: 'auto',
          toolCallStreaming: true,
          onChunk: ({ chunk }) => {
            try {
              // Use a simpler approach with fewer TypeScript issues
              const chunkType = chunk.type as string;

              // We'll use any typing here to avoid TypeScript errors with different chunk types
              const typedChunk = chunk as any;

              if (chunkType === 'tool-call') {
                edgeLogger.info('Tool call chunk received', {
                  toolName: typedChunk.name || 'unknown',
                  parameters: JSON.stringify(typedChunk.parameters || {}).substring(0, 100) + '...',
                  elapsedTimeMs: Date.now() - startTime
                });
              } else if (chunkType === 'tool-result') {
                edgeLogger.info('Tool result chunk received', {
                  resultLength: typeof typedChunk.result === 'string' ? typedChunk.result.length : JSON.stringify(typedChunk.result || {}).length,
                  resultType: typeof typedChunk.result,
                  elapsedTimeMs: Date.now() - startTime
                });
              } else if (chunkType === 'text-delta' && Math.random() < 0.05) {
                // Only log text delta occasionally to avoid flooding
                const text = typedChunk.text || '';
                edgeLogger.debug('Text delta chunk received', {
                  textLength: text.length,
                  textPreview: text.substring(0, 20) + (text.length > 20 ? '...' : ''),
                  elapsedTimeMs: Date.now() - startTime
                });
              } else if (chunkType === 'error') {
                edgeLogger.error('Error chunk in stream', {
                  error: formatError(typedChunk.error),
                  elapsedTimeMs: Date.now() - startTime
                });
              }
            } catch (error) {
              // Prevent errors in the debug logging from breaking the stream
              edgeLogger.error('Error in chunk handler', {
                error: formatError(error),
                chunkType: (chunk as any).type || 'unknown'
              });
            }
          },
          onError: ({ error }) => {
            edgeLogger.error('Error during AI streaming', {
              error: formatError(error),
              chatId: id,
              modelName,
              elapsedTimeMs: Date.now() - startTime,
              messageCount: aiMessages.length,
              toolsCount: Object.keys(aiSdkTools).length,
              important: true,
              stack: error instanceof Error ? error.stack : undefined
            });
          },
          onFinish: async (completion) => {
            try {
              edgeLogger.info('LLM generation completed successfully', {
                chatId: id,
                modelName,
                generationTimeMs: Date.now() - startTime,
                messageCount: aiMessages.length,
                systemPromptSize: aiMessages[0]?.content?.length || 0
              });

              let fullText = '';

              if (typeof completion === 'object' && completion !== null) {
                if ('text' in completion && typeof completion.text === 'string') {
                  fullText = completion.text;
                } else if ('content' in completion && typeof completion.content === 'string') {
                  fullText = completion.content;
                } else if (fullText.trim() === '' && 'toolResults' in completion) {
                  // Define a type for tool result items
                  interface ToolResultItem {
                    result?: string | Record<string, any>;
                    content?: string | Record<string, any>;
                    output?: string | Record<string, any>;
                    text?: string | Record<string, any>;
                  }

                  const toolResultsArray = Array.isArray(completion.toolResults)
                    ? completion.toolResults
                    : [];

                  if (toolResultsArray.length > 0) {
                    const toolContents = toolResultsArray
                      .map((tr: any) => {
                        if (typeof tr === 'object' && tr !== null) {
                          const resultContent = tr.result || tr.content || tr.output || tr.text || '';
                          return typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent);
                        }
                        return '';
                      })
                      .filter(Boolean);

                    if (toolContents.length > 0) {
                      fullText = `Here's what I found in the content:\n\n${toolContents.join('\n\n')}`;
                    }
                  }
                } else {
                  fullText = JSON.stringify(completion);
                }
              } else if (typeof completion === 'string') {
                fullText = completion;
              } else {
                fullText = `Response: ${String(completion)}`;
              }

              edgeLogger.debug('Content before validation', {
                contentLength: fullText.length,
                contentPreview: fullText.substring(0, 100),
                isEmpty: fullText.trim() === ''
              });

              const validatedText = validateResponse(fullText);

              const wasModified = validatedText !== fullText;
              edgeLogger.info(wasModified ? 'Fixed response with validation function' : 'Response validation completed', {
                originalLength: fullText.length,
                validatedLength: validatedText.length,
                wasModified
              });

              if (id) {
                edgeLogger.debug('Storing chat session', { id });
                try {
                  const authClient = await createClient();

                  const { data: existingSession } = await authClient
                    .from('sd_chat_sessions')
                    .select('id, title')
                    .eq('id', id)
                    .maybeSingle();

                  const isFirstMessage = messages.length <= 1;

                  const sessionResponse = await authClient
                    .from('sd_chat_sessions')
                    .upsert({
                      id,
                      user_id: userId,
                      title: isFirstMessage
                        ? lastUserMessage.content.substring(0, 50)
                        : (existingSession?.title || lastUserMessage.content.substring(0, 50)),
                      updated_at: new Date().toISOString(),
                      agent_id: routedAgentId
                    });

                  if (sessionResponse.error) {
                    throw new Error(`Failed to store session: ${sessionResponse.error.message}`);
                  }

                  const assistantMessage = {
                    role: 'assistant' as const,
                    content: validatedText,
                    id: crypto.randomUUID()
                  };

                  const updatedMessages = appendResponseMessages({
                    messages,
                    responseMessages: [assistantMessage]
                  });

                  const lastAssistantMessage = updatedMessages.filter(m => m.role === 'assistant').pop();
                  if (lastAssistantMessage) {
                    const { error: saveError } = await authClient
                      .from('sd_chat_histories')
                      .insert({
                        id: lastAssistantMessage.id,
                        session_id: id,
                        role: lastAssistantMessage.role,
                        content: lastAssistantMessage.content,
                        user_id: userId
                      });

                    if (saveError) {
                      edgeLogger.error('Failed to save assistant message', {
                        error: formatError(saveError),
                        chatId: id,
                        messageId: lastAssistantMessage.id
                      });
                    } else {
                      edgeLogger.info('Saved assistant message', {
                        chatId: id,
                        messageId: lastAssistantMessage.id
                      });
                    }
                  }

                  edgeLogger.info('Chat session and message saved successfully', {
                    id,
                    titleSource: existingSession?.title ? 'preserved existing' : 'set from user message'
                  });
                } catch (error) {
                  edgeLogger.error('Error storing chat messages', { error: formatError(error) });
                }
              }

              edgeLogger.info('Generated assistant response', {
                chatId: id,
                userId,
                contentLength: validatedText.length,
                toolsUsed: toolManager.getToolsUsed().length,
                totalTimeMs: Date.now() - startTime
              });

              if (operationTimeoutId) {
                clearTimeout(operationTimeoutId);
                operationTimeoutId = undefined;
              }
            } catch (error) {
              edgeLogger.error('Error in onFinish callback', { error: formatError(error) });
            }
          }
        });

        result.consumeStream();

        clearTimeout(operationTimeoutId);
        operationTimeoutId = undefined;
        resolve(result.toDataStreamResponse());
      } catch (error) {
        edgeLogger.error('Error in AI API call', {
          error: formatError(error),
          elapsedTimeMs: Date.now() - startTime
        });
        clearTimeout(operationTimeoutId);
        operationTimeoutId = undefined;
        resolve(new Response(`Error: ${error instanceof Error ? error.message : String(error)}`, { status: 500 }));
      }
    };

    const operationPromise = new Promise<Response>((resolve, reject) => {
      processRequest(resolve, reject).catch(reject);
    });

    return await operationPromise;

  } catch (error) {
    edgeLogger.error('Unhandled error in chat API route', { error: formatError(error) });
    return new Response(`Error: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
  }
}