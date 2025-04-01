import { cookies } from 'next/headers';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import { SupabaseClient } from '@supabase/supabase-js';
import type { RouteParams, IdParam } from '@/lib/types/route-handlers';

export const runtime = 'edge';

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
        error: rpcError
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
        error: profileError
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
        error: roleError
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
  // Access userId from params with await
  const { userId } = await params;

  if (!userId) {
    return errorResponse('User ID is required', null, 400);
  }

  edgeLogger.info('Deleting user', {
    category: LOG_CATEGORIES.AUTH,
    targetUserId: userId
  });

  // Use await with cookies to satisfy Next.js warning
  const cookieStore = await cookies();

  // Try to use service role key if available
  const apiKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  edgeLogger.debug('Using service key for user deletion', {
    category: LOG_CATEGORIES.AUTH,
    hasServiceKey: !!process.env.SUPABASE_KEY
  });

  const supabase = createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    apiKey,
    {
      cookies: {
        async getAll() {
          return await cookieStore.getAll();
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
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    edgeLogger.error('Authentication error during user deletion', {
      category: LOG_CATEGORIES.AUTH,
      error: userError.message
    });
    return unauthorizedError('Authentication error');
  }

  const user = userData.user;
  if (!user) {
    edgeLogger.warn('No authenticated user found during deletion attempt', {
      category: LOG_CATEGORIES.AUTH
    });
    return unauthorizedError('Not authenticated');
  }

  edgeLogger.debug('Authenticated as user for deletion operation', {
    category: LOG_CATEGORIES.AUTH,
    userId: user.id
  });

  // Check if user is an admin
  const admin = await isAdmin(supabase, user.id);
  if (!admin) {
    edgeLogger.warn('Non-admin user attempted to delete a user', {
      category: LOG_CATEGORIES.AUTH,
      userId: user.id
    });
    return errorResponse('Forbidden - You do not have admin privileges', null, 403);
  }

  edgeLogger.info('Admin user confirmed for deletion operation', {
    category: LOG_CATEGORIES.AUTH,
    adminId: user.id
  });

  try {
    // Don't allow deleting your own account
    if (userId === user.id) {
      edgeLogger.warn('Admin attempted to delete own account', {
        category: LOG_CATEGORIES.AUTH,
        userId: user.id
      });
      return errorResponse('You cannot delete your own account', null, 400);
    }

    edgeLogger.debug('Checking if target user exists', {
      category: LOG_CATEGORIES.AUTH,
      targetUserId: userId
    });

    // First check the existence through the profiles table (doesn't require admin privileges)
    const { data: profileExists, error: profileError } = await supabase
      .from('sd_user_profiles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError) {
      edgeLogger.error('Error checking profile existence', {
        category: LOG_CATEGORIES.AUTH,
        error: profileError,
        targetUserId: userId
      });
    } else if (profileExists) {
      edgeLogger.debug('Found existing profile for user', {
        category: LOG_CATEGORIES.AUTH,
        targetUserId: userId
      });
    } else {
      edgeLogger.warn('No profile found for user, may not exist', {
        category: LOG_CATEGORIES.AUTH,
        targetUserId: userId
      });
    }

    // Try checking user existence through admin API as a fallback
    try {
      edgeLogger.debug('Checking user existence via admin API', {
        category: LOG_CATEGORIES.AUTH,
        targetUserId: userId
      });

      const { data: userExists, error: userExistsError } = await supabase.auth.admin.getUserById(userId);

      if (userExistsError) {
        edgeLogger.error('Error checking user via admin API', {
          category: LOG_CATEGORIES.AUTH,
          error: userExistsError,
          targetUserId: userId
        });

        // If both profile check and admin API failed, but we know the user should exist,
        // let's proceed anyway since deleteUser will fail for non-existent users
        if (!profileExists) {
          edgeLogger.error('Both profile check and admin API failed', {
            category: LOG_CATEGORIES.AUTH,
            targetUserId: userId
          });
          return errorResponse('Failed to verify user exists', null, 500);
        }
      } else if (!userExists?.user) {
        edgeLogger.warn('User not found in auth.users table', {
          category: LOG_CATEGORIES.AUTH,
          targetUserId: userId
        });
        return errorResponse('User not found', null, 404);
      } else {
        edgeLogger.debug('Found user in auth.users', {
          category: LOG_CATEGORIES.AUTH,
          targetUserId: userId,
          email: userExists.user.email
        });
      }
    } catch (adminError) {
      edgeLogger.error('Exception checking user existence', {
        category: LOG_CATEGORIES.AUTH,
        error: adminError instanceof Error ? adminError.message : String(adminError),
        targetUserId: userId
      });

      // If admin API throws but profile exists, we'll proceed with deletion
      if (!profileExists) {
        return errorResponse('Failed to verify user exists', null, 500);
      }
    }

    // First, verify if ON DELETE CASCADE is working properly by checking if any tables 
    // don't have the proper constraints

    // Check sd_user_roles (should cascade from auth.users)
    const { data: userRoles } = await supabase
      .from('sd_user_roles')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (userRoles && userRoles.length > 0) {
      edgeLogger.debug('User has role assignments that will be deleted', {
        category: LOG_CATEGORIES.AUTH,
        targetUserId: userId
      });
    }

    // Check if user has chat sessions
    const { data: chatSessions } = await supabase
      .from('sd_chat_sessions')
      .select('id')
      .eq('user_id', userId)
      .limit(5);

    if (chatSessions && chatSessions.length > 0) {
      edgeLogger.debug('User has chat sessions that will be deleted', {
        category: LOG_CATEGORIES.AUTH,
        targetUserId: userId,
        sessionCount: chatSessions.length
      });
    }

    edgeLogger.info('Beginning deletion process for user', {
      category: LOG_CATEGORIES.AUTH,
      targetUserId: userId
    });

    // Try to use the safe_delete_user function first
    try {
      edgeLogger.debug('Using safe_delete_user function', {
        category: LOG_CATEGORIES.AUTH,
        targetUserId: userId
      });

      // Call the safe_delete_user function that handles all deletions in one transaction
      const { data: safeDeleteResult, error: safeDeleteError } = await supabase
        .rpc('safe_delete_user', { user_id_param: userId });

      if (safeDeleteError) {
        edgeLogger.error('Error using safe_delete_user', {
          category: LOG_CATEGORIES.AUTH,
          error: safeDeleteError,
          targetUserId: userId
        });

        // Fall back to deleting the data manually
        edgeLogger.debug('Falling back to manual deletion', {
          category: LOG_CATEGORIES.AUTH,
          targetUserId: userId
        });

        // Delete from sd_user_roles
        const { error: rolesError } = await supabase
          .from('sd_user_roles')
          .delete()
          .eq('user_id', userId);

        if (rolesError) {
          edgeLogger.error('Error deleting roles', {
            category: LOG_CATEGORIES.AUTH,
            error: rolesError,
            targetUserId: userId
          });
        }

        // Delete from sd_user_profiles
        const { error: profilesError } = await supabase
          .from('sd_user_profiles')
          .delete()
          .eq('user_id', userId);

        if (profilesError) {
          edgeLogger.error('Error deleting profile', {
            category: LOG_CATEGORIES.AUTH,
            error: profilesError,
            targetUserId: userId
          });
        }

        // Delete from sd_chat_sessions (should cascade to histories)
        const { error: sessionsError } = await supabase
          .from('sd_chat_sessions')
          .delete()
          .eq('user_id', userId);

        if (sessionsError) {
          edgeLogger.error('Error deleting chat sessions', {
            category: LOG_CATEGORIES.AUTH,
            error: sessionsError,
            targetUserId: userId
          });
        }
      } else {
        edgeLogger.debug('safe_delete_user succeeded', {
          category: LOG_CATEGORIES.AUTH,
          targetUserId: userId,
          result: safeDeleteResult
        });
      }

      edgeLogger.info('Profile data deletion completed', {
        category: LOG_CATEGORIES.AUTH,
        targetUserId: userId
      });
    } catch (profileDeleteError) {
      edgeLogger.error('Error in profile deletion', {
        category: LOG_CATEGORIES.AUTH,
        error: profileDeleteError instanceof Error ? profileDeleteError.message : String(profileDeleteError),
        targetUserId: userId
      });
    }

    // Use the complete_user_deletion function for reliable deletion
    try {
      edgeLogger.debug('Using complete_user_deletion function for proper cleanup', {
        category: LOG_CATEGORIES.AUTH,
        targetUserId: userId
      });

      // Call the existing comprehensive user deletion function
      const { data: deleteResult, error: deleteError } = await supabase
        .rpc('complete_user_deletion', { user_id_param: userId });

      if (deleteError) {
        edgeLogger.error('Error using complete_user_deletion function', {
          category: LOG_CATEGORIES.AUTH,
          error: deleteError,
          targetUserId: userId
        });

        // Try the fallback safe_delete_user_data function that only deletes application data
        edgeLogger.debug('Falling back to safe_delete_user_data', {
          category: LOG_CATEGORIES.AUTH,
          targetUserId: userId
        });

        const { data: safeDeleteResult, error: safeDeleteError } = await supabase
          .rpc('safe_delete_user_data', { user_id_param: userId });

        if (safeDeleteError) {
          edgeLogger.error('Error using safe_delete_user_data', {
            category: LOG_CATEGORIES.AUTH,
            error: safeDeleteError,
            targetUserId: userId
          });
        } else {
          edgeLogger.debug('User data deletion successful', {
            category: LOG_CATEGORIES.AUTH,
            targetUserId: userId,
            result: safeDeleteResult
          });
        }

        // Try the Supabase Auth API as a final step
        edgeLogger.debug('Trying Supabase Auth API', {
          category: LOG_CATEGORIES.AUTH,
          targetUserId: userId
        });

        const { error: authError } = await supabase.auth.admin.deleteUser(userId);

        if (authError) {
          edgeLogger.error('Error deleting auth user', {
            category: LOG_CATEGORIES.AUTH,
            error: authError,
            targetUserId: userId
          });

          // Check error message to determine if this is a permissions issue
          const errorMessage = authError.message || '';
          if (errorMessage.includes('not allowed') || errorMessage.includes('permission') ||
            errorMessage.includes('not admin')) {
            return errorResponse(
              'Admin operation not permitted - check SUPABASE_KEY in environment variables',
              errorMessage,
              403
            );
          }

          // For other errors, we've already deleted profile data so return partial success
          return successResponse(
            {
              message: 'User profile data deleted but auth record could not be removed',
              details: errorMessage
            },
            207 // 207 Multi-Status
          );
        }

        edgeLogger.debug('Auth user deletion successful via Auth API', {
          category: LOG_CATEGORIES.AUTH,
          targetUserId: userId
        });
      } else {
        edgeLogger.debug('User deleted successfully via complete_user_deletion', {
          category: LOG_CATEGORIES.AUTH,
          targetUserId: userId,
          result: deleteResult
        });
      }
    } catch (deleteError) {
      edgeLogger.error('Exception during user deletion', {
        category: LOG_CATEGORIES.AUTH,
        error: deleteError instanceof Error ? deleteError.message : String(deleteError),
        targetUserId: userId
      });

      // Return partial success since we've already deleted profile data
      return successResponse(
        {
          message: 'User profile data deleted but auth record could not be removed',
          error: deleteError instanceof Error ? deleteError.message : String(deleteError)
        },
        207 // 207 Multi-Status
      );
    }

    // Verify that the profile was deleted
    try {
      edgeLogger.debug('Verifying deletion was successful', {
        category: LOG_CATEGORIES.AUTH,
        targetUserId: userId
      });

      const { data: profileCheck, error: profileCheckError } = await supabase
        .from('sd_user_profiles')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileCheckError) {
        edgeLogger.error('Error verifying profile deletion', {
          category: LOG_CATEGORIES.AUTH,
          error: profileCheckError,
          targetUserId: userId
        });
      } else if (profileCheck) {
        edgeLogger.warn('Profile still exists after deletion attempt', {
          category: LOG_CATEGORIES.AUTH,
          targetUserId: userId,
          profile: profileCheck
        });

        // One more attempt to remove profile
        await supabase.from('sd_user_profiles').delete().eq('user_id', userId);
      } else {
        edgeLogger.debug('Confirmed profile no longer exists', {
          category: LOG_CATEGORIES.AUTH,
          targetUserId: userId
        });
      }
    } catch (verifyError) {
      edgeLogger.error('Error verifying deletion', {
        category: LOG_CATEGORIES.AUTH,
        error: verifyError instanceof Error ? verifyError.message : String(verifyError),
        targetUserId: userId
      });
    }

    edgeLogger.info('User deletion process completed', {
      category: LOG_CATEGORIES.AUTH,
      targetUserId: userId
    });

    return successResponse({ message: 'User deleted successfully' });
  } catch (error) {
    edgeLogger.error('Error in delete user API', {
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