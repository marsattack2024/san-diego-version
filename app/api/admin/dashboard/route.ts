import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Performance thresholds for admin dashboard operations
const THRESHOLDS = {
  SLOW_OPERATION: 1500,    // 1.5 seconds
  IMPORTANT_THRESHOLD: 3000 // 3 seconds
};

// Helper to check if a user is an admin by checking the profile table directly
async function isAdmin(supabase: any, userId: string) {
  const startTime = performance.now();
  const operationId = `admin-check-${Date.now().toString(36)}`;

  edgeLogger.debug('Checking admin status', {
    category: 'auth',
    operation: 'admin_check',
    operationId,
    userId: userId.substring(0, 8) + '...' // Mask userId for privacy
  });

  try {
    // Check directly in the profile table (single source of truth)
    const { data: profileData, error: profileError } = await supabase
      .from('sd_user_profiles')
      .select('is_admin')
      .eq('user_id', userId)
      .maybeSingle();

    const durationMs = Math.round(performance.now() - startTime);
    const isSlow = durationMs > THRESHOLDS.SLOW_OPERATION;
    const isImportant = durationMs > THRESHOLDS.IMPORTANT_THRESHOLD;

    if (profileError) {
      edgeLogger.error('Error checking admin status via profile', {
        category: 'auth',
        operation: 'admin_check',
        operationId,
        error: profileError.message,
        durationMs,
        userId: userId.substring(0, 8) + '...',
        important: true
      });
      return false;
    }

    if (profileData?.is_admin) {
      edgeLogger.info('User is admin via profile check', {
        category: 'auth',
        operation: 'admin_check',
        operationId,
        durationMs,
        slow: isSlow,
        important: isImportant,
        userId: userId.substring(0, 8) + '...'
      });
      return true;
    }

    edgeLogger.info('User is not admin', {
      category: 'auth',
      operation: 'admin_check',
      operationId,
      durationMs,
      userId: userId.substring(0, 8) + '...'
    });
    return false;
  } catch (err) {
    const durationMs = Math.round(performance.now() - startTime);
    edgeLogger.error('Exception checking admin status', {
      category: 'auth',
      operation: 'admin_check',
      operationId,
      error: err instanceof Error ? err.message : String(err),
      durationMs,
      userId: userId.substring(0, 8) + '...',
      important: true
    });
    return false;
  }
}

