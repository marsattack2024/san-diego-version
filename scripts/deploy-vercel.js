#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to prompt user for input
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function deployToVercel() {
  console.log('🚀 Preparing to deploy to Vercel...');

  // Check if Vercel CLI is installed
  try {
    execSync('vercel --version', { stdio: 'ignore' });
  } catch (error) {
    console.log('❌ Vercel CLI is not installed. Installing now...');
    try {
      execSync('npm install -g vercel', { stdio: 'inherit' });
    } catch (installError) {
      console.error('❌ Failed to install Vercel CLI:', installError);
      process.exit(1);
    }
  }

  // Check if user is logged in to Vercel
  try {
    execSync('vercel whoami', { stdio: 'ignore' });
  } catch (error) {
    console.log('❌ You are not logged in to Vercel. Please log in:');
    try {
      execSync('vercel login', { stdio: 'inherit' });
    } catch (loginError) {
      console.error('❌ Failed to log in to Vercel:', loginError);
      process.exit(1);
    }
  }

  // Check if .env.production exists
  const envProductionPath = path.join(__dirname, '..', '.env.production');
  if (!fs.existsSync(envProductionPath)) {
    console.log('❌ .env.production file not found. Creating from template...');
    
    // Check if .env.production.example exists
    const envProductionExamplePath = path.join(__dirname, '..', '.env.production.example');
    if (fs.existsSync(envProductionExamplePath)) {
      // Copy .env.production.example to .env.production
      fs.copyFileSync(envProductionExamplePath, envProductionPath);
      console.log('✅ Created .env.production from template.');
    } else {
      console.error('❌ .env.production.example file not found. Please create a .env.production file manually.');
      process.exit(1);
    }
  }

  // Prompt user for environment variables
  console.log('\n📝 Please provide the following environment variables:');
  
  const openaiApiKey = await prompt('OpenAI API Key: ');
  const supabaseUrl = await prompt('Supabase URL: ');
  const supabaseAnonKey = await prompt('Supabase Anon Key: ');
  const appUrl = await prompt('App URL (leave blank for Vercel-generated URL): ');
  
  // Optional variables
  const perplexityApiKey = await prompt('Perplexity API Key (optional): ');
  const fireworksApiKey = await prompt('Fireworks API Key (optional): ');
  
  // Update .env.production with user input
  let envContent = fs.readFileSync(envProductionPath, 'utf8');
  
  envContent = envContent.replace(/OPENAI_API_KEY=".*"/, `OPENAI_API_KEY="${openaiApiKey}"`);
  envContent = envContent.replace(/NEXT_PUBLIC_SUPABASE_URL=".*"/, `NEXT_PUBLIC_SUPABASE_URL="${supabaseUrl}"`);
  envContent = envContent.replace(/NEXT_PUBLIC_SUPABASE_ANON_KEY=".*"/, `NEXT_PUBLIC_SUPABASE_ANON_KEY="${supabaseAnonKey}"`);
  
  if (appUrl) {
    envContent = envContent.replace(/NEXT_PUBLIC_APP_URL=.*/, `NEXT_PUBLIC_APP_URL=${appUrl}`);
  }
  
  if (perplexityApiKey) {
    envContent = envContent.replace(/PERPLEXITY_API_KEY=.*/, `PERPLEXITY_API_KEY=${perplexityApiKey}`);
  }
  
  if (fireworksApiKey) {
    envContent = envContent.replace(/FIREWORKS_API_KEY=".*"/, `FIREWORKS_API_KEY="${fireworksApiKey}"`);
  }
  
  fs.writeFileSync(envProductionPath, envContent);
  
  console.log('✅ Environment variables updated.');

  // Run build to ensure everything compiles
  console.log('\n🔨 Running build to ensure everything compiles...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
  } catch (buildError) {
    console.error('❌ Build failed:', buildError);
    const continueDeploy = await prompt('Do you want to continue with deployment anyway? (y/n): ');
    if (continueDeploy.toLowerCase() !== 'y') {
      process.exit(1);
    }
  }

  // Deploy to Vercel
  console.log('\n🚀 Deploying to Vercel...');
  try {
    // Deploy with environment variables
    const deployCommand = `vercel --prod --env OPENAI_API_KEY="${openaiApiKey}" --env NEXT_PUBLIC_SUPABASE_URL="${supabaseUrl}" --env NEXT_PUBLIC_SUPABASE_ANON_KEY="${supabaseAnonKey}"`;
    
    // Add optional environment variables if provided
    const additionalEnvVars = [];
    
    if (appUrl) {
      additionalEnvVars.push(`--env NEXT_PUBLIC_APP_URL="${appUrl}"`);
    }
    
    if (perplexityApiKey) {
      additionalEnvVars.push(`--env PERPLEXITY_API_KEY="${perplexityApiKey}"`);
    }
    
    if (fireworksApiKey) {
      additionalEnvVars.push(`--env FIREWORKS_API_KEY="${fireworksApiKey}"`);
    }
    
    // Add production environment variables
    additionalEnvVars.push('--env NODE_ENV="production"');
    additionalEnvVars.push('--env LOG_LEVEL="info"');
    additionalEnvVars.push('--env ENABLE_REMOTE_LOGGING="false"');
    
    // Execute the deploy command
    execSync(`${deployCommand} ${additionalEnvVars.join(' ')}`, { stdio: 'inherit' });
    
    console.log('\n✅ Deployment successful!');
    
    // Remind user to update Supabase configuration
    console.log('\n📝 Next steps:');
    console.log('1. Go to your Supabase project dashboard');
    console.log('2. Navigate to Authentication > URL Configuration');
    console.log('3. Add your Vercel deployment URL to the Site URL');
    console.log('4. Add the following redirect URLs:');
    console.log(`   - https://your-vercel-url.vercel.app/auth/callback`);
    console.log(`   - https://your-vercel-url.vercel.app/login`);
    
  } catch (deployError) {
    console.error('❌ Deployment failed:', deployError);
    process.exit(1);
  }

  rl.close();
}

deployToVercel(); 