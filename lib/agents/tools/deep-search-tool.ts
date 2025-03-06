import { OpenAI } from 'openai';
import { z } from 'zod';
import { createBasicTool } from '../core/agent-tools';
import { clientLogger } from '../../logger/client-logger';

// Create a component-specific logger wrapper
const logger = {
  debug: (message: string, context = {}) => clientLogger.debug(`[agent:tools:deep-search] ${message}`, context),
  info: (message: string, context = {}) => clientLogger.info(`[agent:tools:deep-search] ${message}`, context),
  warn: (message: string, context = {}) => clientLogger.warn(`[agent:tools:deep-search] ${message}`, context),
  error: (message: string | Error, context = {}) => clientLogger.error(`[agent:tools:deep-search] ${message}`, context)
};

/**
 * DeepSearch tool powered by Perplexity API
 * Provides comprehensive search results with detailed context
 */
export const deepSearchTool = createBasicTool(
  'deepSearch',
  'Performs a deep search using Perplexity API to gather comprehensive information on a topic.',
  z.object({
    query: z.string().describe('The search query to find detailed information about.'),
  }),
  async ({ query }) => {
    const startTime = performance.now();
    
    try {
      logger.debug('Performing deep search', { query });
      
      // Get API key from environment variables
      const apiKey = process.env.PERPLEXITY_API_KEY;
      
      if (!apiKey) {
        logger.error('Missing Perplexity API key');
        return {
          error: true,
          message: 'DeepSearch is unavailable: Missing API key',
          results: []
        };
      }
      
      // Create OpenAI client with Perplexity base URL
      const client = new OpenAI({
        apiKey,
        baseURL: 'https://api.perplexity.ai',
      });
      
      // Prepare messages for the API call
      const messages = [
        {
          role: 'system' as const,
          content: 'You are a deep research agent for an agent team. Please bring back the most comprehensive and relevant context in your searches. Focus on factual information, include specific details, statistics, and cite sources when possible. Format your response in a structured way that will be easy for other agents to parse and utilize.'
        },
        {
          role: 'user' as const,
          content: query
        }
      ];
      
      // Make the API call
      const response = await client.chat.completions.create({
        model: 'sonar-pro',
        messages,
      });
      
      const endTime = performance.now();
      logger.info('Deep search completed', {
        query,
        executionTimeMs: Math.round(endTime - startTime)
      });
      
      return {
        success: true,
        message: 'Deep search completed successfully',
        content: response.choices[0]?.message?.content || 'No results found',
        model: response.model,
        usage: response.usage
      };
      
    } catch (error) {
      const endTime = performance.now();
      logger.error('Error performing deep search', {
        query,
        error,
        executionTimeMs: Math.round(endTime - startTime)
      });
      
      return {
        error: true,
        message: `DeepSearch failed: ${error instanceof Error ? error.message : String(error)}`,
        results: []
      };
    }
  }
);

/**
 * Streaming version of the DeepSearch tool
 * This is for future implementation when streaming is needed
 */
export async function streamingDeepSearch(query: string, onChunk: (chunk: string) => void) {
  try {
    logger.debug('Starting streaming deep search', { query });
    
    // Get API key from environment variables
    const apiKey = process.env.PERPLEXITY_API_KEY;
    
    if (!apiKey) {
      logger.error('Missing Perplexity API key');
      onChunk('DeepSearch is unavailable: Missing API key');
      return;
    }
    
    // Create OpenAI client with Perplexity base URL
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.perplexity.ai',
    });
    
    // Prepare messages for the API call
    const messages = [
      {
        role: 'system' as const,
        content: 'You are a deep research agent for an agent team. Please bring back the most comprehensive and relevant context in your searches. Focus on factual information, include specific details, statistics, and cite sources when possible.'
      },
      {
        role: 'user' as const,
        content: query
      }
    ];
    
    // Make the streaming API call
    const stream = await client.chat.completions.create({
      model: 'sonar-pro',
      messages,
      stream: true,
    });
    
    // Process the stream
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        onChunk(content);
      }
    }
    
    logger.info('Streaming deep search completed', { query });
    
  } catch (error) {
    logger.error('Error in streaming deep search', {
      query,
      error
    });
    
    onChunk(`DeepSearch streaming failed: ${error instanceof Error ? error.message : String(error)}`);
  }
} 