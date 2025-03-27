-- Review and Fix RLS Policies for Admin Access
-- This script helps diagnose and fix RLS policies that may be preventing client-side admin checks

------------------------------------------------------
-- PART 1: Inspect current RLS policies
------------------------------------------------------

-- 1.1 Show all tables with RLS enabled
SELECT 
  table_schema, 
  table_name, 
  row_security 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_schema, table_name;

-- 1.2 Show all RLS policies
SELECT 
  n.nspname AS schema_name,
  c.relname AS table_name,
  pol.polname AS policy_name,
  CASE WHEN pol.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END AS permissive,
  pg_get_expr(pol.polqual, pol.polrelid) AS policy_definition,
  CASE 
    WHEN pol.polcmd = 'r' THEN 'SELECT'
    WHEN pol.polcmd = 'a' THEN 'INSERT'
    WHEN pol.polcmd = 'w' THEN 'UPDATE'
    WHEN pol.polcmd = 'd' THEN 'DELETE'
    WHEN pol.polcmd = '*' THEN 'ALL'
  END AS command,
  ARRAY(
    SELECT pg_authid.rolname
    FROM pg_authid
    WHERE pg_authid.oid = ANY(pol.polroles)
  ) AS roles
FROM pg_policy pol
JOIN pg_class c ON pol.polrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY n.nspname, c.relname, pol.polname;

-- 1.3 Check specific tables used by admin functions
SELECT 
  table_schema, 
  table_name, 
  row_security 
FROM information_schema.tables 
WHERE (table_name = 'sd_user_profiles' OR table_name = 'sd_user_roles') 
  AND table_schema = 'public';

-- 1.4 Check if is_admin function exists
SELECT 
  routine_schema,
  routine_name,
  routine_type,
  data_type,
  security_type
FROM information_schema.routines
WHERE routine_name = 'is_admin' AND routine_schema = 'public';

------------------------------------------------------
-- PART 2: Fix RLS Policies for Admin Tables
------------------------------------------------------

-- 2.1 Fix RLS on sd_user_profiles table to allow users to check their own admin status
-- This ensures the client-side admin check can succeed

-- First check if the table has RLS enabled
DO $$ 
DECLARE 
  has_rls BOOLEAN;
BEGIN
  SELECT row_security INTO has_rls
  FROM information_schema.tables 
  WHERE table_name = 'sd_user_profiles' AND table_schema = 'public';

  IF has_rls THEN
    -- Check if a policy for viewing own profile exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy 
      WHERE polrelid = 'public.sd_user_profiles'::regclass 
      AND polname LIKE '%view_own%'
    ) THEN
      -- Create policy if it doesn't exist
      EXECUTE 'CREATE POLICY "Users can view their own profile" 
               ON public.sd_user_profiles
               FOR SELECT 
               TO authenticated
               USING (auth.uid() = user_id)';
      RAISE NOTICE 'Created policy for users to view their own profile';
    ELSE
      RAISE NOTICE 'Policy for viewing own profile already exists';
    END IF;
  ELSE
    RAISE NOTICE 'Table sd_user_profiles does not have RLS enabled';
  END IF;
END $$;

-- 2.2 Fix RLS on sd_user_roles table to allow users to check their own roles
DO $$ 
DECLARE 
  has_rls BOOLEAN;
BEGIN
  SELECT row_security INTO has_rls
  FROM information_schema.tables 
  WHERE table_name = 'sd_user_roles' AND table_schema = 'public';

  IF has_rls THEN
    -- Check if a policy for viewing own roles exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy 
      WHERE polrelid = 'public.sd_user_roles'::regclass 
      AND polname LIKE '%view_own%'
    ) THEN
      -- Create policy if it doesn't exist
      EXECUTE 'CREATE POLICY "Users can view their own roles" 
               ON public.sd_user_roles
               FOR SELECT 
               TO authenticated
               USING (auth.uid() = user_id)';
      RAISE NOTICE 'Created policy for users to view their own roles';
    ELSE
      RAISE NOTICE 'Policy for viewing own roles already exists';
    END IF;
  ELSE
    RAISE NOTICE 'Table sd_user_roles does not have RLS enabled';
  END IF;
END $$;

------------------------------------------------------
-- PART 3: Check and Fix is_admin function
------------------------------------------------------

-- 3.1 Create or replace the is_admin function to ensure it works with RLS
CREATE OR REPLACE FUNCTION public.is_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- This makes the function run with the privileges of the owner
SET search_path = public
AS $$
DECLARE
  is_admin_role BOOLEAN;
  is_admin_flag BOOLEAN;
BEGIN
  -- Check the profiles table first (more efficient)
  SELECT p.is_admin INTO is_admin_flag
  FROM public.sd_user_profiles p
  WHERE p.user_id = uid;
  
  IF is_admin_flag IS TRUE THEN
    RETURN TRUE;
  END IF;
  
  -- Check the roles table as fallback
  SELECT EXISTS (
    SELECT 1 
    FROM public.sd_user_roles r
    WHERE r.user_id = uid AND r.role = 'admin'
  ) INTO is_admin_role;
  
  RETURN is_admin_role;
END;
$$;

-- 3.2 Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

-- 3.3 Create a function to set admin status (for testing/admin use only)
CREATE OR REPLACE FUNCTION public.set_admin_status(target_user_id UUID, admin_status BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- Run with creator's permissions
SET search_path = public
AS $$
DECLARE
  calling_user_id UUID;
  is_caller_admin BOOLEAN;
BEGIN
  -- Get the ID of the calling user
  calling_user_id := auth.uid();
  
  -- Check if calling user is admin
  SELECT public.is_admin(calling_user_id) INTO is_caller_admin;
  
  IF is_caller_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Permission denied: Only administrators can set admin status';
  END IF;
  
  -- Update the profile
  UPDATE public.sd_user_profiles
  SET is_admin = admin_status
  WHERE user_id = target_user_id;
  
  -- Also handle the roles table
  IF admin_status THEN
    -- Add admin role if not exists
    INSERT INTO public.sd_user_roles (user_id, role)
    VALUES (target_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    -- Remove admin role
    DELETE FROM public.sd_user_roles
    WHERE user_id = target_user_id AND role = 'admin';
  END IF;
  
  RETURN TRUE;
END;
$$;

-- 3.4 Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.set_admin_status(UUID, BOOLEAN) TO authenticated;

------------------------------------------------------
-- PART 4: Test admin functions (MANUAL STEPS)
------------------------------------------------------

-- 4.1 Test is_admin function with a specific user ID
-- Replace 'your-user-id-here' with an actual user ID
-- SELECT is_admin('your-user-id-here');

-- 4.2 Test setting admin status (admin only)
-- Replace 'target-user-id-here' with an actual user ID
-- SELECT set_admin_status('target-user-id-here', TRUE);
-- SELECT is_admin('target-user-id-here'); -- Should return TRUE
-- SELECT set_admin_status('target-user-id-here', FALSE);
-- SELECT is_admin('target-user-id-here'); -- Should return FALSE 