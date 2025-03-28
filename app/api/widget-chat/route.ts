import { CoreMessage } from 'ai';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { NextRequest } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { rateLimitMiddleware } from '@/lib/widget/rate-limit';
import { generateSessionId } from '@/lib/widget/session';
import { findSimilarDocumentsOptimized } from '@/lib/vector/documentRetrieval';
import { tool } from 'ai';
import { z } from 'zod';

// Create a custom StreamingTextResponse class for handling streaming responses
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

// Reduced maxDuration to mitigate timeouts - Edge functions limited to 30s execution
export const maxDuration = 60;
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

// Get allowed origins from environment or use default
const getAllowedOrigins = () => {
  const originsFromEnv = process.env.WIDGET_ALLOWED_ORIGINS;
  return originsFromEnv ? originsFromEnv.split(',') : ['https://marlan.photographytoprofits.com', 'https://programs.thehighrollersclub.io', 'http://localhost:3000'];
};

// Function to add CORS headers to a response
function addCorsHeaders(response: Response, req: NextRequest): Response {
  const origin = req.headers.get('origin') || '';
  const allowedOrigins = getAllowedOrigins();
  const isAllowedOrigin = allowedOrigins.includes(origin) || allowedOrigins.includes('*');

  const corsHeaders = new Headers(response.headers);

  if (isAllowedOrigin) {
    corsHeaders.set('Access-Control-Allow-Origin', origin);
  } else {
    corsHeaders.set('Access-Control-Allow-Origin', allowedOrigins[0]);
  }

  corsHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  corsHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  corsHeaders.set('Access-Control-Max-Age', '86400');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: corsHeaders
  });
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS(req: NextRequest) {
  const response = new Response(null, { status: 204 });
  return addCorsHeaders(response, req);
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
      return addCorsHeaders(
        new Response(
          JSON.stringify({ error: 'Server configuration error', details: 'Missing required environment variables' }),
          { status: 500, headers: defaultHeaders }
        ),
        req
      );
    }

    // Save request body for later use
    const body = await req.json();

    // Add detailed debugging logs
    edgeLogger.info('Widget chat request body received', {
      body: JSON.stringify(body),
      hasMessage: !!body.message,
      messageType: typeof body.message,
      hasSessionId: !!body.sessionId,
      sessionIdType: typeof body.sessionId
    });

    // Apply rate limiting
    const rateLimitResponse = await rateLimitMiddleware(
      new NextRequest(req.url, {
        headers: req.headers,
        method: req.method,
        body: JSON.stringify(body),
      })
    );

    if (rateLimitResponse) return addCorsHeaders(rateLimitResponse, req);

    // Parse the request body
    const { message, sessionId = generateSessionId() } = body;

    // Validate the request
    if (!message || typeof message !== 'string') {
      edgeLogger.error('Invalid message in request', {
        message: message,
        messageType: typeof message,
        body: JSON.stringify(body)
      });

      return addCorsHeaders(
        new Response(
          JSON.stringify({ error: 'Invalid message' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        ),
        req
      );
    }

    edgeLogger.info('Processing widget chat request', {
      sessionId,
      messageLength: message.length,
      timestamp: new Date().toISOString()
    });

    // First, directly search the RAG database to check if we have matching content
    let knowledgeBaseContext = '';
    try {
      edgeLogger.info('Direct RAG check before AI processing', {
        query: message,
        sessionId
      });

      const result = await findSimilarDocumentsOptimized(message, {
        limit: 5,
        sessionId
      });

      if (result && result.documents && result.documents.length > 0) {
        const { documents, metrics } = result;

        edgeLogger.info('Direct RAG found knowledge base matches', {
          documentCount: documents.length,
          averageSimilarity: metrics.averageSimilarity,
          fromCache: metrics.fromCache,
          retrievalTimeMs: metrics.retrievalTimeMs,
          sessionId
        });

        // Prepare context from top 3 documents
        const topDocuments = documents.slice(0, 3);
        const formattedContext = topDocuments.map(doc => {
          const content = typeof doc.content === 'string' ? doc.content : String(doc.content);
          return content;
        }).join('\n\n---\n\n');

        knowledgeBaseContext = formattedContext;
      } else {
        edgeLogger.info('Direct RAG check found no matches', { sessionId });
      }
    } catch (error) {
      edgeLogger.error('Direct RAG check failed', {
        error: error instanceof Error ? error.message : String(error),
        sessionId
      });
      // Continue with normal processing
    }

    // Simplified system prompt for faster responses
    const systemPrompt = `You are a helpful assistant embedded on the High Rollers Club Mastermind Education Website.
    
    KEEP RESPONSES CONCISE AND DIRECT. Be brief.
    
    IMPORTANT INSTRUCTIONS:
    1. Prioritize knowledge base information when answering questions.
    2. If no relevant information is found, say "I don't have specific information about that in my knowledge base."
    3. Keep responses under 300 words whenever possible.
    4. Format with simple line breaks for readability.
    5. The user is using a chat widget. Be friendly but brief.`;

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
          // Add more robust error handling
          if (!findSimilarDocumentsOptimized) {
            edgeLogger.error('findSimilarDocumentsOptimized function is not available', {
              query,
              sessionId
            });
            return "Sorry, the knowledge base search functionality is currently unavailable.";
          }

          edgeLogger.info('Searching knowledge base with RAG', {
            query,
            sessionId
          });

          const result = await findSimilarDocumentsOptimized(query, {
            limit: 5,
            sessionId
          });

          // Add null check for result
          if (!result) {
            edgeLogger.error('Null result from document search', { query });
            return "Sorry, there was an error searching the knowledge base.";
          }

          const { documents, metrics } = result;

          edgeLogger.info('Knowledge base search complete', {
            documentCount: documents.length,
            averageSimilarity: metrics.averageSimilarity,
            fromCache: metrics.fromCache,
            retrievalTimeMs: metrics.retrievalTimeMs,
            sessionId
          });

          if (!documents || documents.length === 0) {
            return "No relevant information found in the knowledge base.";
          }

          // Only use the top 3 most relevant documents
          const topDocuments = documents.slice(0, 3);

          // Ensure consistent access to similarity score regardless of field name
          // Some implementations use 'score', others use 'similarity'
          const getSimilarity = (doc: any): number => {
            // Check all possible similarity field names and default to 0 if none found
            return doc.score ?? doc.similarity ?? 0;
          };

          // Format the results with detailed information
          const formattedResults = topDocuments.map((doc, index) => {
            const similarity = getSimilarity(doc);
            const similarityPercent = Math.round(similarity * 100);

            // Safely handle ID - ensure it's a string
            const idString = typeof doc.id === 'string' ? doc.id : String(doc.id);
            const idPreview = idString.length > 8 ? idString.substring(0, 8) : idString;

            // Format content with proper line breaks
            const content = typeof doc.content === 'string' ? doc.content : String(doc.content);
            // Replace any existing line breaks with proper formatting
            const formattedContent = content
              .split(/\r?\n/)
              .filter(line => line.trim() !== '')
              .map(line => `    ${line.trim()}`)
              .join('\n');

            return `Document #${index + 1} [ID: ${idPreview}] (${similarityPercent}% relevant):\n${formattedContent}\n`;
          }).join('\n-------------------------------------------\n\n');

          // Add aggregate metrics - handle case where all scores might be 0
          const similarities = topDocuments.map(doc => getSimilarity(doc));
          const validSimilarities = similarities.filter(val => val > 0);
          const avgSimilarity = validSimilarities.length > 0
            ? Math.round(validSimilarities.reduce((sum, val) => sum + val, 0) / validSimilarities.length * 100)
            : 0;

          return `Found ${topDocuments.length} relevant documents (average similarity: ${avgSimilarity}%):\n\n${formattedResults}`;
        } catch (error) {
          edgeLogger.error('Knowledge base search failed', {
            query,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : 'No stack trace'
          });

          return "I apologize, but I encountered an error when searching for information in my knowledge base. Please try asking your question in a different way or try again later.";
        }
      }
    });

    // Build messages for the AI
    const messages: CoreMessage[] = [
      { role: 'system', content: systemPrompt }
    ];

    // If we have knowledge base context from our direct check, add it as a system message
    if (knowledgeBaseContext) {
      messages.push({
        role: 'user',
        content: `Please answer my question using the following information from the knowledge base:\n\n${knowledgeBaseContext}\n\nMy question is: ${message}`
      });
    } else {
      messages.push({ role: 'user', content: message });
    }

    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Response generation timed out after 25 seconds"));
        }, 25000); // 25 seconds timeout (gives 5s buffer before Edge timeout)
      });

      // Regular AI stream request - using the streamText function with reduced parameters
      const aiStreamPromise = streamText({
        model: openai('gpt-4o'),
        messages,
        temperature: 0.5,
        // Increased token count for more detailed responses while still being mindful of timeouts
        maxTokens: 600,
        tools: {
          knowledgeBase: knowledgeBaseTool
        },
        // Reduced multi-step tool calling to speed up responses
        maxSteps: 2,
        // Simplified system prompt that focuses on RAG prioritization
        system: `You are a helpful assistant on a photography website. Be CONCISE. Prioritize knowledge base information. If no relevant information is found, say "I don't have specific information about that." Keep responses under 100 words. Format with line breaks for readability.`,
        onStepFinish: ({ text, toolCalls, toolResults, finishReason }) => {
          edgeLogger.info('Step finished in streamText call', {
            hasText: !!text && text.length > 0,
            textLength: text?.length || 0,
            textPreview: text?.substring(0, 50) || '',
            toolCallCount: toolCalls?.length || 0,
            toolResultCount: toolResults?.length || 0,
            finishReason,
            sessionId
          });
        },
        onFinish: (result) => {
          edgeLogger.info('StreamText completed', {
            sessionId,
            hasResult: !!result,
            responseType: typeof result
          });
        }
      });

      // Race between AI stream and timeout
      const result = await Promise.race([aiStreamPromise, timeoutPromise]) as any;

      edgeLogger.info('Chat response streaming started', {
        sessionId,
        setupDuration: Date.now() - startTime,
      });

      // Using standard response handling from AI SDK with text protocol
      const response = result.toTextStreamResponse({
        headers: {
          'x-session-id': sessionId,
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        }
      });

      return addCorsHeaders(response, req);
    } catch (error) {
      edgeLogger.error('Error streaming widget response', {
        error: String(error),
        sessionId,
        processingTime: Date.now() - startTime,
        isTimeout: String(error).includes('timed out'),
      });

      // Check if it's a timeout error
      if (String(error).includes('timed out')) {
        // Return a specific response for timeout errors
        return addCorsHeaders(
          new Response(
            "I'm sorry, but I couldn't generate a response in time. Please try a shorter or simpler question.",
            {
              status: 200, // Use 200 to allow the error to display in the widget
              headers: {
                'Content-Type': 'text/plain',
                'x-session-id': sessionId
              }
            }
          ),
          req
        );
      }

      // For other errors, return a generic error message
      return addCorsHeaders(
        new Response(
          "I apologize, but I encountered an error processing your request. Please try again with a different question.",
          {
            status: 200, // Use 200 to allow the error to display in the widget
            headers: {
              'Content-Type': 'text/plain',
              'x-session-id': sessionId
            }
          }
        ),
        req
      );
    }
  } catch (error) {
    edgeLogger.error('Widget chat error', { error: String(error) });

    return addCorsHeaders(
      new Response(
        "I apologize, but something went wrong. Please try again later.",
        {
          status: 200, // Use 200 to allow the error to display in the widget
          headers: { 'Content-Type': 'text/plain' }
        }
      ),
      req
    );
  }
} 