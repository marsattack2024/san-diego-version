import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';
import { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Helper to check if a user is an admin
async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  edgeLogger.debug('Checking admin status for user', { category: LOG_CATEGORIES.AUTH, userId });
  try {
    const { data, error } = await supabase.rpc('is_admin', { uid: userId });
    if (error) {
      edgeLogger.error('Error checking admin status via RPC', { category: LOG_CATEGORIES.AUTH, error: error.message, userId });
      // Fallback or further checks might be needed depending on requirements
      return false;
    }
    return !!data;
  } catch (err) {
    edgeLogger.error('Exception checking admin status', { category: LOG_CATEGORIES.AUTH, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

// POST /api/admin/users/revoke-admin - Revoke admin privileges
export async function POST(request: Request): Promise<Response> {
  const operationId = `revoke_admin_${Math.random().toString(36).substring(2, 7)}`;

  try {
    // Use standard client
    const supabase = await createRouteHandlerClient();

    // Verify the user is authenticated and an admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user) {
      const errRes = unauthorizedError('Authentication required');
      return handleCors(errRes, request, true);
    }

    const isAdminCaller = await isAdmin(supabase, user.id);
    if (!isAdminCaller) {
      const errRes = errorResponse('Forbidden - You do not have admin privileges', null, 403);
      return handleCors(errRes, request, true);
    }

    // Parse body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      const errRes = errorResponse('Invalid JSON body', null, 400);
      return handleCors(errRes, request, true);
    }
    const { email } = body;

    if (!email) {
      const errRes = errorResponse('Email is required', null, 400);
      return handleCors(errRes, request, true);
    }

    edgeLogger.info('Attempting to revoke admin privileges', {
      category: LOG_CATEGORIES.AUTH,
      requestedBy: user.id,
      targetEmail: email
    });

    try {
      // Call the stored procedure to revoke admin privileges
      const { data, error } = await supabase.rpc('revoke_admin', { admin_email: email });

      if (error) {
        edgeLogger.error('Error revoking admin privileges', {
          category: LOG_CATEGORIES.AUTH,
          error: error.message,
          email
        });

        const errRes = errorResponse('Error revoking admin privileges', error.message, 500);
        return handleCors(errRes, request, true);
      }

      // Check the returned success flag
      if (data === false) {
        edgeLogger.warn('User not found or not an admin', {
          category: LOG_CATEGORIES.AUTH,
          email
        });

        const errRes = errorResponse('User not found or is not an admin', null, 404);
        return handleCors(errRes, request, true);
      }

      edgeLogger.info('Admin privileges revoked successfully', {
        category: LOG_CATEGORIES.AUTH,
        email
      });

      const response = successResponse({
        message: 'Admin privileges revoked successfully',
        success: true
      });
      return handleCors(response, request, true);
    } catch (error) {
      edgeLogger.error('Exception while revoking admin privileges', {
        category: LOG_CATEGORIES.AUTH,
        error: error instanceof Error ? error.message : String(error),
        email
      });

      const errRes = errorResponse(
        'Exception while revoking admin privileges',
        error instanceof Error ? error.message : String(error),
        500
      );
      return handleCors(errRes, request, true);
    }
  } catch (error) {
    edgeLogger.error('Error processing request', {
      category: LOG_CATEGORIES.AUTH,
      error: error instanceof Error ? error.message : String(error)
    });

    const errRes = errorResponse(
      'Internal Server Error',
      error instanceof Error ? error.message : String(error),
      500
    );
    return handleCors(errRes, request, true);
  }
}