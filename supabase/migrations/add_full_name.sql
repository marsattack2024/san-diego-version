-- Add full_name column to user profiles table
ALTER TABLE IF EXISTS sd_user_profiles ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Update any existing profiles to use metadata name if available
UPDATE sd_user_profiles p
SET full_name = u.raw_user_meta_data->>'name'
FROM auth.users u
WHERE p.user_id = u.id
  AND p.full_name IS NULL
  AND u.raw_user_meta_data->>'name' IS NOT NULL;

-- Create a trigger function to auto-populate full_name from auth metadata
CREATE OR REPLACE FUNCTION set_default_full_name()
RETURNS TRIGGER AS $$
BEGIN
  -- If full_name is not provided, try to get it from auth.users metadata
  IF NEW.full_name IS NULL OR NEW.full_name = '' THEN
    -- Try to get name from auth metadata
    NEW.full_name := (
      SELECT raw_user_meta_data->>'name'
      FROM auth.users
      WHERE id = NEW.user_id
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS set_default_full_name_trigger ON sd_user_profiles;
CREATE TRIGGER set_default_full_name_trigger
BEFORE INSERT OR UPDATE ON sd_user_profiles
FOR EACH ROW
EXECUTE FUNCTION set_default_full_name();