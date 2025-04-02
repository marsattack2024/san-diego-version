# Vercel Deployment Checklist

This document provides a comprehensive checklist for deploying the application to Vercel and ensuring that all necessary configuration is properly set up.

## Pre-Deployment Checks

Before deploying to Vercel, ensure that:

1. **Code is ready for production**
   - All tests pass: `npm run test`
   - TypeScript type checking passes: `npm run type-check`
   - Linting passes: `npm run lint`
   - Build completes successfully locally: `npm run build`

2. **Environment Variables**
   - All required environment variables are defined in `.env.production`
   - Sensitive values are not committed to the repository

## Environment Variables Verification

The application requires the following environment variables to be properly configured in Vercel:

### Required Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `PERPLEXITY_API_KEY` | Perplexity API key | Yes |
| `NEXT_PUBLIC_APP_URL` | Application URL | Yes |

### Recommended Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PERPLEXITY_MODEL` | Perplexity model name | `sonar` |
| `WIDGET_ALLOWED_ORIGINS` | Comma-separated list of domains allowed to embed widget | `*` |
| `NEXT_PUBLIC_MAX_TOKENS` | Maximum tokens for AI responses | `600` |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | `info` |

## Automated Verification

You can use our automated verification script to check if all required environment variables are configured in your Vercel project:

```bash
# Verify Vercel configuration
npm run check-vercel

# If you want to specify a project name
npm run check-vercel -- --project your-project-name
```

The script will:
1. Verify that you're logged in to the Vercel CLI
2. Check if all required environment variables are configured
3. Highlight any missing recommended variables
4. Provide guidance on Supabase authentication configuration

## Deployment Process

To deploy the application to Vercel:

1. **Automated Deployment (Recommended)**
   ```bash
   npm run deploy
   ```
   This script will:
   - Validate environment variables
   - Run pre-deployment checks
   - Handle the deployment to Vercel

2. **Manual Deployment**
   ```bash
   vercel --prod
   ```

3. **GitHub Integration**
   - For automatic deployments, connect your GitHub repository to Vercel
   - Enable automatic deployments for the main branch

## Post-Deployment Verification

After deployment, you can automatically test critical endpoints with our verification script:

```bash
# Automatically test all critical endpoints
npm run verify-deployment -- --url https://your-app-url.vercel.app
```

This script checks:
- Public API endpoints
- Authentication flows
- Protected routes
- CORS configuration for the widget

Additionally, manually verify that:

1. **Authentication Works**
   - Navigate to the login page
   - Test both login and registration flows
   - Verify that authenticated routes work correctly

2. **Supabase Authentication**
   - In Supabase Dashboard, navigate to Authentication → URL Configuration
   - Ensure the Site URL matches your deployed application URL
   - Add the following redirect URLs:
     - `https://your-app-url.vercel.app/auth/callback`
     - `https://your-app-url.vercel.app/login`

3. **Chat Widget Integration**
   - Test the chat widget on an external site
   - Verify CORS headers are properly configured
   - Check that websockets/SSE connections work correctly

4. **API Routes**
   - Verify that all API routes respond correctly
   - Check that rate limiting is functioning
   - Test authentication-protected routes

5. **Performance**
   - Use Vercel Analytics to monitor performance
   - Check for any errors in the Vercel logs
   - Verify that Edge functions are running correctly

## Common Issues and Solutions

### Missing Environment Variables

If the application is deployed but not functioning correctly, check:
1. Vercel project settings to ensure all environment variables are set
2. Environment variable names match exactly (they are case-sensitive)

```bash
# Run the verification script
npm run check-vercel
```

### Authentication Issues

If users can't log in:
1. Verify Supabase URL Configuration is correct
2. Check that the NEXT_PUBLIC_APP_URL matches the actual deployed URL
3. Ensure all required redirect URLs are configured in Supabase

### CORS Issues with Widget

If the chat widget can't connect from external sites:
1. Check the WIDGET_ALLOWED_ORIGINS environment variable
2. Verify that the Vercel.json configuration has the correct CORS headers
3. Test with browser developer tools to see specific CORS errors

### Edge Function Errors

If Edge functions fail:
1. Check Vercel logs for specific errors
2. Verify that all required environment variables are available to Edge functions
3. Ensure that Edge functions have enough memory allocated (in vercel.json)

## Maintaining a Healthy Deployment

1. **Regular Monitoring**
   - Set up alerts for errors in Vercel
   - Monitor API usage and performance

2. **Testing Updates**
   - Create preview deployments for testing before production
   - Use branch deployments for feature testing

3. **Managing Secrets**
   - Rotate API keys periodically
   - Use Vercel's environment variable encryption 