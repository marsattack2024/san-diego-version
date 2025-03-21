// Remove static import 
// import { OpenAI } from 'openai';

// Simple console logger for testing
const logger = {
  debug: (message: string, context = {}) => console.debug(`[agent:tools:perplexity:api] ${message}`, context),
  info: (message: string, context = {}) => console.info(`[agent:tools:perplexity:api] ${message}`, context),
  warn: (message: string, context = {}) => console.warn(`[agent:tools:perplexity:api] ${message}`, context),
  error: (message: string | Error, context = {}) => console.error(`[agent:tools:perplexity:api] ${message}`, context)
};

// Constants
const BASE_URL = 'https://api.perplexity.ai';
const DEFAULT_MODEL = 'sonar-pro';
const SYSTEM_PROMPT = 'You are a deep research agent for an agent team. Please bring back the most comprehensive and relevant context in your searches. Focus on factual information, include specific details, statistics, and cite sources when possible. Format your response in a structured way that will be easy for other agents to parse and utilize.';

// Use a reference type for the client to properly handle dynamic imports
type PerplexityClient = any;
let perplexityClient: PerplexityClient | null = null;

/**
 * Get or create the Perplexity API client
 */
async function getClient() {
  if (!perplexityClient) {
    if (!process.env.PERPLEXITY_API_KEY) {
      throw new Error('PERPLEXITY_API_KEY environment variable is required');
    }
    
    // Dynamically import OpenAI only when needed
    const { OpenAI } = await import('openai');
    
    perplexityClient = new OpenAI({
      apiKey: process.env.PERPLEXITY_API_KEY,
      baseURL: BASE_URL,
    });
  }
  
  return perplexityClient;
}

/**
 * Call Perplexity API to get research results
 */
export async function callPerplexityAPI(query: string) {
  const startTime = performance.now();
  
  try {
    const client = await getClient();
    
    logger.debug('Calling Perplexity API', { 
      query,
      model: DEFAULT_MODEL
    });
    
    const response = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: query
        }
      ]
    });
    
    const content = response.choices[0]?.message?.content || '';
    const endTime = performance.now();
    
    logger.info('Perplexity API call successful', {
      responseTime: Math.round(endTime - startTime),
      contentLength: content.length
    });
    
    return {
      content,
      model: response.model,
      usage: response.usage,
      timing: {
        total: Math.round(endTime - startTime)
      }
    };
  } catch (error) {
    const endTime = performance.now();
    logger.error('Perplexity API call failed', {
      error: error instanceof Error ? error.message : String(error),
      responseTime: Math.round(endTime - startTime)
    });
    
    throw error;
  }
}

/**
 * Stream results from Perplexity API
 */
export async function streamPerplexityAPI(query: string, onChunk: (chunk: string) => void) {
  try {
    logger.debug('Starting streaming Perplexity API call', { query });
    
    const client = await getClient();
    
    const stream = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: query
        }
      ],
      stream: true,
    });
    
    // Process the stream
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        onChunk(content);
      }
    }
    
    logger.info('Streaming Perplexity API call completed', { query });
    
  } catch (error) {
    logger.error('Error in streaming Perplexity API call', {
      query,
      error
    });
    
    throw error;
  }
} 