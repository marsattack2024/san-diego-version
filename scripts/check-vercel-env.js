#!/usr/bin/env node

/**
 * Vercel Environment Variable Checker
 * 
 * This script helps verify that all necessary environment variables
 * are configured in your Vercel project. It uses the Vercel CLI to
 * fetch current environment variables and compares them against the
 * required ones.
 * 
 * Usage:
 *   node scripts/check-vercel-env.js [--project your-project-name]
 */

import { execSync } from 'child_process';
import { createInterface } from 'readline';

// Get project name from arguments or prompt user
const args = process.argv.slice(2);
let projectName = '';

// Parse arguments
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) {
        projectName = args[i + 1];
        break;
    }
}

// Required environment variables
const REQUIRED_VARIABLES = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'OPENAI_API_KEY',
    'PERPLEXITY_API_KEY',
    'NEXT_PUBLIC_APP_URL'
];

// Optional but recommended variables
const RECOMMENDED_VARIABLES = [
    'PERPLEXITY_MODEL',
    'WIDGET_ALLOWED_ORIGINS',
    'NEXT_PUBLIC_MAX_TOKENS',
    'LOG_LEVEL'
];

async function main() {
    console.log('🔍 Checking Vercel environment variables...');

    // Ensure Vercel CLI is installed
    try {
        execSync('vercel --version', { stdio: 'ignore' });
    } catch (error) {
        console.error('❌ Vercel CLI is not installed. Please install it with:');
        console.error('   npm install -g vercel');
        process.exit(1);
    }

    // Ensure user is logged in
    try {
        const whoami = execSync('vercel whoami', { encoding: 'utf8' }).trim();
        console.log(`✅ Logged in to Vercel as: ${whoami}`);
    } catch (error) {
        console.error('❌ Not logged in to Vercel. Please run:');
        console.error('   vercel login');
        process.exit(1);
    }

    // If project name is not provided, prompt user
    if (!projectName) {
        projectName = await promptUser('Enter your Vercel project name: ');
    }

    console.log(`🔍 Checking environment variables for project: ${projectName}`);

    try {
        // Fetch environment variables from Vercel
        const output = execSync(`vercel env ls --project ${projectName} --json`, { encoding: 'utf8' });
        const envVars = JSON.parse(output);

        // Extract variable names
        const configuredVars = new Set(envVars.map(v => v.key));

        // Check required variables
        const missingRequired = REQUIRED_VARIABLES.filter(v => !configuredVars.has(v));

        // Check recommended variables
        const missingRecommended = RECOMMENDED_VARIABLES.filter(v => !configuredVars.has(v));

        // Display results
        if (missingRequired.length === 0) {
            console.log('✅ All required environment variables are configured.');
        } else {
            console.error('❌ Missing required environment variables:');
            missingRequired.forEach(v => console.error(`   - ${v}`));
            console.error('\nPlease add these variables to your Vercel project:');
            console.error('   vercel env add');
        }

        if (missingRecommended.length > 0) {
            console.warn('\n⚠️ Missing recommended environment variables:');
            missingRecommended.forEach(v => console.warn(`   - ${v}`));
        }

        // Check for the correct environment URL based on the domain
        if (configuredVars.has('NEXT_PUBLIC_APP_URL')) {
            const appUrl = envVars.find(v => v.key === 'NEXT_PUBLIC_APP_URL')?.value;
            if (appUrl) {
                console.log(`\n🔍 Checking Supabase authentication configuration for: ${appUrl}`);
                console.log('\n⚠️ Important: Make sure to update Supabase Auth settings with your Vercel URL:');
                console.log('   1. Go to Supabase Dashboard -> Authentication -> URL Configuration');
                console.log(`   2. Set Site URL to: ${appUrl}`);
                console.log(`   3. Add the following to Redirect URLs:`);
                console.log(`      - ${appUrl}/auth/callback`);
                console.log(`      - ${appUrl}/login`);
            }
        }

        // Provide complete checklist for production readiness
        console.log('\n📋 Vercel Deployment Checklist:');
        console.log('   ✓ Vercel CLI installed and logged in');
        console.log(`   ${missingRequired.length === 0 ? '✓' : '✗'} Required environment variables configured`);
        console.log(`   ${missingRecommended.length === 0 ? '✓' : '⚠️'} Recommended environment variables configured`);
        console.log('   ? Supabase Auth URL Configuration updated (manual check required)');
        console.log('   ? Build and deployment successful (run: vercel deploy --prod)');
        console.log('   ? CORS settings correctly configured for widget (check Network tab in DevTools)');
        console.log('\n🚀 Run a test deployment with: vercel deploy');

    } catch (error) {
        console.error(`❌ Error fetching environment variables: ${error.message}`);
        console.error('Make sure the project exists and you have access to it.');
        process.exit(1);
    }
}

async function promptUser(question) {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

main().catch(error => {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
}); 