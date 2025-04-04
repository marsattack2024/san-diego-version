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
    validationError,
    notFoundError
} from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';
import type { IdParam } from '@/lib/types/route-handlers';
import { withAuth, type AuthenticatedRouteHandler } from '@/lib/auth/with-auth';
import { type User } from '@supabase/supabase-js';

// Always declare the runtime and dynamic behavior
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * GET route handler example (Non-dynamic, Unauthenticated or Manual Auth)
 */
export async function GET_Unauthenticated(request: Request): Promise<Response> {
    const operationId = `get_operation_${Math.random().toString(36).substring(2, 10)}`;

    try {
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
            return handleCors(unauthorizedError('Authentication required'), request, true);
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
            return handleCors(errorResponse('Error fetching data', error.message, 500), request, true);
        }

        if (!data || data.length === 0) {
            edgeLogger.warn('Data not found', {
                category: LOG_CATEGORIES.SYSTEM,
                operationId,
                userId: user.id
            });
            return handleCors(notFoundError('Data not found'), request, true);
        }

        edgeLogger.info('Request processed successfully', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId,
            resultCount: data?.length || 0
        });

        const response = successResponse({ data: data || [] });
        return handleCors(response, request, true);

    } catch (error) {
        edgeLogger.error('Unexpected error in route handler', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            important: true
        });

        const response = errorResponse(
            'An unexpected error occurred',
            error instanceof Error ? error.message : String(error),
            500
        );
        return handleCors(response, request, true);
    }
}

/**
 * GET route handler example (Non-dynamic, Using withAuth)
 */
const GET_Authenticated_Handler: AuthenticatedRouteHandler = async (request, context, user) => {
    const operationId = `get_auth_op_${Math.random().toString(36).substring(2, 10)}`;

    try {
        edgeLogger.info('Authenticated GET request received', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId,
            userId: user.id.substring(0, 8)
        });

        // Authentication already handled by withAuth wrapper, 'user' is available

        // Process the request using 'user'
        const supabase = await createRouteHandlerClient(); // Still need client for DB ops
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
            return handleCors(errorResponse('Error fetching data', error.message, 500), request, true);
        }

        if (!data || data.length === 0) {
            edgeLogger.warn('Data not found', {
                category: LOG_CATEGORIES.SYSTEM,
                operationId,
                userId: user.id
            });
            return handleCors(notFoundError('Data not found'), request, true);
        }

        edgeLogger.info('Request processed successfully', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId,
            resultCount: data?.length || 0
        });

        const response = successResponse({ data: data || [] });
        return handleCors(response, request, true);

    } catch (error) {
        edgeLogger.error('Unexpected error in GET_Authenticated_Handler', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId,
            userId: user.id.substring(0, 8),
            error: error instanceof Error ? error.message : String(error),
            important: true
        });
        const response = errorResponse('Internal Server Error', error instanceof Error ? error.message : String(error), 500);
        return handleCors(response, request, true);
    }
};
// Wrap the handler for export
export const GET = withAuth(GET_Authenticated_Handler);


/**
 * POST route handler example (using withAuth)
 */
const POST_Handler: AuthenticatedRouteHandler = async (request, context, user) => {
    const operationId = `post_auth_op_${Math.random().toString(36).substring(2, 10)}`;
    try {
        let body;
        try {
            body = await request.json();
        } catch (parseError) {
            edgeLogger.error('Error parsing request body', {
                category: LOG_CATEGORIES.SYSTEM,
                operationId,
                error: parseError instanceof Error ? parseError.message : String(parseError),
                important: true
            });
            return handleCors(validationError('Invalid request body'), request, true);
        }

        // Validate body
        if (!body || !body.requiredField) {
            edgeLogger.error('Missing required field', {
                category: LOG_CATEGORIES.SYSTEM,
                operationId,
                important: true
            });
            return handleCors(validationError('Missing required field'), request, true);
        }

        // Auth already handled by wrapper
        edgeLogger.info('Authenticated POST request received', { operationId, userId: user.id });

        const supabase = await createRouteHandlerClient();
        const { data, error } = await supabase
            .from('your_table')
            .insert({ user_id: user.id, content: body.content })
            .select().single();

        if (error) {
            edgeLogger.error('Error creating record', {
                category: LOG_CATEGORIES.SYSTEM,
                operationId,
                error: error instanceof Error ? error.message : String(error),
                important: true
            });
            return handleCors(errorResponse('Error creating record', error.message, 500), request, true);
        }

        const response = successResponse({ message: 'Record created', data });
        return handleCors(response, request, true);

    } catch (error) {
        edgeLogger.error('Unexpected error in POST_Handler', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId,
            userId: user.id.substring(0, 8),
            error: error instanceof Error ? error.message : String(error),
            important: true
        });
        const response = errorResponse('Internal Server Error', error instanceof Error ? error.message : String(error), 500);
        return handleCors(response, request, true);
    }
};
export const POST = withAuth(POST_Handler);

/**
 * Example notes for special cases:
 * 
 * 1. Serverless routes: export const runtime = 'nodejs'; 
 * 
 * 2. Dynamic route example (withAuth):
 *    import type { IdParam } from '@/lib/types/route-handlers';
 *    const GET_Dynamic_Handler: AuthenticatedRouteHandler = async (
 *      request: Request,
 *      context: { params?: IdParam['params'] }, // Access params via context
 *      user: User
 *    ): Promise<Response> => {
 *      const operationId = `get_dynamic_${...}`;
 *      try {
 *         const id = context.params?.id; 
 *         if (!id) { // Add validation for dynamic param
 *             return handleCors(validationError('Missing ID parameter'), request, true);
 *         }
 *         edgeLogger.info('Dynamic Authenticated GET request', { operationId, id, userId: user.id });
 *         // ... rest of logic using id and user ...
 *         // ... return handleCors(...) ...
 *       } catch (error) {
 *         // ... error handling with handleCors(...) ...
 *       }
 *    }
 *    export const GET = withAuth(GET_Dynamic_Handler);
 * 
 * 3. CORS Preflight (OPTIONS): Generally handled by `handleCors` now, 
 *    but if specific OPTIONS logic is needed:
 *    export async function OPTIONS(request: Request): Promise<Response> {
 *      const response = new Response(null, { status: 204 });
 *      return response;
 *    }
 * 
 * 4. Migration Note: Ensure all usages of `NextRequest` are updated to `Request`.
 */ 