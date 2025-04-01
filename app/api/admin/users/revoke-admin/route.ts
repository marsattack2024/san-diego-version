import { cookies } from 'next/headers';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'edge';

// Helper to check if a user is an admin
async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin', { uid: userId });

  if (error) {
    edgeLogger.error('Error checking admin status', {
      category: LOG_CATEGORIES.AUTH,
      userId,
      error: error.message
    });
    return false;
  }

  return !!data;
}

// POST /api/admin/users/revoke-admin - Revoke admin privileges
export async function POST(request: Request): Promise<Response> {
  // Get cookies with pre-fetching (best practice for Next.js)
  const cookieStore = await cookies();
  const cookieList = cookieStore.getAll();

  const supabase = createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieList;
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );

  // Verify the user is authenticated and an admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return unauthorizedError('Authentication required');
  }

  // Check if user is an admin
  const admin = await isAdmin(supabase, user.id);
  if (!admin) {
    return errorResponse('Forbidden - You do not have admin privileges', null, 403);
  }

  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return errorResponse('Email is required', null, 400);
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

        return errorResponse('Error revoking admin privileges', error.message, 500);
      }

      // Check the returned success flag
      if (data === false) {
        edgeLogger.warn('User not found or not an admin', {
          category: LOG_CATEGORIES.AUTH,
          email
        });

        return errorResponse('User not found or is not an admin', null, 404);
      }

      edgeLogger.info('Admin privileges revoked successfully', {
        category: LOG_CATEGORIES.AUTH,
        email
      });

      return successResponse({
        message: 'Admin privileges revoked successfully',
        success: true
      });
    } catch (error) {
      edgeLogger.error('Exception while revoking admin privileges', {
        category: LOG_CATEGORIES.AUTH,
        error: error instanceof Error ? error.message : String(error),
        email
      });

      return errorResponse(
        'Exception while revoking admin privileges',
        error instanceof Error ? error.message : String(error),
        500
      );
    }
  } catch (error) {
    edgeLogger.error('Error processing request', {
      category: LOG_CATEGORIES.AUTH,
      error: error instanceof Error ? error.message : String(error)
    });

    return errorResponse(
      'Internal Server Error',
      error instanceof Error ? error.message : String(error),
      500
    );
  }
}