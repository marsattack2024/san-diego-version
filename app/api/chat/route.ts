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
        edgeLogger.info('Running RAG for query', { queryLength: userQuery.length });
        
        const ragResult = await chatTools.getInformation.execute({ query: userQuery }, {
          toolCallId: 'rag-search',
          messages: []
        });
        
        if (ragResult && !ragResult.includes("No relevant information found")) {
          toolResults.ragContent = ragResult;
          edgeLogger.info('RAG search successful', { 
            contentLength: ragResult.length,
            hasResults: true
          });
        } else {
          edgeLogger.info('RAG search completed with no relevant results');
        }
      } catch (error) {
        edgeLogger.error('RAG search failed', { error });
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

    // Get system prompt with tool results
    const systemPrompt = agentRouter.getSystemPrompt(selectedAgentId, toolResults, deepSearchEnabled);

    edgeLogger.info('Generating response', {
      selectedAgentId,
      hasRagContent: !!toolResults.ragContent,
      hasWebScraperContent: !!toolResults.webScraper,
      hasDeepSearchContent: !!toolResults.deepSearch,
      urlCount: urls.length,
      maxSteps: urls.length > 0 ? 5 : 3
    });

    // Use AI SDK to generate response with more steps if URLs are present
    const response = await streamText({
      model: myProvider.languageModel(modelName),
      system: systemPrompt,
      messages,
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
  } catch (error) {
    edgeLogger.error('Error in chat route', { error });
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request' }),
      { status: 500 }
    );
  }
}