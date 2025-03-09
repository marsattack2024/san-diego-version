-- Schema Improvements for San Diego Version

-- 1. Role-Based Access Control
-------------------------------

-- Create user roles table
CREATE TABLE IF NOT EXISTS sd_user_roles (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, role)
);

-- Create function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM sd_user_roles 
    WHERE user_id = user_uuid AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update document policies to use roles instead of hardcoded emails
DROP POLICY IF EXISTS "Only admin can insert documents" ON documents;
CREATE POLICY "Only admin can insert documents" ON documents
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admin can update documents" ON documents;
CREATE POLICY "Only admin can update documents" ON documents
  FOR UPDATE USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Only admin can delete documents" ON documents;
CREATE POLICY "Only admin can delete documents" ON documents
  FOR DELETE USING (is_admin(auth.uid()));

-- 2. Granular Access Levels and Document Sharing
-------------------------------------------------

-- Add document sharing table for granular access
CREATE TABLE IF NOT EXISTS sd_document_access (
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL CHECK (access_level IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (document_id, user_id)
);

-- Update documents policies for user ownership
DROP POLICY IF EXISTS "All users can view documents" ON documents;

-- Users can view documents they own or have access to
CREATE POLICY "Users can view documents they have access to" ON documents
  FOR SELECT USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM sd_document_access 
      WHERE document_id = documents.id AND user_id = auth.uid()
    )
    OR is_admin(auth.uid())
  );

-- Users can manage their own documents (if admin allows regular user uploads)
CREATE POLICY "Users can manage their own documents" ON documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents" ON documents
  FOR UPDATE USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM sd_document_access 
      WHERE document_id = documents.id AND user_id = auth.uid() AND access_level = 'editor'
    )
  );

CREATE POLICY "Users can delete their own documents" ON documents
  FOR DELETE USING (auth.uid() = user_id);

-- 3. Improved Data Validation
------------------------------

-- Add proper role validation to chat_histories
ALTER TABLE sd_chat_histories DROP CONSTRAINT IF EXISTS chat_histories_role_check;
ALTER TABLE sd_chat_histories ADD CONSTRAINT chat_histories_role_check 
  CHECK (role IN ('user', 'assistant', 'system', 'tool'));

-- Add NOT NULL constraint to user_id in chat_histories
ALTER TABLE sd_chat_histories ALTER COLUMN user_id SET NOT NULL;

-- Add metadata validation
ALTER TABLE sd_chat_sessions ADD CONSTRAINT valid_session_metadata 
  CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object');
  
ALTER TABLE sd_chat_histories ADD CONSTRAINT valid_history_metadata 
  CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object');
  
ALTER TABLE sd_chat_histories ADD CONSTRAINT valid_tools_used 
  CHECK (tools_used IS NULL OR jsonb_typeof(tools_used) = 'object');

-- 4. Pagination Support
------------------------

-- Update match_documents function to support pagination
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 5,
  offset_count INT DEFAULT 0,
  filter JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT,
  total_count BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  initial_threshold FLOAT := 0.6;
  minimum_threshold FLOAT := 0.4;
  result_count INTEGER;
  total_possible_matches BIGINT;
BEGIN
  -- First count total matches for pagination info
  SELECT COUNT(*) INTO total_possible_matches
  FROM documents
  WHERE
    -- Apply filter if provided
    (filter = '{}' OR (filter->>'kind' IS NOT NULL AND documents.kind = filter->>'kind'))
    -- Apply minimum similarity threshold
    AND GREATEST(0, 1 - (documents.embedding <=> query_embedding)) >= minimum_threshold;

  -- First try with higher threshold
  RETURN QUERY
  SELECT
    documents.id,
    documents.content,
    jsonb_build_object(
      'title', documents.title,
      'kind', documents.kind,
      'created_at', documents.created_at
    ) AS metadata,
    GREATEST(0, 1 - (documents.embedding <=> query_embedding)) AS similarity,
    total_possible_matches
  FROM documents
  WHERE
    -- Apply filter if provided
    (filter = '{}' OR (filter->>'kind' IS NOT NULL AND documents.kind = filter->>'kind'))
    -- Apply initial similarity threshold of 0.6
    AND GREATEST(0, 1 - (documents.embedding <=> query_embedding)) >= initial_threshold
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count
  OFFSET offset_count;

  -- Get the number of rows returned
  GET DIAGNOSTICS result_count = ROW_COUNT;

  -- If no results found with initial threshold, try with minimum threshold
  IF result_count = 0 THEN
    RETURN QUERY
    SELECT
      documents.id,
      documents.content,
      jsonb_build_object(
        'title', documents.title,
        'kind', documents.kind,
        'created_at', documents.created_at
      ) AS metadata,
      GREATEST(0, 1 - (documents.embedding <=> query_embedding)) AS similarity,
      total_possible_matches
    FROM documents
    WHERE
      -- Apply filter if provided
      (filter = '{}' OR (filter->>'kind' IS NOT NULL AND documents.kind = filter->>'kind'))
      -- Apply minimum similarity threshold of 0.4
      AND GREATEST(0, 1 - (documents.embedding <=> query_embedding)) >= minimum_threshold
    ORDER BY documents.embedding <=> query_embedding
    LIMIT match_count
    OFFSET offset_count;
  END IF;
