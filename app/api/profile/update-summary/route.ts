import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

/**
 * Endpoint to directly update a user's profile website summary
 * This uses admin permissions to bypass any RLS issues
 */
export async function POST(request: Request) {
  const startTime = Date.now();
  const operation = 'update_website_summary';
  
  try {
    // Get request data
    const { userId, summary } = await request.json();
    
    if (!userId || !summary) {
      return NextResponse.json(
        { error: 'User ID and summary are required' },
        { status: 400 }
      );
    }
    
    logger.info('Received direct summary update request', {
      userId,
      summaryLength: summary.length,
      operation
    });
    
    // Create Supabase client with service role for admin access
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Verify user exists
    const { data: user, error: userError } = await supabase
      .from('sd_user_profiles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
      
    if (userError) {
      logger.error('Error checking user profile', {
        userId,
        error: userError.message,
        operation
      });
      
      return NextResponse.json(
        { error: 'Error checking user profile', details: userError.message },
        { status: 500 }
      );
    }
    
    if (!user) {
      logger.warn('User profile not found', { userId, operation });
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }
    
    // Attempt the update with admin privileges
    const { data, error } = await supabase
      .from('sd_user_profiles')
      .update({
        website_summary: summary,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select('updated_at');
      
    if (error) {
      logger.error('Error updating website summary', {
        userId,
        error: error.message,
        operation
      });
      
      return NextResponse.json(
        { error: 'Failed to update summary', details: error.message },
        { status: 500 }
      );
    }
    
    // Verify the update worked
    const { data: verifyData, error: verifyError } = await supabase
      .from('sd_user_profiles')
      .select('website_summary')
      .eq('user_id', userId)
      .single();
      
    const updateSuccessful = verifyData?.website_summary === summary;
    
    logger.info('Summary update completed', {
      userId,
      updateSuccessful,
      processingTimeMs: Date.now() - startTime,
      operation
    });
    
    return NextResponse.json({
      success: true,
      updatedAt: data?.[0]?.updated_at,
      summaryLength: summary.length,
      verificationSuccessful: updateSuccessful
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error('Unexpected error in summary update API', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      operation
    });
    
    return NextResponse.json(
      { error: 'Internal server error', details: errorMessage },
      { status: 500 }
    );
  }
}