-- User Profiles Table for Photography Studios
-- Run this SQL in the Supabase SQL Editor (https://app.supabase.io/project/_/sql)

-- Create user profiles table with business information
CREATE TABLE IF NOT EXISTS sd_user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  website_url TEXT,
  company_description TEXT NOT NULL,
  location TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster user lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON sd_user_profiles(user_id);

-- Create trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sd_user_profiles_updated_at
BEFORE UPDATE ON sd_user_profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on the table (CRITICAL FOR SECURITY)
ALTER TABLE sd_user_profiles ENABLE ROW LEVEL SECURITY;

-- Grant access to authenticated users for their own profile
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

-- Allow admins to view all profiles (uncomment if you have admin roles set up)
-- CREATE POLICY "Admins can view all profiles"
--   ON sd_user_profiles
--   FOR SELECT
--   USING (auth.uid() IN (SELECT user_id FROM sd_user_roles WHERE role = 'admin'));

-- Grant table access to authenticated users
GRANT SELECT, INSERT, UPDATE ON sd_user_profiles TO authenticated;

-- IMPORTANT: Ensure the foreign key works with auth.users
-- If you're getting foreign key errors, make sure public has references permission on auth.users
GRANT REFERENCES ON auth.users TO public;

-- If you need to drop the table for any reason (CAUTION: DELETES ALL DATA)
-- DROP TABLE IF EXISTS sd_user_profiles CASCADE;