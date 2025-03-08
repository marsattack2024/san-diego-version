import { validateChatRequest } from '@/lib/chat/validator';
import { chatTools } from '@/lib/chat/tools';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { streamText } from 'ai';
import { Message } from 'ai/react';
import { myProvider } from '@/lib/ai/providers';
import { extractUrls } from '@/lib/chat/url-utils';
import { AgentRouter } from '@/lib/agents/agent-router';
import { type ToolResults, type AgentType } from '@/lib/agents/prompts';
import { logger } from '@/lib/logger/edge-logger';

// Allow streaming responses up to 120 seconds
export const maxDuration = 120;
export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, id, agentId = 'default', deepSearchEnabled = false } = validateChatRequest(body);
    const modelName = 'gpt-4o';

    // Use the agentId from the request body, which comes from the user's selection in the UI
    let selectedAgentId: AgentType = agentId as AgentType;
    
    // Log the agent selection details for debugging
    logger.info('Agent selection details', {
      requestBodyAgentId: agentId,
      selectedAgentId,
      important: true
    });
    
    // Get the last user message for processing
    const lastMessage = messages[messages.length - 1];
    const userQuery = lastMessage?.role === 'user' ? lastMessage.content : '';
    
    logger.info('Processing chat request', {
      selectedAgentId,
      isAutoRouting: selectedAgentId === 'default',
      messageCount: messages.length,
      queryLength: userQuery.length,
      hasUrls: extractUrls(userQuery).length > 0,
      deepSearchEnabled,
      important: true
    });

    // Initialize agent router
    const agentRouter = new AgentRouter();
    
    // Auto-route if using the default agent
    if (selectedAgentId === 'default') {
      edgeLogger.info('Attempting to auto-route message based on content');
      const previousAgentId = selectedAgentId;
      selectedAgentId = agentRouter.routeMessage(selectedAgentId, messages);
      
      if (selectedAgentId !== previousAgentId) {
        edgeLogger.info(`Auto-routed to specialized agent: ${selectedAgentId}`);
        logger.info('Auto-routing result', {
          previousAgentId,
          newAgentId: selectedAgentId,
          isChanged: true,
          important: true
        });
      }
    } else {
      // Log that we're using an explicitly selected agent
      edgeLogger.info(`Using explicitly selected agent: ${selectedAgentId}`);
      logger.info('Using explicitly selected agent', {
        agentId: selectedAgentId,
        selectionMethod: 'user-selected',
        important: true
      });
    }

    // Extract URLs from the last message
    const urls = lastMessage?.role === 'user' ? extractUrls(lastMessage.content) : [];
    
    // Initialize tool results
    let toolResults: ToolResults = {};
    
    // Run RAG for queries over 15 characters
    if (userQuery.length > 15) {
      try {
        edgeLogger.info('Running RAG for query', { 
          queryLength: userQuery.length,
          query: userQuery.substring(0, 100) // Log first 100 chars of query
        });
        
        const ragResult = await chatTools.getInformation.execute({ query: userQuery }, {
          toolCallId: 'rag-search',
          messages: []
        });
        
        // Log the RAG result details
        edgeLogger.info('RAG result details', {
          resultLength: ragResult ? ragResult.length : 0,
          hasResults: ragResult ? !ragResult.includes("No relevant information found") : false,
          firstChars: ragResult ? ragResult.substring(0, 100) : 'No result'
        });
        
        if (ragResult && !ragResult.includes("No relevant information found")) {
          // Use the full RAG result without truncation
          toolResults.ragContent = ragResult;
          
          edgeLogger.info('RAG search successful', { 
            contentLength: ragResult.length,
            hasResults: true
          });
        } else {
          edgeLogger.info('RAG search completed with no relevant results');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        edgeLogger.error('RAG search failed', { 
          error: errorMessage,
          query: userQuery.substring(0, 100)
        });
      }
    }

    // Pre-scrape URLs if present
    if (urls.length > 0) {
      try {
        edgeLogger.info('Pre-scraping URLs', { urls });
        
        // Scrape all URLs in parallel
        const scrapedResults = await Promise.all(
          urls.map(async (url, index) => {
            try {
              return await chatTools.comprehensiveScraper.execute({ url }, {
                toolCallId: `pre-scrape-${index}`,
                messages: []
              });
            } catch (error) {
              edgeLogger.error('Failed to scrape URL', { url, error });
              return null;
            }
          })
        );
        
        // Filter out failed scrapes and format the results
        const validResults = scrapedResults.filter((result): result is NonNullable<typeof result> => result !== null);
        if (validResults.length > 0) {
          toolResults.webScraper = validResults.map(result => (
            `URL: ${result.url}\n` +
            `Title: ${result.title || 'No title'}\n` +
            `Description: ${result.description || 'No description'}\n\n` +
            `${result.content || 'No content available'}`
          )).join('\n\n---\n\n');
          
          edgeLogger.info('Successfully pre-scraped URLs', { 
            urlCount: urls.length,
            successCount: validResults.length,
            totalContentLength: toolResults?.webScraper?.length || 0,
            contentStats: validResults.map(result => ({
              url: result.url,
              contentLength: result.content.length,
              stats: result.stats
            }))
          });
        }
      } catch (error) {
        edgeLogger.error('Failed to pre-scrape URLs', { urls, error });
      }
    }
    
    // Run DeepSearch ONLY if explicitly enabled by the user
    if (deepSearchEnabled && userQuery.length > 0) {
      try {
        edgeLogger.info('Running DeepSearch (explicitly enabled)', { queryLength: userQuery.length });
        
        const deepSearchResult = await chatTools.deepSearch.execute({ query: userQuery }, {
          toolCallId: 'deep-search',
          messages: []
        });
        
        if (deepSearchResult) {
          toolResults.deepSearch = deepSearchResult;
          edgeLogger.info('DeepSearch successful', { contentLength: deepSearchResult.length });
        }
      } catch (error) {
        edgeLogger.error('DeepSearch failed', { error });
      }
    }

    // Get system prompt without tool results
    const systemPrompt = agentRouter.getSystemPrompt(selectedAgentId, deepSearchEnabled);

    // Check system prompt length
    const systemPromptLength = systemPrompt.length;
    if (systemPromptLength > 25000) {
      edgeLogger.warn('System prompt is very long', { 
        systemPromptLength,
        selectedAgentId
      });
    } else {
      edgeLogger.info('System prompt length is acceptable', { 
        systemPromptLength,
        selectedAgentId
      });
    }

    // Enhance the system prompt with tool results instead of using tool messages
    // This approach is more compatible with the Vercel AI SDK
    let enhancedSystemPrompt = systemPrompt;
    
    // Track which tools were used to inform the model
    const toolsUsed = [];
    
    // Add RAG results to the system prompt if available
    if (toolResults.ragContent) {
      enhancedSystemPrompt += `\n\n### RAG KNOWLEDGE BASE TOOL RESULTS ###\nThe following information was retrieved from the knowledge base using the RAG tool:\n\n${toolResults.ragContent}\n\n`;
      toolsUsed.push('RAG Knowledge Base');
      edgeLogger.info('Added RAG results to system prompt', { 
        contentLength: toolResults.ragContent.length 
      });
    }
    
    // Add web scraper results to the system prompt if available
    if (toolResults.webScraper) {
      enhancedSystemPrompt += `\n\n### WEB SCRAPER TOOL RESULTS ###\nThe following information was scraped from the web using the Web Scraper tool:\n\n${toolResults.webScraper}\n\n`;
      toolsUsed.push('Web Scraper');
      edgeLogger.info('Added web scraper results to system prompt', { 
        contentLength: toolResults.webScraper.length 
      });
    }
    
    // Add deep search results to the system prompt if available
    if (toolResults.deepSearch) {
      enhancedSystemPrompt += `\n\n### PERPLEXITY DEEP SEARCH TOOL RESULTS ###\nThe following information was retrieved using the Perplexity Deep Search tool:\n\n${toolResults.deepSearch}\n\n`;
      toolsUsed.push('Perplexity Deep Search');
      edgeLogger.info('Added deep search results to system prompt', { 
        contentLength: toolResults.deepSearch.length 
      });
    }
    
    // Add a reminder about which tools were used
    if (toolsUsed.length > 0) {
      enhancedSystemPrompt += `\n\n### IMPORTANT: TOOLS USED IN THIS RESPONSE ###\nYou have used the following tools to generate this response: ${toolsUsed.join(', ')}.\nYou MUST acknowledge the use of these tools at the end of your response.\n\n`;
      edgeLogger.info('Added tools used reminder to system prompt', { toolsUsed });
    }

    edgeLogger.info('Generating response', {
      selectedAgentId,
      hasRagContent: !!toolResults.ragContent,
      hasWebScraperContent: !!toolResults.webScraper,
      hasDeepSearchContent: !!toolResults.deepSearch,
      urlCount: urls.length,
      maxSteps: urls.length > 0 ? 5 : 3
    });

    // Calculate total message size for debugging
    const totalMessageSize = JSON.stringify(messages).length + enhancedSystemPrompt.length;
    edgeLogger.info('Total message size', { 
      totalMessageSize,
      messageCount: messages.length,
      systemPromptLength: enhancedSystemPrompt.length
    });

    // Check if total size is approaching limits
    if (totalMessageSize > 100000) {
      edgeLogger.warn('Total message size is very large', { totalMessageSize });
    }

    // Use AI SDK to generate response with more steps if URLs are present
    try {
      const response = await streamText({
        model: myProvider.languageModel(modelName),
        system: enhancedSystemPrompt,
        messages: messages,
        tools: {
          // Only include the comprehensive scraper and other tools, not the basic webScraper
          getInformation: chatTools.getInformation,
          deepSearch: chatTools.deepSearch,
          comprehensiveScraper: chatTools.comprehensiveScraper,
          detectAndScrapeUrls: chatTools.detectAndScrapeUrls,
          addResource: chatTools.addResource
        },
        maxSteps: urls.length > 0 ? 5 : 3, // More steps if URLs need processing
        temperature: 0.4 // Lower temperature for more consistent formatting
      });

      return response.toDataStreamResponse();
    } catch (streamError) {
      // Log specific error from streamText
      const errorMessage = streamError instanceof Error ? streamError.message : 'Unknown streamText error';
      const errorStack = streamError instanceof Error ? streamError.stack : 'No stack trace';
      
      edgeLogger.error('Error in streamText', { 
        error: errorMessage,
        stack: errorStack,
        systemPromptLength: enhancedSystemPrompt.length,
        messageCount: messages.length
      });
      
      return new Response(
        JSON.stringify({ 
          error: 'An error occurred while generating the response',
          details: errorMessage
        }),
        { status: 500 }
      );
    }
  } catch (error) {
    // Improved error logging with more details
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : 'No stack trace';
    
    edgeLogger.error('Error in chat route', { 
      error: errorMessage,
      stack: errorStack
    });
    
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request', details: errorMessage }),
      { status: 500 }
    );
  }
}