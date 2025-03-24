import { validateChatRequest } from '@/lib/chat/validator';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '../../../lib/logger/constants';
import { type AgentType } from '@/lib/agents/prompts';
import { createServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

// Import only validation & utility modules at the top level
import { extractUrls } from '@/lib/chat/url-utils';
import { ToolManager } from '@/lib/chat/tool-manager';
import { buildAIMessages } from '@/lib/chat/prompt-builder';
import { createResponseValidator } from '@/lib/chat/response-validator';

// Import the caching and scraping middleware
import { cacheMiddleware } from '@/lib/cache/ai-middleware';
import { urlScrapingMiddleware } from '@/lib/middleware/url-scraping-middleware';

// Import the wrapLanguageModel function
import { wrapLanguageModel } from 'ai';

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

export async function POST(req: Request) {
  try {
    const startTime = Date.now(); // Add timestamp for performance tracking
    const timeoutThreshold = 110000; // 110 seconds (just under our maxDuration)
    let operationTimeoutId: NodeJS.Timeout | undefined = undefined;
    
    // Simplified environment check
    const envCheck = checkEnvironment();
    edgeLogger.info('Environment check', {
      category: LOG_CATEGORIES.SYSTEM,
      valid: envCheck.valid,
      summary: envCheck.summary,
      important: true
    });
    
    // Set up a timeout for the entire operation
    const operationPromise = new Promise<Response>(async (resolve, reject) => {
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
      const authClient = await createServerClient();
      
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
      let systemPrompt = agentRouter.getSystemPrompt(routedAgentId as AgentType, deepSearchEnabled);
      
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
      
      // 3. Web Scraper - Remove automatic preprocessing and URL instructions
      // We now use the urlScrapingMiddleware instead of this section
      if (urls.length > 0) {
        // Just log they were detected, middleware will handle the scraping
        edgeLogger.info('URLs detected in user message', { 
          urlCount: urls.length,
          firstUrl: urls[0],
          message: "These will be processed via middleware auto-scraping rather than explicit AI tool calls"
        });
      }
      
      // Memory usage checkpoint after Web Scraper
      edgeLogger.debug('Memory checkpoint after URL detection', {
        elapsedMs: Date.now() - startTime,
        tool: 'URL detection',
        automaticProcessing: true,
        message: "URLs will be processed via scraping middleware"
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
              
              // Note: Direct API testing has been removed as we now use the serverless endpoint
              
              // Set a 20-second timeout for Deep Search operations
              const deepSearchPromise = callPerplexityAPI(lastUserMessage.content);
              const deepSearchResponse = await Promise.race([
                deepSearchPromise,
                new Promise<{
                  content: string;
                  model: string;
                  timing: { total: number };
                }>((resolve) => {
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
                })
              ]);
              
              // Extract the content from the response object
              const deepSearchContent = deepSearchResponse.content;
              
              edgeLogger.info('DeepSearch response received', {
                operation: 'deep_search_response',
                operationId,
                responseLength: deepSearchContent.length,
                model: deepSearchResponse.model,
                timingMs: deepSearchResponse.timing.total,
                isError: deepSearchResponse.model === 'error'
              });
              
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
                  model: deepSearchResponse.model,
                  responseTime: deepSearchResponse.timing.total,
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
        
        // Create a wrapped model with our middlewares - ⚠️ Note: Order matters here!
        // URL scraping should happen before caching since it modifies the prompt
        const wrappedModel = wrapLanguageModel({
          model: openai('gpt-4o'),
          middleware: [
            // First, process URLs and enhance the prompt
            urlScrapingMiddleware,
            // Then, cache the result based on the enhanced prompt
            cacheMiddleware
          ]
        });
        
        // Log that we're using middleware-based URL scraping
        edgeLogger.info('Using middleware for URL scraping', {
          middlewareOrder: ['urlScrapingMiddleware', 'cacheMiddleware'],
          messageCount: aiMessages.length,
          systemMessageSize: aiMessages[0]?.content?.length || 0,
          containsUrls: urls.length > 0,
          urlCount: urls.length
        });

        // Diagnostic log for URL detection
        if (urls.length > 0) {
          edgeLogger.info('URLs detected that should be processed by middleware', {
            urlsToScrape: urls.slice(0, 3), // Log up to 3 URLs
            lastUserMessage: lastUserMessage.content.substring(0, 100) + (lastUserMessage.content.length > 100 ? '...' : '')
          });
          
          // Add a special marker in the system message to help middleware find URLs
          // This is a workaround for the tokenized prompt issue
          if (aiMessages.length > 0 && aiMessages[0].role === 'system' && typeof aiMessages[0].content === 'string') {
            // Include URLs in system message for middleware to find
            aiMessages[0].content += `\n\n<!-- URL_SCRAPING_MIDDLEWARE_MARKER: ${JSON.stringify({
              urls: urls.slice(0, 3),
              userMessage: lastUserMessage.content
            })} -->\n\n`;
            
            edgeLogger.info('Added URL marker to system message for middleware', {
              urlCount: urls.length
            });
          }
        }
        
        // Use the Vercel AI SDK's streamText function with wrapped model
        const result = await streamText({
          model: wrappedModel,
          messages: aiMessages,
          temperature: 0.4,
          maxTokens: 4000,
          tools: aiSdkTools,
          maxSteps: 10,
          // We don't need to force tool choice anymore since middleware handles URL scraping
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
                  const authClient = await createServerClient();
                  
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
    });
    
    // Return the promise that will resolve either with the successful response or a timeout
    return await operationPromise;
    
  } catch (error) {
    edgeLogger.error('Unhandled error in chat API route', { error: formatError(error) });
    return new Response(`Error: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
  }
}