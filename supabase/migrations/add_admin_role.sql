-- Migration to add admin role functionality
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

-- Create function to check if a user has admin role
CREATE OR REPLACE FUNCTION is_admin(uid UUID) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM sd_user_roles 
    WHERE user_id = uid AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create row level security policies
ALTER TABLE sd_user_roles ENABLE ROW LEVEL SECURITY;

-- Only allow authenticated users to view roles
CREATE POLICY "Users can view their own roles" ON sd_user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Only allow admins to modify roles
CREATE POLICY "Only admins can insert roles" ON sd_user_roles
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Only admins can update roles" ON sd_user_roles
  FOR UPDATE USING (is_admin(auth.uid()));

CREATE POLICY "Only admins can delete roles" ON sd_user_roles
  FOR DELETE USING (is_admin(auth.uid()));

-- Create a helper function to make a user an admin (to be used via Supabase dashboard)
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
  INSERT INTO sd_user_roles (user_id, role) VALUES (uid, 'admin');
  
  -- Update the is_admin flag in user_profiles
  UPDATE sd_user_profiles SET is_admin = TRUE WHERE user_id = uid;
  
  RETURN 'User is now an admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;