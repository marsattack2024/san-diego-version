import { cookies } from 'next/headers';
import { createRouteHandlerClient, createRouteHandlerAdminClient } from '@/lib/supabase/route-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, unauthorizedError, validationError } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';
import { SupabaseClient } from '@supabase/supabase-js';
import type { RouteParams, IdParam } from '@/lib/types/route-handlers';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Helper to check if a user is an admin with comprehensive checks
async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  edgeLogger.debug('Checking admin status for user', {
    category: LOG_CATEGORIES.AUTH,
    userId
  });

  try {
    // Method 1: Use the RPC function that checks sd_user_roles
    const { data: rpcData, error: rpcError } = await supabase.rpc('is_admin', { uid: userId });

    if (rpcError) {
      edgeLogger.error('Error checking admin via RPC', {
        category: LOG_CATEGORIES.AUTH,
        error: rpcError.message
      });
    } else if (rpcData) {
      edgeLogger.debug('User is admin via RPC check', {
        category: LOG_CATEGORIES.AUTH
      });
      return true;
    }

    // Method 2: Check directly in the profiles table
    const { data: profileData, error: profileError } = await supabase
      .from('sd_user_profiles')
      .select('is_admin')
      .eq('user_id', userId)
      .single();

    if (profileError) {
      edgeLogger.error('Error checking admin via profile', {
        category: LOG_CATEGORIES.AUTH,
        error: profileError.message
      });
    } else if (profileData?.is_admin === true) {
      edgeLogger.debug('User is admin via profile flag', {
        category: LOG_CATEGORIES.AUTH
      });
      return true;
    }

    // Method 3: Check directly in the roles table
    const { data: roleData, error: roleError } = await supabase
      .from('sd_user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError) {
      edgeLogger.error('Error checking admin via roles', {
        category: LOG_CATEGORIES.AUTH,
        error: roleError.message
      });
    } else if (roleData) {
      edgeLogger.debug('User is admin via roles table', {
        category: LOG_CATEGORIES.AUTH
      });
      return true;
    }

    edgeLogger.debug('User is not admin by any verification method', {
      category: LOG_CATEGORIES.AUTH
    });
    return false;
  } catch (err) {
    edgeLogger.error('Exception checking admin status', {
      category: LOG_CATEGORIES.AUTH,
      error: err instanceof Error ? err.message : String(err)
    });
    return false;
  }
}

