# User Profiles in San Diego Project

This document describes the implementation of user business profiles and website summarization for our photography studio application.

## Overview

The user profiles feature allows us to collect and store business information about photography studios when users first log in. This includes the user's full name, business details, and website information. This information is used to provide context to AI responses without requiring users to repeatedly provide the same information in each chat. Additionally, the website summarizer automatically generates concise summaries of users' business websites to further enhance the AI context.

## Database Structure

The user profiles are stored in a `sd_user_profiles` table in Supabase with the following schema:

### Table: sd_user_profiles

| Column Name | Data Type | Description | Constraints |
|-------------|-----------|-------------|------------|
| user_id | UUID | Foreign key to auth.users | PRIMARY KEY, REFERENCES auth.users(id) ON DELETE CASCADE |
| full_name | TEXT | User's full name | NOT NULL |
| company_name | TEXT | Name of the photography business | NOT NULL |
| website_url | TEXT | URL to the business website | NULL allowed |
| company_description | TEXT | Description of the business | NOT NULL |
| location | TEXT | Physical location or service area | NULL allowed |
| created_at | TIMESTAMP WITH TIME ZONE | When the profile was created | DEFAULT NOW() |
| updated_at | TIMESTAMP WITH TIME ZONE | When the profile was last updated | DEFAULT NOW() |
| website_summary | TEXT | AI-generated summary of the website | NULL allowed |
| is_admin | BOOLEAN | Whether the user has admin privileges | DEFAULT FALSE |

**Important Note**: The table does NOT have an `id` column. The primary key is `user_id`, which directly references the auth.users table.

The table has a one-to-one relationship with the `auth.users` table, with cascading deletes to ensure data consistency.

### SQL Definition

