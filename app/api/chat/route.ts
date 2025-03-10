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

// Import our new modules
import { toolManager } from '@/lib/chat/tool-manager';
import { createResponseValidator } from '@/lib/chat/response-validator';
import { buildEnhancedSystemPrompt } from '@/lib/chat/prompt-builder';
import { callPerplexityAPI } from '@/lib/agents/tools/perplexity/api';

// Allow streaming responses up to 120 seconds
export const maxDuration = 120;
export const runtime = 'edge';

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
    // Note: Deep Search is not a tool, it's a pre-processing step controlled by UI toggle
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
    
    // Build the enhanced system prompt with tool results
    let enhancedSystemPrompt = buildEnhancedSystemPrompt(
      baseSystemPrompt,
      toolManager.getToolResults(),
      toolManager.getToolsUsed()
    );
    
    // Get tools to provide to the model
    const toolsToProvide = toolManager.getToolsToProvide();
    
    // Create a response validator function
    const validateResponse = createResponseValidator({
      toolsUsed: toolManager.getToolsUsed(),
      toolResults: toolManager.getToolResults(),
      urls
    });
    
    // Log the final system prompt size
    edgeLogger.info('Final system prompt prepared', {
      promptLength: enhancedSystemPrompt.length,
      toolsUsed: toolManager.getToolsUsed(),
      toolsCount: toolManager.getToolsUsed().length
    });
    
    // Generate the streaming response using streamText
    const streamResponse = await streamText({
      model: myProvider.languageModel(modelName),
      system: enhancedSystemPrompt,
      messages: messages,
      tools: toolsToProvide,
      maxSteps: urls.length > 0 ? 5 : 3, // More steps if URLs need processing
      temperature: 0.4 // Lower temperature for more consistent formatting
    });
    
    // Get the original response stream
    const originalResponse = streamResponse.toDataStreamResponse();
    
    // Early exit if no body
    if (!originalResponse.body) {
      throw new Error('Response body is null');
    }
    
    // Create a transform stream to process the response
    class ResponseTransformer {
      fullText: string = '';
      textDecoder: TextDecoder = new TextDecoder();
      
      transform(chunk: Uint8Array, controller: TransformStreamDefaultController) {
        // Pass the chunk through to the client unmodified
        controller.enqueue(chunk);
        
        // Also accumulate it for processing later
        this.fullText += this.textDecoder.decode(chunk, { stream: true });
      }
      
      async flush(controller: TransformStreamDefaultController) {
        try {
          // Apply validation to the full text
          const validatedText = validateResponse(this.fullText);
          
          // If validation modified the response, send the difference
          if (validatedText !== this.fullText) {
            edgeLogger.info('Fixed response with validation function', {
              originalLength: this.fullText.length,
              fixedLength: validatedText.length
            });
            
            // Send the difference as a final chunk
            const difference = validatedText.slice(this.fullText.length);
            if (difference) {
              controller.enqueue(new TextEncoder().encode(difference));
            }
          }
          
          // Store in database if needed
          if (userId && id) {
            try {
              const supabase = await createServerClient();
              await supabase
                .from('sd_chat_messages')
                .insert({
                  chat_id: id,
                  role: 'assistant',
                  content: validatedText,
                  user_id: userId
                });
              
              edgeLogger.info('Stored assistant response', {
                chatId: id,
                userId,
                contentLength: validatedText.length
              });
              
              // Add metadata in a special format the client can recognize
              const metadata = {
                validation: validatedText !== this.fullText ? 'modified' : 'unchanged',
                storage: 'success'
              };
              
              // Encode it as a special message the client can parse
              const metadataChunk = `\n\n__METADATA__:${JSON.stringify(metadata)}`;
              controller.enqueue(new TextEncoder().encode(metadataChunk));
            } catch (error) {
              edgeLogger.error('Failed to store assistant response', {
                error,
                chatId: id,
                userId
              });
              
              // Add error metadata
              const metadata = {
                validation: validatedText !== this.fullText ? 'modified' : 'unchanged',
                storage: 'failed',
                error: String(error)
              };
              
              // Encode it as a special message the client can parse
              const metadataChunk = `\n\n__METADATA__:${JSON.stringify(metadata)}`;
              controller.enqueue(new TextEncoder().encode(metadataChunk));
            }
          }
        } catch (error) {
          edgeLogger.error('Error in stream processing', { error });
        }
      }
    }

    const transformer = new ResponseTransformer();
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        transformer.transform(chunk, controller);
      },
      flush(controller) {
        return transformer.flush(controller);
      }
    });
    
    // Pipe the original response through our transform stream
    originalResponse.body.pipeTo(transformStream.writable).catch(error => {
      edgeLogger.error('Error piping stream', { error });
    });
    
    // Return a new response with our processed stream
    return new Response(transformStream.readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8'
      }
    });
  } catch (streamError) {
    // Log specific error from streamText
    edgeLogger.error('Error in chat stream', { streamError });
    return new Response('Error processing chat request', { status: 500 });
  }
}