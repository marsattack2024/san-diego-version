-- Simple fix to ensure website_summary column works correctly
-- Step 1: Temporarily disable RLS to test if that's the issue

-- Disable RLS to test if that's the problem
ALTER TABLE sd_user_profiles DISABLE ROW LEVEL SECURITY;

-- Do a direct update as a test
UPDATE sd_user_profiles
SET website_summary = 'Test summary with RLS disabled at ' || NOW()::TEXT,
    updated_at = NOW()
WHERE user_id = '5c80df74-1e2b-4435-89eb-b61b740120e9';

-- Re-enable RLS
ALTER TABLE sd_user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop and recreate all policies to ensure they apply to all columns
DROP POLICY IF EXISTS "Users can insert their own profile" ON sd_user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON sd_user_profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON sd_user_profiles;

-- CREATE policy for SELECT
CREATE POLICY "Users can view their own profile"
  ON sd_user_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- CREATE policy for INSERT
CREATE POLICY "Users can insert their own profile"
  ON sd_user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- CREATE policy for UPDATE
CREATE POLICY "Users can update their own profile"
  ON sd_user_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Verify the table structure and policies
COMMENT ON COLUMN sd_user_profiles.website_summary IS 'Automated summary of the website content';