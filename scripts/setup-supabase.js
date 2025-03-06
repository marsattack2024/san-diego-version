#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check for required environment variables
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach(envVar => {
    console.error(`   - ${envVar}`);
  });
  console.error('\nPlease add these to your .env file and try again.');
  process.exit(1);
}

// Create Supabase client with service role key for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setupSupabase() {
  console.log('🔧 Setting up Supabase tables...');

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '20240306_initial_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Execute the SQL
    const { error } = await supabase.rpc('pgexec', { sql });

    if (error) {
      console.error('❌ Error executing SQL:', error);
      process.exit(1);
    }

    console.log('✅ Supabase tables created successfully!');

    // Verify tables were created
    const { data: tables, error: tablesError } = await supabase
      .from('pg_tables')
      .select('tablename')
      .eq('schemaname', 'public');

    if (tablesError) {
      console.error('❌ Error verifying tables:', tablesError);
      process.exit(1);
    }

    console.log('\n📋 Tables created:');
    tables.forEach(table => {
      console.log(`   - ${table.tablename}`);
    });

    console.log('\n🚀 Your Supabase database is ready to use!');
    console.log('\n📝 Next steps:');
    console.log('   1. Set up authentication in the Supabase dashboard');
    console.log('   2. Configure your application environment variables');
    console.log('   3. Run your application with `npm run dev`');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

setupSupabase(); 