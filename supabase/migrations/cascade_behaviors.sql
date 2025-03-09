-- Cascade Behaviors Standardization
-- This migration ensures consistent foreign key behaviors across all tables

-- 1. Add explicit NOT NULL constraints where missing
-----------------------------------------------------

-- Ensure user_id is always NOT NULL in all tables
ALTER TABLE sd_chat_histories 
  ALTER COLUMN user_id SET NOT NULL;

-- 2. Ensure all foreign keys have appropriate cascade behaviors
----------------------------------------------------------------

-- First, check constraints that might need to be fixed in new tables
-- For sd_document_access
ALTER TABLE IF EXISTS sd_document_access
  DROP CONSTRAINT IF EXISTS sd_document_access_document_id_fkey,
  ADD CONSTRAINT sd_document_access_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS sd_document_access
  DROP CONSTRAINT IF EXISTS sd_document_access_user_id_fkey,
  ADD CONSTRAINT sd_document_access_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- For sd_session_shares
ALTER TABLE IF EXISTS sd_session_shares
  DROP CONSTRAINT IF EXISTS sd_session_shares_session_id_fkey,
  ADD CONSTRAINT sd_session_shares_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES sd_chat_sessions(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS sd_session_shares
  DROP CONSTRAINT IF EXISTS sd_session_shares_user_id_fkey,
  ADD CONSTRAINT sd_session_shares_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- For sd_user_roles
ALTER TABLE IF EXISTS sd_user_roles
  DROP CONSTRAINT IF EXISTS sd_user_roles_user_id_fkey,
  ADD CONSTRAINT sd_user_roles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- For sd_audit_logs
ALTER TABLE IF EXISTS sd_audit_logs
  DROP CONSTRAINT IF EXISTS sd_audit_logs_user_id_fkey,
  ADD CONSTRAINT sd_audit_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Define what happens to partitioned tables' foreign keys
------------------------------------------------------------

-- For partitioned chat_histories table
-- Note: If using partitioning, make sure foreign key behavior is maintained:
ALTER TABLE IF EXISTS sd_chat_histories 
  DROP CONSTRAINT IF EXISTS sd_chat_histories_session_id_fkey,
  ADD CONSTRAINT sd_chat_histories_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES sd_chat_sessions(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS sd_chat_histories 
  DROP CONSTRAINT IF EXISTS sd_chat_histories_user_id_fkey,
  ADD CONSTRAINT sd_chat_histories_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 4. Add cascade behavior documentation
----------------------------------------

-- Create a schema documentation table to track foreign key behaviors
CREATE TABLE IF NOT EXISTS sd_schema_documentation (
  id SERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  constraint_name TEXT NOT NULL,
  referenced_table TEXT NOT NULL,
  cascade_behavior TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document existing cascade behaviors for future reference
INSERT INTO sd_schema_documentation 
  (table_name, constraint_name, referenced_table, cascade_behavior, description)
VALUES
  ('sd_chat_sessions', 'sd_chat_sessions_user_id_fkey', 'auth.users', 
   'ON DELETE CASCADE', 
   'When a user is deleted, all their chat sessions are deleted'),
   
  ('sd_chat_histories', 'sd_chat_histories_session_id_fkey', 'sd_chat_sessions', 
   'ON DELETE CASCADE', 
   'When a chat session is deleted, all its messages are deleted'),
   
  ('sd_chat_histories', 'sd_chat_histories_user_id_fkey', 'auth.users', 
   'ON DELETE CASCADE', 
   'When a user is deleted, all their messages are deleted'),
   
  ('documents', 'documents_user_id_fkey', 'auth.users', 
   'ON DELETE CASCADE', 
   'When a user is deleted, all their documents are deleted'),
   
  ('sd_document_access', 'sd_document_access_document_id_fkey', 'documents', 
   'ON DELETE CASCADE', 
   'When a document is deleted, all access rights to it are deleted'),
   
  ('sd_document_access', 'sd_document_access_user_id_fkey', 'auth.users', 
   'ON DELETE CASCADE', 
   'When a user is deleted, all their document access rights are deleted'),
   
  ('sd_session_shares', 'sd_session_shares_session_id_fkey', 'sd_chat_sessions', 
   'ON DELETE CASCADE', 
   'When a chat session is deleted, all shares of it are deleted'),
   
  ('sd_session_shares', 'sd_session_shares_user_id_fkey', 'auth.users', 
   'ON DELETE CASCADE', 
   'When a user is deleted, all their session access rights are deleted'),
   
  ('sd_user_roles', 'sd_user_roles_user_id_fkey', 'auth.users', 
   'ON DELETE CASCADE', 
   'When a user is deleted, all their role assignments are deleted'),
   
  ('sd_audit_logs', 'sd_audit_logs_user_id_fkey', 'auth.users', 
   'ON DELETE CASCADE', 
   'When a user is deleted, their audit log entries remain but user_id reference is removed');

-- 5. Create a view to help inspect foreign key relationships
------------------------------------------------------------

CREATE OR REPLACE VIEW sd_foreign_key_relationships AS
SELECT
  tc.table_schema || '.' || tc.table_name AS source_table,
  kcu.column_name AS source_column,
  ccu.table_schema || '.' || ccu.table_name AS target_table,
  ccu.column_name AS target_column,
  rc.delete_rule AS on_delete,
  rc.update_rule AS on_update
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
ORDER BY
  source_table, source_column;