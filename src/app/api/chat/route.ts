import { NextRequest, NextResponse } from 'next/server';
import { Message } from 'ai';
import { AgentType } from '../../../agents/core/agent-types';
import { createAgentContext } from '../../../agents/core/agent-context';
import { agentRouter } from '../../../agents';
import { createLogger } from '../../../utils/server-logger';
import { deepSearchTool, combinedSearchTool } from '../../../agents/tools';

// Define types for search results based on the web-search-tool.ts implementation
interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

interface WebSearchResponse {
  success: boolean;
  message: string;
  results: SearchResult[];
  urls: string[];
  error?: string;
}

interface DeepSearchResponse {
  content: string;
  error?: string;
}

interface CombinedSearchResponse {
  webSearch: WebSearchResponse;
  deepSearch: DeepSearchResponse;
}

const logger = createLogger('api:chat');

/**
 * API route for chat messages
 * Processes incoming messages and routes them to the appropriate agent
 */
export async function POST(req: NextRequest) {
  try {
    const { messages, agentId, isDeepSearch, deepSearch } = await req.json();
    
    // Determine if deep search is enabled (support both flags for backward compatibility)
    const shouldUseDeepSearch = isDeepSearch || deepSearch;
    
    // Validate input
    if (!messages || !Array.isArray(messages)) {
      logger.warn('Invalid messages format');
      return NextResponse.json(
        { error: 'Invalid messages format' },
        { status: 400 }
      );
    }
    
    logger.info({
      messageCount: messages.length,
      agentId,
      deepSearchEnabled: shouldUseDeepSearch
    }, 'Processing chat request');
    
    // Convert messages to the format expected by our agents
    const formattedMessages = messages.map((message: Message) => ({
      role: message.role === 'data' ? 'system' : message.role,
      content: message.content,
      id: message.id || crypto.randomUUID(),
      createdAt: new Date()
    }));
    
    // Create agent context
    const context = createAgentContext(formattedMessages);
    
    // Get the latest user message
    const latestMessage = messages[messages.length - 1].content;
    
    // Handle deep search if requested
    if (shouldUseDeepSearch) {
      logger.info({ query: latestMessage }, 'Processing deep search request');
      
      try {
        // Extract the query from the message (remove "DeepSearch: " prefix if present)
        const query = latestMessage.startsWith('DeepSearch: ')
          ? latestMessage.substring('DeepSearch: '.length)
          : latestMessage;
        
        // Use the combined search tool
        const searchResult = await combinedSearchTool.execute({ query }) as CombinedSearchResponse;
        
        // Format the response
        let responseContent = `## Deep Search Results for "${query}"\n\n`;
        
        // Add deep search results if available
        if (searchResult.deepSearch && !searchResult.deepSearch.error) {
          responseContent += `### Comprehensive Research\n\n${searchResult.deepSearch.content}\n\n`;
        }
        
        // Add web search results if available
        if (searchResult.webSearch && !searchResult.webSearch.error && searchResult.webSearch.results?.length > 0) {
          responseContent += `### Web Search Results\n\n`;
          
          searchResult.webSearch.results.forEach((result: SearchResult, index: number) => {
            responseContent += `${index + 1}. **[${result.title}](${result.link})**\n   ${result.snippet}\n\n`;
          });
        }
        
        // Add a summary if both searches failed
        if ((searchResult.deepSearch?.error || !searchResult.deepSearch) && 
            (searchResult.webSearch?.error || !searchResult.webSearch?.results?.length)) {
          responseContent += `I couldn't find any relevant information for your query. Please try a different search term or ask a more specific question.`;
        }
        
        logger.info('Deep search completed successfully');
        
        return NextResponse.json({
          role: 'assistant',
          content: responseContent,
          id: crypto.randomUUID(),
          createdAt: new Date()
        });
        
      } catch (error) {
        logger.error({ error }, 'Error processing deep search');
        
        return NextResponse.json({
          role: 'assistant',
          content: `I encountered an error while performing the deep search: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again later.`,
          id: crypto.randomUUID(),
          createdAt: new Date()
        });
      }
    }
    
    // Process the message with the appropriate agent
    const targetAgentId = (agentId as AgentType) || 'default';
    
    logger.debug({
      targetAgentId,
      messageContent: latestMessage.substring(0, 100) + (latestMessage.length > 100 ? '...' : '')
    }, 'Routing message to agent');
    
    const response = await agentRouter.routeMessage(latestMessage, context, targetAgentId);
    
    logger.info({
      targetAgentId,
      responseId: response.message.id
    }, 'Agent response received');
    
    // Return the response
    return NextResponse.json({
      role: 'assistant',
      content: response.message.content,
      id: response.message.id,
      createdAt: response.message.createdAt
    });
    
  } catch (error) {
    logger.error({ error }, 'Error processing chat request');
    
    return NextResponse.json(
      { 
        error: 'Failed to process message',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 