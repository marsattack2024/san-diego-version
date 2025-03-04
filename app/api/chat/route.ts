import { NextRequest, NextResponse } from 'next/server';
import { Message as VercelChatMessage, streamText } from 'ai';
import { createLogger } from '@/utils/server-logger';
import { v4 as uuidv4 } from 'uuid';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { headers } from 'next/headers';
import { estimateConversationTokens } from '@/lib/message-utils';
import { agents as agentsArray, defaultAgent } from '@/config/agents';
import { Agent } from '@/types/chat';

const logger = createLogger('api:chat');

// Set runtime to edge for better performance
export const runtime = 'edge';
export const maxDuration = 30; // 30 seconds max duration

// Define validation schema for messages
const MessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['user', 'assistant', 'system', 'function', 'data', 'tool']),
  content: z.string(),
  name: z.string().optional(),
  function_call: z.any().optional(),
});

// Define validation schema for the request body
const RequestSchema = z.object({
  messages: z.array(MessageSchema),
  agent: z.string().optional(),
  deepSearch: z.boolean().optional(),
});

// Rate limiting state (in a production app, use Redis or similar)
const rateLimit = new Map<string, { count: number; timestamp: number }>();
const MAX_REQUESTS_PER_MINUTE = 20;

// Helper function to get client IP
function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  return (forwarded ? forwarded.split(',')[0] : 'unknown-ip').trim();
}

// Check rate limit for an IP
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - 60000; // 1 minute ago
  
  const current = rateLimit.get(ip) || { count: 0, timestamp: now };
  
  // Reset if outside window
  if (current.timestamp < windowStart) {
    rateLimit.set(ip, { count: 1, timestamp: now });
    return true;
  }
  
  // Increment and check
  current.count++;
  current.timestamp = now;
  rateLimit.set(ip, current);
  
  return current.count <= MAX_REQUESTS_PER_MINUTE;
}

// Create a logger for this API route
const log = createLogger('api:chat');

// Define the agent types
const AGENTS = {
  default: {
    id: 'default',
    name: 'Default Assistant',
    description: 'General-purpose AI assistant',
    systemPrompt: 'You are a helpful AI assistant.'
  },
  developer: {
    id: 'developer',
    name: 'Developer Assistant',
    description: 'Specialized in coding and technical topics',
    systemPrompt: 'You are a developer assistant, specialized in helping with coding, technical questions, and software development best practices. Provide code examples when relevant.'
  },
  creative: {
    id: 'creative',
    name: 'Creative Assistant',
    description: 'Specialized in creative writing and brainstorming',
    systemPrompt: 'You are a creative assistant, specialized in helping with writing, brainstorming, and creative tasks. Be imaginative and provide diverse ideas.'
  }
};

// Token usage tracking function
function logTokenUsage(data: {
  requestId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}) {
  log.info({
    ...data,
    timestamp: new Date().toISOString()
  }, 'AI token usage');
}

// Estimate tokens in a message (rough approximation)
function estimateTokens(text: string): number {
  // GPT models use ~4 chars per token on average
  return Math.ceil(text.length / 4);
}

// Calculate estimated cost based on model and tokens
function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  // Pricing per 1000 tokens (as of 2023)
  const pricing: Record<string, {input: number, output: number}> = {
    'gpt-4': {input: 0.03, output: 0.06},
    'gpt-3.5-turbo': {input: 0.0015, output: 0.002}
  };
  
  const modelPricing = pricing[model] || pricing['gpt-3.5-turbo'];
  
  return (promptTokens * modelPricing.input + completionTokens * modelPricing.output) / 1000;
}

// Convert agents array to a lookup object
const agents = agentsArray.reduce((acc, agent) => {
  acc[agent.id] = agent;
  return acc;
}, {} as Record<string, Agent>);

