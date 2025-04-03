-- Admin Claims SQL Function and Trigger
-- This creates a database function that updates the JWT claims when a user's admin status changes
-- The function is designed to be triggered after INSERT or UPDATE on the sd_user_profiles table
-- It adds or removes the is_admin claim from raw_app_meta_data in auth.users

-- Function to set/remove admin claim in JWT
create or replace function public.set_admin_claim()
returns trigger as $$
begin
  if new.is_admin = true then
    -- Add admin claim to user's metadata
    update auth.users set raw_app_meta_data = 
      coalesce(raw_app_meta_data, '{}'::jsonb) || 
      jsonb_build_object('is_admin', true)
    where id = new.user_id;
    
    -- Log the admin role assignment to sd_audit_logs
    insert into sd_audit_logs(action, entity_type, entity_id, actor_id, details)
    values (
      'admin_role_granted', 
      'user',
      new.user_id,
      new.user_id, -- Self-assignment or system assignment
      jsonb_build_object(
        'profile_id', new.id,
        'timestamp', current_timestamp
      )
    );
  else
    -- Remove admin claim from user's metadata
    update auth.users set raw_app_meta_data = 
      coalesce(raw_app_meta_data, '{}'::jsonb) - 'is_admin'
    where id = new.user_id;
    
    -- Log the admin role removal to sd_audit_logs
    insert into sd_audit_logs(action, entity_type, entity_id, actor_id, details)
    values (
      'admin_role_revoked', 
      'user',
      new.user_id,
      new.user_id, -- Self-removal or system removal
      jsonb_build_object(
        'profile_id', new.id,
        'timestamp', current_timestamp
      )
    );
  end if;
  
  return new;
end;
$$ language plpgsql security definer;

-- Create trigger to automatically update claims when admin status changes
create or replace trigger on_admin_status_update
  after insert or update of is_admin on public.sd_user_profiles
  for each row execute procedure public.set_admin_claim();

-- Note: The sd_audit_logs table should already exist in the database
-- It has the following structure:
/*
CREATE TABLE IF NOT EXISTS sd_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  actor_id UUID, -- The user who performed the action
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
*/ 