END;
$$;

-- 5. Better Security Practices
-------------------------------

-- Add audit logging table
CREATE TABLE IF NOT EXISTS sd_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  ip_address TEXT,
  changes JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO sd_audit_logs (event_type, table_name, record_id, user_id, changes)
    VALUES ('DELETE', TG_TABLE_NAME, OLD.id, auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO sd_audit_logs (event_type, table_name, record_id, user_id, changes)
    VALUES ('UPDATE', TG_TABLE_NAME, NEW.id, auth.uid(), 
            jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO sd_audit_logs (event_type, table_name, record_id, user_id, changes)
    VALUES ('INSERT', TG_TABLE_NAME, NEW.id, auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit triggers to sensitive tables
CREATE TRIGGER documents_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON documents
FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- 6. Session Sharing and Collaboration
---------------------------------------

-- Create session sharing table
CREATE TABLE IF NOT EXISTS sd_session_shares (
  session_id UUID REFERENCES sd_chat_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL CHECK (access_level IN ('owner', 'collaborator', 'viewer')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (session_id, user_id)
);

-- Update session policies for sharing
CREATE POLICY "Users can view shared sessions" ON sd_chat_sessions
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM sd_session_shares 
      WHERE session_id = sd_chat_sessions.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Collaborators can edit shared sessions" ON sd_chat_sessions
  FOR UPDATE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM sd_session_shares 
      WHERE session_id = sd_chat_sessions.id 
        AND user_id = auth.uid()
        AND access_level IN ('owner', 'collaborator')
    )
  );

-- Update chat histories policies for shared sessions
CREATE POLICY "Users can view histories in shared sessions" ON sd_chat_histories
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM sd_chat_sessions WHERE id = session_id
    )
    OR auth.uid() IN (
      SELECT user_id FROM sd_session_shares WHERE session_id = sd_chat_histories.session_id
    )
  );

CREATE POLICY "Collaborators can add messages to shared sessions" ON sd_chat_histories
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM sd_chat_sessions WHERE id = session_id
    )
    OR auth.uid() IN (
      SELECT user_id FROM sd_session_shares 
      WHERE session_id = sd_chat_histories.session_id
        AND access_level IN ('owner', 'collaborator')
    )
  );

-- 7. Performance Optimization with Strategic Indexing
----------------------------------------------

-- Create indexes for better performance
-- Essential indexes (highest priority)
CREATE INDEX IF NOT EXISTS sd_chat_sessions_user_id_idx ON sd_chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS sd_chat_histories_session_id_idx ON sd_chat_histories(session_id);
CREATE INDEX IF NOT EXISTS sd_chat_histories_session_created_idx ON sd_chat_histories(session_id, created_at);
CREATE INDEX IF NOT EXISTS documents_user_id_idx ON documents(user_id);
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- High-value indexes for chat session management
CREATE INDEX IF NOT EXISTS sd_chat_sessions_updated_at_idx ON sd_chat_sessions(updated_at);
CREATE INDEX IF NOT EXISTS sd_chat_sessions_user_updated_idx ON sd_chat_sessions(user_id, updated_at DESC);

-- High-value indexes for message retrieval patterns
CREATE INDEX IF NOT EXISTS sd_chat_histories_created_at_idx ON sd_chat_histories(created_at);
CREATE INDEX IF NOT EXISTS sd_chat_histories_role_idx ON sd_chat_histories(role);
CREATE INDEX IF NOT EXISTS sd_chat_histories_session_role_created_idx ON sd_chat_histories(session_id, role, created_at);

-- Specialized indexes for filtering and searching
CREATE INDEX IF NOT EXISTS sd_chat_sessions_agent_id_idx ON sd_chat_sessions(agent_id);
CREATE INDEX IF NOT EXISTS sd_chat_sessions_user_agent_idx ON sd_chat_sessions(user_id, agent_id);

-- JSON content indexes (only create if you query these fields frequently)
CREATE INDEX IF NOT EXISTS sd_chat_sessions_metadata_idx ON sd_chat_sessions USING GIN (metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS sd_chat_histories_tools_used_idx ON sd_chat_histories USING GIN (tools_used jsonb_path_ops);
CREATE INDEX IF NOT EXISTS sd_chat_histories_metadata_idx ON sd_chat_histories USING GIN (metadata jsonb_path_ops);