```sql
CREATE TABLE IF NOT EXISTS sd_user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  website_url TEXT,
  company_description TEXT NOT NULL,
  location TEXT,
  website_summary TEXT, -- Automated summary of the website content
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Key Files and Implementation Components

### Core Files

1. **Profile Page**:
   - **Path**: `/app/profile/page.tsx`
   - **Purpose**: Server component that handles loading user profile data and renders the profile form
   - **Key Functions**: 
     - Fetches user profile data from Supabase
     - Determines if this is a first login
     - Redirects unauthenticated users to login
   - **Dependencies**: ProfileForm component, createServerClient

2. **Profile Form Component**:
   - **Path**: `/components/profile-form.tsx`
   - **Purpose**: Client component that handles the profile form UI and saving profile data
   - **Key Functions**:
     - Manages form state and validation
     - Handles character limits and validations
     - Performs profile upsert to Supabase
     - Triggers website summarization API
   - **Dependencies**: UI components, createBrowserClient

3. **Middleware Profile Check**:
   - **Path**: `/middleware.ts`
   - **Purpose**: Checks if authenticated users have completed profile setup
   - **Key Implementation Details**:
     - Runs on protected routes (especially /chat)
     - Queries `sd_user_profiles` using `user_id` (not id)
     - Redirects to profile setup if no profile exists
     - Sets profile status headers for caching
   - **Dependencies**: createServerClient from Supabase

4. **Website Summary API**:
   - **Path**: `/app/api/profile/update-summary/route.ts`
   - **Purpose**: API endpoint that handles website summarization
   - **Key Functions**:
     - Scrapes website content
     - Generates AI summary
     - Updates profile with the summary
   - **Dependencies**: scraper tool, AI SDK, Supabase

### Database and Schema

1. **Supabase Migrations**: 
   - **Path**: `supabase/migrations/create_user_profiles_table.sql`
   - **Purpose**: Creates the main profiles table with correct schema

2. **TypeScript Interface**: 
   - **Path**: `lib/db/schema.ts`
   - **Purpose**: TypeScript definition of the UserProfile interface
   - **Fields**: 
     ```typescript
     interface UserProfile {
       user_id: string;
       full_name: string;
       company_name: string;
       website_url?: string;
       company_description: string;
       location?: string;
       created_at?: string;
       updated_at?: string;
       website_summary?: string;
       is_admin?: boolean;
     }
     ```

3. **Database Queries**: 
   - **Path**: `lib/db/queries.ts`
   - **Key Functions**:
     - `getUserProfile`: Fetches user profile by user_id
     - `upsertUserProfile`: Creates or updates a profile

### AI Integration

1. **Prompt Builder**:
   - **Path**: `/lib/chat/prompt-builder.ts`
   - **Purpose**: Enhances chat prompts with user profile context
   - **Key Implementation Detail**: Includes profile data in the system prompt

2. **Website Summarizer**:
   - **Path**: `/lib/agents/tools/website-summarizer.ts`
   - **Purpose**: Logic for summarizing website content using AI
   - **Key Functions**: scrapeAndSummarize, generateSummaryFromContent

## User Profile Flow

### Authentication and Profile Check

1. User registers or logs in using standard authentication
2. On first access to a protected route (like /chat), the middleware checks if they have a profile:
   ```typescript
   // In middleware.ts
   const { data: profile } = await supabase
     .from('sd_user_profiles')
     .select('user_id')  // Important: selects user_id, not id
     .eq('user_id', user.id)
     .single();
   ```
3. If no profile exists, they're redirected to the profile setup page:
   ```typescript
   if (!profile && pathname !== PROFILE_PATH) {
     return NextResponse.redirect(new URL('/profile', request.url));
   }
   ```

### Profile Creation/Update

4. The profile page loads initial profile data if it exists:
   ```typescript
   // In app/profile/page.tsx
   const { data: profile } = await supabase
     .from('sd_user_profiles')
     .select('*')
     .eq('user_id', user.id)
     .single();
   ```

5. User completes/updates the profile form in the UI
   - The form enforces character limits for fields:
     - Company Name: 60 characters
     - Company Description: 300 characters
     - Location: 60 characters
   - Website URL validation ensures it starts with https://

6. Form submission saves profile data using upsert:
   ```typescript
   // In profile-form.tsx
   const { error } = await supabase
     .from('sd_user_profiles')
     .upsert({
       user_id: userId,
       full_name: profile.full_name || '',
       company_name: profile.company_name || '',
       website_url: profile.website_url || '',
       company_description: profile.company_description || '',
       location: profile.location || '',
       updated_at: new Date().toISOString(),
       website_summary: profile.website_summary || ''
     });
   ```

7. After completing the profile setup, new users are redirected to the chat page:
   ```typescript
   if (isFirstLogin) {
     router.push('/chat');
   }
   ```

### Website Summary Generation

8. If a website URL is provided, the system generates a summary in the background:
   ```typescript
   // API call to generate summary
   fetch('/api/profile/update-summary', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ url, userId })
   });
   ```

9. The summarizer API:
   - Scrapes the website content
   - Processes the content with AI
   - Updates the user's profile with the summary
   - Shows a success notification when complete

10. The business context, including the website summary, is automatically included in all AI interactions

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
- Contact: [Full Name]
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

### Profile Redirect Issues

If users are being redirected to the profile page even when they should have a profile:

1. Check that the middleware is using the correct column name:
   ```typescript
   // CORRECT - using user_id column
   const { data: profile } = await supabase
     .from('sd_user_profiles')
     .select('user_id')
     .eq('user_id', user.id)
     .single();
   
   // WRONG - the table does not have an id column
   const { data: profile } = await supabase
     .from('sd_user_profiles')
     .select('id')
     .eq('user_id', user.id)
     .single();
   ```

2. Check that the user has a valid profile in the database:
   ```sql
   SELECT * FROM sd_user_profiles WHERE user_id = '5c80df74-1e2b-4435-89eb-b61b740120e9';
   ```

3. Check the Supabase logs for any errors related to the profile query:
   - Look for PostgreSQL error messages like `column sd_user_profiles.id does not exist`
   - Check if RLS policies are blocking access to the profile data

4. Verify that the auth headers are being properly set for caching:
   ```
   x-has-profile: true
   ```

### Website Summarizer Issues

If the website summarizer is not working:

1. Check that the `OPENAI_API_KEY` environment variable is set correctly
2. Ensure the Supabase connection is working
3. Verify that RLS policies allow updates to the `website_summary` column
4. Check if the website can be scraped (some sites block scrapers)
5. Look for detailed logging messages in the console or server logs

### Common Errors and Solutions

| Error | Description | Solution |
|-------|-------------|----------|
| `column sd_user_profiles.id does not exist` | The middleware is trying to query a non-existent column | Change `select('id')` to `select('user_id')` |
| `Failed to update profile: duplicate key value violates unique constraint` | Trying to create a duplicate profile | Use upsert instead of insert |
| `Failed to generate website summary` | Website summarization process failed | Check if website blocks scrapers, try with a different URL |
| `Error: invalid input syntax for type uuid` | Invalid UUID format in a query | Ensure UUIDs are properly formatted |
| `Error: new row violates row-level security policy` | RLS blocking an operation | Check RLS policies and user authentication

## Optimized Profile State Management

The profile management system has been optimized to reduce database queries and improve performance. This section outlines the enhanced approach to managing user profile state.

### Metadata-First Approach

The optimized system uses Supabase user metadata as the primary indicator of profile completion:

```typescript
// Enhanced user metadata structure
{
  "has_profile": true,
  "profile_updated_at": "2023-05-20T12:00:00Z",
  "profile_summary": {
    "full_name": "John Doe",
    "company_name": "Photography Studio",
    "is_admin": false
  }
}
```

This approach offers several advantages:
- Profile existence can be checked without additional database queries
- Critical profile information is available immediately after authentication
- Changes to profile status are reflected instantly across the application

### Zustand State Management Integration

The auth store has been enhanced to serve as the single source of truth for profile data:

```typescript
// Accessing profile data through the store
const { user, profile, hasProfile, isLoading } = useAuthStore();

