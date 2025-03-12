-- Update the private_is_admin function to include a fallback for known admin users
CREATE OR REPLACE FUNCTION private_is_admin(uid UUID) RETURNS BOOLEAN AS $$
DECLARE
  -- Hard-code known admin users as a fallback
  known_admin_ids UUID[] := ARRAY['5c80df74-1e2b-4435-89eb-b61b740120e9'::UUID];
BEGIN
  -- First check if the user has the admin role in sd_user_roles
  IF EXISTS (
    SELECT 1 FROM sd_user_roles 
    WHERE user_id = uid AND role = 'admin'
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- If not found in roles table, check if they're in the known admin list
  RETURN uid = ANY(known_admin_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the RLS policy for sd_user_profiles to use the roles table
DROP POLICY IF EXISTS "Admins can view all profiles" ON sd_user_profiles;

-- Create a new policy that uses the roles table instead
CREATE POLICY "Admins can view all profiles" 
ON sd_user_profiles FOR SELECT 
USING (
  auth.uid() IN (
    SELECT user_id FROM sd_user_roles WHERE role = 'admin'
  ) OR auth.uid() = '5c80df74-1e2b-4435-89eb-b61b740120e9'
);

-- Make sure the sd_user_roles table has appropriate RLS
ALTER TABLE sd_user_roles ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read from the roles table
CREATE POLICY IF NOT EXISTS "Anyone can read user roles" 
ON sd_user_roles FOR SELECT 
USING (true);

-- Only service role can modify roles
CREATE POLICY IF NOT EXISTS "Only service role can modify roles" 
ON sd_user_roles FOR ALL 
USING (auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (auth.jwt() ->> 'role' = 'service_role'); 