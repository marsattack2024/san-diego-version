import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Export the handler type for use in tests
export type AuthHandler = (user: User, req: Request) => Promise<Response>;

/**
 * Middleware wrapper for route handlers that require authentication
 * Creates a standardized way to protect API routes with proper error handling
 * 
 * @param handler Function to handle the request if authentication is successful
 * @returns Route handler function that validates auth before proceeding
 */
export function withAuth(handler: AuthHandler): (req: Request) => Promise<Response> {
    return async (req: Request) => {
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

            return await handler(user, req);
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
 * Extends withAuth to also check for admin status
 * 
 * @param handler Function to handle the request if authentication and admin check are successful
 * @returns Route handler function that validates auth and admin status before proceeding
 */
export function withAdminAuth(handler: AuthHandler): (req: Request) => Promise<Response> {
    return withAuth(async (user, req) => {
        const operationId = `admin_auth_${Math.random().toString(36).substring(2, 8)}`;

        try {
            // Check JWT claims for admin status (available after Phase 6)
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

            return await handler(user, req);
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