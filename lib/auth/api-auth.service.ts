import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { unauthorizedError, errorResponse } from '@/lib/utils/route-handler';
import { maskUserId } from '@/lib/utils/misc-utils';

/**
 * Service to handle API request authentication.
 */
export class ApiAuthService {
    private operationName: string;

    constructor(operationName: string = 'api_auth') {
        this.operationName = operationName;
    }

    /**
     * Authenticates an incoming API request.
     * Checks for bearer token first, then cookie-based session.
     * @param req - The incoming Request object.
     * @param requiresAuth - Whether authentication is strictly required.
     * @returns The authenticated user ID.
     * @throws Will throw an error (intended to be caught and turned into a Response) 
     *         using standardized error utilities if authentication fails and is required.
     */
    async authenticateRequest(req: Request, requiresAuth: boolean): Promise<string | undefined> {
        const startTime = Date.now();
        const operationId = `${this.operationName}-${crypto.randomUUID().substring(0, 8)}`;
        let authMethod = 'none'; // Track which method succeeded or failed

        edgeLogger.debug('Starting request authentication', {
            category: LOG_CATEGORIES.AUTH,
            operation: this.operationName,
            operationId,
            requiresAuth,
            path: new URL(req.url).pathname
        });

        if (!requiresAuth) {
            edgeLogger.info('Authentication not required for this request', {
                category: LOG_CATEGORIES.AUTH,
                operation: this.operationName,
                operationId,
                durationMs: Date.now() - startTime
            });
            return undefined; // No user ID if auth isn't required
        }

        try {
            // 1. Check for Bearer Token (Authorization header)
            const authHeader = req.headers.get('Authorization');
            if (authHeader && authHeader.startsWith('Bearer ')) {
                authMethod = 'token';
                const token = authHeader.substring(7);
                // TODO: Implement actual JWT verification here
                // For now, assume valid token yields a dummy user ID
                const userId = 'token-auth-user'; // Placeholder

                edgeLogger.info('Authentication successful (Bearer Token)', {
                    category: LOG_CATEGORIES.AUTH,
                    operation: this.operationName,
                    operationId,
                    method: authMethod,
                    userId: maskUserId(userId), // Mask the ID
                    durationMs: Date.now() - startTime
                });
                return userId;
            }

            // 2. Check for Cookie-based Session
            authMethod = 'cookie';
            try {
                // cookies() only works in Next.js context (Route Handlers, Server Components)
                const cookieStore = cookies();
                const supabase = await createClient();
                const { data: { user }, error: userError } = await supabase.auth.getUser();

                if (userError) {
                    edgeLogger.warn('Supabase getUser error during cookie auth', {
                        category: LOG_CATEGORIES.AUTH,
                        operation: this.operationName,
                        operationId,
                        method: authMethod,
                        error: userError.message
                    });
                    // Throw standard unauthorized error to be handled by the route handler
                    throw unauthorizedError('Session invalid or expired');
                }

                if (!user) {
                    edgeLogger.warn('Unauthorized access attempt (No user session found)', {
                        category: LOG_CATEGORIES.AUTH,
                        operation: this.operationName,
                        operationId,
                        method: authMethod,
                        path: new URL(req.url).pathname
                    });
                    throw unauthorizedError('Authentication required');
                }

                // Auth successful
                edgeLogger.info('Authentication successful (Cookie Session)', {
                    category: LOG_CATEGORIES.AUTH,
                    operation: this.operationName,
                    operationId,
                    method: authMethod,
                    userId: maskUserId(user.id),
                    durationMs: Date.now() - startTime
                });
                return user.id;

            } catch (cookieError) {
                // Handle cases where cookies() fails (e.g., called outside Next.js context)
                // Or if createClient/getUser throws other errors
                edgeLogger.error('Error during cookie-based authentication', {
                    category: LOG_CATEGORIES.AUTH,
                    operation: this.operationName,
                    operationId,
                    method: authMethod,
                    error: cookieError instanceof Error ? cookieError.message : String(cookieError),
                    // If the error is one of our standardized Response errors, extract status
                    status: cookieError instanceof Response ? cookieError.status : undefined
                });

                // If it's already a standardized error response, rethrow it
                if (cookieError instanceof Response) {
                    throw cookieError;
                }

                // For other errors, throw a generic auth error response
                throw errorResponse('Authentication failed', cookieError, 500);
            }

        } catch (error) {
            // Catch errors thrown from within the auth checks (like unauthorizedError)
            edgeLogger.error('Authentication process failed', {
                category: LOG_CATEGORIES.AUTH,
                operation: this.operationName,
                operationId,
                method: authMethod,
                error: error instanceof Error ? error.message : String(error),
                status: error instanceof Response ? error.status : 500,
                durationMs: Date.now() - startTime,
                important: true // Mark auth failures as important
            });

            // Rethrow the error (which should be a Response object)
            // This ensures the calling route handler gets a standard Response error
            if (error instanceof Response) {
                throw error;
            } else {
                // Wrap unexpected errors in a standard 500 response
                throw errorResponse('Internal authentication error', error, 500);
            }
        }
    }
} 