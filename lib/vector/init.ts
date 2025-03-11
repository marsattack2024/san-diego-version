/**
 * Initialization module for vector search functionality
 * Makes sure all required environment variables are loaded
 */

import { logger } from '../logger/vector-logger';

// Initialize and validate environment variables needed for vector search
export function initializeVectorSearch() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  // Check for placeholder values or missing values
  if (!supabaseUrl || !supabaseKey) {
    console.warn('Missing Supabase credentials. Vector search will be disabled.');
    return false;
  }
  
  // Check for placeholder values
  if (supabaseUrl === 'your-supabase-url-here' || 
      supabaseUrl.includes('your-supabase') || 
      supabaseKey.includes('your-supabase')) {
    console.warn('Using placeholder Supabase credentials. Vector search will be disabled.');
    return false;
  }
  
  // Validate URL format
  try {
    // Only validate the base URL without appending paths
    new URL(supabaseUrl);
    
    // Log success with fallback
    try {
      logger.logVectorQuery('initialization', {}, 0, 0);
      console.log('Vector search initialized successfully');
    } catch (logError) {
      console.log('Vector search initialized successfully');
    }
    
    return true;
  } catch (error) {
    // Log URL validation error
    console.error('Invalid Supabase URL format:', error instanceof Error ? error.message : String(error));
    try {
      logger.logVectorError('url_validation', error);
    } catch (logError) {
      // Silently continue if logger fails
    }
    return false;
  }
}