-- Create a more comprehensive admin check function that doesn't rely on hardcoded IDs
CREATE OR REPLACE FUNCTION is_admin(uid UUID) RETURNS BOOLEAN AS $$
BEGIN
  -- Check roles table first
  IF EXISTS (SELECT 1 FROM sd_user_roles WHERE user_id = uid AND role = 'admin') THEN
    RETURN TRUE;
  END IF;
  
  -- Fallback to profile flag
  IF EXISTS (SELECT 1 FROM sd_user_profiles WHERE user_id = uid AND is_admin = TRUE) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure all is_admin=true profiles have admin role entries
INSERT INTO sd_user_roles (user_id, role)
SELECT user_id, 'admin' FROM sd_user_profiles 
WHERE is_admin = TRUE
AND NOT EXISTS (SELECT 1 FROM sd_user_roles WHERE role = 'admin' AND user_id = sd_user_profiles.user_id);

-- Ensure all admin role entries have is_admin=true in profiles
UPDATE sd_user_profiles SET is_admin = TRUE
WHERE user_id IN (SELECT user_id FROM sd_user_roles WHERE role = 'admin')
AND (is_admin IS NULL OR is_admin = FALSE);

-- Create a diagnostic function to list all admin users
CREATE OR REPLACE FUNCTION list_all_admins() 
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  from_roles BOOLEAN,
  from_profiles BOOLEAN
) 
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.email,
    EXISTS (SELECT 1 FROM sd_user_roles r WHERE r.user_id = u.id AND r.role = 'admin') AS from_roles,
    EXISTS (SELECT 1 FROM sd_user_profiles p WHERE p.user_id = u.id AND p.is_admin = TRUE) AS from_profiles
  FROM 
    auth.users u
  WHERE
    EXISTS (SELECT 1 FROM sd_user_roles r WHERE r.user_id = u.id AND r.role = 'admin')
    OR
    EXISTS (SELECT 1 FROM sd_user_profiles p WHERE p.user_id = u.id AND p.is_admin = TRUE);
END;
$$ LANGUAGE plpgsql;