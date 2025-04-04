import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Define and EXPORT the type for handlers that require authentication
export type AuthenticatedRouteHandler = (
    request: Request,
    context: { params?: Record<string, string> },
    user: User
) => Promise<Response>;

// Define the type for handlers that require admin authentication
export type AdminAuthenticatedRouteHandler = AuthenticatedRouteHandler;

/**
 * Middleware wrapper for route handlers that require authentication
 * Creates a standardized way to protect API routes with proper error handling
 * 
 * @param handler Function to handle the request if authentication is successful (matches AuthenticatedRouteHandler)
 * @returns Route handler function that validates auth before proceeding
 */
export function withAuth(handler: AuthenticatedRouteHandler): (req: Request, context: { params?: Record<string, string> }) => Promise<Response> {
    return async (req: Request, context: { params?: Record<string, string> }) => {
        const operationId = `auth_${Math.random().toString(36).substring(2, 8)}`;

        try {
            // Get Supabase client with route handler context
            const supabase = await createRouteHandlerClient();

            // Use getUser (not getSession) to validate auth with Supabase server
            const { data: { user }, error } = await supabase.auth.getUser();

            // Handle authentication failure
            if (error || !user) {
                edgeLogger.warn('Authentication required for API route', {
                    category: LOG_CATEGORIES.AUTH,
                    operationId,
                    path: new URL(req.url).pathname,
                    error: error?.message || 'No authenticated user',
                });

                return NextResponse.json(
                    { error: 'Authentication required' },
                    { status: 401 }
                );
            }

            // Auth successful, log and proceed to handler
            edgeLogger.debug('Authentication successful for API route', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                path: new URL(req.url).pathname,
                userId: user.id.substring(0, 8) + '...',
            });

            // Resolve params BEFORE passing to the handler
            let resolvedContext = context;
            if (context.params) {
                try {
                    // Await the params promise from Next.js context
                    const resolvedParams = await context.params;
                    resolvedContext = { ...context, params: resolvedParams };
                } catch (paramsError) {
                    edgeLogger.error('Error resolving route params in auth wrapper', {
                        category: LOG_CATEGORIES.SYSTEM,
                        operationId,
                        path: new URL(req.url).pathname,
                        error: paramsError instanceof Error ? paramsError.message : String(paramsError),
                        important: true
                    });
                    // Return a generic server error if params fail to resolve
                    // Use standard response utilities and handleCors if available/imported, otherwise use NextResponse
                    // Assuming handleCors and errorResponse are not standard here, use NextResponse
                    // TODO: Consider importing and using standardized response utils here if possible
                    return NextResponse.json(
                        { error: 'Internal server error processing request parameters' },
                        { status: 500 }
                    );
                }
            }

            // Call the handler with the potentially resolved context
            return await handler(req, resolvedContext, user);
        } catch (error) {
            // Log unexpected errors
            edgeLogger.error('Unexpected error in auth wrapper', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                path: new URL(req.url).pathname,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                important: true
            });

            // Return standardized error response
            return NextResponse.json(
                { error: 'Internal server error' },
                { status: 500 }
            );
        }
    };
}

/**
 * Middleware wrapper for route handlers that require admin privileges
 * Extends withAuth to also check for admin status (via JWT claim)
 * 
 * @param handler Function to handle the request if authentication and admin check are successful (matches AdminAuthenticatedRouteHandler)
 * @returns Route handler function that validates auth and admin status before proceeding
 */
export function withAdminAuth(handler: AdminAuthenticatedRouteHandler): (req: Request, context: { params?: Record<string, string> }) => Promise<Response> {
    // Wrap the authenticated handler logic first
    return withAuth(async (req, context, user) => { // Receive user from withAuth
        const operationId = `admin_auth_${Math.random().toString(36).substring(2, 8)}`;

        try {
            // Check JWT claims for admin status 
            const isAdmin = user.app_metadata?.is_admin === true;

            if (!isAdmin) {
                edgeLogger.warn('Admin access denied', {
                    category: LOG_CATEGORIES.AUTH,
                    operationId,
                    path: new URL(req.url).pathname,
                    userId: user.id.substring(0, 8) + '...',
                });

                return NextResponse.json(
                    { error: 'Admin access required' },
                    { status: 403 }
                );
            }

            // Admin access granted, proceed to handler
            edgeLogger.debug('Admin authentication successful', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                path: new URL(req.url).pathname,
                userId: user.id.substring(0, 8) + '...',
            });

            // Call the original handler with the adjusted signature
            return await handler(req, context, user);
        } catch (error) {
            // Log unexpected errors
            edgeLogger.error('Unexpected error in admin auth wrapper', {
                category: LOG_CATEGORIES.AUTH,
                operationId,
                path: new URL(req.url).pathname,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                important: true
            });

            // Return standardized error response
            return NextResponse.json(
                { error: 'Internal server error' },
                { status: 500 }
            );
        }
    });
} 