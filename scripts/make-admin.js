/**
 * Admin User Management Script
 * Create or update admin users in Supabase
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createAdminClient, findUserByEmail, getAdminUsers, setUserRole } from './lib/supabase/supabase-admin.ts';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Determine action based on command line arguments
const email = process.argv[2];

/**
 * List all admin users
 */
async function listAdminUsers() {
  console.log('\n📋 Current Admin Users');
  console.log('=====================');
  
  try {
    const adminUsers = await getAdminUsers();
    
    if (adminUsers.length === 0) {
      console.log('No admin users found.');
      return;
    }
    
    // Display admin users in a table format
    console.log(`Found ${adminUsers.length} admin users:\n`);
    
    // Format and print each admin user
    adminUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Created: ${new Date(user.created_at || '').toLocaleString()}`);
      if (user.last_sign_in_at) {
        console.log(`   Last sign in: ${new Date(user.last_sign_in_at).toLocaleString()}`);
      }
      console.log('');
    });
    
  } catch (error) {
    console.error(`❌ Error listing admin users: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Make a user an admin by email
 */
async function makeUserAdmin(email) {
  console.log(`\n👑 Making User Admin: ${email}`);
  console.log('==========================' + '='.repeat(email.length));
  
  try {
    // Find the user by email
    const user = await findUserByEmail(email);
    
    if (!user) {
      console.error(`❌ User not found with email: ${email}`);
      process.exit(1);
    }
    
    console.log(`Found user: ${user.email} (${user.id})`);
    console.log(`Current role: ${user.role || 'none'}`);
    
    if (user.role === 'admin') {
      console.log('✅ User is already an admin.');
      return;
    }
    
    // Set the user as admin
    const result = await setUserRole(user.id, 'admin');
    
    if (result.success) {
      console.log(`✅ ${result.message}`);
    } else {
      console.error(`❌ ${result.message}`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error(`❌ Error making user admin: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Verify Supabase connection by creating client (will throw if env vars are missing)
    createAdminClient();
    
    if (email) {
      await makeUserAdmin(email);
    } else {
      await listAdminUsers();
      
      // Display usage information
      console.log('\n📌 Usage');
      console.log('=======');
      console.log('To make a user an admin:');
      console.log('  node scripts/make-admin.js <email>');
      console.log('\nExample:');
      console.log('  node scripts/make-admin.js user@example.com');
    }
  } catch (error) {
    console.error(`\n❌ Script execution failed: ${error.message}`);
    
    if (error.message.includes('Supabase URL and key are required')) {
      console.log('\nPlease ensure the following environment variables are set:');
      console.log('- SUPABASE_URL');
      console.log('- SUPABASE_KEY (service role key)');
      console.log('\nYou can set these in a .env file or through your environment.');
    }
    
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 