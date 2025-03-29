/**
 * Supabase RPC Test Script
 * Tests direct RPC calls to validate database functions
 */

import { env } from '../lib/env-loader';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// Create Supabase client
const supabase = createClient(
  env.SUPABASE_URL!,
  env.SUPABASE_KEY!
);

/**
 * Test Supabase RPC functions, specifically save_message_and_update_session
 */
async function testSupabaseRPC(): Promise<void> {
  console.log('🧪 Testing Supabase RPC Functions');
  console.log('===============================');
  
  // Get current user ID from arguments or prompt for one
  let userId = process.argv[2];
  
  if (!userId) {
    console.log('⚠️ No user ID provided as argument. Testing will require an existing user ID.');
    console.log('Attempting to fetch a user from the database...');
    
    // Try to get a user from the database
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1
    });
    
    if (usersError) {
      console.error('❌ Failed to list users:', usersError.message);
      return;
    }
    
    if (users && users.users.length > 0) {
      userId = users.users[0].id;
      console.log(`✅ Found user ID: ${userId}`);
    } else {
      console.error('❌ No users found in the database. Please create a user first.');
      return;
    }
  }
  
  // Generate test data
  const sessionId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const testContent = `Test message from script at ${new Date().toISOString()}`;
  
  console.log(`\n📝 Test Parameters:`);
  console.log(`  • User ID: ${userId}`);
  console.log(`  • Session ID: ${sessionId}`);
  console.log(`  • Message ID: ${messageId}`);
  console.log(`  • Test Content: "${testContent}"`);
  
  // Test runs to execute
  const testRuns = [];
  
  console.log('\n🚀 Executing RPC calls...');
  
  // Test 1: User role message
  console.log('\n1️⃣ Testing with user role:');
  const userResult = await supabase.rpc('save_message_and_update_session', {
    p_session_id: sessionId,
    p_role: 'user',
    p_content: testContent,
    p_user_id: userId,
    p_message_id: messageId,
    p_tools_used: null,
    p_update_timestamp: true
  });
  
  const userSuccess = !userResult.error;
  console.log(`  • Result: ${userSuccess ? '✅ Success' : '❌ Failed'}`);
  if (userResult.error) {
    console.error(`  • Error: ${userResult.error.message}`);
  }
  
  testRuns.push({
    role: 'user',
    messageId,
    success: userSuccess,
    data: userResult.data,
    error: userResult.error,
    timestamp: new Date().toISOString()
  });
  
  // Test 2: Assistant role message
  console.log('\n2️⃣ Testing with assistant role:');
  const assistantMessageId = crypto.randomUUID();
  const assistantContent = `Assistant response to test at ${new Date().toISOString()}`;
  
  const assistantResult = await supabase.rpc('save_message_and_update_session', {
    p_session_id: sessionId,
    p_role: 'assistant',
    p_content: assistantContent,
    p_user_id: userId,
    p_message_id: assistantMessageId,
    p_tools_used: null,
    p_update_timestamp: true
  });
  
  const assistantSuccess = !assistantResult.error;
  console.log(`  • Result: ${assistantSuccess ? '✅ Success' : '❌ Failed'}`);
  if (assistantResult.error) {
    console.error(`  • Error: ${assistantResult.error.message}`);
  }
  
  testRuns.push({
    role: 'assistant',
    messageId: assistantMessageId,
    success: assistantSuccess,
    data: assistantResult.data,
    error: assistantResult.error,
    timestamp: new Date().toISOString()
  });
  
  // Verify messages were saved
  console.log('\n🔍 Verifying saved messages in database:');
  const { data: savedMessages, error: fetchError } = await supabase
    .from('sd_chat_histories')
    .select('id, role, content, created_at')
    .eq('session_id', sessionId);
  
  if (fetchError) {
    console.error(`  • Error fetching messages: ${fetchError.message}`);
  } else {
    console.log(`  • Found ${savedMessages.length} messages for session ${sessionId}`);
    savedMessages.forEach((msg, i) => {
      console.log(`    ${i+1}. Role: ${msg.role} | Content: "${msg.content.substring(0, 30)}${msg.content.length > 30 ? '...' : ''}"`);
    });
  }
  
  // Summary
  console.log('\n📊 Test Summary:');
  console.log(`  • User message test: ${testRuns[0].success ? '✅ Success' : '❌ Failed'}`);
  console.log(`  • Assistant message test: ${testRuns[1].success ? '✅ Success' : '❌ Failed'}`);
  console.log(`  • Verification query: ${!fetchError ? '✅ Success' : '❌ Failed'}`);
  console.log(`  • Total messages saved: ${savedMessages?.length || 0}`);
  
  console.log('\n✅ Supabase RPC test completed');
}

// Run the test if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  testSupabaseRPC().catch(err => {
    console.error('❌ Supabase RPC test failed:', err);
    process.exit(1);
  });
}

// Export for use in the test runner
export const tests = [
  { name: 'Supabase RPC Functions', fn: testSupabaseRPC }
]; 