import { createClient as createServerClient } from '@/utils/supabase/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * Simple auth status check endpoint
 * Returns 200 if authenticated, 401 if not
 * Also sets x-auth-state header for debugging
 */
export async function GET(_request: Request): Promise<Response> {
  try {
    // Create Supabase server client
    const supabase = await createServerClient();

    // Get user session
    const { data: { user } } = await supabase.auth.getUser();

    // Get time for tracking response times
    const startTime = Date.now();

    // If authenticated
    if (user) {
      // Return success response with appropriate headers
      const response = successResponse({
        status: 'authenticated',
        userId: user.id
      });

      // Add custom headers
      response.headers.set('x-auth-state', 'authenticated');
      response.headers.set('x-response-time', `${Date.now() - startTime}ms`);

      return response;
    }

    // Not authenticated - use standard unauthorized response
    const response = unauthorizedError('Unauthorized: Authentication required');

    // Add response data through headers 
    response.headers.set('x-auth-state', 'unauthenticated');
    response.headers.set('x-response-time', `${Date.now() - startTime}ms`);

    return response;
  } catch (error: unknown) {
    // Log the error
    edgeLogger.error('Error in auth status endpoint', {
      error: error instanceof Error ? error.message : String(error)
    });

    // Return 500 Internal Server Error with custom header
    const response = errorResponse(
      'Failed to check authentication status',
      error,
      500
    );

    response.headers.set('x-auth-state', 'error');

    return response;
  }
} 