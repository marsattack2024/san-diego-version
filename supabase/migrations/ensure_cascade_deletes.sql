-- Ensure Proper Cascade Deletion Behavior for All User-Related Tables
-- This migration ensures that when a user is deleted from auth.users, all related data is properly deleted

-- 1. Verify and fix foreign key constraints in sd_user_profiles
ALTER TABLE IF EXISTS sd_user_profiles
  DROP CONSTRAINT IF EXISTS sd_user_profiles_user_id_fkey,
  ADD CONSTRAINT sd_user_profiles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Verify and fix foreign key constraints in sd_user_roles
ALTER TABLE IF EXISTS sd_user_roles
  DROP CONSTRAINT IF EXISTS sd_user_roles_user_id_fkey,
  ADD CONSTRAINT sd_user_roles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Verify and fix foreign key constraints in sd_chat_sessions
ALTER TABLE IF EXISTS sd_chat_sessions
  DROP CONSTRAINT IF EXISTS sd_chat_sessions_user_id_fkey,
  ADD CONSTRAINT sd_chat_sessions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 4. Verify and fix foreign key constraints in sd_chat_histories
ALTER TABLE IF EXISTS sd_chat_histories
  DROP CONSTRAINT IF EXISTS sd_chat_histories_user_id_fkey,
  ADD CONSTRAINT sd_chat_histories_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 5. Verify and fix foreign key constraints in any other user-related tables
ALTER TABLE IF EXISTS sd_documents
  DROP CONSTRAINT IF EXISTS sd_documents_user_id_fkey,
  ADD CONSTRAINT sd_documents_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 6. Add a trigger to clean up any orphaned records that might exist
CREATE OR REPLACE FUNCTION clean_orphaned_user_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete any orphaned user profiles
  DELETE FROM sd_user_profiles
  WHERE user_id NOT IN (SELECT id FROM auth.users);
  
  -- Delete any orphaned user roles
  DELETE FROM sd_user_roles
  WHERE user_id NOT IN (SELECT id FROM auth.users);
  
  -- Delete any orphaned chat sessions
  DELETE FROM sd_chat_sessions
  WHERE user_id NOT IN (SELECT id FROM auth.users);
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create or replace the trigger
DROP TRIGGER IF EXISTS trigger_clean_orphaned_user_data ON auth.users;
CREATE TRIGGER trigger_clean_orphaned_user_data
AFTER DELETE ON auth.users
FOR EACH STATEMENT
EXECUTE FUNCTION clean_orphaned_user_data();

-- 7. Create a trigger function to handle any special cleanup that might be required
-- when a user record is deleted from auth.users
CREATE OR REPLACE FUNCTION process_auth_user_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- Log deletion for audit purposes
  INSERT INTO sd_audit_logs (
    event_type,
    resource_type,
    resource_id,
    details,
    performed_by
  ) VALUES (
    'user_deleted',
    'user',
    OLD.id,
    jsonb_build_object('email', OLD.email),
    current_setting('request.jwt.claims', true)::jsonb->>'sub'
  );
  
  -- Special cleanup operations could be added here
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create or replace the trigger
DROP TRIGGER IF EXISTS trigger_process_auth_user_deletion ON auth.users;
CREATE TRIGGER trigger_process_auth_user_deletion
BEFORE DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION process_auth_user_deletion();

-- 8. Create a function to perform a complete user deletion
CREATE OR REPLACE FUNCTION complete_user_deletion(user_id UUID)
RETURNS TEXT AS $$
DECLARE
  result TEXT;
BEGIN
  -- Step 1: Delete from sd_user_profiles
  DELETE FROM sd_user_profiles WHERE user_id = $1;
  
  -- Step 2: Delete from sd_user_roles
  DELETE FROM sd_user_roles WHERE user_id = $1;
  
  -- Step 3: Delete from sd_chat_sessions 
  -- (should cascade to sd_chat_histories)
  DELETE FROM sd_chat_sessions WHERE user_id = $1;
  
  -- Step 4: Delete from auth.users
  -- This requires admin privileges
  DELETE FROM auth.users WHERE id = $1;
  
  RETURN 'User and all associated data deleted successfully';
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'Error deleting user: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Add a check to validate proper foreign key relationships
CREATE OR REPLACE FUNCTION validate_foreign_key_cascade()
RETURNS TABLE(table_name TEXT, has_proper_cascade BOOLEAN) AS $$
BEGIN
  RETURN QUERY
  WITH fk_constraints AS (
    SELECT
      tc.table_schema || '.' || tc.table_name AS source_table,
      tc.constraint_name,
      ccu.table_schema || '.' || ccu.table_name AS target_table,
      rc.delete_rule
    FROM
      information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
      AND tc.table_schema = rc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON rc.unique_constraint_name = ccu.constraint_name
      AND rc.unique_constraint_schema = ccu.table_schema
    WHERE
      tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_schema = 'auth'
      AND ccu.table_name = 'users'
  )
  SELECT
    split_part(source_table, '.', 2) AS table_name,
    delete_rule = 'CASCADE' AS has_proper_cascade
  FROM
    fk_constraints;
END;
$$ LANGUAGE plpgsql;

-- 10. Update audit log schema if it doesn't exist
CREATE TABLE IF NOT EXISTS sd_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  details JSONB,
  performed_by UUID, -- can be null for system actions
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_id ON sd_audit_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON sd_audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON sd_audit_logs(event_type);

-- 11. Create a view to check for orphaned records
CREATE OR REPLACE VIEW orphaned_user_data AS
SELECT
  'sd_user_profiles' AS table_name,
  COUNT(*) AS orphaned_count
FROM
  sd_user_profiles
WHERE
  user_id NOT IN (SELECT id FROM auth.users)
UNION ALL
SELECT
  'sd_user_roles' AS table_name,
  COUNT(*) AS orphaned_count
FROM
  sd_user_roles
WHERE
  user_id NOT IN (SELECT id FROM auth.users)
UNION ALL
SELECT
  'sd_chat_sessions' AS table_name,
  COUNT(*) AS orphaned_count
FROM
  sd_chat_sessions
WHERE
  user_id NOT IN (SELECT id FROM auth.users);
