[
  {
    "table_name": "sd_chat_histories",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO"
  },
  {
    "table_name": "sd_chat_histories",
    "column_name": "session_id",
    "data_type": "uuid",
    "is_nullable": "NO"
  },
  {


[
  {
    "table_name": "sd_chat_histories",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO"
  },
  {
    "table_name": "sd_chat_histories",
    "column_name": "session_id",
    "data_type": "uuid",
    "is_nullable": "NO"
  },
  {
    "table_name": "sd_chat_histories",
    "column_name": "role",
    "data_type": "text",
    "is_nullable": "NO"
  },
  {
    "table_name": "sd_chat_histories",
    "column_name": "content",
    "data_type": "text",
    "is_nullable": "NO"
  },
  {
    "table_name": "sd_chat_histories",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES"
  },
  {
    "table_name": "sd_chat_histories",
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": "NO"
  },
  {
    "table_name": "sd_chat_histories",
    "column_name": "tools_used",
    "data_type": "jsonb",
    "is_nullable": "YES"
  },
  {
    "table_name": "sd_chat_histories",
    "column_name": "metadata",
    "data_type": "jsonb",
    "is_nullable": "YES"
  },
  {
    "table_name": "sd_chat_histories",
    "column_name": "vote",
    "data_type": "text",
    "is_nullable": "YES"
  },
  {
    "table_name": "sd_chat_sessions",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO"
  },
  {
    "table_name": "sd_chat_sessions",
    "column_name": "title",
    "data_type": "text",
    "is_nullable": "YES"
  },
  {
    "table_name": "sd_chat_sessions",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES"
  },
  {
    "table_name": "sd_chat_sessions",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES"
  },
  {
    "table_name": "sd_chat_sessions",
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": "NO"
  },
  {
    "table_name": "sd_chat_sessions",
    "column_name": "agent_id",
    "data_type": "text",
    "is_nullable": "YES"
  },
  {
    "table_name": "sd_chat_sessions",
    "column_name": "deep_search_enabled",
    "data_type": "boolean",
    "is_nullable": "YES"
  },
  {
    "table_name": "sd_chat_sessions",
    "column_name": "metadata",
    "data_type": "jsonb",
    "is_nullable": "YES"
  }
]

[
  {
    "schemaname": "public",
    "tablename": "sd_chat_histories",
    "policyname": "Users can insert histories in their sessions",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "(auth.uid() IN ( SELECT sd_chat_sessions.user_id\n   FROM sd_chat_sessions\n  WHERE (sd_chat_sessions.id = sd_chat_histories.session_id)))"
  },
  {
    "schemaname": "public",
    "tablename": "sd_chat_histories",
    "policyname": "Users can update their votes in histories",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "UPDATE",
    "qual": "(auth.uid() IN ( SELECT sd_chat_sessions.user_id\n   FROM sd_chat_sessions\n  WHERE (sd_chat_sessions.id = sd_chat_histories.session_id)))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "sd_chat_histories",
    "policyname": "Users can view histories in their sessions",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "(auth.uid() IN ( SELECT sd_chat_sessions.user_id\n   FROM sd_chat_sessions\n  WHERE (sd_chat_sessions.id = sd_chat_histories.session_id)))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "sd_chat_sessions",
    "policyname": "Users can delete their own chat sessions",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "DELETE",
    "qual": "(auth.uid() = user_id)",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "sd_chat_sessions",
    "policyname": "Users can insert their own chat sessions",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "(auth.uid() = user_id)"
  },
  {
    "schemaname": "public",
    "tablename": "sd_chat_sessions",
    "policyname": "Users can update their own chat sessions",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "UPDATE",
    "qual": "(auth.uid() = user_id)",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "sd_chat_sessions",
    "policyname": "Users can view their own chat sessions",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "(auth.uid() = user_id)",
    "with_check": null
  }
]
    "table_name": "sd_chat_histories",
    "column_name": "role",
    "data_type": "text",
    "is_nullable": "NO"
  },
  {
    "table_name": "sd_chat_histories",
    "column_name": "content",
    "data_type": "text",
    "is_nullable": "NO"
  },
  {
    "table_name": "sd_chat_histories",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES"
  },
  {
    "table_name": "sd_chat_histories",
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": "NO"
  },
  {
    "table_name": "sd_chat_histories",
    "column_name": "tools_used",
    "data_type": "jsonb",
    "is_nullable": "YES"
  },
  {
    "table_name": "sd_chat_histories",
    "column_name": "metadata",
    "data_type": "jsonb",
    "is_nullable": "YES"
  },
  {
    "table_name": "sd_chat_histories",
    "column_name": "vote",
    "data_type": "text",
    "is_nullable": "YES"
  },
  {
    "table_name": "sd_chat_sessions",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO"
  },
  {
    "table_name": "sd_chat_sessions",
    "column_name": "title",
    "data_type": "text",
    "is_nullable": "YES"
  },
  {
    "table_name": "sd_chat_sessions",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES"
  },
  {
    "table_name": "sd_chat_sessions",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES"
  },
  {
    "table_name": "sd_chat_sessions",
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": "NO"
  },
  {
    "table_name": "sd_chat_sessions",
    "column_name": "agent_id",
    "data_type": "text",
    "is_nullable": "YES"
  },
  {
    "table_name": "sd_chat_sessions",
    "column_name": "deep_search_enabled",
    "data_type": "boolean",
    "is_nullable": "YES"
  },
  {
    "table_name": "sd_chat_sessions",
    "column_name": "metadata",
    "data_type": "jsonb",
    "is_nullable": "YES"
  }
]

