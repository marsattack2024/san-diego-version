-- Migration to optimize profile state management
-- Date: 2025-03-21

-- Function to sync existing profiles with user metadata
-- This is used for a one-time sync of existing profiles
CREATE OR REPLACE FUNCTION sync_profile_metadata()
RETURNS void AS $$
BEGIN
  -- Sync profile data to user metadata
  UPDATE auth.users u
  SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb), 
    '{has_profile}', 
    'true'
  )
  FROM sd_user_profiles p
  WHERE u.id = p.user_id
  AND (raw_user_meta_data->>'has_profile') IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update user metadata whenever a profile is inserted or updated
CREATE OR REPLACE FUNCTION update_user_profile_metadata()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the user's metadata to indicate they have a profile
  UPDATE auth.users
  SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{has_profile}',
    'true'
  )
  WHERE id = NEW.user_id;

  -- Also store a basic profile summary in the metadata for faster access
  UPDATE auth.users
  SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{profile_summary}',
    jsonb_build_object(
      'full_name', NEW.full_name,
      'company_name', NEW.company_name,
      'is_admin', NEW.is_admin,
      'updated_at', extract(epoch from NEW.updated_at)
    )
  )
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to automatically update user metadata when a profile is created or updated
DROP TRIGGER IF EXISTS sync_profile_metadata ON sd_user_profiles;
CREATE TRIGGER sync_profile_metadata
AFTER INSERT OR UPDATE ON sd_user_profiles
FOR EACH ROW
EXECUTE FUNCTION update_user_profile_metadata();

-- Function to check if a user has a profile (more efficient than direct query)
CREATE OR REPLACE FUNCTION has_profile(uid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  has_profile_flag BOOLEAN;
BEGIN
  -- First check the user metadata (fastest)
  SELECT (raw_user_meta_data->>'has_profile')::BOOLEAN INTO has_profile_flag
  FROM auth.users
  WHERE id = uid;
  
  -- If we found the flag in metadata, return it
  IF has_profile_flag IS NOT NULL THEN
    RETURN has_profile_flag;
  END IF;
  
  -- Otherwise check the profiles table
  RETURN EXISTS (
    SELECT 1 FROM sd_user_profiles WHERE user_id = uid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the sync function once to update existing profiles
SELECT sync_profile_metadata();

-- Add a comment explaining the migration
COMMENT ON FUNCTION sync_profile_metadata() IS 'One-time function to sync existing user profiles to user metadata';
COMMENT ON FUNCTION update_user_profile_metadata() IS 'Trigger function to keep user metadata in sync with profile changes';
COMMENT ON FUNCTION has_profile(UUID) IS 'Efficient function to check if a user has a profile using metadata first'; 