import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import type { User } from '@supabase/supabase-js';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { unauthorizedError, errorResponse } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';

// Context passed TO the handler (RESOLVED params)
export type AuthenticatedContext = {
    params?: Record<string, string>;
    user: User;
};

// Signature FOR the handler logic
export type AuthenticatedRouteHandler = (
    request: Request,
    context: AuthenticatedContext
) => Promise<Response>;

export type AdminAuthenticatedRouteHandler = AuthenticatedRouteHandler;

/**
 * Middleware wrapper for route handlers that require authentication
 * Allows TypeScript to infer the return type.
 */
export function withAuth(handler: AuthenticatedRouteHandler) {
    // This inner async function matches the signature Next.js provides
    return async (req: Request, context: { params?: Promise<Record<string, string>> }) => {
        const operationId = `auth_${Math.random().toString(36).substring(2, 8)}`;

        try {
            const supabase = await createRouteHandlerClient();
            const { data: { user }, error } = await supabase.auth.getUser();

            if (error || !user) {
                edgeLogger.warn('Authentication required for API route', {
                    category: LOG_CATEGORIES.AUTH,
                    operationId,
                    path: new URL(req.url).pathname,
                    error: error?.message || 'No authenticated user',
                });
                // Use standard unauthorizedError and handleCors
                const errRes = unauthorizedError('Authentication required');
                return handleCors(errRes, req, true);
            }

            edgeLogger.debug('Authentication successful for API route', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                path: new URL(req.url).pathname,
                userId: user.id.substring(0, 8) + '...',
            });

            // Resolve params provided by Next.js
            const resolvedParams = context.params ? await context.params : undefined;

            // Prepare context for the actual handler
            const authenticatedContext: AuthenticatedContext = {
                params: resolvedParams,
                user
            };

            // Call the original handler with the RESOLVED context
            return await handler(req, authenticatedContext);
        } catch (error) {
            edgeLogger.error('Unexpected error in auth wrapper', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                path: new URL(req.url).pathname,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                important: true
            });
            // Use standard errorResponse and handleCors
            const errRes = errorResponse('Internal server error', error, 500);
            return handleCors(errRes, req, true);
        }
    };
}

/**
 * Middleware wrapper for route handlers that require admin privileges
 * Allows TypeScript to infer the return type.
 */
export function withAdminAuth(handler: AdminAuthenticatedRouteHandler) {
    // Wrap withAuth, providing an AuthenticatedRouteHandler
    return withAuth(async (req, context) => {
        // context is AuthenticatedContext (user + resolved params) here
        const operationId = `admin_auth_${Math.random().toString(36).substring(2, 8)}`;
        const { user } = context;

        try {
            const isAdmin = user.app_metadata?.is_admin === true;

            if (!isAdmin) {
                edgeLogger.warn('Admin access denied', {
                    category: LOG_CATEGORIES.AUTH,
                    operationId,
                    path: new URL(req.url).pathname,
                    userId: user.id.substring(0, 8) + '...',
                });
                // Use standard errorResponse(403) and handleCors
                const errRes = errorResponse('Admin access required', 'Forbidden', 403);
                return handleCors(errRes, req, true);
            }

            edgeLogger.debug('Admin authentication successful', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                path: new URL(req.url).pathname,
                userId: user.id.substring(0, 8) + '...',
            });

            // Call the original admin handler with the AuthenticatedContext
            return await handler(req, context);
        } catch (error) {
            edgeLogger.error('Unexpected error in admin auth wrapper', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                path: new URL(req.url).pathname,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                important: true
            });
            // Use standard errorResponse and handleCors
            const errRes = errorResponse('Internal server error', error, 500);
            return handleCors(errRes, req, true);
        }
    });
} 