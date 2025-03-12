-- Create a function to get raw profile data for debugging
create or replace function get_raw_profile_data(user_id_param uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  result jsonb;
begin
  -- Get the raw profile data as JSON
  select 
    to_jsonb(p)
  into 
    result
  from 
    sd_user_profiles p
  where 
    p.user_id = user_id_param;
    
  -- If not found, try with case-insensitive comparison
  if result is null then
    select 
      to_jsonb(p)
    into 
      result
    from 
      sd_user_profiles p
    where 
      lower(p.user_id::text) = lower(user_id_param::text);
  end if;
  
  -- Return the result
  return result;
end;
$$; 