// Using profile data in components
if (hasProfile) {
  // User has completed profile setup
} else if (isLoading) {
  // Profile data is being loaded
} else {
  // User needs to complete profile setup
}
```

Key features:
- Centralized profile state management
- Loading states to prevent UI flicker
- Optimistic updates for better user experience

### Database Triggers for Automatic Synchronization

Database triggers automatically sync profile changes to user metadata:

```sql
-- Triggered when a profile is created or updated
CREATE TRIGGER sync_profile_metadata
AFTER INSERT OR UPDATE ON sd_user_profiles
FOR EACH ROW
EXECUTE FUNCTION update_user_profile_metadata();
```

This ensures that:
- User metadata always reflects the current profile status
- No manual synchronization code is needed
- Profile changes are immediately available to all application components

### Simplified Middleware Logic

The middleware has been simplified to rely primarily on user metadata:

```typescript
// Optimized middleware profile check
const hasProfile = user?.user_metadata?.has_profile === true;
if (!hasProfile && pathname !== PROFILE_PATH) {
  return NextResponse.redirect(new URL('/profile', request.url));
}
```

Benefits:
- Reduced database queries
- Faster middleware execution
- Fewer points of failure

### Progressive Profile Completion

The system now supports a progressive approach to profile completion:

1. **Basic Profile**: Users complete essential fields to access the application
2. **Enhanced Profile**: Additional fields can be completed later
3. **Website Summary**: Website summaries are generated in the background

This improves user onboarding by:
- Reducing friction in the initial setup
- Allowing immediate access to core functionality
- Encouraging gradual profile enhancement

### Performance Improvements

The optimized system significantly reduces:
- Database queries: from 5-10 per page load to 0-1
- Auth validation: from multiple checks to a single metadata check
- Redundant operations: eliminated duplicate profile checks

This results in faster page loads, smoother user experience, and reduced database load.

### Implementation Architecture

The optimized profile system follows this architecture:

1. **Authentication**:
   - User logs in via Supabase Auth
   - Auth callback checks user metadata for profile status
   - Redirects based on metadata without database queries

2. **Profile Creation**:
   - Profile form saves to database AND updates user metadata
   - Database trigger ensures metadata stays in sync
   - Client receives immediate confirmation without waiting for database

3. **Profile Access**:
   - Auth store provides centralized access to profile data
   - Components subscribe to profile changes
   - Optimistic UI updates show changes immediately

4. **Profile Updates**:
   - Updates are written to database and reflected in UI immediately
   - Background synchronization ensures consistency
   - Error handling provides fallbacks if updates fail

## Best Practices

1. **Always Use `user_id` as the Primary Key**:
   - The table uses `user_id` as its primary key, not a separate `id` column
   - All queries should use `user_id` for lookups and joins

2. **Error Handling in Profile Queries**:
   - Always include error handling when querying profiles
   - Fallback gracefully when profile data can't be fetched

3. **Character Limits**:
   - Enforce character limits on the client side:
     - Company Name: 60 characters
     - Company Description: 300 characters
     - Location: 60 characters

4. **URL Validation**:
   - Always validate that website URLs start with https://
   - Don't attempt summarization on invalid URLs

5. **Asynchronous Website Summarization**:
   - Don't block the UI while generating website summaries
   - Use placeholder text while summary is being generated
   - Show success notification when summary completes

6. **Middleware Profile Check**:
   - Use `select('user_id')` not `select('id')` in middleware
   - Cache profile checks with response headers
   - Fallback to allowing access on errors rather than blocking users

## Future Enhancements

1. **Performance Improvements**:
   - Add caching to reduce API calls for website summarization
   - Implement background processing for summary generation
   - Add batch summarization for multiple URLs

2. **UX Improvements**:
   - Show progress indicator during website summarization
   - Add real-time updates for summary status
   - Improve error messages for failed summarization

3. **Feature Enhancements**:
   - Add support for multi-language websites
   - Allow uploading a business logo and portfolio examples
   - Add photography specialties/categories selection
   - Implement an admin panel for managing user profiles
   - Add periodic re-summarization for websites that change frequently

4. **Technology Improvements**:
   - Use a more robust web scraper for complex websites
   - Implement vector embeddings for better summarization
   - Add a summary quality scoring system
   - Implement WebSockets for real-time summary updates