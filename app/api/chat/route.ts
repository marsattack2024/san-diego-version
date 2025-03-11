import { validateChatRequest } from '@/lib/chat/validator';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { streamText } from 'ai';
import { Message } from 'ai/react';
import { myProvider } from '@/lib/ai/providers';
import { extractUrls, ensureProtocol } from '@/lib/chat/url-utils';
import { AgentRouter } from '@/lib/agents/agent-router';
import { type AgentType } from '@/lib/agents/prompts';
import { createServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

// Import our modules
import { toolManager } from '@/lib/chat/tool-manager';
import { createResponseValidator } from '@/lib/chat/response-validator';
import { buildEnhancedSystemPrompt, buildAIMessages } from '@/lib/chat/prompt-builder';
import { callPerplexityAPI } from '@/lib/agents/tools/perplexity/api';

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
    
    // Get the base system prompt from the agent router
    const agentRouter = new AgentRouter();
    const baseSystemPrompt = agentRouter.getSystemPrompt(agentId as AgentType, deepSearchEnabled);
    
    // Process resources in the correct priority order
    
    // 1. RAG (Knowledge Base) - HIGHEST PRIORITY for queries over 15 characters
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
    
    // 2. Deep Search - SECOND PRIORITY if enabled
    if (deepSearchEnabled) {
      edgeLogger.info('Running Deep Search for query (UI toggle enabled)', { 
        query: lastUserMessage.content.substring(0, 100) + '...'
      });
      
      try {
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
    
    // 3. Web Scraper - LOWEST PRIORITY
    if (urls.length > 0) {
      edgeLogger.info('Pre-scraping URLs from message', { 
        urlCount: urls.length, 
        urls 
      });
      
      try {
        // Import the tools dynamically to avoid circular dependencies
        const { chatTools } = await import('@/lib/chat/tools');
        
        // Scrape all URLs in parallel
        const scrapingPromises = urls.map(url => 
          chatTools.comprehensiveScraper.execute(
            { url: ensureProtocol(url) },
            { toolCallId: `pre-scrape-${url}`, messages: [] }
          )
        );
        
        // Wait for all scraping to complete
        const scrapingResults = await Promise.allSettled(scrapingPromises);
        
        // Format successful results
        const successfulResults = scrapingResults
          .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
          .map(result => {
            const data = result.value;
            return `URL: ${data.url || 'Unknown'}\n` +
                   `Title: ${data.title || 'No title'}\n` +
                   `Description: ${data.description || 'No description'}\n\n` +
                   `${data.content || 'No content available'}`;
          });
        
        if (successfulResults.length > 0) {
          const combinedResults = successfulResults.join('\n\n--- Next URL ---\n\n');
          toolManager.registerToolResult('Web Scraper', combinedResults);
          edgeLogger.info('Web scraping results found', { 
            contentLength: combinedResults.length,
            successCount: successfulResults.length,
            failCount: scrapingResults.length - successfulResults.length
          });
        } else {
          edgeLogger.info('No web scraping results found');
        }
      } catch (error) {
        edgeLogger.error('Error pre-scraping URLs', { error });
      }
    }
    
    // Build AI messages with tool results and user profile data
    const aiMessages = await buildAIMessages({
      basePrompt: baseSystemPrompt,
      toolResults: toolManager.getToolResults(),
      toolsUsed: toolManager.getToolsUsed(),
      userMessages: messages,
      userId
    });
    
    // Define AI SDK tools using Zod schemas
    const aiSdkTools = {
      getInformation: {
        description: 'Search for information in the knowledge base',
        parameters: getInformationSchema,
        execute: async ({ query }: { query: string }) => {
          try {
            const { chatTools } = await import('@/lib/chat/tools');
            const result = await chatTools.getInformation.execute(
              { query },
              { toolCallId: 'ai-sdk-rag-search', messages: [] }
            );
            return typeof result === 'string' ? result : JSON.stringify(result);
          } catch (error) {
            edgeLogger.error('Error executing getInformation tool', { error });
            return 'Error searching for information';
          }
        }
      },
      addResource: {
        description: 'Store new information in the knowledge base',
        parameters: addResourceSchema,
        execute: async ({ content }: { content: string }) => {
          try {
            const { chatTools } = await import('@/lib/chat/tools');
            const result = await chatTools.addResource.execute(
              { content },
              { toolCallId: 'ai-sdk-add-resource', messages: [] }
            );
            return typeof result === 'string' ? result : JSON.stringify(result);
          } catch (error) {
            edgeLogger.error('Error executing addResource tool', { error });
            return 'Error storing information';
          }
        }
      },
      detectAndScrapeUrls: {
        description: 'Extract and scrape URLs from text',
        parameters: detectAndScrapeUrlsSchema,
        execute: async ({ text }: { text: string }) => {
          try {
            const { chatTools } = await import('@/lib/chat/tools');
            const result = await chatTools.detectAndScrapeUrls.execute(
              { text },
              { toolCallId: 'ai-sdk-detect-urls', messages: [] }
            );
            return typeof result === 'string' ? result : JSON.stringify(result);
          } catch (error) {
            edgeLogger.error('Error executing detectAndScrapeUrls tool', { error });
            return 'Error detecting and scraping URLs';
          }
        }
      },
      comprehensiveScraper: {
        description: 'Scrape content from a URL',
        parameters: comprehensiveScraperSchema,
        execute: async ({ url }: { url: string }) => {
          try {
            const { chatTools } = await import('@/lib/chat/tools');
            const result = await chatTools.comprehensiveScraper.execute(
              { url: ensureProtocol(url) },
              { toolCallId: 'ai-sdk-scrape', messages: [] }
            );
            return typeof result === 'string' ? result : JSON.stringify(result);
          } catch (error) {
            edgeLogger.error('Error executing comprehensiveScraper tool', { error });
            return 'Error scraping URL';
          }
        }
      }
    };
    
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
      // Use the Vercel AI SDK's streamText function
      const result = await streamText({
        model: myProvider.languageModel(modelName),
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
              // Try to access text property if it exists
              const textContent = completion.text || '';
              
              if (textContent && typeof textContent === 'string') {
                // Add information about tools used to ensure the client has this context
                // This ensures the client-side storage has complete information
                const toolsUsed = toolManager.getToolsUsed();
                if (toolsUsed.length > 0) {
                  // If there's no tools section yet, add one
                  if (!textContent.includes("--- Tools and Resources Used ---")) {
                    fullText = textContent + "\n\n--- Tools and Resources Used ---\n" + 
                      toolsUsed.map(tool => `- ${tool}`).join('\n');
                  } else {
                    fullText = textContent;
                  }
                } else {
                  fullText = textContent;
                }
              } else {
                // If no text property, try to stringify the object
                try {
                  // Use JSON.stringify to get a string representation
                  const stringified = JSON.stringify(completion);
                  if (stringified && stringified !== '{}') {
                    fullText = `Completion object: ${stringified}`;
                  }
                } catch (e) {
                  edgeLogger.warn('Failed to stringify completion object', { error: e });
                }
              }
            }
            
            // If we still don't have text, use a fallback
            if (!fullText) {
              fullText = 'No text content could be extracted from the completion.';
              edgeLogger.warn('Could not extract text from completion object', { 
                completionType: typeof completion,
                isNull: completion === null,
                hasSteps: completion && 'steps' in completion
              });
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