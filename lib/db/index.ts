import { createClient } from '@supabase/supabase-js';

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Check for missing environment variables
if (!supabaseUrl || !supabaseKey) {
  console.warn('Missing Supabase credentials. Some features will be disabled.');
}

// Check for placeholder values
if (supabaseUrl === 'your-supabase-url-here' || 
    (supabaseUrl && supabaseUrl.includes('your-supabase')) || 
    (supabaseKey && supabaseKey.includes('your-supabase'))) {
  console.warn('Using placeholder Supabase credentials. Some features will be disabled.');
}

// Validate URL format before creating client
let validSupabaseUrl = supabaseUrl;
try {
  if (supabaseUrl) {
    new URL(supabaseUrl);
  }
} catch (error) {
  console.error('Invalid Supabase URL format:', error instanceof Error ? error.message : String(error));
  // Use a dummy URL that will pass URL validation but fail gracefully when used
  validSupabaseUrl = 'https://example.com';
}

// Create and export the Supabase client
export const supabase = createClient(
  validSupabaseUrl || 'https://example.com', 
  supabaseKey || 'dummy-key'
); 