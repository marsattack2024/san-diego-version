const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Apply the profile optimization SQL to the Supabase project
 * 
 * Usage:
 * 1. Make sure you have the Supabase CLI installed
 * 2. Run: node scripts/apply-profile-optimization.js
 */

try {
  console.log('Applying profile optimization to Supabase project...');
  
  // Check if Supabase CLI is installed
  try {
    execSync('supabase --version', { stdio: 'pipe' });
  } catch (error) {
    console.error('Error: Supabase CLI not found. Please install it first:');
    console.error('npm install -g supabase');
    process.exit(1);
  }
  
  // Path to the migration file
  const migrationFile = path.join(
    __dirname, 
    '../supabase/migrations/20250321_profile_metadata_optimization.sql'
  );
  
  if (!fs.existsSync(migrationFile)) {
    console.error(`Error: Migration file not found: ${migrationFile}`);
    process.exit(1);
  }
  
  console.log('Running migration with Supabase CLI...');
  
  try {
    // Apply the migration using the Supabase CLI
    const result = execSync(`supabase db push --db-url=${process.env.SUPABASE_DB_URL}`, { 
      stdio: 'inherit',
      env: process.env
    });
    
    console.log('Migration applied successfully!');
    console.log('\nThe following optimizations have been applied:');
    console.log('1. Added sync_profile_metadata() function to update user metadata for existing profiles');
    console.log('2. Added update_user_profile_metadata() trigger function to keep user metadata in sync');
    console.log('3. Created sync_profile_metadata trigger on the sd_user_profiles table');
    console.log('4. Added has_profile() function for efficient profile checking');
    console.log('\nThe system will now use user metadata for faster profile checks,');
    console.log('reducing database queries and improving performance.');
  } catch (error) {
    console.error('Error applying migration:', error.message);
    console.error('\nAlternative manual steps:');
    console.error('1. Log in to your Supabase dashboard');
    console.error('2. Go to the SQL Editor');
    console.error('3. Copy and paste the contents of this file:');
    console.error(`   ${migrationFile}`);
    console.error('4. Run the SQL manually');
    process.exit(1);
  }
} catch (error) {
  console.error('Unexpected error:', error.message);
  process.exit(1);
} 