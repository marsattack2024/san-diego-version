import { validateChatRequest } from '@/lib/chat/validator';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '../../../lib/logger/constants';
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
import { ToolManager } from '@/lib/chat/tool-manager';
import { streamText } from 'ai';

// Allow streaming responses up to 120 seconds instead of 60
export const maxDuration = 120;
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Define tool schemas using Zod for better type safety
const getInformationSchema = z.object({
  query: z.string().describe('The search query to find information about')
});

const addResourceSchema = z.object({
  content: z.string().describe('The information to store')
});

const detectAndScrapeUrlsSchema = z.object({
  text: z.string().describe('The text to extract URLs from')
});

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

// Define the formatScrapedContent function at module level instead of nested
function formatScrapedContent(content: any): string {
  if (!content) return 'No content was extracted from the URL.';
  
  // Format content into a structured string  
  let formatted = '';
  
  if (content.title) {
    formatted += `TITLE: ${content.title}\n\n`;
  }
  
  if (content.description) {
    formatted += `DESCRIPTION: ${content.description}\n\n`;
  }
  
  if (content.mainContent) {
    formatted += `CONTENT:\n${content.mainContent}\n\n`;
  }
  
  if (content.url) {
    formatted += `SOURCE: ${content.url}\n`;
  }
  
  return formatted;
}

