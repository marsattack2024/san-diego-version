# Deployment Guide for Vercel

This guide will walk you through the process of deploying your AI Chat Application to Vercel.

## Prerequisites

Before you begin, make sure you have:

1. A [Vercel account](https://vercel.com/signup)
2. A [Supabase account](https://supabase.com/)
3. An [OpenAI API key](https://platform.openai.com/api-keys)
4. A [Perplexity API key](https://www.perplexity.ai/) (optional, for deep search)
5. Your code pushed to a Git repository (GitHub, GitLab, or Bitbucket)

## Step 1: Set Up Supabase

### Create a Supabase Project

1. Log in to your Supabase account
2. Click "New Project"
3. Fill in the project details:
   - Name: Choose a name for your project
   - Database Password: Create a secure password
   - Region: Choose a region close to your users
4. Click "Create new project"

### Set Up Database Tables

1. Once your project is created, go to the SQL Editor
2. Copy the contents of `supabase/migrations/20240306_initial_schema.sql`
3. Paste it into the SQL Editor and click "Run"
4. Verify that all tables were created successfully

### Configure Authentication

1. Go to Authentication > Settings
2. Under "Site URL", enter your Vercel deployment URL (you can update this later)
3. Under "Redirect URLs", add:
   - `https://your-vercel-url.vercel.app/auth/callback`
   - `https://your-vercel-url.vercel.app/login`
4. Save changes
5. Go to Authentication > Providers
6. Enable Email provider and any other providers you want to use

### Get Your Supabase Credentials

1. Go to Project Settings > API
2. Copy the following values:
   - Project URL
   - anon public key
   - service_role key (keep this secure, it has admin privileges)

## Step 2: Deploy to Vercel

### Using the Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New" > "Project"
3. Import your Git repository
4. Configure the project:
   - Framework Preset: Next.js
   - Root Directory: ./
   - Build Command: next build
   - Output Directory: .next
5. Add environment variables:
   ```
   OPENAI_API_KEY=your_openai_api_key
   PERPLEXITY_API_KEY=your_perplexity_api_key
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   NEXT_PUBLIC_APP_URL=your_vercel_deployment_url
   NODE_ENV=production
   LOG_LEVEL=info
   ENABLE_REMOTE_LOGGING=false
   ```
6. Click "Deploy"

### Using Vercel CLI

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy the project:
   ```bash
   vercel
   ```

4. Follow the prompts to configure your project.

5. Set environment variables:
   ```bash
   vercel env add OPENAI_API_KEY
   vercel env add PERPLEXITY_API_KEY
   vercel env add NEXT_PUBLIC_SUPABASE_URL
   vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
   vercel env add NEXT_PUBLIC_APP_URL
   ```

6. Deploy to production:
   ```bash
   vercel --prod
   ```

## Step 3: Update Supabase Configuration

After deploying to Vercel, you need to update your Supabase configuration:

1. Go back to your Supabase project
2. Go to Authentication > Settings
3. Update the "Site URL" with your Vercel deployment URL
4. Update the "Redirect URLs" with your Vercel deployment URL:
   - `https://your-vercel-url.vercel.app/auth/callback`
   - `https://your-vercel-url.vercel.app/login`
5. Save changes

## Step 4: Verify Deployment

1. Visit your deployed application
2. Test the authentication flow:
   - Sign up for a new account
   - Log in with the account
   - Log out
3. Test the chat functionality:
   - Send a message to the AI
   - Check if the response is generated correctly
4. Test the RAG functionality:
   - Upload a document
   - Ask a question related to the document
   - Verify that the AI uses the document in its response

## Troubleshooting

### Authentication Issues

If you're experiencing authentication issues:

1. Check that your Supabase URL and anon key are correct
2. Verify that the Site URL and Redirect URLs are set correctly in Supabase
3. Check the browser console for any errors
4. Check the Vercel logs for any server-side errors

### Database Issues

If you're experiencing database issues:

1. Check that your Supabase tables were created correctly
2. Verify that the RLS policies are set up correctly
3. Check the Supabase logs for any errors

### AI Issues

If you're experiencing issues with the AI:

1. Check that your OpenAI API key is correct
2. Verify that you have sufficient credits in your OpenAI account
3. Check the Vercel logs for any errors related to the AI API calls

## Continuous Deployment

Vercel automatically deploys your application when you push changes to your Git repository. To make changes to your deployed application:

1. Make changes to your code
2. Commit and push to your Git repository
3. Vercel will automatically deploy the changes

## Custom Domains

To use a custom domain with your Vercel deployment:

1. Go to your project in the Vercel dashboard
2. Click on "Domains"
3. Add your custom domain
4. Follow the instructions to configure DNS settings

## Monitoring and Analytics

Vercel provides built-in monitoring and analytics for your application:

1. Go to your project in the Vercel dashboard
2. Click on "Analytics" to view performance metrics
3. Click on "Logs" to view application logs

## Conclusion

Your AI Chat Application is now deployed to Vercel and ready to use! If you encounter any issues, refer to the troubleshooting section or check the Vercel and Supabase documentation for more information. 