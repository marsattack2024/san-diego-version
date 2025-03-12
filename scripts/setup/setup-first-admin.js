#!/usr/bin/env node

// This script sets up the first admin user in the system
// Usage: node scripts/setup/setup-first-admin.js your@email.com

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

async function setupFirstAdmin() {
  // Get email from command line arguments
  const email = process.argv[2];
  
  if (!email) {
    console.error('Error: Email is required');
    console.error('Usage: node scripts/setup/setup-first-admin.js your@email.com');
    process.exit(1);
  }
  
  // Initialize Supabase client with service role key
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_KEY; // Using the correct environment variable name
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: Missing Supabase credentials in environment variables');
    console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    // Call the setup_first_admin function
    const { data, error } = await supabase.rpc('setup_first_admin', { user_email: email });
    
    if (error) {
      console.error('Error making user admin:', error);
      process.exit(1);
    }
    
    console.log('Success:', data);
    console.log(`User ${email} has been set up as an admin`);
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

setupFirstAdmin();