export async function POST(req: Request) {
  try {
    const startTime = Date.now(); // Add timestamp for performance tracking
    const timeoutThreshold = 110000; // 110 seconds (just under our maxDuration)
    let operationTimeoutId: TimeoutId | undefined = undefined;
    
    // Simplified environment check
    const envCheck = checkEnvironment();
    edgeLogger.info('Environment check', {
      category: LOG_CATEGORIES.SYSTEM,
      valid: envCheck.valid,
      summary: envCheck.summary,
      important: true
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
      const body = await req.json();
      const { messages, id, agentId = 'default', deepSearchEnabled = false } = validateChatRequest(body);
      const modelName = 'gpt-4o';
      
      // Create Supabase client for auth
      const cookieStore = await cookies();
      const authClient = await createClient();
      
      // Get user ID from session
      const { data: { user } } = await authClient.auth.getUser();
      const userId = user?.id;
      
      edgeLogger.info('Processing chat request', {
        chatId: id,
        messageCount: messages.length,
        agentId: agentId,
        deepSearchEnabled,
        userAuthenticated: !!userId
      });
      
      if (!userId) {
        clearTimeout(operationTimeoutId);
        operationTimeoutId = undefined;
        return resolve(new Response('Unauthorized', { status: 401 }));
      }
      
      // Get the last user message
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      if (!lastUserMessage) {
        clearTimeout(operationTimeoutId);
        operationTimeoutId = undefined;
        return resolve(new Response('No user message found', { status: 400 }));
      }
      
      // Extract URLs from the user message
      const urls = extractUrls(lastUserMessage.content);
      
      // Initialize the tool manager for this request
      const toolManager = new ToolManager();
      
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
      
      // Process resources in the correct priority order (as specified in requirements)
      // Order of importance: 1. System Message 2. RAG 3. Web Scraper 4. Deep Search
      
      // 1. System Message is already prioritized in the buildAIMessages function
      
      // Import the tools - but only once to reduce memory overhead
      const { chatTools } = await import('@/lib/chat/tools');
      
      // 2. RAG (Knowledge Base) - HIGH PRIORITY for queries over 15 characters
      if (lastUserMessage.content.length > 15) {
        const ragStartTime = Date.now();
        edgeLogger.info('Running RAG for query', { 
          query: lastUserMessage.content.substring(0, 100) + '...',
          queryLength: lastUserMessage.content.length
        });
        
        try {
          // Execute the RAG tool with proper operation tracking
          const ragResult = await edgeLogger.trackOperation(
            'rag_search',
            async () => {
              return await chatTools.getInformation.execute(
                { query: lastUserMessage.content },
                { toolCallId: 'rag-search', messages: [] }
              );
            },
            {
              category: LOG_CATEGORIES.TOOLS,
              query: lastUserMessage.content.substring(0, 100),
              important: true
            }
          );
          
          // Check if we got valid results
          if (typeof ragResult === 'string') {
            if (!ragResult.includes("No relevant information found")) {
              toolManager.registerToolResult('Knowledge Base', ragResult);
              edgeLogger.info('RAG results found', { 
                contentLength: ragResult.length,
                firstChars: ragResult.substring(0, 100) + '...',
                durationMs: Date.now() - ragStartTime
              });
            } else {
              edgeLogger.info('No RAG results found', {
                durationMs: Date.now() - ragStartTime,
                reason: 'no matches'
              });
            }
          } else {
            // If it's not a string, log the unexpected result type
            edgeLogger.warn('Unexpected RAG result type', {
              resultType: typeof ragResult,
              durationMs: Date.now() - ragStartTime
            });
          }
        } catch (error) {
          edgeLogger.error('Error running RAG', { 
            error: formatError(error),
            durationMs: Date.now() - ragStartTime
          });
        }
      }
      
      // Memory usage checkpoint after RAG
      edgeLogger.debug('Memory checkpoint after RAG', {
        elapsedMs: Date.now() - startTime,
        tool: 'RAG'
      });
      
      // 3. Web Scraper - Detect and process URLs directly in the route handler
      if (urls.length > 0) {
        // Log URLs detected in the user message
        edgeLogger.info('URLs detected in user message', { 
          urlCount: urls.length,
          firstUrl: urls[0],
          message: "These will be processed directly via our Puppeteer scraper"
        });
      }
      
      // Memory usage checkpoint after URL detection
      edgeLogger.debug('Memory checkpoint after URL detection', {
        elapsedMs: Date.now() - startTime,
        tool: 'URL detection',
        automaticProcessing: true,
        message: "URLs will be processed directly in the route handler"
      });
      
      // 4. Deep Search - LOWEST PRIORITY (if enabled)
      if (deepSearchEnabled) {
        // Skip Deep Search if we already have a substantial amount of context
        const toolResults = toolManager.getToolResults();
        const ragContentLength = toolResults.ragContent?.length || 0;
        const webScraperLength = toolResults.webScraper?.length || 0;
        const hasExtensiveRAG = ragContentLength > 5000;
        const hasExtensiveWebContent = webScraperLength > 8000;
        
        if (hasExtensiveRAG && hasExtensiveWebContent) {
          edgeLogger.info('Skipping Deep Search due to sufficient existing context', {
            operation: 'deep_search_skipped',
            important: true,
            ragContentLength,
            webScraperLength,
            reason: 'sufficient_context'
          });
        } else {
          const deepSearchStartTime = Date.now();
          
          // Create a meaningful operation ID for tracing
          const operationId = `deepsearch-${Date.now().toString(36)}`;
          
          edgeLogger.info('Running Deep Search for query', { 
            operation: 'deep_search_start',
            operationId,
            query: lastUserMessage.content.substring(0, 100) + '...',
            queryLength: lastUserMessage.content.length
          });
          
          let eventHandler;
          
          try {
            // Import dependencies once
            const eventsModule = await import('@/app/api/events/route');
            eventHandler = eventsModule.sendEventToClients;
            
            // Send event to client that DeepSearch has started
            eventHandler({
              type: 'deepSearch',
              status: 'started',
              details: `Query length: ${lastUserMessage.content.length} characters`
            });
            
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
                important: true,
                reason: 'missing_api_key'
              });
              
              // Skip DeepSearch and log a clear message
              toolManager.registerToolUsage('Deep Search');
              toolManager.registerToolResult('deepSearch', 'DeepSearch is unavailable due to missing API key configuration.');
              
              // Send event to client that DeepSearch failed
              eventHandler({
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
                      eventHandler({
                        type: 'deepSearch',
                        status: 'completed',
                        details: `Retrieved ${deepSearchContent.length} characters from cache`
                      });
                      
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
                
                // Create the timeout resolver function outside the Promise constructor
                const createTimeoutResolver = (resolve: (value: { content: string; model: string; timing: { total: number } }) => void) => {
                  setTimeout(() => {
                    edgeLogger.warn('Deep Search operation timed out', {
                      operation: 'deep_search_timeout',
                      operationId,
                      durationMs: Date.now() - deepSearchStartTime,
                      threshold: 20000,
                      important: true
                    });
                    resolve({ 
                      content: "Deep Search timed out after 20 seconds. The AI will continue without these results and use only internal knowledge and any other available sources.",
                      model: "timeout",
                      timing: { total: Date.now() - deepSearchStartTime }
                    });
                  }, 20000);
                };
                
                const deepSearchResponse = await Promise.race([
                  deepSearchPromise,
                  new Promise<{
                    content: string;
                    model: string;
                    timing: { total: number };
                  }>(resolve => createTimeoutResolver(resolve))
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
                  fromCache: deepSearchResponse ? deepSearchContent !== deepSearchResponse.content : true,
                  durationMs: Date.now() - deepSearchStartTime,
                  important: true
                });
                
                // Send event to client that DeepSearch has completed
                eventHandler({
                  type: 'deepSearch',
                  status: 'completed',
                  details: `Retrieved ${deepSearchContent.length} characters of information`
                });
              } else {
                // When no useful results are found or search timed out
                edgeLogger.info('No Deep Search results found or timed out', {
                  operation: 'deep_search_empty',
                  operationId,
                  reason: deepSearchContent.includes("timed out") ? 'timeout' : 'no_results',
                  durationMs: Date.now() - deepSearchStartTime
                });
                
                // Send event to client that DeepSearch has failed
                eventHandler({
                  type: 'deepSearch',
                  status: 'failed',
                  details: deepSearchContent.includes("timed out") 
                    ? 'Search timed out after 20 seconds' 
                    : 'No relevant results found'
                });
              }
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            edgeLogger.error('Error running Deep Search', { 
              operation: 'deep_search_error',
              operationId,
              error: formatError(error),
              durationMs: Date.now() - deepSearchStartTime,
              important: true
            });
            
            // Send event to client that DeepSearch has failed
            // Import again if it wasn't imported before due to earlier errors
            if (!eventHandler) {
              try {
                const eventsModule = await import('@/app/api/events/route');
                eventsModule.sendEventToClients({
                  type: 'deepSearch',
                  status: 'failed',
                  details: `Error: ${errorMessage}`
                });
              } catch (e) {
                edgeLogger.error('Failed to send event for DeepSearch error', { 
                  operation: 'deep_search_event_error',
                  error: formatError(e) 
                });
              }
            } else {
              eventHandler({
                type: 'deepSearch',
                status: 'failed',
                details: `Error: ${errorMessage}`
              });
            }
          }
        }
      } else {
        edgeLogger.info('Deep Search skipped (UI toggle disabled)', {
          operation: 'deep_search_disabled'
        });
      }
      
      // Memory usage checkpoint after Deep Search
      edgeLogger.debug('Memory checkpoint after Deep Search', {
        elapsedMs: Date.now() - startTime,
        tool: 'Deep Search'
      });
      
      /**
       * Generate a detailed preprocessing summary of all tools used
       * This helps with logging and debugging what happened before AI response generation
       */
      function generatePreprocessingSummary(toolManager: ToolManager) {
        const toolResults = toolManager.getToolResults();
        const toolsUsed = toolManager.getToolsUsed();
        
        const summary = {
          operation: 'preprocessing_summary',
          important: true,
          toolsCount: toolsUsed.length,
          toolsUsed,
          contentSizes: {
            ragContent: toolResults.ragContent?.length || 0,
            webScraper: toolResults.webScraper?.length || 0,
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
      
      // Build AI messages with tool results and user profile data
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
      
      // Add tools to the AI using the AI SDK
      // Initialize an empty collection of tools
      let aiSdkTools = {};
      
      try {
        // Dynamically import AI SDK tool utilities
        const { tool } = await import('ai');
        
        // Dynamically import the tools
        const { chatTools } = await import('@/lib/chat/tools');
        
        // Convert our tools to AI SDK format
        aiSdkTools = {
          getInformation: tool({
            description: 'Search the internal knowledge base for relevant information',
            parameters: getInformationSchema,
            execute: async ({ query }) => {
              const startTime = performance.now();
              
              try {
                const result = await chatTools.getInformation.execute({ query }, { 
                  toolCallId: 'ai-initiated-search',
                  messages: []
                });
                
                const duration = Math.round(performance.now() - startTime);
                edgeLogger.info('Knowledge base search completed', { 
                  query, 
                  durationMs: duration,
                  resultLength: typeof result === 'string' ? result.length : 0
                });
                
                return result;
              } catch (error) {
                const duration = Math.round(performance.now() - startTime);
                edgeLogger.error('Knowledge base search failed', { 
                  query, 
                  durationMs: duration,
                  error: formatError(error)
                });
                
                throw error;
              }
            }
          }),
          
          addResource: tool({
            description: 'Store new information in the knowledge base',
            parameters: addResourceSchema,
            execute: async ({ content }) => {
              const startTime = performance.now();
              
              try {
                const result = await chatTools.addResource.execute({ content }, { 
                  toolCallId: 'ai-initiated-store',
                  messages: []
                });
                
                const duration = Math.round(performance.now() - startTime);
                edgeLogger.info('Resource storage completed', { 
                  contentLength: content.length,
                  durationMs: duration 
                });
                
                return result;
              } catch (error) {
                const duration = Math.round(performance.now() - startTime);
                edgeLogger.error('Resource storage failed', { 
                  contentLength: content.length,
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
        toolsCount: toolManager.getToolsUsed().length,
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
        
        // Process detected URLs directly
        if (urls.length > 0) {
          edgeLogger.info('Processing detected URLs directly', {
            urlCount: urls.length,
            urls: urls.slice(0, 3) // Log up to 3 URLs
          });
          
          // Import the necessary tools for URL scraping
          const { callPuppeteerScraper, validateAndSanitizeUrl } = await import('@/lib/agents/tools/web-scraper-tool');
          const { ensureProtocol } = await import('@/lib/chat/url-utils');
          
          try {
            // Process the first URL (limit to avoid overwhelming the response)
            const fullUrl = ensureProtocol(urls[0]);
            const validUrl = validateAndSanitizeUrl(fullUrl);
            
            // Check cache first - Redis requires explicit JSON serialization
            const cacheKey = `scrape:${validUrl}`;
            const redis = Redis.fromEnv();
            let result;
            
            try {
              const cachedContentStr = await redis.get(cacheKey);
              if (cachedContentStr) {
                // Parse cached content with error handling
                try {
                  // Ensure we're working with a string before parsing
                  const parsedContent = typeof cachedContentStr === 'string' 
                    ? JSON.parse(cachedContentStr) 
                    : cachedContentStr; // If it's already an object, use it directly
                  
                  // Validate the parsed content has the required fields
                  if (parsedContent && typeof parsedContent === 'object' && 
                      typeof parsedContent.content === 'string' && 
                      typeof parsedContent.title === 'string' && 
                      typeof parsedContent.url === 'string') {
                    result = parsedContent;
                    edgeLogger.info('Redis cache hit for URL', {
                      url: validUrl,
                      cacheHit: true,
                      contentLength: result.content.length,
                      cacheSource: 'redis',
                      durationMs: Date.now() - startTime
                    });
                  } else {
                    throw new Error('Missing required fields in cached content');
                  }
                } catch (parseError: unknown) {
                  edgeLogger.error('Error parsing cached content', {
                    url: validUrl,
                    error: parseError instanceof Error ? parseError.message : String(parseError),
                    cachedContentSample: typeof cachedContentStr === 'string' 
                      ? cachedContentStr.substring(0, 100) + '...' 
                      : `type: ${typeof cachedContentStr}`
                  });
                  // Continue with scraping since parsing failed
                }
              }
            } catch (cacheError) {
              edgeLogger.error('Error checking Redis cache', {
                url: validUrl,
                error: cacheError instanceof Error ? cacheError.message : String(cacheError)
              });
            }
            
            // If not in cache or parsing failed, perform scraping
            if (!result) {
              // Call the puppeteer scraper with timeout protection
              edgeLogger.info('No Redis cache hit - calling puppeteer scraper', { url: validUrl });
              
              const scrapingPromise = callPuppeteerScraper(validUrl);
              const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Scraping timed out')), 15000);
              });
              
              const scraperResult = await Promise.race([scrapingPromise, timeoutPromise]);
              
              // Handle potential string responses from the scraper
              // This ensures we always have a proper object before stringifying
              try {
                if (typeof scraperResult === 'string') {
                  // If it's a JSON string, parse it
                  result = JSON.parse(scraperResult);
                  edgeLogger.info('Parsed string result from scraper', {
                    resultType: 'json-string',
                    parsed: true
                  });
                } else if (scraperResult && typeof scraperResult === 'object') {
                  // If it's already an object, use it directly
                  result = scraperResult;
                  edgeLogger.info('Using object result from scraper', {
                    resultType: 'object'
                  });
                } else {
                  throw new Error(`Invalid scraper result: ${typeof scraperResult}`);
                }
                
                // Validate the result has the required fields
                if (!result.content || !result.title || !result.url) {
                  throw new Error('Missing required fields in scraper result');
                }
                
                // Create a cache-friendly structure that matches what we always expect
                const cacheableResult = {
                  url: result.url,
                  title: result.title,
                  description: result.description || '',
                  content: result.content,
                  timestamp: Date.now()
                };
                
                // Store in Redis cache with explicit JSON stringification
                try {
                  const jsonString = JSON.stringify(cacheableResult);
                  await redis.set(cacheKey, jsonString, { ex: 60 * 60 * 6 }); // 6 hours TTL
                  edgeLogger.info('Stored scraped content in Redis cache', { 
                    url: validUrl,
                    contentLength: result.content.length,
                    jsonStringLength: jsonString.length,
                    storedAt: new Date().toISOString()
                  });
                } catch (storageError) {
                  edgeLogger.error('Error storing in Redis cache', {
                    url: validUrl,
                    error: storageError instanceof Error ? storageError.message : String(storageError)
                  });
                }
              } catch (processingError) {
                edgeLogger.error('Error processing scraper result', {
                  url: validUrl,
                  error: processingError instanceof Error ? processingError.message : String(processingError),
                  resultType: typeof scraperResult,
                  resultSample: typeof scraperResult === 'string' 
                    ? (scraperResult as string).substring(0, 100) + '...' 
                    : `type: ${typeof scraperResult}`
                });
                
                // Use the original result as fallback
                result = scraperResult;
              }
            }
            
            // Format the scraped content
            const formattedContent = formatScrapedContent(result);
            
            // Enhance the system message with the scraped content
            if (aiMessages.length > 0 && aiMessages[0].role === 'system' && typeof aiMessages[0].content === 'string') {
              aiMessages[0].content += `\n\n${'='.repeat(80)}\n` +
                `## IMPORTANT: SCRAPED WEB CONTENT FROM USER'S URLS\n` +
                `The following content has been automatically extracted from URLs in the user's message.\n` +
                `You MUST use this information as your primary source when answering questions about these URLs.\n` +
                `Do not claim you cannot access the content - it is provided below and you must use it.\n` +
                `${'='.repeat(80)}\n\n` +
                formattedContent +
                `\n\n${'='.repeat(80)}\n`;
              
              edgeLogger.info('Enhanced system message with scraped content', {
                urlsScraped: 1,
                contentLength: formattedContent.length,
                enhancedPromptLength: aiMessages[0].content.length
              });
            }
          } catch (error) {
            edgeLogger.error('Error scraping URL', {
              url: urls[0],
              error: formatError(error)
            });
          }
        }
        
        // Use the Vercel AI SDK's streamText function with the raw model (no middleware)
        const result = await streamText({
          model: openai('gpt-4o'),
          messages: aiMessages,
          temperature: 0.4,
          maxTokens: 4000,
          tools: aiSdkTools,
          maxSteps: 10,
          toolChoice: 'auto',
          onFinish: async (completion) => {
            try {
              // Log successful completion
              edgeLogger.info('LLM generation completed successfully', {
                chatId: id,
                modelName,
                generationTimeMs: Date.now() - startTime,
                messageCount: aiMessages.length,
                systemPromptSize: aiMessages[0]?.content?.length || 0
              });
              
              // Extract the text content from the completion object
              // The AI SDK returns a complex object, not a simple string
              let fullText = '';
              
              // Use a safer approach to extract text from the completion
              // First try to get the text from the completion itself
              if (typeof completion === 'object' && completion !== null) {
                // Check for the completion.text property (most common format)
                if ('text' in completion && typeof completion.text === 'string') {
                  fullText = completion.text;
                } 
                // Check for more complex structures
                else if ('content' in completion && typeof completion.content === 'string') {
                  fullText = completion.content;
                }
                // Try to get tool results if text is empty
                else if (fullText.trim() === '' && 'toolResults' in completion) {
                  const toolResultsArray = Array.isArray(completion.toolResults) ? completion.toolResults : [];
                  if (toolResultsArray.length > 0) {
                    // Extract content from tool results using a type-safe approach
                    const toolContents = toolResultsArray
                      .map(tr => {
                        if (typeof tr === 'object' && tr !== null) {
                          // Check if it has a 'result' property or any other likely property containing output
                          // @ts-ignore - We're deliberately checking for possible properties dynamically
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
                }
                // Convert the whole object to string if we can't find the text
                else {
                  fullText = JSON.stringify(completion);
                }
              } else if (typeof completion === 'string') {
                // If it's already a string, use it directly
                fullText = completion;
              } else {
                // Fallback to a safe default
                fullText = `Response: ${String(completion)}`;
              }
              
              // Log the content before validation
              edgeLogger.debug('Content before validation', {
                contentLength: fullText.length,
                contentPreview: fullText.substring(0, 100),
                isEmpty: fullText.trim() === '' 
              });
              
              // Validate the response
              const validatedText = validateResponse(fullText);
              
              // Log validation results
              const wasModified = validatedText !== fullText;
              edgeLogger.info(wasModified ? 'Fixed response with validation function' : 'Response validation completed', {
                originalLength: fullText.length,
                validatedLength: validatedText.length,
                wasModified
              });
              
              // Create Supabase client for session storage
              if (id) {
                edgeLogger.debug('Storing chat session', { id });
                try {
                  const authClient = await createClient();
                  
                  // First check if the session already exists
                  const { data: existingSession } = await authClient
                    .from('sd_chat_sessions')
                    .select('id, title')
                    .eq('id', id)
                    .maybeSingle();
                  
                  // Only store/update the session record, not messages
                  // Messages are saved by the client-side onFinish callback
                  const sessionResponse = await authClient
                    .from('sd_chat_sessions')
                    .upsert({
                      id,
                      user_id: userId,
                      // Only use lastUserMessage for title if the session doesn't exist or has no title
                      title: existingSession?.title || lastUserMessage.content.substring(0, 50),
                      updated_at: new Date().toISOString(),
                      agent_id: routedAgentId  // Use the routed agent ID
                    });
                  
                  if (sessionResponse.error) {
                    throw new Error(`Failed to store session: ${sessionResponse.error.message}`);
                  }
                  
                  edgeLogger.info('Chat session updated successfully', { 
                    id,
                    note: 'Message storage handled by client side to prevent duplication',
                    titleSource: existingSession?.title ? 'preserved existing' : 'set from user message'
                  });
                } catch (error) {
                  edgeLogger.error('Error storing chat session', { error: formatError(error) });
                }
              }
              
              // We no longer store messages server-side to avoid duplicates
              // The client-side onFinish callback in chat.tsx will handle storage
              
              // Just log that we completed response generation
              edgeLogger.info('Generated assistant response', {
                chatId: id,
                userId,
                contentLength: validatedText.length,
                toolsUsed: toolManager.getToolsUsed().length,
                totalTimeMs: Date.now() - startTime
              });
              
              // Clear our operation timeout since we completed successfully
              if (operationTimeoutId) {
                clearTimeout(operationTimeoutId);
                operationTimeoutId = undefined;
              }
            } catch (error) {
              edgeLogger.error('Error in onFinish callback', { error: formatError(error) });
            }
          }
        });
        
        // Return the stream as a response using the SDK's helper
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
    
    // Return the promise that will resolve either with the successful response or a timeout
    return await operationPromise;
    
  } catch (error) {
    edgeLogger.error('Unhandled error in chat API route', { error: formatError(error) });
    return new Response(`Error: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
  }
}