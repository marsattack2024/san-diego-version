-- Improved migration to add admin role functionality
-- Addresses circular dependency, redundant storage, and first admin setup issues

-- Add is_admin column to user profiles if it doesn't exist
ALTER TABLE IF EXISTS sd_user_profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Create user roles table if it doesn't exist
CREATE TABLE IF NOT EXISTS sd_user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on user_id and role for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON sd_user_roles(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_user_role ON sd_user_roles(user_id, role);

-- Create a private admin check function that bypasses RLS
-- This avoids the circular dependency problem
CREATE OR REPLACE FUNCTION private_is_admin(uid UUID) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM sd_user_roles 
    WHERE user_id = uid AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Public function that uses the private function
CREATE OR REPLACE FUNCTION is_admin(uid UUID) RETURNS BOOLEAN AS $$
BEGIN
  RETURN private_is_admin(uid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create row level security policies
ALTER TABLE sd_user_roles ENABLE ROW LEVEL SECURITY;

-- Only allow authenticated users to view roles
CREATE POLICY "Users can view their own roles" ON sd_user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Only allow admins to modify roles
CREATE POLICY "Only admins can insert roles" ON sd_user_roles
  FOR INSERT WITH CHECK (private_is_admin(auth.uid()));

CREATE POLICY "Only admins can update roles" ON sd_user_roles
  FOR UPDATE USING (private_is_admin(auth.uid()));

CREATE POLICY "Only admins can delete roles" ON sd_user_roles
  FOR DELETE USING (private_is_admin(auth.uid()));

-- Create a trigger to keep the profile.is_admin in sync with user_roles
CREATE OR REPLACE FUNCTION sync_admin_role() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.role = 'admin' THEN
    UPDATE sd_user_profiles SET is_admin = TRUE WHERE user_id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' AND OLD.role = 'admin' THEN
    UPDATE sd_user_profiles SET is_admin = FALSE WHERE user_id = OLD.user_id 
      AND NOT EXISTS (SELECT 1 FROM sd_user_roles WHERE user_id = OLD.user_id AND role = 'admin');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sync_user_admin_role
AFTER INSERT OR DELETE ON sd_user_roles
FOR EACH ROW
EXECUTE FUNCTION sync_admin_role();

-- Create a helper function to make a user an admin (to be used via Supabase dashboard)
-- Using SECURITY DEFINER to bypass row security
CREATE OR REPLACE FUNCTION make_user_admin(user_email TEXT) RETURNS TEXT AS $$
DECLARE
  uid UUID;
BEGIN
  -- Find the user by email
  SELECT id INTO uid FROM auth.users WHERE email = user_email;
  
  IF uid IS NULL THEN
    RETURN 'User not found';
  END IF;
  
  -- Check if already an admin
  IF EXISTS (SELECT 1 FROM sd_user_roles WHERE user_id = uid AND role = 'admin') THEN
    RETURN 'User is already an admin';
  END IF;
  
  -- Insert the admin role
  -- The trigger will update the is_admin flag in user_profiles
  INSERT INTO sd_user_roles (user_id, role) VALUES (uid, 'admin');
  
  RETURN 'User is now an admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a helper function to revoke admin privileges
CREATE OR REPLACE FUNCTION revoke_admin(user_email TEXT) RETURNS TEXT AS $$
DECLARE
  uid UUID;
BEGIN
  -- Find the user by email
  SELECT id INTO uid FROM auth.users WHERE email = user_email;
  
  IF uid IS NULL THEN
    RETURN 'User not found';
  END IF;
  
  -- Check if the user is an admin
  IF NOT EXISTS (SELECT 1 FROM sd_user_roles WHERE user_id = uid AND role = 'admin') THEN
    RETURN 'User is not an admin';
  END IF;
  
  -- Delete the admin role
  -- The trigger will update the is_admin flag in user_profiles
  DELETE FROM sd_user_roles WHERE user_id = uid AND role = 'admin';
  
  RETURN 'Admin privileges revoked';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to set up the first admin - can only be executed by service role
-- This solves the chicken-and-egg problem
CREATE OR REPLACE FUNCTION setup_first_admin(user_email TEXT) RETURNS TEXT AS $$
DECLARE
  uid UUID;
BEGIN
  -- Find the user by email
  SELECT id INTO uid FROM auth.users WHERE email = user_email;
  
  IF uid IS NULL THEN
    RETURN 'User not found';
  END IF;
  
  -- Directly insert the admin role bypassing RLS
  INSERT INTO sd_user_roles (user_id, role) VALUES (uid, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  -- Directly update the profile
  UPDATE sd_user_profiles SET is_admin = TRUE WHERE user_id = uid;
  
  RETURN 'First admin user set up successfully';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;