// GET /api/admin/dashboard - Get dashboard statistics
export async function GET(request: Request): Promise<Response> {
  const requestId = `dashboard-${Date.now().toString(36)}`;
  const startTime = performance.now();

  edgeLogger.debug('Admin dashboard API request received', {
    category: 'system',
    requestId,
    path: '/api/admin/dashboard',
    method: 'GET'
  });

  edgeLogger.debug('Creating Supabase client via utility', {
    category: 'system',
    requestId
  });

  // Use the standard utility
  const supabase = await createRouteHandlerClient();

  // Verify the user is authenticated and an admin
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError) {
      const durationMs = Math.round(performance.now() - startTime);
      edgeLogger.error('Authentication error in admin dashboard', {
        category: 'auth',
        requestId,
        error: userError.message,
        durationMs,
        important: true,
        status: 401
      });
      const errRes = errorResponse('Authentication error', userError, 401);
      return handleCors(errRes, request, true);
    }

    const user = userData.user;
    if (!user) {
      const durationMs = Math.round(performance.now() - startTime);
      edgeLogger.warn('No authenticated user found for admin dashboard', {
        category: 'auth',
        requestId,
        durationMs,
        status: 401
      });
      const errRes = unauthorizedError('Authentication required');
      return handleCors(errRes, request, true);
    }

    const maskedUserId = user.id.substring(0, 8) + '...';
    edgeLogger.debug('User authenticated for admin dashboard', {
      category: 'auth',
      requestId,
      userId: maskedUserId
    });

    // Check if user is an admin
    const admin = await isAdmin(supabase, user.id);
    if (!admin) {
      const durationMs = Math.round(performance.now() - startTime);
      edgeLogger.warn('Non-admin user attempted to access dashboard', {
        category: 'auth',
        requestId,
        userId: maskedUserId,
        durationMs,
        status: 403
      });
      const errRes = errorResponse('Forbidden - Admin access required', null, 403);
      return handleCors(errRes, request, true);
    }

    edgeLogger.info('Admin access confirmed for dashboard', {
      category: 'auth',
      requestId,
      userId: maskedUserId
    });

    // Get user count
    const { count: userCount, error: userCountError } = await supabase
      .from('sd_user_profiles')
      .select('*', { count: 'exact', head: true });

    if (userCountError) {
      edgeLogger.error('Error fetching user count', {
        category: 'system',
        requestId,
        error: userCountError.message
      });
    }

    // Get chat count
    const { count: chatCount, error: chatError } = await supabase
      .from('sd_chat_sessions')
      .select('*', { count: 'exact', head: true });

    if (chatError) {
      edgeLogger.error('Error fetching chat count', {
        category: 'system',
        requestId,
        error: chatError.message
      });
    }

    // Get recent activity - Fix the query to not rely on foreign key relationships
    const { data: recentActivity, error: activityError } = await supabase
      .from('sd_chat_histories')
      .select(`
        id, session_id, role, content, created_at, user_id, tools_used, metadata, vote
      `)
      .order('created_at', { ascending: false })
      .limit(5);

    if (activityError) {
      edgeLogger.error('Error fetching recent activity', {
        category: 'system',
        requestId,
        error: activityError.message
      });
    } else if (recentActivity?.length) {
      // Fetch user information separately and join it manually
      const userIds = recentActivity.map(item => item.user_id).filter(Boolean);

      if (userIds.length) {
        // Get user profiles for the relevant users
        const { data: profiles, error: profilesError } = await supabase
          .from('sd_user_profiles')
          .select('user_id, company_name')
          .in('user_id', userIds);

        if (profilesError) {
          edgeLogger.error('Error fetching user profiles', {
            category: 'system',
            requestId,
            error: profilesError.message
          });
        } else {
          // Join the profile information to the activity data
          recentActivity.forEach((activity: any) => {
            const profile = profiles?.find(p => p.user_id === activity.user_id);
            activity.user = profile ? { id: activity.user_id, profile } : { id: activity.user_id };
          });
        }
      }
    }

    // Get admin count from profiles table (single source of truth)
    const { count: adminProfilesCount, error: adminProfilesError } = await supabase
      .from('sd_user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_admin', true);

    if (adminProfilesError) {
      edgeLogger.error('Error fetching admin profiles count', {
        category: 'system',
        requestId,
        error: adminProfilesError.message
      });
    }

    const durationMs = Math.round(performance.now() - startTime);
    const isSlow = durationMs > THRESHOLDS.SLOW_OPERATION;
    const isImportant = durationMs > THRESHOLDS.IMPORTANT_THRESHOLD;

    // Use the appropriate log level based on timing
    if (isSlow) {
      edgeLogger.warn('Admin dashboard request completed', {
        category: 'system',
        requestId,
        path: '/api/admin/dashboard',
        method: 'GET',
        durationMs,
        status: 200,
        slow: true,
        important: isImportant,
        stats: {
          userCount: userCount || 0,
          chatCount: chatCount || 0,
          adminCount: adminProfilesCount || 0,
          activityCount: recentActivity?.length || 0
        }
      });
    } else {
      edgeLogger.info('Admin dashboard request completed', {
        category: 'system',
        requestId,
        path: '/api/admin/dashboard',
        method: 'GET',
        durationMs,
        status: 200,
        slow: false,
        important: false,
        stats: {
          userCount: userCount || 0,
          chatCount: chatCount || 0,
          adminCount: adminProfilesCount || 0,
          activityCount: recentActivity?.length || 0
        }
      });
    }

    // Wrap final success response with handleCors
    const response = successResponse({
      userCount: userCount || 0,
      chatCount: chatCount || 0,
      adminCount: adminProfilesCount || 0,
      recentActivity: recentActivity || []
    });
    return handleCors(response, request, true);
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    edgeLogger.error('Error in dashboard API', {
      category: 'system',
      requestId,
      error: error instanceof Error ? error.message : String(error),
      durationMs,
      status: 500,
      important: true
    });
    const errRes = errorResponse('Internal Server Error', error, 500);
    return handleCors(errRes, request, true);
  }
}