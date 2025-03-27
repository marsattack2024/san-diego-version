[
  {
    "table_schema": "public",
    "table_name": "documents",
    "row_security": true
  },
  {
    "table_schema": "public",
    "table_name": "documents_duplicate",
    "row_security": true
  },
  {
    "table_schema": "public",
    "table_name": "notion_documents",
    "row_security": true
  },
  {
    "table_schema": "public",
    "table_name": "sd_audit_logs",
    "row_security": false
  },
  {
    "table_schema": "public",
    "table_name": "sd_chat_histories",
    "row_security": true
  },
  {
    "table_schema": "public",
    "table_name": "sd_chat_sessions",
    "row_security": true
  },
  {
    "table_schema": "public",
    "table_name": "sd_user_profiles",
    "row_security": true
  },
  {
    "table_schema": "public",
    "table_name": "sd_user_roles",
    "row_security": true
  },
  {
    "table_schema": "public",
    "table_name": "website_documents",
    "row_security": true
  }
]


[
  {
    "schema_name": "public",
    "table_name": "documents",
    "policy_name": "Allow anon to read documents",
    "permissive": "PERMISSIVE",
    "policy_definition": "true",
    "command": "SELECT",
    "roles": "{anon}"
  },
  {
    "schema_name": "public",
    "table_name": "documents",
    "policy_name": "Allow anonymous read access",
    "permissive": "PERMISSIVE",
    "policy_definition": "true",
    "command": "SELECT",
    "roles": "{anon}"
  },
  {
    "schema_name": "public",
    "table_name": "sd_chat_histories",
    "policy_name": "Users can insert histories in their sessions",
    "permissive": "PERMISSIVE",
    "policy_definition": null,
    "command": "INSERT",
    "roles": "{}"
  },
  {
    "schema_name": "public",
    "table_name": "sd_chat_histories",
    "policy_name": "Users can update their votes in histories",
    "permissive": "PERMISSIVE",
    "policy_definition": "(auth.uid() IN ( SELECT sd_chat_sessions.user_id\n   FROM sd_chat_sessions\n  WHERE (sd_chat_sessions.id = sd_chat_histories.session_id)))",
    "command": "UPDATE",
    "roles": "{}"
  },
  {
    "schema_name": "public",
    "table_name": "sd_chat_histories",
    "policy_name": "Users can view histories in their sessions",
    "permissive": "PERMISSIVE",
    "policy_definition": "(auth.uid() IN ( SELECT sd_chat_sessions.user_id\n   FROM sd_chat_sessions\n  WHERE (sd_chat_sessions.id = sd_chat_histories.session_id)))",
    "command": "SELECT",
    "roles": "{}"
  },
  {
    "schema_name": "public",
    "table_name": "sd_chat_sessions",
    "policy_name": "Users can delete their own chat sessions",
    "permissive": "PERMISSIVE",
    "policy_definition": "(auth.uid() = user_id)",
    "command": "DELETE",
    "roles": "{}"
  },
  {
    "schema_name": "public",
    "table_name": "sd_chat_sessions",
    "policy_name": "Users can insert their own chat sessions",
    "permissive": "PERMISSIVE",
    "policy_definition": null,
    "command": "INSERT",
    "roles": "{}"
  },
  {
    "schema_name": "public",
    "table_name": "sd_chat_sessions",
    "policy_name": "Users can update their own chat sessions",
    "permissive": "PERMISSIVE",
    "policy_definition": "(auth.uid() = user_id)",
    "command": "UPDATE",
    "roles": "{}"
  },
  {
    "schema_name": "public",
    "table_name": "sd_chat_sessions",
    "policy_name": "Users can view their own chat sessions",
    "permissive": "PERMISSIVE",
    "policy_definition": "(auth.uid() = user_id)",
    "command": "SELECT",
    "roles": "{}"
  },
  {
    "schema_name": "public",
    "table_name": "sd_user_profiles",
    "policy_name": "Admins can view all profiles",
    "permissive": "PERMISSIVE",
    "policy_definition": "(auth.uid() IN ( SELECT sd_user_roles.user_id\n   FROM sd_user_roles\n  WHERE (sd_user_roles.role = 'admin'::text)))",
    "command": "SELECT",
    "roles": "{}"
  },
  {
    "schema_name": "public",
    "table_name": "sd_user_profiles",
    "policy_name": "Service role can access all profiles",
    "permissive": "PERMISSIVE",
    "policy_definition": "((auth.jwt() ->> 'role'::text) = 'service_role'::text)",
    "command": "ALL",
    "roles": "{}"
  },
  {
    "schema_name": "public",
    "table_name": "sd_user_profiles",
    "policy_name": "Users can insert their own profile",
    "permissive": "PERMISSIVE",
    "policy_definition": null,
    "command": "INSERT",
    "roles": "{}"
  },
  {
    "schema_name": "public",
    "table_name": "sd_user_profiles",
    "policy_name": "Users can update their own profile",
    "permissive": "PERMISSIVE",
    "policy_definition": "(auth.uid() = user_id)",
    "command": "UPDATE",
    "roles": "{}"
  },
  {
    "schema_name": "public",
    "table_name": "sd_user_profiles",
    "policy_name": "Users can view their own profile",
    "permissive": "PERMISSIVE",
    "policy_definition": "(auth.uid() = user_id)",
    "command": "SELECT",
    "roles": "{}"
  },
  {
    "schema_name": "public",
    "table_name": "sd_user_roles",
    "policy_name": "Anyone can read user roles",
    "permissive": "PERMISSIVE",
    "policy_definition": "true",
    "command": "SELECT",
    "roles": "{}"
  },
  {
    "schema_name": "public",
    "table_name": "sd_user_roles",
    "policy_name": "Only admins can delete roles",
    "permissive": "PERMISSIVE",
    "policy_definition": "private_is_admin(auth.uid())",
    "command": "DELETE",
    "roles": "{}"
  },
  {
    "schema_name": "public",
    "table_name": "sd_user_roles",
    "policy_name": "Only admins can insert roles",
    "permissive": "PERMISSIVE",
    "policy_definition": null,
    "command": "INSERT",
    "roles": "{}"
  },
  {
    "schema_name": "public",
    "table_name": "sd_user_roles",
    "policy_name": "Only admins can update roles",
    "permissive": "PERMISSIVE",
    "policy_definition": "private_is_admin(auth.uid())",
    "command": "UPDATE",
    "roles": "{}"
  },
  {
    "schema_name": "public",
    "table_name": "sd_user_roles",
    "policy_name": "Only service role can modify roles",
    "permissive": "PERMISSIVE",
    "policy_definition": "((auth.jwt() ->> 'role'::text) = 'service_role'::text)",
    "command": "ALL",
    "roles": "{}"
  },
  {
    "schema_name": "public",
    "table_name": "sd_user_roles",
    "policy_name": "Users can view their own roles",
    "permissive": "PERMISSIVE",
    "policy_definition": "(auth.uid() = user_id)",
    "command": "SELECT",
    "roles": "{}"
  }
]

[
  {
    "table_schema": "public",
    "table_name": "sd_user_profiles",
    "row_security": true
  },
  {
    "table_schema": "public",
    "table_name": "sd_user_roles",
    "row_security": true
  }
]

[
  {
    "routine_schema": "public",
    "routine_name": "is_admin",
    "routine_type": "FUNCTION",
    "data_type": "boolean",
    "security_type": "DEFINER"
  }
]