[
  {
    "schema": "public",
    "function_name": "save_message_and_update_session",
    "arguments": "p_session_id uuid, p_role text, p_content text, p_user_id uuid, p_message_id uuid DEFAULT NULL::uuid, p_tools_used jsonb DEFAULT NULL::jsonb, p_update_timestamp boolean DEFAULT false",
    "security": "SECURITY DEFINER",
    "function_def": "CREATE OR REPLACE FUNCTION public.save_message_and_update_session(p_session_id uuid, p_role text, p_content text, p_user_id uuid, p_message_id uuid DEFAULT NULL::uuid, p_tools_used jsonb DEFAULT NULL::jsonb, p_update_timestamp boolean DEFAULT false)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nDECLARE\n  v_session_exists BOOLEAN;\n  v_result JSONB;\n  v_actual_message_id UUID;\n  v_start_time TIMESTAMPTZ;\n  v_error_context TEXT;\nBEGIN\n  -- Track execution time\n  v_start_time := clock_timestamp();\n  \n  -- Always use the provided message_id instead of generating one\n  -- This ensures we don't need uuid_generate_v4() which isn't available\n  IF p_message_id IS NULL THEN\n    RETURN jsonb_build_object(\n      'success', FALSE,\n      'error', 'Message ID is required',\n      'execution_time_ms', extract(epoch from (clock_timestamp() - v_start_time)) * 1000\n    );\n  END IF;\n  \n  v_actual_message_id := p_message_id;\n  \n  -- Validate input parameters before processing\n  BEGIN\n    -- Check if content is too large (1MB limit to prevent database issues)\n    IF length(p_content) > 1000000 THEN\n      v_error_context := 'Message content too large: ' || length(p_content) || ' bytes. Maximum allowed is 1MB.';\n      RAISE EXCEPTION '%', v_error_context;\n    END IF;\n    \n    -- Validate role is one of the allowed values\n    IF p_role NOT IN ('user', 'assistant', 'system', 'tool', 'function') THEN\n      v_error_context := 'Invalid role: ' || p_role || '. Allowed values are: user, assistant, system, tool, function';\n      RAISE EXCEPTION '%', v_error_context;\n    END IF;\n    \n    -- Validate user ID is not null\n    IF p_user_id IS NULL THEN\n      v_error_context := 'User ID cannot be null';\n      RAISE EXCEPTION '%', v_error_context;\n    END IF;\n    \n    -- Validate session ID is not null\n    IF p_session_id IS NULL THEN\n      v_error_context := 'Session ID cannot be null';\n      RAISE EXCEPTION '%', v_error_context;\n    END IF;\n  EXCEPTION WHEN OTHERS THEN\n    -- Return validation error\n    RETURN jsonb_build_object(\n      'success', FALSE,\n      'error', v_error_context,\n      'execution_time_ms', extract(epoch from (clock_timestamp() - v_start_time)) * 1000\n    );\n  END;\n  \n  -- Begin error handling capture block\n  BEGIN\n    -- Check if the session exists with better error context\n    BEGIN\n      SELECT EXISTS (\n        SELECT 1 FROM sd_chat_sessions \n        WHERE id = p_session_id\n      ) INTO v_session_exists;\n    EXCEPTION WHEN OTHERS THEN\n      v_error_context := 'Error checking session existence: ' || SQLERRM;\n      RAISE EXCEPTION '%', v_error_context;\n    END;\n    \n    -- If session doesn't exist, create it\n    IF NOT v_session_exists THEN\n      BEGIN\n        INSERT INTO sd_chat_sessions (id, title, user_id)\n        VALUES (p_session_id, 'New Chat', p_user_id);\n      EXCEPTION WHEN OTHERS THEN\n        v_error_context := 'Failed to create session: ' || SQLERRM;\n        RAISE EXCEPTION '%', v_error_context;\n      END;\n    END IF;\n    \n    -- Begin message insertion transaction\n    BEGIN\n      -- Insert the message - use id column as the primary key\n      INSERT INTO sd_chat_histories (\n        id, session_id, role, content, user_id, tools_used\n      ) VALUES (\n        v_actual_message_id, p_session_id, p_role, p_content, p_user_id, p_tools_used\n      );\n      \n      -- Update session timestamp if requested\n      IF p_update_timestamp THEN\n        UPDATE sd_chat_sessions\n        SET updated_at = NOW()\n        WHERE id = p_session_id;\n      END IF;\n    EXCEPTION WHEN OTHERS THEN\n      v_error_context := 'Failed to insert message or update session: ' || SQLERRM;\n      RAISE EXCEPTION '%', v_error_context;\n    END;\n    \n    -- Return success with performance metrics\n    v_result := jsonb_build_object(\n      'success', TRUE,\n      'message', p_role || ' message saved and session updated',\n      'message_id', v_actual_message_id,\n      'execution_time_ms', extract(epoch from (clock_timestamp() - v_start_time)) * 1000\n    );\n    \n  EXCEPTION WHEN OTHERS THEN\n    -- Return failure details with error context\n    v_result := jsonb_build_object(\n      'success', FALSE,\n      'error', CASE \n        WHEN v_error_context IS NOT NULL THEN v_error_context\n        ELSE 'Failed to save ' || p_role || ' message: ' || SQLERRM\n      END,\n      'execution_time_ms', extract(epoch from (clock_timestamp() - v_start_time)) * 1000,\n      'session_id', p_session_id,\n      'role', p_role,\n      'message_id', v_actual_message_id\n    );\n  END;\n  \n  RETURN v_result;\nEND;\n$function$\n"
  }
]