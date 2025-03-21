import { validateChatRequest } from '@/lib/chat/validator';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { type AgentType } from '@/lib/agents/prompts';
import { createServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

// Import only validation & utility modules at the top level
import { extractUrls, ensureProtocol } from '@/lib/chat/url-utils';
import { toolManager } from '@/lib/chat/tool-manager';

// Allow streaming responses up to 120 seconds
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
    const body = await req.json();
    const { messages, id, agentId = 'default', deepSearchEnabled = false } = validateChatRequest(body);
    const modelName = 'gpt-4o';
    
    // Create Supabase client for auth
    const cookieStore = await cookies();
    const authClient = await createServerClient();
    
    // Get user ID from session
    const { data: { user } } = await authClient.auth.getUser();
    const userId = user?.id;
    
    if (!userId) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    // Get the last user message
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMessage) {
      return new Response('No user message found', { status: 400 });
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
    
    // Use the final (potentially routed) agent ID for building the system prompt
    const baseSystemPrompt = agentRouter.getSystemPrompt(routedAgentId as AgentType, deepSearchEnabled);
    
    // Process resources in the correct priority order (as specified in requirements)
    // Order of importance: 1. System Message 2. RAG 3. Web Scraper 4. Deep Search
    
    // 1. System Message is already prioritized in the buildAIMessages function
    
    // 2. RAG (Knowledge Base) - HIGH PRIORITY for queries over 15 characters
    if (lastUserMessage.content.length > 15) {
      edgeLogger.info('Running RAG for query', { 
        query: lastUserMessage.content.substring(0, 100) + '...',
        queryLength: lastUserMessage.content.length
      });
      
      try {
        // Import the tools dynamically to avoid circular dependencies
        const { chatTools } = await import('@/lib/chat/tools');
        
        // Execute the RAG tool
        const ragResult = await chatTools.getInformation.execute(
          { query: lastUserMessage.content },
          { toolCallId: 'rag-search', messages: [] }
        );
        
        // Check if we got valid results
        if (typeof ragResult === 'string') {
          if (!ragResult.includes("No relevant information found")) {
            toolManager.registerToolResult('Knowledge Base', ragResult);
            edgeLogger.info('RAG results found', { 
            contentLength: ragResult.length,
              firstChars: ragResult.substring(0, 100) + '...'
          });
          } else {
            edgeLogger.info('No RAG results found');
          }
        } else {
          // If it's not a string, log the unexpected result type
          edgeLogger.warn('Unexpected RAG result type', {
            resultType: typeof ragResult
          });
        }
      } catch (error) {
        edgeLogger.error('Error running RAG', { error });
      }
    }
    
    // 3. Web Scraper - MEDIUM PRIORITY (if URLs are detected)
    if (urls.length > 0) {
      edgeLogger.info('URLs detected in user message, running web scraper', { 
        urlCount: urls.length,
        firstUrl: urls[0]
      });
      
      try {
        // Dynamically import the tools
        const { chatTools } = await import('@/lib/chat/tools');
        
        // Only use the first URL to limit token usage
        const firstUrl = urls[0];
        
        // Execute the comprehensive scraper
        const scraperResult = await chatTools.comprehensiveScraper.execute!(
          { url: firstUrl },
          { toolCallId: 'web-scraper', messages: [] }
        );
        
        // Check if we got valid results
        if (scraperResult && scraperResult.content) {
          toolManager.registerToolResult('Web Content', scraperResult.content);
          edgeLogger.info('Scraper results found', { 
            url: firstUrl,
            contentLength: scraperResult.content.length,
            firstChars: scraperResult.content.substring(0, 100) + '...'
          });
        } else {
          edgeLogger.info('No valid scraper results found');
        }
      } catch (error) {
        edgeLogger.error('Error running web scraper', { error });
      }
    }
    
    // 4. Deep Search - LOWEST PRIORITY (if enabled)
    if (deepSearchEnabled) {
      edgeLogger.info('Running Deep Search for query (UI toggle enabled)', { 
        query: lastUserMessage.content.substring(0, 100) + '...'
      });
      
      try {
        // Dynamically import Perplexity API
        const { callPerplexityAPI } = await import('@/lib/agents/tools/perplexity/api');
        const deepSearchResponse = await callPerplexityAPI(lastUserMessage.content);
        
        // Extract the content from the response object
        const deepSearchContent = deepSearchResponse.content;
        
        if (deepSearchContent && deepSearchContent.length > 0) {
          toolManager.registerToolResult('Deep Search', deepSearchContent);
          edgeLogger.info('Deep Search results found', { 
            contentLength: deepSearchContent.length,
            firstChars: deepSearchContent.substring(0, 100) + '...',
            model: deepSearchResponse.model,
            responseTime: deepSearchResponse.timing.total
          });
        } else {
          edgeLogger.info('No Deep Search results found');
        }
      } catch (error) {
        edgeLogger.error('Error running Deep Search', { error });
      }
    } else {
      edgeLogger.info('Deep Search skipped (UI toggle disabled)');
    }
    
    // Build AI messages with tool results and user profile data
    const aiMessages = await buildAIMessages({
      basePrompt: baseSystemPrompt,
      toolResults: toolManager.getToolResults(),
      toolsUsed: toolManager.getToolsUsed(),
      userMessages: messages,
      userId
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
      includesUserProfile: !!userId
    });
    
    try {
      // Dynamically import the OpenAI model directly
      const { openai } = await import('@ai-sdk/openai');
      
      // Use the Vercel AI SDK's streamText function
      const result = await streamText({
        model: openai(modelName), // Directly use the OpenAI model
        messages: aiMessages,
        temperature: 0.7,
        maxTokens: 10000,
        tools: aiSdkTools,
        onFinish: async (completion) => {
          try {
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
                
                // Only store/update the session record, not messages
                // Messages are saved by the client-side onFinish callback
                const sessionResponse = await authClient
                  .from('sd_chat_sessions')
                  .upsert({
                    id,
                    user_id: userId,
                    title: lastUserMessage.content.substring(0, 50),
                    updated_at: new Date().toISOString(),
                    agent_id: routedAgentId  // Use the routed agent ID
                  });
                
                if (sessionResponse.error) {
                  throw new Error(`Failed to store session: ${sessionResponse.error.message}`);
                }
                
                edgeLogger.info('Chat session updated successfully', { 
                  id,
                  note: 'Message storage handled by client side to prevent duplication' 
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
              toolsUsed: toolManager.getToolsUsed().length
            });
          } catch (error) {
            edgeLogger.error('Error in onFinish callback', { error });
          }
        }
      });
      
      // Return the stream as a response using the SDK's helper
      return result.toDataStreamResponse();
    } catch (error) {
      edgeLogger.error('Error in AI API call', { error });
      return new Response(`Error: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
    }
  } catch (error) {
    edgeLogger.error('Unhandled error in chat API route', { error });
    return new Response(`Error: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
  }
}