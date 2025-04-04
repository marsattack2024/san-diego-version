/**
 * Route Handler Template
 * 
 * This template demonstrates the standard pattern for implementing
 * route handlers in our Next.js application.
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
import { withAuth, type AuthenticatedRouteHandler } from '@/lib/auth/with-auth';
import { type User } from '@supabase/supabase-js';

// Always declare the runtime and dynamic behavior
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * GET handler for API route
 */
const GET_Handler: AuthenticatedRouteHandler = async (request, context) => {
    // Extract user from context
    const { user } = context;
    const operationId = `get_${Math.random().toString(36).substring(2, 10)}`;

    try {
        // Extract URL params if needed
        let paramId;
        if (context.params) {
            // Must await params in Next.js
            const resolvedParams = await context.params;
            paramId = resolvedParams.id;
        }

        // Log operation start
        edgeLogger.info('Starting GET operation', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId,
            userId: user.id.substring(0, 8) + '...'
        });

        // Create Supabase client
        const supabase = await createRouteHandlerClient();

        // Perform database operations
        // const { data, error } = await supabase...

        // Return success response with CORS handling
        return handleCors(
            successResponse({ message: 'Success' }),
            request,
            true
        );
    } catch (error) {
        // Log error
        edgeLogger.error('Error in GET handler', {
            category: LOG_CATEGORIES.SYSTEM,
            operationId,
            error: error instanceof Error ? error.message : String(error),
            important: true
        });

        // Return error response with CORS handling
        return handleCors(
            errorResponse(
                'Internal server error',
                error instanceof Error ? error.message : String(error),
                500
            ),
            request,
            true
        );
    }
};

// Apply auth middleware to handler
export const GET = withAuth(GET_Handler);

// You can add additional HTTP methods (POST, PUT, DELETE, etc.) following the same pattern 