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
    
    // Create a strong system prompt that emphasizes using knowledge base information
    const systemPrompt = `You are a helpful assistant embedded on the Marlin photography website.
    
    IMPORTANT INSTRUCTIONS:
    1. ALWAYS prioritize knowledge base information when answering questions.
    2. If the knowledge base contains relevant information, use it as your primary source.
    3. Provide concise, accurate responses based on the knowledge base.
    4. If no relevant information is found in the knowledge base, respond with "I don't have specific information about that in my knowledge base."
    5. Do not hallucinate or make up information that isn't provided in the knowledge base.
    6. The user is interacting with a chat widget on the website.
    7. Keep responses friendly, helpful and professional.
    8. NEVER output tool call responses directly in your text. Process the information and provide a human-friendly response.
    9. FORMAT YOUR RESPONSES WITH CLEAR LINE BREAKS:
       - Use line breaks between paragraphs
       - For lists, put each item on a new line with numbers or bullet points
       - Add blank lines between sections for better readability
       - Use simple markdown formatting for emphasis when needed`;
    
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
            // No need to set similarityThreshold here as it's handled in the function
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
          
          // Format the results with detailed information
          const formattedResults = topDocuments.map((doc, index) => {
            const similarityPercent = Math.round((doc.score || 0) * 100);
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

          // Add aggregate metrics
          const avgSimilarity = Math.round(
            topDocuments.reduce((sum, doc) => sum + (doc.score || 0), 0) / topDocuments.length * 100
          );

          return `Found ${topDocuments.length} most relevant documents (out of ${documents.length} retrieved, average similarity of top 3: ${avgSimilarity}%):\n\n${formattedResults}`;
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
        role: 'system',
        content: `Here is relevant information from our knowledge base about the user's query:\n\n${knowledgeBaseContext}\n\nUse this information to inform your response.`
      });
    }
    
    // Add the user message last
    messages.push({ role: 'user', content: message });
    
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
        // Add a system message to ensure the model is explicitly asked to synthesize results
        system: `${systemPrompt}
        
IMPORTANT: After using tools to gather information, you MUST provide a final response that:
1. Synthesizes the information from the knowledge base
2. Directly answers the user's question in a clear, concise manner
3. Does NOT include any raw tool output, but instead presents the information in a helpful, conversational format
4. Make sure to add line breaks and make the information easy to see for the user since it's a small chat window. 
5. Format responses with clear paragraph breaks and use numbered or bulleted lists when appropriate.
6. If the tool returns "No relevant information found", acknowledge that and provide general guidance if possible`,
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
        sessionId
      });
      
      return addCorsHeaders(
        new Response(
          JSON.stringify({
            error: 'Error generating response',
            message: String(error)
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          }
        ),
        req
      );
    }
  } catch (error) {
    edgeLogger.error('Widget chat error', { error: String(error) });
    
    return addCorsHeaders(
      new Response(
        JSON.stringify({
          error: 'An error occurred processing your request',
          message: String(error)
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      ),
      req
    );
  }
} 