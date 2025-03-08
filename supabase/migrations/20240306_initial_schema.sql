-- Create extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create chat sessions table
CREATE TABLE IF NOT EXISTS sd_chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id TEXT DEFAULT 'default',
  deep_search_enabled BOOLEAN DEFAULT FALSE,
  metadata JSONB
);

-- Create chat histories table
CREATE TABLE IF NOT EXISTS sd_chat_histories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sd_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tools_used JSONB, -- Track which tools were used (RAG, Web Scraper, Deep Search)
  metadata JSONB
);

-- Create votes table
CREATE TABLE IF NOT EXISTS sd_chat_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sd_chat_sessions(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES sd_chat_histories(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('up', 'down')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE(message_id, user_id)
);


-- Enable pgvector extension for vector embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create documents table for vector search
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  kind TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  embedding VECTOR(1536)
);

-- Create function to match documents based on embedding similarity
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 5,
  filter JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$$
DECLARE
  initial_threshold FLOAT := 0.6;
  minimum_threshold FLOAT := 0.4;
  result_count INTEGER;
BEGIN
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
    GREATEST(0, 1 - (documents.embedding <=> query_embedding)) AS similarity
  FROM documents
  WHERE
    -- Apply filter if provided
    (filter = '{}' OR (filter->>'kind' IS NOT NULL AND documents.kind = filter->>'kind'))
    -- Apply initial similarity threshold of 0.6
    AND GREATEST(0, 1 - (documents.embedding <=> query_embedding)) >= initial_threshold
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;

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
      GREATEST(0, 1 - (documents.embedding <=> query_embedding)) AS similarity
    FROM documents
    WHERE
      -- Apply filter if provided
      (filter = '{}' OR (filter->>'kind' IS NOT NULL AND documents.kind = filter->>'kind'))
      -- Apply minimum similarity threshold of 0.4
      AND GREATEST(0, 1 - (documents.embedding <=> query_embedding)) >= minimum_threshold
    ORDER BY documents.embedding <=> query_embedding
    LIMIT match_count;
  END IF;
END;
$$;

-- Create RLS policies
ALTER TABLE sd_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sd_chat_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE sd_chat_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Create policies for chat sessions
CREATE POLICY "Users can view their own chat sessions" ON sd_chat_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat sessions" ON sd_chat_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat sessions" ON sd_chat_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat sessions" ON sd_chat_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Create policies for chat histories
CREATE POLICY "Users can view histories in their sessions" ON sd_chat_histories
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM sd_chat_sessions WHERE id = session_id
    )
  );

CREATE POLICY "Users can insert histories in their sessions" ON sd_chat_histories
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM sd_chat_sessions WHERE id = session_id
    )
  );

-- Create policies for votes
CREATE POLICY "Users can view their own votes" ON sd_chat_votes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own votes" ON sd_chat_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own votes" ON sd_chat_votes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own votes" ON sd_chat_votes
  FOR DELETE USING (auth.uid() = user_id);

-- Create policies for documents
CREATE POLICY "Users can view their own documents" ON documents
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own documents" ON documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents" ON documents
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents" ON documents
  FOR DELETE USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS sd_chat_sessions_user_id_idx ON sd_chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS sd_chat_histories_session_id_idx ON sd_chat_histories(session_id);
CREATE INDEX IF NOT EXISTS sd_chat_votes_message_id_idx ON sd_chat_votes(message_id);
CREATE INDEX IF NOT EXISTS documents_user_id_idx ON documents(user_id);
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);