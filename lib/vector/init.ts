/**
 * Initialization module for vector search functionality
 * Makes sure all required environment variables are loaded
 */

import { logger } from '../logger/vector-logger';

// Initialize and validate environment variables needed for vector search
export function initializeVectorSearch() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  // Validation for environment variables
  if (!supabaseUrl) {
    logger.error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
    throw new Error('Supabase URL is required for vector search to work');
  }
  
  if (!supabaseKey) {
    logger.error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
    throw new Error('Supabase anonymous key is required for vector search to work');
  }
  
  try {
    // Validate that the URL is properly formatted
    new URL(supabaseUrl);
    logger.info('Vector search initialized successfully');
    return true;
  } catch (error) {
    logger.error('Invalid NEXT_PUBLIC_SUPABASE_URL format', { error });
    throw new Error(
      `Supabase URL is not a valid URL. Please provide a URL in the format: https://your-project-id.supabase.co`
    );
  }
}