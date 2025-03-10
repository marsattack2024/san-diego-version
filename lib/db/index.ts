import { createClient } from '@supabase/supabase-js';

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Improved error handling to provide better diagnostics during build
if (!supabaseUrl) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL environment variable is missing');
  // In development, provide a more helpful error with placeholder for better debugging
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable. Check your .env file.');
}

if (!supabaseKey) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable is missing');
  // In development, provide a more helpful error with placeholder for better debugging
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable. Check your .env file.');
}

// Create and export the Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey); 