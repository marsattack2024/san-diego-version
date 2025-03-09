-- Create documents table for vector search
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  kind TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- Admin user ID
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  embedding VECTOR(1536)
);

-- 2. Vector Search Function
----------------------------

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

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Simple admin check using email for documents management
-- Document policies - only admin can manage documents
CREATE POLICY "All users can view documents" ON documents
  FOR SELECT USING (true);

CREATE POLICY "Only admin can insert documents" ON documents
  FOR INSERT WITH CHECK (
    auth.email() = 'admin@example.com' -- Replace with actual admin email
  );

CREATE POLICY "Only admin can update documents" ON documents
  FOR UPDATE USING (
    auth.email() = 'admin@example.com' -- Replace with actual admin email
  );

CREATE POLICY "Only admin can delete documents" ON documents
  FOR DELETE USING (
    auth.email() = 'admin@example.com' -- Replace with actual admin email
  );

  CREATE INDEX documents_embedding_idx ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);


