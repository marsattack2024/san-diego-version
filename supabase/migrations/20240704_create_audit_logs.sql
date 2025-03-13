-- Create audit logs table for tracking user deletion and other administrative actions
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

-- Create a function to delete users that doesn't rely on audit logs
CREATE OR REPLACE FUNCTION safe_delete_user(user_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete from sd_user_roles first
  DELETE FROM sd_user_roles WHERE user_id = user_id_param;
  
  -- Delete from sd_user_profiles
  DELETE FROM sd_user_profiles WHERE user_id = user_id_param;
  
  -- Delete from sd_chat_sessions
  DELETE FROM sd_chat_sessions WHERE user_id = user_id_param;
  
  -- Insert into audit log manually
  BEGIN
    INSERT INTO sd_audit_logs (action, entity_type, entity_id, actor_id, details)
    VALUES ('user_deleted', 'user', user_id_param, auth.uid(), 
            jsonb_build_object('deleted_by', 'safe_delete_user function'));
  EXCEPTION 
    WHEN OTHERS THEN
      -- If audit logging fails, we still want to continue with the deletion
      NULL;
  END;
  
  RETURN TRUE;
END;
$$;