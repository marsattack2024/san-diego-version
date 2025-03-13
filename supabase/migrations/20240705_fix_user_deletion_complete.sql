-- Comprehensive fix for user deletion issues
-- Note: user_stats and orphaned_user_data are VIEWS (not tables)
-- Tables: sd_audit_logs, sd_chat_histories, sd_chat_sessions, sd_user_profiles, sd_user_roles, auth.users

-- 1. Make sure the audit logs table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_tables WHERE tablename = 'sd_audit_logs' AND schemaname = 'public'
  ) THEN
    CREATE TABLE sd_audit_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      event_type TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id UUID,
      details JSONB,
      performed_by UUID, -- can be null for system actions
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    -- Create index for faster lookups
    CREATE INDEX idx_audit_logs_resource_id ON sd_audit_logs(resource_id);
    CREATE INDEX idx_audit_logs_performed_by ON sd_audit_logs(performed_by);
    CREATE INDEX idx_audit_logs_event_type ON sd_audit_logs(event_type);
  END IF;
END;
$$;

-- 2. Ensure all tables have proper ON DELETE CASCADE foreign key constraints
-- This fixes cases where users can't be properly deleted

-- sd_user_profiles
ALTER TABLE IF EXISTS sd_user_profiles
  DROP CONSTRAINT IF EXISTS sd_user_profiles_user_id_fkey,
  ADD CONSTRAINT sd_user_profiles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- sd_user_roles
ALTER TABLE IF EXISTS sd_user_roles
  DROP CONSTRAINT IF EXISTS sd_user_roles_user_id_fkey,
  ADD CONSTRAINT sd_user_roles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- sd_chat_sessions
ALTER TABLE IF EXISTS sd_chat_sessions
  DROP CONSTRAINT IF EXISTS sd_chat_sessions_user_id_fkey,
  ADD CONSTRAINT sd_chat_sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Create enhanced version of complete_user_deletion with more robust error handling
CREATE OR REPLACE FUNCTION complete_user_deletion(user_id_param UUID)
RETURNS TEXT AS $$
DECLARE
  result TEXT;
BEGIN
  -- Try to record the action in audit logs
  BEGIN
    INSERT INTO sd_audit_logs (
      event_type,
      resource_type,
      resource_id,
      details,
      performed_by
    ) VALUES (
      'user_deleted',
      'user',
      user_id_param,
      jsonb_build_object('method', 'complete_user_deletion'),
      auth.uid()
    );
  EXCEPTION WHEN OTHERS THEN
    -- Continue even if audit logging fails
    NULL;
  END;

  -- Delete from all application tables
  DELETE FROM sd_user_roles WHERE user_id = user_id_param;
  DELETE FROM sd_user_profiles WHERE user_id = user_id_param;
  DELETE FROM sd_chat_sessions WHERE user_id = user_id_param;
  
  -- Try to delete from auth.users (will fail if no permissions)
  BEGIN
    DELETE FROM auth.users WHERE id = user_id_param;
    result := 'User and all associated data deleted successfully';
  EXCEPTION WHEN OTHERS THEN
    result := 'Application data deleted, but auth record could not be removed: ' || SQLERRM;
  END;
  
  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'Error deleting user: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create a safer version that only deletes application data
CREATE OR REPLACE FUNCTION safe_delete_user_data(user_id_param UUID)
RETURNS TEXT AS $$
DECLARE
  result TEXT;
BEGIN
  -- Try to record the action in audit logs
  BEGIN
    INSERT INTO sd_audit_logs (
      event_type,
      resource_type,
      resource_id,
      details,
      performed_by
    ) VALUES (
      'user_data_deleted',
      'user',
      user_id_param,
      jsonb_build_object('method', 'safe_delete_user_data'),
      auth.uid()
    );
  EXCEPTION WHEN OTHERS THEN
    -- Continue even if audit logging fails
    NULL;
  END;

  -- Delete from all application tables
  DELETE FROM sd_user_roles WHERE user_id = user_id_param;
  DELETE FROM sd_user_profiles WHERE user_id = user_id_param;
  DELETE FROM sd_chat_sessions WHERE user_id = user_id_param;
  
  RETURN 'User application data deleted successfully. User still exists in auth system.';
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'Error deleting user data: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create direct auth user deletion function (requires admin privileges)
CREATE OR REPLACE FUNCTION admin_delete_auth_user(user_id_param UUID)
RETURNS TEXT AS $$
DECLARE
  result TEXT;
BEGIN
  -- Try to delete directly from auth.users
  BEGIN
    DELETE FROM auth.users WHERE id = user_id_param;
    result := 'Auth user deleted successfully';
  EXCEPTION WHEN OTHERS THEN
    result := 'Error deleting auth user: ' || SQLERRM;
  END;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to check if a user exists
CREATE OR REPLACE FUNCTION does_user_exist(user_id_param UUID)
RETURNS TABLE(
  auth_exists BOOLEAN,
  profile_exists BOOLEAN,
  roles_exist BOOLEAN,
  chat_sessions_exist BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    EXISTS(SELECT 1 FROM auth.users WHERE id = user_id_param),
    EXISTS(SELECT 1 FROM sd_user_profiles WHERE user_id = user_id_param),
    EXISTS(SELECT 1 FROM sd_user_roles WHERE user_id = user_id_param),
    EXISTS(SELECT 1 FROM sd_chat_sessions WHERE user_id = user_id_param);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Grant appropriate permissions
GRANT EXECUTE ON FUNCTION complete_user_deletion TO service_role;
GRANT EXECUTE ON FUNCTION safe_delete_user_data TO service_role;
GRANT EXECUTE ON FUNCTION admin_delete_auth_user TO service_role;
GRANT EXECUTE ON FUNCTION does_user_exist TO service_role;