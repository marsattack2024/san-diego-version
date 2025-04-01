/**
 * Route Handler Template
 * 
 * This template demonstrates the standard pattern for implementing
 * route handlers in our Next.js 15 application.
 */

import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import {
    successResponse,
    errorResponse,
    unauthorizedError,
    validationError
} from '@/lib/utils/route-handler';

// Always declare the runtime for consistency
export const runtime = 'edge';

/**
 * GET route handler example
 */
export async function GET(request: Request): Promise<Response> {
    try {
        // Create a unique operation ID for tracing in logs
        const operationId = `get_operation_${Math.random().toString(36).substring(2, 10)}`;

        // Log the request
        edgeLogger.info('GET request received', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId,
            url: request.url
        });

        // Parse URL parameters if needed
        const url = new URL(request.url);
        const queryParam = url.searchParams.get('param');

        // Authenticate the user
        const supabase = await createRouteHandlerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            edgeLogger.warn('Authentication failed', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                error: authError?.message || 'No user found'
            });

            return unauthorizedError('Authentication required');
        }

        // Process the request
        const { data, error } = await supabase
            .from('your_table')
            .select('*')
            .eq('user_id', user.id);

        if (error) {
            edgeLogger.error('Database query error', {
                category: LOG_CATEGORIES.SYSTEM,
                operationId,
                error: error.message
            });

            return errorResponse('Error fetching data', error.message, 500);
        }

        // Log success and return response
        edgeLogger.info('Request processed successfully', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId,
            resultCount: data?.length || 0
        });

        return successResponse({ data: data || [] });
    } catch (error) {
        // Log the error
        edgeLogger.error('Unexpected error in route handler', {
            category: LOG_CATEGORIES.SYSTEM,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            important: true
        });

        // Return standardized error response
        return errorResponse(
            'An unexpected error occurred',
            error instanceof Error ? error.message : String(error),
            500
        );
    }
}

/**
 * POST route handler example
 */
export async function POST(request: Request): Promise<Response> {
    try {
        // Create a unique operation ID for tracing
        const operationId = `post_operation_${Math.random().toString(36).substring(2, 10)}`;

        // Log the request
        edgeLogger.info('POST request received', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId
        });

        // Parse the request body
        let body;
        try {
            body = await request.json();
        } catch (parseError) {
            edgeLogger.error('Failed to parse request body', {
                category: LOG_CATEGORIES.SYSTEM,
                operationId,
                error: parseError instanceof Error ? parseError.message : String(parseError)
            });

            return validationError('Invalid request body');
        }

        // Validate request data
        if (!body.requiredField) {
            return validationError('Missing required field');
        }

        // Authenticate the user
        const supabase = await createRouteHandlerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return unauthorizedError('Authentication required');
        }

        // Process the request
        const { data, error } = await supabase
            .from('your_table')
            .insert({
                user_id: user.id,
                content: body.content,
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            return errorResponse('Error creating record', error.message, 500);
        }

        // Return success response
        return successResponse({
            message: 'Record created successfully',
            data
        });
    } catch (error) {
        // Log and return standardized error response
        edgeLogger.error('Unexpected error in route handler', {
            category: LOG_CATEGORIES.SYSTEM,
            error: error instanceof Error ? error.message : String(error)
        });

        return errorResponse(
            'An unexpected error occurred',
            error instanceof Error ? error.message : String(error),
            500
        );
    }
}

/**
 * Example notes for special cases:
 * 
 * 1. For serverless routes that need more memory or CPU:
 *    export const runtime = 'nodejs';
 * 
 * 2. For dynamic route parameters:
 *    export async function GET(
 *      request: Request,
 *      { params }: { params: { id: string } }
 *    ): Promise<Response> {
 *      const { id } = params;
 *      // ...
 *    }
 * 
 * 3. For CORS handling:
 *    export async function OPTIONS(request: Request): Promise<Response> {
 *      return successResponse(null, {
 *        headers: {
 *          'Access-Control-Allow-Origin': '*',
 *          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
 *          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
 *        }
 *      });
 *    }
 */ 