-- 1. Check table structure for chat histories and sessions
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM 
    information_schema.columns
WHERE 
    table_name IN ('sd_chat_histories', 'sd_chat_sessions')
ORDER BY 
    table_name, ordinal_position;

-- 2. Check RLS policies on chat tables
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM
    pg_policies
WHERE
    tablename IN ('sd_chat_histories', 'sd_chat_sessions')
ORDER BY
    tablename, policyname;

-- 3. Check if RLS is enabled on tables
SELECT
    t.table_schema,
    t.table_name,
    t.row_security
FROM
    pg_tables t
WHERE
    t.table_name IN ('sd_chat_histories', 'sd_chat_sessions');

-- 4. Verify the RPC function exists and has SECURITY DEFINER set
SELECT
    n.nspname as schema,
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END as security,
    pg_get_functiondef(p.oid) as function_def
FROM
    pg_proc p
JOIN
    pg_namespace n ON p.pronamespace = n.oid
WHERE
    p.proname = 'save_message_and_update_session';

-- 5. Test direct insert vs RPC call (use with caution in production)
-- This is for testing in a development environment

-- 5a. Test direct insert into sd_chat_histories
/*
DO $$
DECLARE
    v_session_id UUID := '00000000-0000-0000-0000-000000000001'; -- Test session ID
    v_user_id UUID := '00000000-0000-0000-0000-000000000002';    -- Test user ID
    v_message_id UUID := '00000000-0000-0000-0000-000000000003'; -- Test message ID
BEGIN
    -- First ensure the session exists
    INSERT INTO sd_chat_sessions (id, user_id, title)
    VALUES (v_session_id, v_user_id, 'Test Session')
    ON CONFLICT (id) DO NOTHING;
    
    -- Try direct insert
    INSERT INTO sd_chat_histories (id, session_id, role, content, user_id)
    VALUES (v_message_id, v_session_id, 'user', 'Direct insert test message', v_user_id);
    
    RAISE NOTICE 'Direct insert succeeded';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Direct insert failed: %', SQLERRM;
END;
$$;
*/

-- 5b. Test RPC function call
/*
DO $$
DECLARE
    v_session_id UUID := '00000000-0000-0000-0000-000000000001'; -- Test session ID
    v_user_id UUID := '00000000-0000-0000-0000-000000000002';    -- Test user ID
    v_message_id UUID := '00000000-0000-0000-0000-000000000004'; -- Different test message ID
    v_result JSONB;
BEGIN
    -- Call the RPC function
    v_result := save_message_and_update_session(
        v_session_id,
        'user',
        'RPC function test message',
        v_user_id,
        v_message_id,
        NULL,
        TRUE
    );
    
    RAISE NOTICE 'RPC function result: %', v_result;
END;
$$;
*/

-- 6. Check recent messages (adjust session ID as needed)
/*
SELECT 
    id, 
    session_id, 
    role, 
    content, 
    user_id, 
    created_at, 
    tools_used
FROM 
    sd_chat_histories
WHERE 
    session_id = '00000000-0000-0000-0000-000000000001'
ORDER BY 
    created_at DESC
LIMIT 10;
*/ 