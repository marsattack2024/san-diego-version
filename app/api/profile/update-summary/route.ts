import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { generateWebsiteSummary } from '@/lib/agents/tools/website-summarizer';

/**
 * Endpoint to generate and update a user's profile website summary
 */
export async function POST(request: Request) {
  const startTime = Date.now();
  const operation = 'update_website_summary';
  
  try {
    // Get request data
    const { url, userId } = await request.json();
    
    if (!userId || !url) {
      return NextResponse.json(
        { error: 'User ID and URL are required' },
        { status: 400 }
      );
    }
    
    // Validate URL starts with https://
    if (!url.startsWith('https://')) {
      return NextResponse.json(
        { error: 'URL must start with https://' },
        { status: 400 }
      );
    }
    
    logger.info('Starting website summary generation and profile update', {
      userId,
      urlDomain: new URL(url).hostname,
      operation
    });
    
    // Get authenticated Supabase client
    const supabase = await createServerClient();
    
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
    
    // Generate the summary and update the profile directly in the request
    try {
      logger.info('Starting website summary generation', {
        userId,
        urlDomain: new URL(url).hostname,
        operation
      });
      
      // Generate the summary - don't do this in the background
      const summary = await generateWebsiteSummary(url, 400, userId);
      
      if (!summary) {
        logger.error('Failed to generate website summary', {
          userId,
          url,
          operation
        });
        return NextResponse.json({
          success: false,
          message: 'Failed to generate website summary'
        }, { status: 500 });
      }
      
      logger.info('Website summary generated successfully', {
        userId,
        summaryLength: summary.length,
        operation
      });
      
      // Get a fresh Supabase client for the update
      const updateSupabase = await createServerClient();
      
      // Update the profile with the generated summary
      const { error } = await updateSupabase
        .from('sd_user_profiles')
        .update({
          website_summary: summary,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);
        
      if (error) {
        logger.error('Error updating website summary in profile', {
          userId,
          error: error.message,
          operation
        });
        return NextResponse.json({
          success: false,
          message: 'Error updating profile with website summary'
        }, { status: 500 });
      }
      
      logger.info('Profile updated with website summary', {
        userId,
        processingTimeMs: Date.now() - startTime,
        operation
      });
      
      // Return success with the generated summary
      return NextResponse.json({
        success: true,
        message: 'Website summary generated and saved',
        summary
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('Error in website summary generation', {
        userId,
        url,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : 'No stack trace',
        operation
      });
      
      return NextResponse.json({
        success: false,
        message: 'Error generating website summary'
      }, { status: 500 });
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error('Unexpected error in website summary API', {
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