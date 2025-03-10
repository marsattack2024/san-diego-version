-- Create user profiles table with business information
CREATE TABLE IF NOT EXISTS sd_user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT,
  website_url TEXT,
  company_description TEXT,
  location TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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

-- Enable RLS on the table
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