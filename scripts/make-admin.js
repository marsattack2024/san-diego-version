#!/usr/bin/env node

/**
 * Make Admin Script
 * 
 * This script makes a user an admin by directly setting the is_admin flag in their profile
 * to true. It uses the Supabase service role key to bypass RLS.
 * 
 * Usage: node make-admin.js <user_email>
 * 
 * Example: node make-admin.js user@example.com
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from nearest .env file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Check for required environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Error: Required environment variables are missing.');
    console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
    process.exit(1);
}

// Get email from command line arguments
const userEmail = process.argv[2];

if (!userEmail) {
    console.error('Error: User email is required.');
    console.error('Usage: node make-admin.js <user_email>');
    process.exit(1);
}

// Initialize Supabase client with service role to bypass RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function makeUserAdmin(email) {
    console.log(`Looking up user: ${email}`);

    try {
        // Find the user by email
        const { data: userData, error: userError } = await supabase
            .from('auth.users')
            .select('id, email')
            .eq('email', email)
            .single();

        if (userError) {
            // If we can't directly query auth.users, use RPC function
            console.log('Falling back to find_user_by_email RPC...');
            const { data: rpcData, error: rpcError } = await supabase
                .rpc('find_user_by_email', { email_address: email });

            if (rpcError || !rpcData) {
                console.error('Error finding user:', rpcError?.message || 'User not found');
                process.exit(1);
            }

            userData = rpcData;
        }

        if (!userData) {
            console.error(`User with email ${email} not found.`);
            process.exit(1);
        }

        console.log(`Found user: ${userData.email} (${userData.id})`);

        // Check if user already has a profile
        const { data: profileData, error: profileError } = await supabase
            .from('sd_user_profiles')
            .select('user_id, is_admin')
            .eq('user_id', userData.id)
            .maybeSingle();

        if (profileError && !profileError.message.includes('No rows found')) {
            console.error('Error checking profile:', profileError.message);
            process.exit(1);
        }

        // If profile exists, update it
        if (profileData) {
            if (profileData.is_admin) {
                console.log('User is already an admin in profile.');
            } else {
                console.log('Updating existing profile to set is_admin = true');
                const { error: updateError } = await supabase
                    .from('sd_user_profiles')
                    .update({ is_admin: true })
                    .eq('user_id', userData.id);

                if (updateError) {
                    console.error('Error updating profile:', updateError.message);
                    process.exit(1);
                }
            }
        } else {
            // Create a minimal profile with is_admin = true
            console.log('Creating new profile with is_admin = true');
            const { error: insertError } = await supabase
                .from('sd_user_profiles')
                .insert({
                    user_id: userData.id,
                    full_name: email.split('@')[0], // Simple default full name
                    is_admin: true
                });

            if (insertError) {
                console.error('Error creating profile:', insertError.message);
                process.exit(1);
            }
        }

        // Also ensure there's an entry in the roles table for backward compatibility
        console.log('Ensuring admin role exists in sd_user_roles table');
        const { error: roleError } = await supabase
            .from('sd_user_roles')
            .insert({
                user_id: userData.id,
                role: 'admin'
            })
            .on_conflict(['user_id', 'role'])
            .do_nothing();

        if (roleError) {
            console.error('Error adding admin role:', roleError.message);
            process.exit(1);
        }

        console.log('✅ Success! User is now an admin.');
        console.log('The changes will take effect the next time the user logs in or their session refreshes.');

    } catch (error) {
        console.error('Unexpected error:', error.message);
        process.exit(1);
    }
}

// Execute the function
makeUserAdmin(userEmail); 