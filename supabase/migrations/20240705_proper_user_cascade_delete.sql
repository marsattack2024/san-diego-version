-- Comprehensive fix for user deletion cascade issues
-- This migration ensures that deleting a user from auth.users automatically cascades to all related tables

-- 1. First ensure all foreign keys have proper ON DELETE CASCADE constraints
ALTER TABLE IF EXISTS sd_user_profiles
  DROP CONSTRAINT IF EXISTS sd_user_profiles_user_id_fkey,
  ADD CONSTRAINT sd_user_profiles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS sd_user_roles
  DROP CONSTRAINT IF EXISTS sd_user_roles_user_id_fkey,
  ADD CONSTRAINT sd_user_roles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS sd_chat_sessions
  DROP CONSTRAINT IF EXISTS sd_chat_sessions_user_id_fkey,
  ADD CONSTRAINT sd_chat_sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Create the audit logs table needed by Supabase for proper auditing
CREATE TABLE IF NOT EXISTS sd_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  actor_id UUID, -- The user who performed the action
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on entity_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON sd_audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON sd_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON sd_audit_logs(action);

-- 3. Create a trigger on auth.users to ensure proper cascading deletion
-- This is a backup mechanism in case the foreign key cascades don't work
CREATE OR REPLACE FUNCTION trigger_cascade_delete_user() 
RETURNS TRIGGER AS $$
BEGIN
  -- Log the deletion to audit logs
  INSERT INTO sd_audit_logs (
    action, 
    entity_type, 
    entity_id, 
    actor_id, 
    details
  ) VALUES (
    'user_deleted',
    'user',
    OLD.id,
    auth.uid(),
    jsonb_build_object(
      'email', OLD.email,
      'deleted_at', now(),
      'triggered_by', 'trigger_cascade_delete_user'
    )
  );

  -- Make sure to delete from all related tables
  DELETE FROM sd_user_roles WHERE user_id = OLD.id;
  DELETE FROM sd_user_profiles WHERE user_id = OLD.id;
  DELETE FROM sd_chat_sessions WHERE user_id = OLD.id;

  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN
    -- If any errors occur, log them but allow the deletion to proceed
    RAISE NOTICE 'Error in cascade delete trigger: %', SQLERRM;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the trigger if it exists to avoid duplicates
DROP TRIGGER IF EXISTS tg_cascade_delete_user ON auth.users;

-- Create the trigger
CREATE TRIGGER tg_cascade_delete_user
BEFORE DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION trigger_cascade_delete_user();

-- 4. Create admin functions for proper user deletion

-- Function to delete user with proper cleanup (used by the API)
CREATE OR REPLACE FUNCTION admin_delete_user(user_id_param UUID) 
RETURNS BOOLEAN AS $$
DECLARE
  result BOOLEAN;
BEGIN
  -- Try to directly delete from auth.users
  -- This should cascade to all related tables due to foreign key constraints
  DELETE FROM auth.users WHERE id = user_id_param;
  
  -- Check if the deletion was successful
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_id_param) THEN
    result := TRUE;
  ELSE
    -- If direct deletion failed, try cleaning up related records first
    DELETE FROM sd_user_roles WHERE user_id = user_id_param;
    DELETE FROM sd_user_profiles WHERE user_id = user_id_param;
    DELETE FROM sd_chat_sessions WHERE user_id = user_id_param;
    
    -- Try again to delete from auth.users
    DELETE FROM auth.users WHERE id = user_id_param;
    
    -- Final check
    result := NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_id_param);
  END IF;
  
  -- Record the operation in audit logs
  INSERT INTO sd_audit_logs (
    action, 
    entity_type, 
    entity_id, 
    actor_id, 
    details
  ) VALUES (
    'user_deleted',
    'user',
    user_id_param,
    auth.uid(),
    jsonb_build_object(
      'deleted_at', now(),
      'success', result,
      'method', 'admin_delete_user'
    )
  );
  
  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error to audit logs
    BEGIN
      INSERT INTO sd_audit_logs (
        action, 
        entity_type, 
        entity_id, 
        actor_id, 
        details
      ) VALUES (
        'user_deletion_error',
        'user',
        user_id_param,
        auth.uid(),
        jsonb_build_object(
          'error', SQLERRM,
          'timestamp', now()
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        -- If even logging fails, just continue
        NULL;
    END;
    
    -- Re-raise the exception
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Grant appropriate permissions to the service role
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT SELECT, DELETE ON auth.users TO service_role;
GRANT EXECUTE ON FUNCTION admin_delete_user TO service_role;
GRANT EXECUTE ON FUNCTION trigger_cascade_delete_user TO service_role;

-- 6. Add function to verify cascade behavior
CREATE OR REPLACE FUNCTION verify_user_delete_cascade() 
RETURNS TABLE(
  user_id UUID,
  auth_deleted BOOLEAN,
  profile_deleted BOOLEAN,
  roles_deleted BOOLEAN,
  chat_deleted BOOLEAN
) AS $$
DECLARE
  test_user_id UUID;
  test_email TEXT := 'test_cascade_delete_' || gen_random_uuid() || '@example.com';
BEGIN
  -- Create a test user
  INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    email_confirmed_at
  ) VALUES (
    gen_random_uuid(),
    test_email,
    '$2a$10$abcdefghijklmnopqrstuvwxyz012345', -- fake password hash
    now()
  ) RETURNING id INTO test_user_id;
  
  -- Create profile, role, and chat records
  INSERT INTO sd_user_profiles (user_id, full_name) 
  VALUES (test_user_id, 'Test User');
  
  INSERT INTO sd_user_roles (user_id, role)
  VALUES (test_user_id, 'user');
  
  INSERT INTO sd_chat_sessions (user_id, title)
  VALUES (test_user_id, 'Test Session');
  
  -- Delete the user and check what cascaded
  BEGIN
    EXECUTE 'DELETE FROM auth.users WHERE id = $1' USING test_user_id;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN QUERY SELECT 
        test_user_id, 
        FALSE,
        FALSE,
        FALSE, 
        FALSE;
      RETURN;
  END;
  
  -- Check what was deleted
  RETURN QUERY SELECT 
    test_user_id,
    NOT EXISTS (SELECT 1 FROM auth.users WHERE id = test_user_id),
    NOT EXISTS (SELECT 1 FROM sd_user_profiles WHERE user_id = test_user_id),
    NOT EXISTS (SELECT 1 FROM sd_user_roles WHERE user_id = test_user_id),
    NOT EXISTS (SELECT 1 FROM sd_chat_sessions WHERE user_id = test_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;