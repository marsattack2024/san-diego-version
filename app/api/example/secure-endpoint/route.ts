import { NextRequest, NextResponse } from 'next/server';
import { createApiMiddleware } from '@/app/api/middleware';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { validateWithZod, CommonSchemas } from '@/lib/validation';
import { z } from 'zod';

// Define a custom schema for this endpoint
const ExampleRequestSchema = z.object({
  name: z.string().min(2).max(100),
  email: CommonSchemas.email,
  message: z.string().min(5).max(500),
  requestType: z.enum(['feedback', 'question', 'support']),
  timestamp: z.number().optional()
});

type ExampleRequest = z.infer<typeof ExampleRequestSchema>;

/**
 * Example secure API endpoint handler with:
 * - Input validation using our centralized validation utility
 * - CORS protection via middleware
 * - Error handling and logging
 */
async function handler(request: NextRequest) {
  try {
    // Only allow POST for this endpoint
    if (request.method !== 'POST') {
      return NextResponse.json(
        { error: 'Method not allowed' },
        { status: 405 }
      );
    }
    
    // Parse and validate the request body
    const rawData = await request.json().catch(() => ({}));
    
    // Validate using our utility with Zod schema
    const validationResult = validateWithZod(
      rawData,
      ExampleRequestSchema,
      'Invalid example request data'
    );
    
    // Handle validation errors
    if (!validationResult.success || !validationResult.data) {
      return NextResponse.json(
        { 
          error: 'Validation error', 
          details: validationResult.errors?.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message
          }))
        },
        { status: 400 }
      );
    }
    
    // Extract validated data
    const data = validationResult.data as ExampleRequest;
    
    // Get user ID from header (set by auth middleware)
    const userId = request.headers.get('x-user-id');
    
    // Log successful request (sanitized)
    edgeLogger.info('Example endpoint called', {
      userId,
      requestType: data.requestType,
      // Don't log PII like email or full message
    });
    
    // Process the validated data
    // ... your business logic here ...
    
    // Return successful response
    return NextResponse.json({
      success: true,
      message: `Thank you for your ${data.requestType}, ${data.name}!`,
      timestamp: Date.now()
    });
  } catch (error) {
    // Log unexpected errors
    edgeLogger.error('Example endpoint error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Return generic error to client
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Apply the API middleware that includes CORS, rate limiting, and auth checks
export const POST = createApiMiddleware(handler); 