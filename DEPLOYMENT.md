# Deployment Checklist for Vercel

This document outlines the steps needed to deploy the AI Chat Application to Vercel.

## Prerequisites

- [ ] Vercel account
- [ ] Supabase account
- [ ] OpenAI API key
- [ ] Perplexity API key (optional, for deep search)
- [ ] GitHub repository with the code

## Step 1: Set Up Supabase

- [ ] Create a new Supabase project
- [ ] Run the SQL from `supabase/migrations/20240306_initial_schema.sql` in the Supabase SQL editor
- [ ] Enable Email/Password authentication in Supabase Auth settings
- [ ] Get your Supabase URL, anon key, and service role key

## Step 2: Configure Environment Variables

Prepare the following environment variables for Vercel:

- [ ] `OPENAI_API_KEY` - Your OpenAI API key
- [ ] `PERPLEXITY_API_KEY` - Your Perplexity API key (required for Deep Search feature)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key
- [ ] `NEXT_PUBLIC_APP_URL` - Your Vercel deployment URL (can be updated after deployment)
- [ ] `NODE_ENV` - Set to "production"
- [ ] `LOG_LEVEL` - Set to "info" or "error" for production
- [ ] `ENABLE_REMOTE_LOGGING` - Set to "false" or "true" depending on your needs
- [ ] `FIREWORKS_API_KEY` - Your Fireworks AI API key (optional)
- [ ] `DEFAULT_AGENT` - Set to "default" or another agent type
- [ ] `ENABLE_DEEP_SEARCH` - Set to "true" or "false"
- [ ] `MAX_DOCUMENTS` - Set to "10" or another number
- [ ] `SIMILARITY_THRESHOLD` - Set to "0.5" or another number

### Environment Variable Setup for Vercel Serverless Functions

When deploying to Vercel, environment variables need special configuration to work properly in serverless functions:

1. Set environment variables in the Vercel dashboard
2. Make sure variable names are exactly as shown above (e.g., `PERPLEXITY_API_KEY`, not `perplexity_api_key`)
3. Do not add quotes or spaces to the variable values
4. Ensure your Perplexity API key starts with `pplx-`
5. After setting environment variables, do a clean deployment by selecting "Clear build cache and deploy" in the Vercel dashboard

For Perplexity API in particular, if you experience authentication errors:
- Verify the API key is correctly set in Vercel
- Check deployment logs for "missing API key" or "invalid API key" messages
- If errors persist, check the app logs for specific error details

## Step 3: Deploy to Vercel

### Using the Vercel Dashboard

1. [ ] Push your code to GitHub
2. [ ] Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. [ ] Click "New Project"
4. [ ] Import your GitHub repository
5. [ ] Configure the project:
   - Framework Preset: Next.js
   - Root Directory: ./
   - Build Command: next build
   - Output Directory: .next
6. [ ] Add the environment variables from Step 2
7. [ ] Click "Deploy"

### Using Vercel CLI

1. [ ] Install Vercel CLI: `npm i -g vercel`
2. [ ] Login to Vercel: `vercel login`
3. [ ] Deploy the project: `vercel`
4. [ ] Follow the prompts to configure your project
5. [ ] Set environment variables: `vercel env add [VARIABLE_NAME]`
6. [ ] Deploy to production: `vercel --prod`

## Step 4: Update Supabase Configuration

After deploying to Vercel:

1. [ ] Go to your Supabase project dashboard
2. [ ] Navigate to Authentication > URL Configuration
3. [ ] Add your Vercel deployment URL to the Site URL
4. [ ] Add the following redirect URLs:
   - `https://your-vercel-url.vercel.app/auth/callback`
   - `https://your-vercel-url.vercel.app/login`

## Step 5: Verify Deployment

1. [ ] Visit your deployed application
2. [ ] Test the authentication flow
3. [ ] Test the chat functionality
4. [ ] Test the RAG functionality by uploading documents
5. [ ] Test the agent selection functionality

## Troubleshooting

If you encounter issues during deployment:

1. Check the Vercel deployment logs
2. Verify that all environment variables are set correctly
3. Check the Supabase authentication settings
4. Ensure that the Supabase tables were created correctly
5. Check the browser console for any client-side errors

## Post-Deployment Tasks

1. [ ] Set up a custom domain (optional)
2. [ ] Configure monitoring and analytics
3. [ ] Set up continuous deployment
4. [ ] Create a backup plan for your Supabase database 