import { cookies } from 'next/headers';
// import { createServerClient } from '@supabase/ssr'; // REMOVE
import { createRouteHandlerClient, createRouteHandlerAdminClient } from '@/lib/supabase/route-client'; // ADD/Ensure both
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, unauthorizedError, validationError } from '@/lib/utils/route-handler'; // Ensure validationError
import { handleCors } from '@/lib/utils/http-utils'; // ADD
import { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'edge';
export const dynamic = 'force-dynamic'; // ADD

// Helper to check if a user is an admin
async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  // Replace console logs with edgeLogger
  edgeLogger.debug('Checking admin status for user', { category: LOG_CATEGORIES.AUTH, userId });
  const knownAdminIds = ['5c80df74-1e2b-4435-89eb-b61b740120e9'];
  try {
    const { data, error } = await supabase.rpc('is_admin', { uid: userId });
    if (error) {
      edgeLogger.error('Error checking admin status via RPC', { category: LOG_CATEGORIES.AUTH, error: error.message, userId });
      return knownAdminIds.includes(userId);
    }
    edgeLogger.debug('Admin role check result', { category: LOG_CATEGORIES.AUTH, result: data });
    return !!data;
  } catch (err) {
    edgeLogger.error('Exception checking admin status', { category: LOG_CATEGORIES.AUTH, error: err instanceof Error ? err.message : String(err) });
    return knownAdminIds.includes(userId);
  }
}

// POST /api/admin/users/create-profile - Create a profile for an existing auth user
export async function POST(request: Request): Promise<Response> {
  const operationId = `admin_create_profile_${Math.random().toString(36).substring(2, 8)}`;
  let targetUserId = 'unknown'; // For logging

  try {
    // Use standard client for checking the *requester's* auth/admin status
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user) {
      const errRes = unauthorizedError('Authentication required');
      return handleCors(errRes, request, true); // Wrap with CORS
    }

    const isAdminRequester = await isAdmin(supabase, user.id);
    if (!isAdminRequester) {
      const errRes = errorResponse('Forbidden - You do not have admin privileges', null, 403);
      return handleCors(errRes, request, true); // Wrap with CORS
    }

    // Get the user_id from request body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      const errRes = validationError('Invalid JSON body');
      return handleCors(errRes, request, true); // Wrap with CORS
    }
    const { user_id } = body;
    targetUserId = user_id; // Assign for logging

    if (!user_id) {
      const errRes = validationError('User ID is required in request body');
      return handleCors(errRes, request, true); // Wrap with CORS
    }

    edgeLogger.info('Admin creating profile for user', {
      category: LOG_CATEGORIES.AUTH,
      operationId,
      adminId: user.id,
      targetUserId: targetUserId
    });

    // --- Use Admin Client for target user operations --- 
    const supabaseAdmin = await createRouteHandlerAdminClient();

    // Get target user details from auth
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(user_id);

    if (userError || !userData?.user) {
      // ... (logging)
      const errRes = errorResponse('Target user not found in auth', userError ? userError.message : 'No user data found', 404);
      return handleCors(errRes, request, true); // Wrap with CORS
    }

    // Extract name and email from auth user
    const email = userData.user.email || '';
    const name = userData.user.user_metadata?.name || email.split('@')[0] || 'Unknown';

    // Check if profile already exists using admin client
    const { data: existingProfile, error: checkError } = await supabaseAdmin
      .from('sd_user_profiles')
      .select('user_id')
      .eq('user_id', user_id)
      .maybeSingle(); // Use maybeSingle to not error if not found

    if (checkError) {
      edgeLogger.error('Error checking for existing profile', { operationId, targetUserId, error: checkError.message });
      const errRes = errorResponse('Database error checking profile', checkError, 500);
      return handleCors(errRes, request, true); // Wrap with CORS
    }

    if (existingProfile) {
      // ... (logging)
      const response = successResponse({ message: 'Profile already exists for this user', user_id: user_id });
      return handleCors(response, request, true); // Wrap with CORS
    }

    // Create placeholder profile using admin client
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('sd_user_profiles')
      .insert([{
        user_id: user_id,
        full_name: name,
        company_name: 'Pending Setup',
        company_description: 'Pending profile completion',
        // ... other fields ...
      }])
      .select()
      .single(); // Expect one row back

    if (profileError) {
      // ... (logging)
      const errRes = errorResponse('Failed to create profile', profileError, 500);
      return handleCors(errRes, request, true); // Wrap with CORS
    }

    if (!profile) {
      const errRes = errorResponse('Profile data null after insert', null, 500);
      return handleCors(errRes, request, true); // Wrap with CORS
    }

    // ... (logging success)

    const response = successResponse({ message: 'Profile created successfully', profile });
    return handleCors(response, request, true); // Wrap with CORS

  } catch (error) {
    // ... (logging)
    // Determine if it was a JSON parsing error already handled or other
    if (error instanceof SyntaxError) {
      const errRes = validationError('Invalid JSON body', error.message);
      return handleCors(errRes, request, true);
    }
    const errRes = errorResponse('Internal Server Error', error instanceof Error ? error.message : String(error), 500);
    return handleCors(errRes, request, true); // Wrap with CORS
  }
}