// DELETE /api/admin/users/[userId] - Delete a user
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
): Promise<Response> {
  const operationId = `admin_delete_user_${Math.random().toString(36).substring(2, 8)}`;
  let targetUserIdToDelete = ''; // Initialize for logging

  try {
    // Await params early
    const resolvedParams = await params;
    targetUserIdToDelete = resolvedParams.userId;

    if (!targetUserIdToDelete) {
      const errRes = validationError('User ID parameter is required');
      return handleCors(errRes, request, true); // Wrap with CORS
    }

    edgeLogger.info('Attempting user deletion', { operationId, targetUserId: targetUserIdToDelete });

    // Use standard client for initial auth check of the CALLING user
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      edgeLogger.error('Authentication error during user deletion', {
        category: LOG_CATEGORIES.AUTH,
        error: authError?.message
      });
      const errRes = unauthorizedError('Authentication required');
      return handleCors(errRes, request, true); // Wrap with CORS
    }

    // Check if the CALLING user is an admin
    const isAdminCaller = await isAdmin(supabase, user.id);
    if (!isAdminCaller) {
      edgeLogger.warn('Non-admin user attempted to delete a user', {
        category: LOG_CATEGORIES.AUTH,
        userId: user.id
      });
      const errRes = errorResponse('Forbidden - Admin privileges required', null, 403);
      return handleCors(errRes, request, true); // Wrap with CORS
    }

    // Prevent self-deletion
    if (targetUserIdToDelete === user.id) {
      edgeLogger.warn('Admin attempted to delete own account', {
        category: LOG_CATEGORIES.AUTH,
        userId: user.id
      });
      const errRes = errorResponse('You cannot delete your own account', null, 400);
      return handleCors(errRes, request, true); // Wrap with CORS
    }

    // --- Use ADMIN CLIENT for the actual deletion operations --- 
    edgeLogger.debug('Using Admin Client for user deletion operations', { operationId, targetUserId: targetUserIdToDelete });
    const supabaseAdmin = await createRouteHandlerAdminClient();

    // Use complete_user_deletion RPC for reliable deletion
    edgeLogger.debug('Attempting deletion via complete_user_deletion RPC', { operationId, targetUserId: targetUserIdToDelete });
    const { data: deleteResult, error: deleteError } = await supabaseAdmin
      .rpc('complete_user_deletion', { user_id_param: targetUserIdToDelete });

    if (deleteError) {
      edgeLogger.error('Error calling complete_user_deletion RPC', {
        operationId,
        targetUserId: targetUserIdToDelete,
        error: deleteError.message || deleteError
      });
      // Attempt fallback deletion methods ONLY if RPC failed

      // Fallback 1: Try deleting associated data via admin client
      try {
        edgeLogger.warn('RPC failed, attempting manual data deletion as fallback', { operationId, targetUserId: targetUserIdToDelete });
        await supabaseAdmin.from('sd_user_roles').delete().eq('user_id', targetUserIdToDelete);
        await supabaseAdmin.from('sd_user_profiles').delete().eq('user_id', targetUserIdToDelete);
        await supabaseAdmin.from('sd_chat_histories').delete().eq('user_id', targetUserIdToDelete);
        await supabaseAdmin.from('sd_chat_sessions').delete().eq('user_id', targetUserIdToDelete);
        edgeLogger.info('Manual data deletion fallback successful', { operationId, targetUserId: targetUserIdToDelete });
      } catch (manualDeleteError) {
        edgeLogger.error('Manual data deletion fallback FAILED', {
          operationId,
          targetUserId: targetUserIdToDelete,
          error: manualDeleteError instanceof Error ? manualDeleteError.message : String(manualDeleteError)
        });
        // Proceed to delete auth user anyway if possible
      }

      // Fallback 2: Try deleting auth user directly via admin client
      edgeLogger.warn('Attempting direct auth user deletion via Admin API as final fallback', { operationId, targetUserId: targetUserIdToDelete });
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserIdToDelete);

      if (authDeleteError) {
        edgeLogger.error('FINAL DELETION ATTEMPT FAILED (Auth API)', {
          operationId,
          targetUserId: targetUserIdToDelete,
          rpcError: deleteError.message || deleteError,
          authDeleteError: authDeleteError.message || authDeleteError,
          important: true
        });
        const errRes = errorResponse('Failed to completely delete user', { rpcError: deleteError, authError: authDeleteError }, 500);
        return handleCors(errRes, request, true); // Wrap with CORS
      }
      edgeLogger.info('Auth user deleted via Admin API fallback', { operationId, targetUserId: targetUserIdToDelete });
      // If auth user deleted after RPC failed, report success
      const response = successResponse({ message: 'User deleted successfully (via fallback)' });
      return handleCors(response, request, true); // Wrap with CORS
    }

    // RPC succeeded
    edgeLogger.info('Successfully deleted user via complete_user_deletion RPC', {
      operationId,
      targetUserId: targetUserIdToDelete,
      result: deleteResult
    });
    const response = successResponse({ message: 'User deleted successfully' });
    return handleCors(response, request, true); // Wrap with CORS

  } catch (error) {
    edgeLogger.error('Error in delete user API', {
      category: LOG_CATEGORIES.AUTH,
      error: error instanceof Error ? error.message : String(error)
    });
    const errRes = errorResponse('Internal Server Error', error, 500);
    return handleCors(errRes, request, true); // Wrap with CORS
  }
}