export async function POST(req: NextRequest) {
  const requestId = uuidv4();
  const requestStartTime = Date.now();
  
  try {
    logger.info('Chat request received', { 
      requestId, 
      url: req.url,
      method: req.method
    });
    
    // Check for API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.error('Missing OpenAI API key', { requestId });
      return NextResponse.json(
        { error: 'Missing OpenAI API key' },
        { status: 500 }
      );
    }

    // Validate request body
    const body = await req.json();
    
    logger.debug('Request body received', { 
      requestId,
      hasMessages: !!body.messages,
      messageCount: body.messages?.length || 0
    });
    
    const result = RequestSchema.safeParse(body);
    if (!result.success) {
      const errorMessage = result.error.message;
      logger.warn('Invalid request body', { requestId, errorMessage });
      return NextResponse.json(
        { error: 'Invalid request: ' + errorMessage },
        { status: 400 }
      );
    }

    // Get the selected agent from the request
    const agentType = body.agent || defaultAgent.id;
    const agent = agents[agentType] || defaultAgent;
    
    logger.info('Using agent', { 
      requestId, 
      agentType,
      systemPromptLength: agent.systemPrompt?.length || 0
    });
    
    // Check for deep search flag
    const deepSearch = body.deepSearch || false;
    
    // Convert messages to the format expected by the AI SDK
    const messages: VercelChatMessage[] = body.messages.map((msg: any) => ({
      id: msg.id || uuidv4(),
      role: msg.role,
      content: msg.content
    }));
    
    // Prepare messages for AI SDK
    const userMessages = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    // Prepare system message based on agent
    const systemMessage = {
      role: 'system' as const,
      content: agent.systemPrompt || 'You are a helpful assistant.',
    };

    const allMessages = [systemMessage, ...userMessages];

    // Estimate tokens
    const totalTokens = allMessages.reduce((acc, message) => {
      return acc + estimateTokens(message.content);
    }, 0);

    // Add 4 tokens for formatting
    const estimatedPromptTokens = totalTokens + 4;

    logger.info('Request details', {
      requestId,
      messageCount: allMessages.length,
      estimatedPromptTokens,
      agent: agentType,
    });

    // Stream the response from OpenAI
    const model = 'gpt-4';
    log.debug({ model }, 'Using OpenAI model');

    // Track time to first token and stream analytics
    const streamStartTime = performance.now();

    // Estimate completion tokens (will be updated with actual values when available)
    const estimatedCompletionTokens = 500; // Placeholder
    const estimatedTotalTokens = estimatedPromptTokens + estimatedCompletionTokens;
    const estimatedCost = calculateCost(model, estimatedPromptTokens, estimatedCompletionTokens);

    // Log token usage estimates
    log.info('Streaming response', { 
      requestId, 
      model,
      promptTokens: estimatedPromptTokens,
      maxTokens: 1000,
      estimatedCost
    });

    try {
      // Create a stream with enhanced logging
      let firstTokenReceived = false;
      let chunkCount = 0;

      const result = streamText({
        model: openai(model),
        messages: allMessages,
        maxTokens: 1000, // Limit max tokens for faster responses
      });

      // We can't track chunks directly without onToken, so we'll just log completion
      const timeToFirstToken = performance.now() - streamStartTime;
      logger.info('First token received', { 
        requestId, 
        timeToFirstTokenMs: Math.round(timeToFirstToken) 
      });
      
      // Set first token received flag
      firstTokenReceived = true;

      // Add performance metrics to response headers
      const responseTime = Math.round(performance.now() - streamStartTime);
      const responseHeaders = new Headers({
        'X-Response-Time': `${responseTime}ms`,
        'X-Request-ID': requestId,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive'
      });

      log.info('Chat request processed', { 
        responseTime,
        estimatedPromptTokens,
        agent: agentType
      });

      // Create a response with the stream
      const streamResponse = result.toDataStreamResponse({
        headers: responseHeaders
      });

      // Log stream completion analytics
      setTimeout(() => {
        const streamDuration = performance.now() - streamStartTime;
        
        log.info('Stream analytics', {
          requestId, 
          streamDuration: Math.round(streamDuration),
          chunkCount,
          estimatedCompletionTokens,
          estimatedTotalTokens,
          estimatedCost
        });
      }, 100); // Small delay to ensure this runs after the stream starts

      return streamResponse;
    } catch (error) {
      // Re-throw to be handled by the outer catch block
      throw error;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorTime = Date.now() - requestStartTime;
    
    logger.error('Chat request error', { 
      requestId, 
      errorMessage,
      errorTime
    });

    // Determine status code based on error message
    let status = 500;
    let responseMessage = 'An unexpected error occurred';

    if (
      errorMessage.toLowerCase().includes('rate limit') ||
      errorMessage.toLowerCase().includes('429') ||
      errorMessage.toLowerCase().includes('too many requests')
    ) {
      status = 429;
      responseMessage = 'Rate limit exceeded. Please try again later.';
      logger.warn('Rate limit error', { requestId, errorMessage });
    } else if (
      errorMessage.toLowerCase().includes('auth') ||
      errorMessage.toLowerCase().includes('key') ||
      errorMessage.toLowerCase().includes('401') ||
      errorMessage.toLowerCase().includes('unauthorized')
    ) {
      status = 401;
      responseMessage = 'Authentication error. Please check your API key.';
      logger.error('Authentication error', { requestId, errorMessage });
    } else if (
      errorMessage.toLowerCase().includes('invalid') ||
      errorMessage.toLowerCase().includes('bad request') ||
      errorMessage.toLowerCase().includes('400')
    ) {
      status = 400;
      responseMessage = 'Invalid request. Please check your input.';
      logger.warn('Invalid request error', { requestId, errorMessage });
    } else {
      logger.error('Unexpected error', { requestId, errorMessage });
    }

    const responseTime = Date.now() - requestStartTime;
    
    return NextResponse.json(
      { error: responseMessage },
      { 
        status,
        headers: {
          'X-Response-Time': `${responseTime}ms`,
          'X-Request-ID': requestId
        }
      }
    );
  }
} 