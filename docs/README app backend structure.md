# Backend Structure Documentation

## 1. Database Schema

### Core Tables

#### 1.1 User Profiles (`sd_user_profiles`)
```sql
CREATE TABLE sd_user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  website_url TEXT,
  company_description TEXT NOT NULL,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_admin BOOLEAN DEFAULT FALSE
);
```

#### 1.2 Chat Sessions (`sd_chat_sessions`)
```sql
CREATE TABLE sd_chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  agent_id TEXT,
  deep_search_enabled BOOLEAN DEFAULT FALSE,
  metadata JSONB
);
```

#### 1.3 Chat Histories (`sd_chat_histories`)
```sql
CREATE TABLE sd_chat_histories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sd_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tools_used JSONB,
  metadata JSONB,
  vote TEXT CHECK (vote IN ('up', 'down', NULL))
);
```

#### 1.4 Documents (Vector Store)
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  kind TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  embedding VECTOR(1536)
);
```

#### 1.5 Audit Logs
```sql
CREATE TABLE sd_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  ip_address TEXT,
  changes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Performance Optimizations

#### Indexes
```sql
-- Chat Sessions
CREATE INDEX sd_chat_sessions_user_id_idx ON sd_chat_sessions(user_id);
CREATE INDEX sd_chat_sessions_updated_at_idx ON sd_chat_sessions(updated_at);
CREATE INDEX sd_chat_sessions_user_updated_idx ON sd_chat_sessions(user_id, updated_at DESC);

-- Chat Histories
CREATE INDEX sd_chat_histories_session_id_idx ON sd_chat_histories(session_id);
CREATE INDEX sd_chat_histories_created_at_idx ON sd_chat_histories(created_at);
CREATE INDEX sd_chat_histories_role_idx ON sd_chat_histories(role);
CREATE INDEX sd_chat_histories_session_role_created_idx ON sd_chat_histories(session_id, role, created_at);

-- Vector Search
CREATE INDEX documents_embedding_idx ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

## 2. Authentication System

### 2.1 Middleware Implementation
- Handles authentication state across the application
- Implements caching for performance optimization
- Manages protected routes and admin access
- Handles profile completion requirements

```typescript
// Key middleware features
- Protected paths verification
- Auth state caching (30 minutes production, 60 minutes development)
- Admin role verification
- Profile completion checks
- Rate limiting for auth endpoints
```

### 2.2 Auth Headers Optimization
```typescript
// Client-side header injection for performance
headers.set('x-supabase-auth', user.id);
headers.set('x-auth-time', Date.now().toString());
headers.set('x-has-profile', profile ? 'true' : 'false');
```

### 2.3 Admin Authorization
```sql
-- Admin check function
CREATE OR REPLACE FUNCTION is_admin(uid UUID) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM sd_user_roles 
    WHERE user_id = uid AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## 3. Vector Search System

### 3.1 Document Retrieval Function
```sql
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 5,
  filter JSONB DEFAULT '{}'::JSONB
) RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
  initial_threshold FLOAT := 0.6;
  minimum_threshold FLOAT := 0.4;
BEGIN
  -- Implementation with two-tier threshold system
END;
$$;
```

### 3.2 Vector Search Features
- Two-tier similarity threshold (0.6 initial, 0.4 fallback)
- Metadata filtering support
- Caching system for frequent queries
- Performance monitoring and logging

## 4. Row Level Security (RLS)

### 4.1 User Profiles
```sql
CREATE POLICY "Users can view their own profile"
  ON sd_user_profiles FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON sd_user_profiles FOR UPDATE USING (auth.uid() = user_id);
```

### 4.2 Chat Sessions
```sql
CREATE POLICY "Users can view shared sessions" ON sd_chat_sessions
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM sd_session_shares 
      WHERE session_id = sd_chat_sessions.id AND user_id = auth.uid()
    )
  );
```

### 4.3 Documents
```sql
CREATE POLICY "All users can view documents" ON documents
  FOR SELECT USING (true);

CREATE POLICY "Only admin can insert documents" ON documents
  FOR INSERT WITH CHECK (is_admin(auth.uid()));
```

## 5. Edge Cases & Error Handling

### 5.1 Authentication Edge Cases
- Token expiration handling
- Session refresh logic
- Concurrent request handling
- Development mode shortcuts

### 5.2 Vector Search Edge Cases
- No results found (fallback threshold)
- Slow queries (performance monitoring)
- Invalid embeddings
- Rate limiting for vector operations

### 5.3 Error Logging
```typescript
// Structured logging for vector operations
vectorLogger.logVectorQuery(query, params, resultCount, durationMs);

// Edge logging for auth operations
edgeLogger.info('Auth performance', { 
  path: requestPath, 
  executionTimeMs: executionTime,
  wasSlow: true
});
```

## 6. Performance Considerations

### 6.1 Caching Strategy
- Auth state caching (10s production, 5m development)
- Vector search results caching
- Profile checks caching
- Request-specific caching

### 6.2 Database Optimizations
- Partitioned chat history tables
- Strategic indexing
- Efficient vector search indexes
- JSON operation optimizations

### 6.3 Rate Limiting
```typescript
// Different rate limits for:
- Authentication endpoints
- AI/Chat endpoints
- Standard API endpoints
- Vector search operations
```

## 7. Security Measures

### 7.1 Audit System
- Comprehensive action logging
- User activity tracking
- Admin action monitoring
- Security event logging

### 7.2 Data Protection
- Row Level Security (RLS) policies
- Admin role verification
- Secure session management
- Data access controls
