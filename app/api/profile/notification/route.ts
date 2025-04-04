import { type NextRequest } from 'next/server';
import { type User } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse, validationError } from '@/lib/utils/route-handler';
import { withAuth, type AuthenticatedRouteHandler } from '@/lib/auth/with-auth';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

export const runtime = 'edge';

/**
 * Endpoint to send client-side notifications for long-running processes
 * This is designed to notify users when async processes like website summarization complete
 * Requires authentication.
 */
const POST_Handler: AuthenticatedRouteHandler = async (request, context, user) => {
  const operation = 'profile_notification';

  try {
    // Get request data
    const { type, message } = await request.json();

    // User ID is available from the withAuth wrapper
    const userId = user.id;

    if (!type || !message) {
      return validationError('Type and message are required');
    }

    // Validate notification type
    const validTypes = ['success', 'error', 'info', 'warning'];
    if (!validTypes.includes(type)) {
      return validationError('Invalid notification type');
    }

    edgeLogger.info('Sending user notification', {
      category: LOG_CATEGORIES.SYSTEM,
      userId: userId.substring(0, 8) + '...',
      type,
      operation
    });

    // Future implementation: Store notifications in database here
    const supabase = await createRouteHandlerClient();

    return successResponse({
      success: true,
      message: 'Notification sent successfully'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    edgeLogger.error('Unexpected error in notification API', {
      category: LOG_CATEGORIES.SYSTEM,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      operation
    });

    return errorResponse(
      'Internal server error',
      errorMessage,
      500
    );
  }
};

// Apply withAuth wrapper
export const POST = withAuth(POST_Handler);