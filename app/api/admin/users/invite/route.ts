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
  if (error) return false;
  return !!data;
}

// POST /api/admin/users/invite - Invite a new user
export async function POST(request: Request): Promise<Response> {
  // Get cookies with pre-fetching (best practice for NextJS)
  const cookieStore = await cookies();
  const cookieList = cookieStore.getAll();

  // Try to use service role key if available
  const apiKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    apiKey,
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

    edgeLogger.info('Attempting to invite user', {
      category: LOG_CATEGORIES.AUTH,
      adminId: user.id,
      email: email
    });

    // Invite the user using the admin API
    if (!process.env.SUPABASE_KEY) {
      return errorResponse('Service role key is required for user invitations', null, 500);
    }

    try {
      // Use the inviteUserByEmail method which:
      // 1. Creates the user record in auth.users
      // 2. Generates a magic link token
      // 3. Sends an invitation email with the link
      // 4. Handles verification when the user clicks the link
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);

      if (error) {
        // If the user already exists, return a friendly message
        if (error.message?.includes('already been registered') ||
          error.message?.includes('already exists')) {

          edgeLogger.info('User already exists', {
            category: LOG_CATEGORIES.AUTH,
            email: email
          });

          return successResponse({
            message: 'User with this email already exists',
            status: 'exists'
          });
        }

        edgeLogger.error('Error inviting user', {
          category: LOG_CATEGORIES.AUTH,
          error: error.message,
          email: email
        });

        return errorResponse(error.message, null, 500);
      }

      // Verify we have user data
      if (!data?.user) {
        return errorResponse('Invitation succeeded but no user data returned', null, 500);
      }

      edgeLogger.info('User invited successfully', {
        category: LOG_CATEGORIES.AUTH,
        userId: data.user.id,
        email: email
      });

      // Create a minimal profile record so the user appears in the admin dashboard
      try {
        // Extract name from email for initial profile (e.g., john from john@example.com)
        const emailName = email.split('@')[0];
        const userName = emailName.charAt(0).toUpperCase() + emailName.slice(1);

        // Create minimal placeholder profile for the user
        const { error: profileError } = await supabase
          .from('sd_user_profiles')
          .insert([{
            user_id: data.user.id,
            full_name: userName,
            company_name: 'Pending Setup',
            company_description: 'Pending profile completion',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);

        if (profileError) {
          edgeLogger.warn('Created user but failed to create profile', {
            category: LOG_CATEGORIES.AUTH,
            error: profileError,
            userId: data.user.id
          });
          // Don't fail the request, just log the warning
        } else {
          edgeLogger.info('Created placeholder profile for user', {
            category: LOG_CATEGORIES.AUTH,
            userId: data.user.id
          });
        }
      } catch (profileErr) {
        edgeLogger.warn('Error creating placeholder profile', {
          category: LOG_CATEGORIES.AUTH,
          error: profileErr instanceof Error ? profileErr.message : String(profileErr),
          userId: data.user.id
        });
        // Don't fail the request, just log the warning
      }

      // Return success response with the user data
      return successResponse({
        message: 'User invitation email sent successfully',
        user: data.user
      });
    } catch (error) {
      edgeLogger.error('Exception during user invitation', {
        category: LOG_CATEGORIES.AUTH,
        error: error instanceof Error ? error.message : String(error),
        email: email
      });

      return errorResponse(
        'Exception during user invitation',
        error instanceof Error ? error.message : String(error),
        500
      );
    }
  } catch (error) {
    edgeLogger.error('Error in invite user API', {
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