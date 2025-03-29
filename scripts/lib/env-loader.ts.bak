import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
config({ path: resolve(process.cwd(), '.env') });

// Also try to load from .env.local which is the recommended approach for Next.js
config({ path: resolve(process.cwd(), '.env.local') });

// Check for critical environment variables
const requiredPublicVars = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const requiredPrivateVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'OPENAI_API_KEY'];

// Check for missing public vars which are needed for client components
const missingPublicVars = requiredPublicVars.filter(envVar => !process.env[envVar]);
if (missingPublicVars.length > 0) {
  console.warn(`Warning: Missing public environment variables: ${missingPublicVars.join(', ')}`);
  
  // Use values from non-public vars if available (common mistake is forgetting the NEXT_PUBLIC_ prefix)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_URL) {
    console.log('Using SUPABASE_URL as fallback for NEXT_PUBLIC_SUPABASE_URL');
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
  }
  
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_ANON_KEY) {
    console.log('Using SUPABASE_ANON_KEY as fallback for NEXT_PUBLIC_SUPABASE_ANON_KEY');
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  }
}

// Check for missing private vars
const missingPrivateVars = requiredPrivateVars.filter(envVar => !process.env[envVar]);
if (missingPrivateVars.length > 0) {
  console.warn(`Warning: Missing private environment variables: ${missingPrivateVars.join(', ')}`);
}

// For development only - provide example values with clear indicators that they're placeholders
if (process.env.NODE_ENV === 'development') {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    console.warn('⚠️ Using placeholder NEXT_PUBLIC_SUPABASE_URL for development - not suitable for production');
  }
  
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example-key';
    console.warn('⚠️ Using placeholder NEXT_PUBLIC_SUPABASE_ANON_KEY for development - not suitable for production');
  }
  
  if (!process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = 'sk-example';
    console.warn('⚠️ Using placeholder OPENAI_API_KEY for development - not suitable for production');
  }
}

// Export environment variables
export const env = {
  // Public vars (safe to expose to client)
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  
  // Private vars (server-side only)
  SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY
}; 