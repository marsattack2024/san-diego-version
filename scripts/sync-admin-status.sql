-- Sync Admin Status Script
-- This script ensures admin status consistency by making sd_user_profiles.is_admin 
-- the single source of truth for admin permissions

-- 1. First, view current admin status in both tables to see the difference
SELECT 
  auth.users.id AS user_id,
  auth.users.email,
  p.is_admin AS profile_is_admin,
  CASE WHEN r.role IS NOT NULL THEN TRUE ELSE FALSE END AS has_admin_role
FROM auth.users
LEFT JOIN sd_user_profiles p ON auth.users.id = p.user_id
LEFT JOIN (
  SELECT user_id, role FROM sd_user_roles WHERE role = 'admin'
) r ON auth.users.id = r.user_id
WHERE p.is_admin = TRUE OR r.role IS NOT NULL
ORDER BY auth.users.email;

-- 2. Sync from roles to profiles (ensure profiles have admin flag if roles exist)
UPDATE sd_user_profiles
SET is_admin = TRUE
WHERE user_id IN (
  SELECT user_id FROM sd_user_roles WHERE role = 'admin'
)
AND is_admin IS NOT TRUE;

-- 3. Sync from profiles to roles (ensure roles exist if profile has admin flag)
-- First identify users needing role update
WITH users_needing_role AS (
  SELECT user_id 
  FROM sd_user_profiles 
  WHERE is_admin = TRUE
  AND user_id NOT IN (
    SELECT user_id FROM sd_user_roles WHERE role = 'admin'
  )
)
-- Then insert missing roles
INSERT INTO sd_user_roles (user_id, role)
SELECT user_id, 'admin' 
FROM users_needing_role
ON CONFLICT (user_id, role) DO NOTHING;

-- 4. Show final status after synchronization
SELECT 
  auth.users.id AS user_id,
  auth.users.email,
  p.is_admin AS profile_is_admin,
  CASE WHEN r.role IS NOT NULL THEN TRUE ELSE FALSE END AS has_admin_role
FROM auth.users
LEFT JOIN sd_user_profiles p ON auth.users.id = p.user_id
LEFT JOIN (
  SELECT user_id, role FROM sd_user_roles WHERE role = 'admin'
) r ON auth.users.id = r.user_id
WHERE p.is_admin = TRUE OR r.role IS NOT NULL
ORDER BY auth.users.email;

-- Note: You must use a service role to execute this query as it accesses auth.users
-- Run this in your Supabase SQL Editor to ensure admin status consistency 