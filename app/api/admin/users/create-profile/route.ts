import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'edge';

// Helper to check if a user is an admin
async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  edgeLogger.debug('Checking admin status for user', {
    category: LOG_CATEGORIES.AUTH,
    userId
  });

  // Hard-code known admin users for now as a fallback
  const knownAdminIds = ['5c80df74-1e2b-4435-89eb-b61b740120e9'];

  try {
    // Use the RPC function that checks sd_user_roles
    const { data, error } = await supabase.rpc('is_admin', { uid: userId });

    if (error) {
      edgeLogger.error('Error checking admin status', {
        category: LOG_CATEGORIES.AUTH,
        error: error.message,
        userId
      });
      // Fall back to hard-coded admin check
      return knownAdminIds.includes(userId);
    }

    edgeLogger.debug('Admin role check result', {
      category: LOG_CATEGORIES.AUTH,
      result: data
    });
    return !!data;
  } catch (err) {
    edgeLogger.error('Exception checking admin status', {
      category: LOG_CATEGORIES.AUTH,
      error: err instanceof Error ? err.message : String(err)
    });
    // Fall back to hard-coded admin check
    return knownAdminIds.includes(userId);
  }
}

// POST /api/admin/users/create-profile - Create a profile for an existing auth user
export async function POST(request: Request): Promise<Response> {
  // Get cookies with proper handler
  const cookieStore = await cookies();

  // Try to use service role key if available
  const apiKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    apiKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );

  // Verify the requester is authenticated and an admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return unauthorizedError('Authentication required');
  }

  // Check if requester is an admin
  const admin = await isAdmin(supabase, user.id);
  if (!admin) {
    return errorResponse('Forbidden - You do not have admin privileges', null, 403);
  }

  try {
    // Get the user_id from request body
    const body = await request.json();
    const { user_id } = body;

    if (!user_id) {
      return errorResponse('User ID is required', null, 400);
    }

    edgeLogger.info('Creating profile for user', {
      category: LOG_CATEGORIES.AUTH,
      adminId: user.id,
      targetUserId: user_id
    });

    // Get user details from auth
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(user_id);

    if (userError || !userData?.user) {
      edgeLogger.error('Error getting auth user', {
        category: LOG_CATEGORIES.AUTH,
        error: userError ? userError.message : 'No user data found',
        targetUserId: user_id
      });
      return errorResponse(
        'User not found',
        userError ? userError.message : 'No user data found',
        404
      );
    }

    // Extract name and email from auth user
    const email = userData.user.email || '';
    const name = userData.user.user_metadata?.name || email.split('@')[0] || 'Unknown';

    // Check if profile already exists
    const { data: existingProfile } = await supabase
      .from('sd_user_profiles')
      .select('user_id')
      .eq('user_id', user_id)
      .single();

    if (existingProfile) {
      edgeLogger.info('Profile already exists for user', {
        category: LOG_CATEGORIES.AUTH,
        targetUserId: user_id
      });

      return successResponse({
        message: 'Profile already exists for this user',
        user_id: user_id
      });
    }

    // Create placeholder profile
    const { data: profile, error: profileError } = await supabase
      .from('sd_user_profiles')
      .insert([{
        user_id: user_id,
        full_name: name,
        company_name: 'Pending Setup',
        company_description: 'Pending profile completion',
        location: '',
        website_url: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select();

    if (profileError) {
      edgeLogger.error('Error creating profile', {
        category: LOG_CATEGORIES.AUTH,
        error: profileError,
        targetUserId: user_id
      });
      return errorResponse('Failed to create profile', profileError, 500);
    }

    edgeLogger.info('Profile created successfully', {
      category: LOG_CATEGORIES.AUTH,
      targetUserId: user_id
    });

    return successResponse({
      message: 'Profile created successfully',
      profile: profile[0]
    });
  } catch (error) {
    edgeLogger.error('Error in profile creation', {
      category: LOG_CATEGORIES.AUTH,
      error: error instanceof Error ? error.message : String(error)
    });
    return errorResponse('Internal Server Error', error instanceof Error ? error.message : String(error), 500);
  }
}