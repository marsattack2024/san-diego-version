import { cookies } from 'next/headers';
// import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'; // REMOVE
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
  edgeLogger.debug('Checking admin status for user', { category: LOG_CATEGORIES.AUTH, userId });
  try {
    const { data, error } = await supabase.rpc('is_admin', { uid: userId });
    if (error) {
      edgeLogger.error('Error checking admin status via RPC', { category: LOG_CATEGORIES.AUTH, error: error.message, userId });
      return false;
    }
    return !!data;
  } catch (err) {
    edgeLogger.error('Exception checking admin status', { category: LOG_CATEGORIES.AUTH, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

// POST /api/admin/users/invite - Invite a new user
export async function POST(request: Request): Promise<Response> {
  const operationId = `admin_invite_${Math.random().toString(36).substring(2, 8)}`;

  try {
    // Use standard client for checking the *requester's* auth/admin status
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user) {
      const errRes = unauthorizedError('Authentication required');
      return handleCors(errRes, request, true); // Wrap with CORS
    }

    const isAdminCaller = await isAdmin(supabase, user.id);
    if (!isAdminCaller) {
      const errRes = errorResponse('Forbidden - You do not have admin privileges', null, 403);
      return handleCors(errRes, request, true); // Wrap with CORS
    }

    // Parse body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      const errRes = validationError('Invalid JSON body');
      return handleCors(errRes, request, true); // Wrap with CORS
    }
    const { email } = body;

    if (!email) {
      const errRes = errorResponse('Email is required', null, 400);
      return handleCors(errRes, request, true); // Wrap with CORS
    }

    edgeLogger.info('Attempting to invite user', {
      category: LOG_CATEGORIES.AUTH,
      adminId: user.id,
      email: email
    });

    // --- Use Admin Client for invite and profile creation --- 
    edgeLogger.debug('Using Admin Client for user invitation', { operationId, targetEmail: email });
    const supabaseAdmin = await createRouteHandlerAdminClient();

    // Invite the user using the admin API
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);

    if (inviteError) {
      if (inviteError.message?.includes('already been registered') || inviteError.message?.includes('already exists')) {
        edgeLogger.info('User already exists', {
          category: LOG_CATEGORIES.AUTH,
          email: email
        });
        const response = successResponse({ message: 'User with this email already exists', status: 'exists' });
        return handleCors(response, request, true); // Wrap with CORS
      }
      edgeLogger.error('Error inviting user', {
        category: LOG_CATEGORIES.AUTH,
        error: inviteError.message,
        email: email
      });
      const errRes = errorResponse(inviteError.message, null, 500);
      return handleCors(errRes, request, true); // Wrap with CORS
    }

    if (!inviteData?.user) {
      const errRes = errorResponse('Invitation succeeded but no user data returned', null, 500);
      return handleCors(errRes, request, true); // Wrap with CORS
    }

    edgeLogger.info('User invited successfully', {
      category: LOG_CATEGORIES.AUTH,
      userId: inviteData.user.id,
      email: email
    });

    // Create placeholder profile using admin client
    try {
      const emailName = email.split('@')[0];
      const userName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
      const { error: profileError } = await supabaseAdmin
        .from('sd_user_profiles')
        .insert({ user_id: inviteData.user.id, full_name: userName, company_name: 'Pending Setup', company_description: 'Pending profile completion', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

      if (profileError) {
        edgeLogger.warn('Created user but failed to create profile', {
          category: LOG_CATEGORIES.AUTH,
          error: profileError,
          userId: inviteData.user.id
        });
      } else {
        edgeLogger.info('Created placeholder profile for invited user', {
          category: LOG_CATEGORIES.AUTH,
          userId: inviteData.user.id
        });
      }
    } catch (profileErr) {
      edgeLogger.warn('Exception creating placeholder profile', {
        category: LOG_CATEGORIES.AUTH,
        error: profileErr instanceof Error ? profileErr.message : String(profileErr),
        userId: inviteData.user.id
      });
    }

    // Return success response with the user data
    const response = successResponse({ message: 'User invitation email sent successfully', user: inviteData.user });
    return handleCors(response, request, true); // Wrap with CORS
  } catch (error) {
    edgeLogger.error('Error in invite user API', {
      category: LOG_CATEGORIES.AUTH,
      error: error instanceof Error ? error.message : String(error)
    });
    const errRes = errorResponse('Internal Server Error', error instanceof Error ? error.message : String(error), 500);
    return handleCors(errRes, request, true); // Wrap with CORS
  }
}