import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { logger } from '@/lib/logger';
import { generateWebsiteSummary } from '@/lib/agents/tools/website-summarizer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Maximum allowed duration for Hobby plan (60 seconds)

// Safety timeout - slightly less than maxDuration to ensure we return a response
const SAFETY_TIMEOUT_MS = 55000; // 55 seconds

/**
 * Endpoint to generate and update a user's profile website summary
 */
export async function POST(request: Request) {
  const startTime = Date.now();
  const operation = 'update_website_summary';
  
  // Create a timeout promise that resolves after SAFETY_TIMEOUT_MS
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        timeoutReached: true,
        message: 'Processing is taking longer than expected. Please try again later.'
      });
    }, SAFETY_TIMEOUT_MS);
  });
  
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
    const supabase = await createClient();
    
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
    
    // Generate the summary and update the profile with timeout safety
    try {
      logger.info('Starting website summary generation', {
        userId,
        urlDomain: new URL(url).hostname,
        operation
      });
      
      // Create the processing promise
      const processingPromise = async () => {
        // Generate the summary
        const summary = await generateWebsiteSummary(url, 1000, userId);
        
        if (!summary) {
          logger.error('Failed to generate website summary', {
            userId,
            url,
            operation
          });
          return {
            success: false,
            message: 'Failed to generate website summary'
          };
        }
        
        logger.info('Website summary generated successfully', {
          userId,
          summaryLength: summary.length,
          operation
        });
        
        // Get a fresh Supabase client for the update
        const updateSupabase = await createClient();
        
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
          return {
            success: false,
            message: 'Error updating profile with website summary'
          };
        }
        
        logger.info('Profile updated with website summary', {
          userId,
          processingTimeMs: Date.now() - startTime,
          operation
        });
        
        return {
          success: true,
          message: 'Website summary generated and saved',
          summary
        };
      };
      
      // Race the processing promise against the timeout
      const result = await Promise.race([processingPromise(), timeoutPromise]) as any;
      
      // Check if timeout was reached
      if (result.timeoutReached) {
        logger.warn('Website summary generation timed out', {
          userId,
          url,
          timeoutMs: SAFETY_TIMEOUT_MS,
          operation
        });
        
        return NextResponse.json({
          success: false,
          message: result.message,
          timedOut: true
        }, { status: 408 }); // 408 Request Timeout
      }
      
      // Return the result from processing
      return NextResponse.json(result, { 
        status: result.success ? 200 : 500 
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