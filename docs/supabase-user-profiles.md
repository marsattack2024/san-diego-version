# User Profiles Feature

This document describes the implementation of user business profiles and website summarization for our photography studio application.

## Overview

The user profiles feature allows us to collect and store business information about photography studios when users first log in. This information is used to provide context to AI responses without requiring users to repeatedly provide the same information in each chat. Additionally, the website summarizer automatically generates concise summaries of users' business websites to further enhance the AI context.

## Database Structure

The user profiles are stored in a `sd_user_profiles` table in Supabase with the following schema:

```sql
CREATE TABLE IF NOT EXISTS sd_user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  website_url TEXT,
  company_description TEXT NOT NULL,
  location TEXT,
  website_summary TEXT, -- Automated summary of the website content
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

The table has a one-to-one relationship with the `auth.users` table, with cascading deletes to ensure data consistency.

## Implementation Components

1. **Supabase Migrations**: 
   - `supabase/migrations/create_user_profiles_table.sql`: Creates the main profiles table
   - `supabase/migrations/add_website_summary.sql`: Adds the website summary column

2. **TypeScript Interfaces**: The schema is defined in TypeScript in `lib/db/schema.ts`.

3. **Database Queries**: Functions for working with user profiles are in `lib/db/queries.ts`:
   - `getUserProfile`: Retrieves a user profile by user ID
   - `upsertUserProfile`: Creates or updates a user profile

4. **Profile Setup UI**: The `components/profile-setup.tsx` component provides a form for users to enter their business information and triggers website summarization.

5. **Website Summarizer**: The `lib/agents/tools/website-summarizer.ts` contains the logic for scraping website content and generating summaries using AI.

6. **Profile Page**: The `/app/profile/page.tsx` handles both first-time setup and profile updates.

7. **Middleware**: The middleware checks if a user has a profile when they access protected routes, redirecting to profile setup on first login.

8. **Chat Context**: The chat API includes user profile information (including website summary) in the AI context.

## User Profile Flow

1. User registers or logs in using standard authentication
2. On first access to a protected route (like /chat), the middleware checks if they have a profile
3. If no profile exists, they're redirected to the profile setup page
4. User completes the profile setup form, including their website URL
5. After completing the profile setup, they're redirected to their original destination
6. In the background, the system generates a summary of their website content
7. The business context, including the website summary, is automatically included in all AI interactions

## Website Summarization Process

When a user saves their profile with a website URL:

1. The profile is saved with a placeholder message: "Website Summary: [Summary will be generated in background...]"
2. A background process starts that:
   - Scrapes the website content using the comprehensive scraper tool
   - Truncates content to 10,000 characters for faster processing
   - Sends the content to the AI model (gpt-4o-mini) for summarization
   - Formats the summary with a consistent "Website Summary:" prefix
   - Updates the user's profile in the database with the complete summary

This process happens asynchronously so users can continue using the application without waiting for the summary to be generated.

## AI Context Enhancement

When a user chats with the AI, their business profile and website summary are automatically included in the system prompt:

```
### PHOTOGRAPHY BUSINESS CONTEXT ###
You are speaking with a photography studio with the following details:
- Studio Name: [Company Name]
- Website: [Website URL]
- Location: [Location]
- Description: [Company Description]
- [Website Summary]

Please tailor your responses to be relevant to their photography business. This is a professional context where they are looking for assistance with their photography studio needs.
```

This allows the AI to provide more personalized and relevant responses based on rich information about the user's photography business.

## Technical Implementation

### Website Summarizer

The website summarizer in `lib/agents/tools/website-summarizer.ts` is optimized for performance:

- Uses a faster model (gpt-4o-mini) for better response times
- Limits content to 10,000 characters for faster AI processing
- Sets token limits for generation (250 tokens)
- Default summary word limit of 200 words

The prompt is tailored to extract photography-specific information:
- Type of photography offered (weddings, portraits, etc.)
- Style and approach
- Specializations and unique selling points
- Geographic service areas
- Target clientele
- Special packages or services

### Profile Setup Component

The profile setup component in `components/profile-setup.tsx` handles:
- Initial form display and validation
- Saving the profile with a placeholder summary
- Triggering the background summarization process
- Updating the database with the generated summary

### Testing

Test scripts are available for verifying the website summarizer:

```bash
# Test the website summarizer with a specific URL
npm run test:website-summarizer -- https://example.com

# Check if a summary was saved to a user's profile
npm run test:profile-summary -- user-id-here
```

## Security

The Supabase RLS policies ensure users can only view and edit their own profiles:

```sql
CREATE POLICY "Users can view their own profile"
  ON sd_user_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON sd_user_profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON sd_user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

## Troubleshooting

If the website summarizer is not working:

1. Check that the `OPENAI_API_KEY` environment variable is set correctly
2. Ensure the Supabase connection is working
3. Verify that RLS policies allow updates to the `website_summary` column
4. Check if the website can be scraped (some sites block scrapers)
5. Look for detailed logging messages in the console or server logs

## Future Enhancements

1. Add caching to reduce API calls for website summarization
2. Improve scraping for complex websites or single-page applications
3. Add support for multi-language websites
4. Allow uploading a business logo and portfolio examples
5. Add photography specialties/categories selection
6. Implement an admin panel for managing user profiles
7. Add periodic re-summarization for websites that change frequently