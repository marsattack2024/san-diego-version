import { validateChatRequest } from '@/lib/chat/validator';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { type AgentType } from '@/lib/agents/prompts';
import { createServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

// Import only validation & utility modules at the top level
import { extractUrls, ensureProtocol } from '@/lib/chat/url-utils';
import { toolManager } from '@/lib/chat/tool-manager';

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

const comprehensiveScraperSchema = z.object({
  url: z.string().url().describe('The URL to scrape content from')
});

export async function POST(req: Request) {
  try {
    const startTime = Date.now(); // Add timestamp for performance tracking
    const timeoutThreshold = 110000; // 110 seconds (just under our maxDuration)
    let operationTimeoutId: NodeJS.Timeout | undefined = undefined;
    
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
      
      // Clear any previous tool results
      toolManager.clear();
      
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
      const baseSystemPrompt = agentRouter.getSystemPrompt(routedAgentId as AgentType, deepSearchEnabled);
      
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
          // Execute the RAG tool with timeout guard
          const ragPromise = chatTools.getInformation.execute(
            { query: lastUserMessage.content },
            { toolCallId: 'rag-search', messages: [] }
          );
          
          // Set a 10-second timeout for RAG operations
          const ragResult = await Promise.race([
            ragPromise,
            new Promise<string>((resolve) => {
              setTimeout(() => {
                edgeLogger.warn('RAG operation timed out', {
                  durationMs: Date.now() - ragStartTime,
                  threshold: 10000
                });
                resolve("RAG operation timed out. Continuing without these results.");
              }, 10000);
            })
          ]);
          
          // Check if we got valid results
          if (typeof ragResult === 'string') {
            if (!ragResult.includes("No relevant information found") && 
                !ragResult.includes("timed out")) {
              toolManager.registerToolResult('Knowledge Base', ragResult);
              edgeLogger.info('RAG results found', { 
                contentLength: ragResult.length,
                firstChars: ragResult.substring(0, 100) + '...',
                durationMs: Date.now() - ragStartTime
              });
            } else {
              edgeLogger.info('No RAG results found', {
                durationMs: Date.now() - ragStartTime,
                reason: ragResult.includes("timed out") ? 'timeout' : 'no matches'
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
            error,
            durationMs: Date.now() - ragStartTime
          });
        }
      }
      
      // Memory usage checkpoint after RAG
      edgeLogger.debug('Memory checkpoint after RAG', {
        elapsedMs: Date.now() - startTime,
        tool: 'RAG'
      });
      
      // 3. Web Scraper - MEDIUM PRIORITY (if URLs are detected)
      if (urls.length > 0) {
        const scraperStartTime = Date.now();
        edgeLogger.info('URLs detected in user message, running web scraper', { 
          urlCount: urls.length,
          firstUrl: urls[0]
        });
        
        try {
          // Only use the first URL to limit token usage and reduce processing time
          const firstUrl = urls[0];
          
          // Execute the comprehensive scraper with timeout guard
          const scraperPromise = chatTools.comprehensiveScraper.execute!(
            { url: firstUrl },
            { toolCallId: 'web-scraper', messages: [] }
          );
          
          // Set a 15-second timeout for scraper operations
          const scraperResult = await Promise.race([
            scraperPromise,
            new Promise<{ content?: string }>((resolve) => {
              setTimeout(() => {
                edgeLogger.warn('Web scraper operation timed out', {
                  durationMs: Date.now() - scraperStartTime,
                  threshold: 15000,
                  url: firstUrl
                });
                resolve({ content: `Web scraping timed out for URL: ${firstUrl}` });
              }, 15000);
            })
          ]);
          
          // Check if we got valid results
          if (scraperResult && scraperResult.content) {
            // Only use web content if it's not a timeout message
            if (!scraperResult.content.includes("timed out")) {
              // Check content size and truncate if necessary to avoid memory issues
              const contentSize = scraperResult.content.length;
              const MAX_CONTENT_SIZE = 80000;
              
              let contentToUse = scraperResult.content;
              if (contentSize > MAX_CONTENT_SIZE) {
                contentToUse = scraperResult.content.substring(0, MAX_CONTENT_SIZE) + 
                  `\n\n[Content truncated due to size limit. Original size: ${contentSize} characters]`;
                edgeLogger.warn('Web content truncated due to size', {
                  originalSize: contentSize,
                  truncatedSize: MAX_CONTENT_SIZE,
                  url: firstUrl
                });
              }
              
              toolManager.registerToolResult('Web Content', contentToUse);
              edgeLogger.info('Scraper results found', { 
                url: firstUrl,
                contentLength: contentToUse.length,
                firstChars: contentToUse.substring(0, 100) + '...',
                durationMs: Date.now() - scraperStartTime
              });
            } else {
              edgeLogger.info('Web scraper timed out', {
                url: firstUrl,
                durationMs: Date.now() - scraperStartTime
              });
            }
          } else {
            edgeLogger.info('No valid scraper results found', {
              durationMs: Date.now() - scraperStartTime
            });
          }
        } catch (error) {
          edgeLogger.error('Error running web scraper', { 
            error,
            durationMs: Date.now() - scraperStartTime
          });
        }
      }
      
      // Memory usage checkpoint after Web Scraper
      edgeLogger.debug('Memory checkpoint after Web Scraper', {
        elapsedMs: Date.now() - startTime,
        tool: 'Web Scraper'
      });
      
      // 4. Deep Search - LOWEST PRIORITY (if enabled)
      if (deepSearchEnabled) {
        // Skip Deep Search if we already have a substantial amount of context
        const toolResults = toolManager.getToolResults();
        const ragContentLength = toolResults.ragContent?.length || 0;
        const webContentLength = toolResults.webScraper?.length || 0;
        const hasExtensiveRAG = ragContentLength > 5000;
        const hasExtensiveWebContent = webContentLength > 8000;
        
        if (hasExtensiveRAG && hasExtensiveWebContent) {
          edgeLogger.info('Skipping Deep Search due to sufficient existing context', {
            ragContentLength,
            webContentLength
          });
        } else {
          const deepSearchStartTime = Date.now();
          edgeLogger.info('Running Deep Search for query (UI toggle enabled)', { 
            query: lastUserMessage.content.substring(0, 100) + '...'
          });
          
          try {
            // Dynamically import Perplexity API
            const { callPerplexityAPI } = await import('@/lib/agents/tools/perplexity/api');
            
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
                    durationMs: Date.now() - deepSearchStartTime,
                    threshold: 20000
                  });
                  resolve({ 
                    content: "Deep Search timed out. Continuing without these results.",
                    model: "timeout",
                    timing: { total: Date.now() - deepSearchStartTime }
                  });
                }, 20000);
              })
            ]);
            
            // Extract the content from the response object
            const deepSearchContent = deepSearchResponse.content;
            
            if (deepSearchContent && 
                deepSearchContent.length > 0 && 
                !deepSearchContent.includes("timed out")) {
              toolManager.registerToolResult('Deep Search', deepSearchContent);
              edgeLogger.info('Deep Search results found', { 
                contentLength: deepSearchContent.length,
                firstChars: deepSearchContent.substring(0, 100) + '...',
                model: deepSearchResponse.model,
                responseTime: deepSearchResponse.timing.total,
                durationMs: Date.now() - deepSearchStartTime
              });
            } else {
              edgeLogger.info('No Deep Search results found or timed out', {
                reason: deepSearchContent.includes("timed out") ? 'timeout' : 'no results',
                durationMs: Date.now() - deepSearchStartTime
              });
            }
          } catch (error) {
            edgeLogger.error('Error running Deep Search', { 
              error,
              durationMs: Date.now() - deepSearchStartTime
            });
          }
        }
      } else {
        edgeLogger.info('Deep Search skipped (UI toggle disabled)');
      }
      
      // Memory usage checkpoint after Deep Search
      edgeLogger.debug('Memory checkpoint after Deep Search', {
        elapsedMs: Date.now() - startTime,
        tool: 'Deep Search'
      });
      
      // Build AI messages with tool results and user profile data
      const aiMessageStartTime = Date.now();
      edgeLogger.info('Building AI messages', {
        toolsUsed: toolManager.getToolsUsed().length
      });
      
      const aiMessages = await buildAIMessages({
        basePrompt: baseSystemPrompt,
        toolResults: toolManager.getToolResults(),
        toolsUsed: toolManager.getToolsUsed(),
        userMessages: messages,
        userId
      });
      
      edgeLogger.info('AI messages built', {
        durationMs: Date.now() - aiMessageStartTime,
        messageCount: aiMessages.length,
        systemPromptSize: aiMessages[0]?.content?.length || 0
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
                  error
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
                  error
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
                  error
                });
                
                throw error;
              }
            }
          })
        };
      } catch (error) {
        edgeLogger.error('Error initializing tools', { error });
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
      
      try {
        // Dynamically import the OpenAI model directly
        const { openai } = await import('@ai-sdk/openai');
        
        edgeLogger.info('Starting LLM request', {
          model: modelName,
          elapsedTimeMs: Date.now() - startTime,
          systemPromptSize: aiMessages[0]?.content?.length || 0
        });
        
        // Use the Vercel AI SDK's streamText function
        const result = await streamText({
          model: openai(modelName), // Directly use the OpenAI model
          messages: aiMessages,
          temperature: 0.4,
          maxTokens: 4000, // Increased from default but still reasonable for GPT-4o
          tools: aiSdkTools,
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
                  edgeLogger.error('Error storing chat session', { error });
                }
              }
              
              // Validate the response
              const validatedText = validateResponse(fullText);
              
              // Log validation results
              const wasModified = validatedText !== fullText;
              edgeLogger.info(wasModified ? 'Fixed response with validation function' : 'Response validation completed', {
                originalLength: fullText.length,
                validatedLength: validatedText.length,
                wasModified
              });
              
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
              edgeLogger.error('Error in onFinish callback', { error });
            }
          }
        });
        
        // Return the stream as a response using the SDK's helper
        clearTimeout(operationTimeoutId);
        operationTimeoutId = undefined;
        resolve(result.toDataStreamResponse());
      } catch (error) {
        edgeLogger.error('Error in AI API call', { 
          error,
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
    edgeLogger.error('Unhandled error in chat API route', { error });
    return new Response(`Error: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
  }
}