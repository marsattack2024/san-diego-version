-- Advanced Performance Optimizations for San Diego Version
-- Apply these after schema_improvements.sql and monitor their impact

-- 1. Table Partitioning for Historical Chat Data
------------------------------------------------

-- First, we need to preserve the existing data
CREATE TABLE sd_chat_histories_temp AS SELECT * FROM sd_chat_histories;

-- Drop existing table (save constraints for later)
DROP TABLE sd_chat_histories CASCADE;

-- Create partitioned table with same structure
CREATE TABLE sd_chat_histories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tools_used JSONB,
  metadata JSONB,
  vote TEXT CHECK (vote IN ('up', 'down', NULL))
) PARTITION BY RANGE (created_at);

-- Add constraint for role validation
ALTER TABLE sd_chat_histories ADD CONSTRAINT chat_histories_role_check 
  CHECK (role IN ('user', 'assistant', 'system', 'tool'));

-- Add JSON validation constraints
ALTER TABLE sd_chat_histories ADD CONSTRAINT valid_history_metadata 
  CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object');
  
ALTER TABLE sd_chat_histories ADD CONSTRAINT valid_tools_used 
  CHECK (tools_used IS NULL OR jsonb_typeof(tools_used) = 'object');

-- Create foreign key constraint
ALTER TABLE sd_chat_histories 
  ADD CONSTRAINT sd_chat_histories_session_id_fkey 
  FOREIGN KEY (session_id) REFERENCES sd_chat_sessions(id) ON DELETE CASCADE;

-- Create partitions (one per month for next 12 months)
-- Adjust dates based on your actual data timeline
CREATE TABLE sd_chat_histories_current_month PARTITION OF sd_chat_histories
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
  
CREATE TABLE sd_chat_histories_next_month PARTITION OF sd_chat_histories
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- Default partition for any data outside defined ranges
CREATE TABLE sd_chat_histories_default PARTITION OF sd_chat_histories DEFAULT;

-- Restore existing data
INSERT INTO sd_chat_histories SELECT * FROM sd_chat_histories_temp;

-- Drop temp table
DROP TABLE sd_chat_histories_temp;

-- Add indexes to partitioned table
CREATE INDEX sd_chat_histories_session_id_idx ON sd_chat_histories(session_id);
CREATE INDEX sd_chat_histories_created_at_idx ON sd_chat_histories(created_at);
CREATE INDEX sd_chat_histories_role_idx ON sd_chat_histories(role);
CREATE INDEX sd_chat_histories_session_created_idx ON sd_chat_histories(session_id, created_at);
CREATE INDEX sd_chat_histories_session_role_created_idx ON sd_chat_histories(session_id, role, created_at);
CREATE INDEX sd_chat_histories_tools_used_idx ON sd_chat_histories USING GIN (tools_used jsonb_path_ops);
CREATE INDEX sd_chat_histories_metadata_idx ON sd_chat_histories USING GIN (metadata jsonb_path_ops);

-- Add RLS policies
ALTER TABLE sd_chat_histories ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Users can update their votes in histories" ON sd_chat_histories
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT user_id FROM sd_chat_sessions WHERE id = session_id
    )
  );

-- Add policies for shared sessions if using that feature
CREATE POLICY "Users can view histories in shared sessions" ON sd_chat_histories
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM sd_session_shares WHERE session_id = sd_chat_histories.session_id
    )
  );

CREATE POLICY "Collaborators can add messages to shared sessions" ON sd_chat_histories
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM sd_session_shares 
      WHERE session_id = sd_chat_histories.session_id
        AND access_level IN ('owner', 'collaborator')
    )
  );

-- Automatic partition management function
CREATE OR REPLACE FUNCTION create_chat_history_partition()
RETURNS VOID AS $$
DECLARE
  next_month_start DATE;
  partition_name TEXT;
  partition_exists BOOLEAN;
BEGIN
  -- Calculate start of next month from current date
  next_month_start := date_trunc('month', current_date + interval '1 month')::date;
  
  -- Create partition name based on date (format: sd_chat_histories_YYYYMM)
  partition_name := 'sd_chat_histories_' || to_char(next_month_start, 'YYYYMM');
  
  -- Check if partition already exists
  SELECT EXISTS (
    SELECT FROM pg_tables 
    WHERE tablename = partition_name
  ) INTO partition_exists;
  
  -- Create new partition if it doesn't exist
  IF NOT partition_exists THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF sd_chat_histories FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      next_month_start,
      next_month_start + interval '1 month'
    );
    
    RAISE NOTICE 'Created new partition: %', partition_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to run partition creation monthly
-- Uncomment and run manually or adapt for your scheduled job system
/*
SELECT cron.schedule(
  'create-chat-history-partition',
  '0 0 1 * *',  -- At midnight on the 1st of every month
  'SELECT create_chat_history_partition()'
);
*/

