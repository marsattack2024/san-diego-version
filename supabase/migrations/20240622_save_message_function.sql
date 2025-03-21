-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop the existing function first (required when changing parameter names)
DROP FUNCTION IF EXISTS public.save_message_and_update_session(uuid, text, text, uuid, uuid, jsonb, boolean);

-- Function to save a message and update the session in a single transaction
CREATE OR REPLACE FUNCTION public.save_message_and_update_session(
  p_session_id UUID,
  p_role TEXT,
  p_content TEXT,
  p_user_id UUID,
  p_message_id UUID DEFAULT NULL,
  p_tools_used JSONB DEFAULT NULL,
  p_update_timestamp BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_exists BOOLEAN;
  v_result JSONB;
  v_actual_message_id UUID;
  v_start_time TIMESTAMPTZ;
  v_error_context TEXT;
BEGIN
  -- Track execution time
  v_start_time := clock_timestamp();
  
  -- Always use the provided message_id instead of generating one
  -- This ensures we don't need uuid_generate_v4() which isn't available
  IF p_message_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Message ID is required',
      'execution_time_ms', extract(epoch from (clock_timestamp() - v_start_time)) * 1000
    );
  END IF;
  
  v_actual_message_id := p_message_id;
  
  -- Validate input parameters before processing
  BEGIN
    -- Check if content is too large (1MB limit to prevent database issues)
    IF length(p_content) > 1000000 THEN
      v_error_context := 'Message content too large: ' || length(p_content) || ' bytes. Maximum allowed is 1MB.';
      RAISE EXCEPTION '%', v_error_context;
    END IF;
    
    -- Validate role is one of the allowed values
    IF p_role NOT IN ('user', 'assistant', 'system', 'tool', 'function') THEN
      v_error_context := 'Invalid role: ' || p_role || '. Allowed values are: user, assistant, system, tool, function';
      RAISE EXCEPTION '%', v_error_context;
    END IF;
    
    -- Validate user ID is not null
    IF p_user_id IS NULL THEN
      v_error_context := 'User ID cannot be null';
      RAISE EXCEPTION '%', v_error_context;
    END IF;
    
    -- Validate session ID is not null
    IF p_session_id IS NULL THEN
      v_error_context := 'Session ID cannot be null';
      RAISE EXCEPTION '%', v_error_context;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Return validation error
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', v_error_context,
      'execution_time_ms', extract(epoch from (clock_timestamp() - v_start_time)) * 1000
    );
  END;
  
  -- Begin error handling capture block
  BEGIN
    -- Check if the session exists with better error context
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM sd_chat_sessions 
        WHERE id = p_session_id
      ) INTO v_session_exists;
    EXCEPTION WHEN OTHERS THEN
      v_error_context := 'Error checking session existence: ' || SQLERRM;
      RAISE EXCEPTION '%', v_error_context;
    END;
    
    -- If session doesn't exist, create it
    IF NOT v_session_exists THEN
      BEGIN
        INSERT INTO sd_chat_sessions (id, title, user_id)
        VALUES (p_session_id, 'New Chat', p_user_id);
      EXCEPTION WHEN OTHERS THEN
        v_error_context := 'Failed to create session: ' || SQLERRM;
        RAISE EXCEPTION '%', v_error_context;
      END;
    END IF;
    
    -- Begin message insertion transaction
    BEGIN
      -- Insert the message - use id column as the primary key
      INSERT INTO sd_chat_histories (
        id, session_id, role, content, user_id, tools_used
      ) VALUES (
        v_actual_message_id, p_session_id, p_role, p_content, p_user_id, p_tools_used
      );
      
      -- Update session timestamp if requested
      IF p_update_timestamp THEN
        UPDATE sd_chat_sessions
        SET updated_at = NOW()
        WHERE id = p_session_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_error_context := 'Failed to insert message or update session: ' || SQLERRM;
      RAISE EXCEPTION '%', v_error_context;
    END;
    
    -- Return success with performance metrics
    v_result := jsonb_build_object(
      'success', TRUE,
      'message', p_role || ' message saved and session updated',
      'message_id', v_actual_message_id,
      'execution_time_ms', extract(epoch from (clock_timestamp() - v_start_time)) * 1000
    );
    
  EXCEPTION WHEN OTHERS THEN
    -- Return failure details with error context
    v_result := jsonb_build_object(
      'success', FALSE,
      'error', CASE 
        WHEN v_error_context IS NOT NULL THEN v_error_context
        ELSE 'Failed to save ' || p_role || ' message: ' || SQLERRM
      END,
      'execution_time_ms', extract(epoch from (clock_timestamp() - v_start_time)) * 1000,
      'session_id', p_session_id,
      'role', p_role,
      'message_id', v_actual_message_id
    );
  END;
  
  RETURN v_result;
END;
$$; 