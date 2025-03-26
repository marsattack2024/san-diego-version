import { CoreMessage } from 'ai';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { NextRequest } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { rateLimitMiddleware } from '@/lib/widget/rate-limit';
import { generateSessionId } from '@/lib/widget/session';
import { ToolManager } from '@/lib/chat/tool-manager';
import { findSimilarDocumentsOptimized } from '@/lib/vector/documentRetrieval';
import { tool } from 'ai';
import { z } from 'zod';

// Create a proper StreamingTextResponse class for handling streaming responses
class StreamingTextResponse extends Response {
  constructor(stream: ReadableStream, init?: ResponseInit) {
    super(stream, {
      ...init,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        ...init?.headers,
      },
    });
  }
}

// Allow streaming responses up to 120 seconds
export const maxDuration = 120;
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Default headers for responses
const defaultHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

// Function to check if required environment variables are set
function checkEnvironment() {
  const requiredVars = {
    openaiApiKey: process.env.OPENAI_API_KEY,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  };
  
  const missing = Object.entries(requiredVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);
  
  return {
    valid: missing.length === 0,
    missing
  };
}

export async function POST(req: NextRequest) {
  try {
    const startTime = Date.now();
    
    // Check environment variables
    const envCheck = checkEnvironment();
    if (!envCheck.valid) {
      edgeLogger.error('Missing environment variables', { 
        missing: envCheck.missing
      });
      return new Response(
        JSON.stringify({ error: 'Server configuration error', details: 'Missing required environment variables' }),
        { status: 500, headers: defaultHeaders }
      );
    }
    
    // Save request body for later use
    const body = await req.json();
    
    // Apply rate limiting
    const rateLimitResponse = await rateLimitMiddleware(
      new NextRequest(req.url, {
        headers: req.headers,
        method: req.method,
        body: JSON.stringify(body),
      })
    );
    
    if (rateLimitResponse) return rateLimitResponse;
    
    // Parse the request body
    const { message, sessionId = generateSessionId() } = body;
    
    // Validate the request
    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid message' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    edgeLogger.info('Processing widget chat request', { 
      sessionId,
      messageLength: message.length,
      timestamp: new Date().toISOString()
    });
    
    // Create a strong system prompt that emphasizes using knowledge base information
    const systemPrompt = `You are a helpful assistant embedded on the website thehighrollersclub.io.
    
    IMPORTANT INSTRUCTIONS:
    1. ALWAYS prioritize knowledge base information when answering questions.
    2. If the knowledge base contains relevant information, use it as your primary source.
    3. Provide concise, accurate responses based on the knowledge base.
    4. If no relevant information is found in the knowledge base, respond with "I don't have specific information about that in my knowledge base."
    5. Do not hallucinate or make up information that isn't provided in the knowledge base.
    6. The user is interacting with a chat widget on the website.
    7. Keep responses friendly, helpful and professional.`;
    
    edgeLogger.info('Widget starting to process message', {
      sessionId
    });
    
    // Define the knowledge search tool
    const knowledgeBaseTool = tool({
      description: 'Search the knowledge base for relevant information',
      parameters: z.object({
        query: z.string().describe('The search query to find information about')
      }),
      execute: async ({ query }): Promise<string> => {
        try {
          const { documents, metrics } = await findSimilarDocumentsOptimized(query, {
            limit: 5,
            similarityThreshold: 0.65
          });
          
          if (!documents || documents.length === 0) {
            return "No relevant information found in the knowledge base.";
          }

          // Only use the top 3 most relevant documents
          const topDocuments = documents.slice(0, 3);
          
          // Format the results with detailed information
          const formattedResults = topDocuments.map((doc, index) => {
            const similarityPercent = Math.round((doc.score || 0) * 100);
            const content = typeof doc.content === 'string' ? doc.content : String(doc.content);
            
            return `Document #${index + 1} (${similarityPercent}% relevant):\n${content}\n`;
          }).join('\n-------------------------------------------\n\n');

          // Add aggregate metrics
          const avgSimilarity = Math.round(
            topDocuments.reduce((sum, doc) => sum + (doc.score || 0), 0) / topDocuments.length * 100
          );

          return `Found ${topDocuments.length} relevant documents (average similarity: ${avgSimilarity}%):\n\n${formattedResults}`;
        } catch (error) {
          edgeLogger.error('Knowledge base search failed', {
            query,
            error: error instanceof Error ? error.message : String(error)
          });
          
          return `Knowledge base search failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
    });
    
    // Build messages for the AI
    const messages: CoreMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ];
    
    try {
      // Use the streamText function with the knowledge base tool and multi-step calls
      const result = await streamText({
        model: openai('gpt-4o'),
        messages,
        temperature: 0.7,
        maxTokens: 1000,
        tools: {
          knowledgeBase: knowledgeBaseTool
        },
        // Enable multi-step tool calling to use the search results
        maxSteps: 3,
        // Always use the knowledge base tool for every query
        toolChoice: {
          type: 'tool',
          toolName: 'knowledgeBase'
        }
      });
      
      edgeLogger.info('Chat response streaming started', {
        sessionId,
        setupDuration: Date.now() - startTime,
      });
      
      // Return the streaming response using the Vercel AI SDK helper
      return result.toDataStreamResponse({
        headers: {
          'x-session-id': sessionId
        }
      });
    } catch (error) {
      edgeLogger.error('Error streaming widget response', { 
        error: String(error),
        sessionId
      });
      
      return new Response(
        JSON.stringify({
          error: 'Error generating response',
          message: String(error)
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  } catch (error) {
    edgeLogger.error('Widget chat error', { error: String(error) });
    
    return new Response(
      JSON.stringify({
        error: 'An error occurred processing your request',
        message: String(error)
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 