-- 2. Materialized Views for Common Query Patterns
-------------------------------------------------

-- User activity metrics
CREATE MATERIALIZED VIEW user_chat_metrics AS
SELECT 
  user_id,
  COUNT(DISTINCT session_id) AS total_sessions,
  COUNT(*) AS total_messages,
  COUNT(CASE WHEN role = 'user' THEN 1 END) AS user_messages,
  COUNT(CASE WHEN role = 'assistant' THEN 1 END) AS assistant_messages,
  MAX(created_at) AS last_activity,
  MIN(created_at) AS first_activity
FROM sd_chat_histories
GROUP BY user_id;

-- Create index on the materialized view
CREATE UNIQUE INDEX user_chat_metrics_user_id_idx ON user_chat_metrics(user_id);

-- Periodic refresh function
CREATE OR REPLACE FUNCTION refresh_user_chat_metrics()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_chat_metrics;
END;
$$ LANGUAGE plpgsql;

-- Session summary view
CREATE MATERIALIZED VIEW session_summary AS
SELECT 
  s.id AS session_id,
  s.title,
  s.user_id,
  s.agent_id,
  s.created_at AS session_created_at,
  s.updated_at AS session_updated_at,
  COUNT(h.id) AS message_count,
  MAX(h.created_at) AS last_message_at,
  EXTRACT(EPOCH FROM (MAX(h.created_at) - MIN(h.created_at)))/60 AS session_duration_minutes
FROM sd_chat_sessions s
LEFT JOIN sd_chat_histories h ON s.id = h.session_id
GROUP BY s.id, s.title, s.user_id, s.agent_id, s.created_at, s.updated_at;

-- Create index on the materialized view
CREATE UNIQUE INDEX session_summary_id_idx ON session_summary(session_id);

-- Popular content report
CREATE MATERIALIZED VIEW popular_documents AS
SELECT 
  d.id AS document_id,
  d.title,
  d.kind,
  COUNT(*) AS usage_count,
  AVG(h.vote = 'up')::float AS upvote_ratio,
  d.user_id AS uploaded_by
FROM documents d
JOIN sd_chat_histories h ON h.metadata->>'referenced_documents' ? d.id::text
GROUP BY d.id, d.title, d.kind, d.user_id
ORDER BY usage_count DESC;

-- Create index on the materialized view
CREATE UNIQUE INDEX popular_documents_id_idx ON popular_documents(document_id);

-- 3. VACUUM and Maintenance Operations
---------------------------------------

-- Configure autovacuum settings for chat histories table
ALTER TABLE sd_chat_histories SET (
  autovacuum_vacuum_scale_factor = 0.05,  -- Vacuum after 5% of rows change
  autovacuum_analyze_scale_factor = 0.02, -- Analyze after 2% of rows change
  autovacuum_vacuum_cost_limit = 1000     -- Allow more vacuum work per cycle
);

-- Configure autovacuum settings for sessions table
ALTER TABLE sd_chat_sessions SET (
  autovacuum_vacuum_scale_factor = 0.1,  -- Vacuum after 10% of rows change
  autovacuum_analyze_scale_factor = 0.05 -- Analyze after 5% of rows change
);

-- Configure autovacuum settings for documents table (less frequent updates)
ALTER TABLE documents SET (
  autovacuum_vacuum_scale_factor = 0.2,  -- Vacuum after 20% of rows change
  autovacuum_analyze_scale_factor = 0.1  -- Analyze after 10% of rows change
);

-- Create statistics targets for better query planning
ALTER TABLE sd_chat_histories ALTER COLUMN session_id SET STATISTICS 1000;
ALTER TABLE sd_chat_histories ALTER COLUMN role SET STATISTICS 500;
ALTER TABLE sd_chat_histories ALTER COLUMN created_at SET STATISTICS 1000;

ALTER TABLE sd_chat_sessions ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE sd_chat_sessions ALTER COLUMN agent_id SET STATISTICS 500;

ALTER TABLE documents ALTER COLUMN kind SET STATISTICS 500;

-- Create maintenance function
CREATE OR REPLACE FUNCTION perform_database_maintenance()
RETURNS VOID AS $$
BEGIN
  -- Refresh materialized views
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_chat_metrics;
  REFRESH MATERIALIZED VIEW CONCURRENTLY session_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY popular_documents;
  
  -- Analyze tables for better statistics
  ANALYZE sd_chat_histories;
  ANALYZE sd_chat_sessions;
  ANALYZE documents;
  
  -- Check for upcoming partition needs
  PERFORM create_chat_history_partition();
END;
$$ LANGUAGE plpgsql;