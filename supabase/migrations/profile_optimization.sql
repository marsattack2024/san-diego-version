-- Migration for profile optimization

-- Create a function to check if a user has a profile (faster than direct query)
CREATE OR REPLACE FUNCTION public.has_profile(uid uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM sd_user_profiles
    WHERE user_id = uid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to update user metadata when profile is created
CREATE OR REPLACE FUNCTION update_user_has_profile()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = 
    jsonb_set(
      COALESCE(raw_user_meta_data, '{}'::jsonb),
      '{has_profile}',
      'true'::jsonb
    )
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger to set has_profile flag when profile is created
DROP TRIGGER IF EXISTS set_has_profile ON sd_user_profiles;
CREATE TRIGGER set_has_profile
AFTER INSERT ON sd_user_profiles
FOR EACH ROW
EXECUTE FUNCTION update_user_has_profile();

-- Update existing users to set has_profile in metadata
UPDATE auth.users AS u
SET raw_user_meta_data = 
  jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{has_profile}',
    'true'::jsonb
  )
FROM sd_user_profiles AS p
WHERE u.id = p.user_id;