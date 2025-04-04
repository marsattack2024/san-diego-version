/**
 * Profile Notification API Route
 * 
 * Handles user notification preferences (Pattern B - Direct Export)
 */

// import { withAuth, type AuthenticatedRouteHandler } from '@/lib/auth/with-auth'; // Remove Pattern A import
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse, validationError, unauthorizedError } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { z } from 'zod'; // Keep for validation
import { LOG_CATEGORIES } from '@/lib/logger/constants'; // Import if needed for logging
import type { User } from '@supabase/supabase-js'; // Keep for manual auth check

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Zod schema for validating the request body
const NotificationPrefsSchema = z.object({
  receive_email_notifications: z.boolean()
});

// Removed AuthenticatedRouteHandler type
export async function POST(request: Request): Promise<Response> { // Direct export
  const operationId = `profile_notif_${Math.random().toString(36).substring(2, 10)}`;

  try {
    // Manual Auth Check
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      edgeLogger.warn('Authentication required for profile notification update', {
        category: LOG_CATEGORIES.AUTH,
        operationId,
        error: authError?.message
      });
      const errRes = unauthorizedError('Authentication required');
      return handleCors(errRes, request, true);
    }
    const userId = user.id;

    // Validate request body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      const errRes = validationError('Invalid JSON body');
      return handleCors(errRes, request, true);
    }

    const validationResult = NotificationPrefsSchema.safeParse(body);
    if (!validationResult.success) {
      const errRes = validationError('Invalid request body', validationResult.error.format());
      return handleCors(errRes, request, true);
    }
    const { receive_email_notifications } = validationResult.data;

    edgeLogger.info('Updating notification preferences', {
      category: LOG_CATEGORIES.SYSTEM,
      operationId,
      userId: userId.substring(0, 8),
      newValue: receive_email_notifications
    });

    // Update the user's profile in the database (RLS enforced)
    const { data, error: updateError } = await supabase
      .from('sd_user_profiles') // Assuming table name
      .update({ receive_email_notifications })
      .eq('user_id', userId)
      .select('receive_email_notifications') // Select the updated field to confirm
      .single();

    if (updateError) {
      edgeLogger.error('Error updating notification preferences', {
        category: LOG_CATEGORIES.DB,
        operationId,
        userId: userId.substring(0, 8),
        error: updateError.message
      });
      const errRes = errorResponse('Failed to update notification preferences', updateError);
      return handleCors(errRes, request, true);
    }

    if (!data) { // Should be caught by .single(), but safety check
      edgeLogger.error('Profile not found after update attempt', { operationId, userId: userId.substring(0, 8) });
      const errRes = errorResponse('Profile not found or update failed', null, 404); // Or 500
      return handleCors(errRes, request, true);
    }

    edgeLogger.info('Successfully updated notification preferences', {
      category: LOG_CATEGORIES.SYSTEM,
      operationId,
      userId: userId.substring(0, 8),
      updatedValue: data.receive_email_notifications
    });

    const response = successResponse({ receive_email_notifications: data.receive_email_notifications });
    return handleCors(response, request, true);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    edgeLogger.error('Unexpected error updating notification preferences', {
      category: LOG_CATEGORIES.SYSTEM,
      operationId,
      error: errorMsg,
      important: true
    });
    const errRes = errorResponse('Unexpected error updating preferences', error, 500);
    return handleCors(errRes, request, true);
  }
}

// Removed export const POST = withAuth(POST_Handler);