import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { edgeLogger } from '@/lib/logger/edge-logger';

export const dynamic = 'force-dynamic';

/**
 * Simple auth status check endpoint
 * Returns 200 if authenticated, 401 if not
 * Also sets x-auth-state header for debugging
 */
export async function GET(request: NextRequest) {
  try {
    // Create Supabase server client
    const supabase = await createServerClient();
    
    // Get user session
    const { data: { user } } = await supabase.auth.getUser();
    
    // Get time for tracking response times
    const startTime = Date.now();
    
    // Set headers for all response types
    const headers = new Headers();
    headers.set('x-response-time', `${Date.now() - startTime}ms`);
    
    // If authenticated
    if (user) {
      headers.set('x-auth-state', 'authenticated');
      
      // Return success response with appropriate headers
      return new NextResponse(JSON.stringify({ 
        status: 'authenticated',
        userId: user.id
      }), {
        status: 200,
        headers
      });
    }
    
    // Not authenticated
    headers.set('x-auth-state', 'unauthenticated');
    
    // Return 401 Unauthorized
    return new NextResponse(JSON.stringify({ 
      status: 'unauthenticated' 
    }), {
      status: 401,
      headers
    });
  } catch (error: unknown) {
    // Log the error
    edgeLogger.error('Error in auth status endpoint', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    
    // Return 500 Internal Server Error
    return new NextResponse(JSON.stringify({ 
      status: 'error',
      message: 'Failed to check authentication status'
    }), {
      status: 500,
      headers: {
        'x-auth-state': 'error'
      }
    });
  }
} 