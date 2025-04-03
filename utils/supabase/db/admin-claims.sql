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
    
    -- Log the admin role assignment
    insert into public.audit_logs(event_type, user_id, metadata)
    values (
      'admin_role_granted', 
      new.user_id, 
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
    
    -- Log the admin role removal
    insert into public.audit_logs(event_type, user_id, metadata)
    values (
      'admin_role_revoked', 
      new.user_id, 
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

-- IMPORTANT: Ensure the audit_logs table exists
-- If it doesn't exist, you can create it with:

/*
create table if not exists public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  event_type text not null,
  user_id uuid references auth.users(id),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Add RLS policy for audit logs
alter table public.audit_logs enable row level security;

-- Only allow admins to read audit logs
create policy "Admins can read audit logs" on public.audit_logs
  for select using ((
    select is_admin from sd_user_profiles where user_id = auth.uid()
  ) = true);

-- Only system can insert audit logs
create policy "System can insert audit logs" on public.audit_logs
  for insert with check (true);
*/ 