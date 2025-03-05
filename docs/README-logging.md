# Simplified Logging System for Next.js + Vercel + Supabase

This directory contains a lightweight, production-ready logging system optimized for Next.js applications deployed on Vercel and using Supabase (including vector operations).

## Core Components

### `logger.ts`
The foundational logger that provides structured JSON logging optimized for Vercel's built-in logging infrastructure. It offers different log levels with environment-aware behavior.

```typescript
import { logger } from './utils/logger';

// Basic usage
logger.info('User signed up', { userId: '123', important: true });
logger.error('Failed to connect to database', { error });
```

### `middleware.ts`
Adds request correlation IDs and tracking to all requests. This enables tracing requests throughout the system, even across services.

### `api-logger.ts`
Higher-order function that wraps API route handlers with logging functionality. It logs request receipt, completion, and any errors.

```typescript
import { withLogging } from '../utils/api-logger';

async function handler(req, res) {
  // Your API logic here
}

export default withLogging(handler);
```

### `vector-logger.ts`
Specialized logging for Supabase vector operations, including embedding creation and similarity searches.

```typescript
import { vectorLogger, tracedVectorOperation } from '../utils/vector-logger';

// Direct usage
vectorLogger.logEmbeddingCreation('doc-123', { contentType: 'article' });

// Using the wrapper
const results = await tracedVectorOperation(
  'search',
  () => supabase.rpc('match_documents', { query_embedding }),
  { query: 'user query', params: { threshold: 0.5 } }
);
```

### `client-logger.ts`
Browser-side logging with throttling and server reporting for critical errors.

```typescript
import { clientLogger } from '../utils/client-logger';

clientLogger.error('Failed to load user profile', { userId });
```

### `ai-logger.ts`
Tracks AI service interactions with performance metrics and token usage.

```typescript
import { logAIInteraction, tracedAIOperation } from '../utils/ai-logger';

// Using the wrapper
const completion = await tracedAIOperation(
  () => openai.chat.completions.create({ messages, model: 'gpt-4' }),
  { 
    requestId: 'req-123', 
    model: 'gpt-4', 
    promptTokens: 250
  }
);
```

## Key Features

1. **JSON-Structured Logs**: All logs are formatted as JSON for better searchability in Vercel's dashboard
2. **Request Correlation**: Unique IDs are assigned to requests and propagated throughout the system
3. **Performance Tracking**: Automatic tracking of response times with warnings for slow operations
4. **Environment Awareness**: Different logging behavior in development vs. production
5. **Error Consolidation**: Client-side errors are reported to the server and logged consistently
6. **Specialized Logging**: Custom logging for vector operations and AI interactions

## Best Practices

1. **Use Correlation IDs**: Always pass correlation IDs when making service-to-service calls
2. **Mark Important Logs**: Set `important: true` for logs that should appear in production
3. **Structured Context**: Include relevant context data in structured format
4. **Minimal Production Logging**: In production, only log errors, warnings, and important events
5. **Security**: Never log sensitive data (passwords, tokens, etc.)

## Production Considerations

- **Log Storage**: Vercel automatically stores logs; no additional infrastructure needed
- **Viewing Logs**: Use Vercel dashboard to view and search logs
- **Retention**: Vercel has limited log retention; for long-term storage, implement a custom solution
- **Rate Limiting**: This system includes throttling for high-volume logs to prevent flooding

## Examples

### API Route with Full Logging

```typescript
// pages/api/chat.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { withLogging } from '../../utils/api-logger';
import { logAIInteraction } from '../../utils/ai-logger';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestId = req.headers['x-request-id'] as string;
  const { message, userId, sessionId } = req.body;
  
  // Store chat message in Supabase
  await supabase
    .from('chat_messages')
    .insert({
      user_id: userId,
      session_id: sessionId,
      role: 'user',
      content: message
    });
  
  // Process with AI service
  // ... your AI processing code ...
  
  res.status(200).json({ response: 'AI response here' });
}

export default withLogging(handler);
```

### Vector Search with Logging

```typescript
// utils/search.ts
import { tracedVectorOperation } from './vector-logger';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function searchDocuments(query, options = {}) {
  const requestId = options.requestId || 'unknown';
  
  return tracedVectorOperation(
    'search',
    () => supabase.rpc('match_documents', {
      query_embedding: query,
      match_threshold: options.threshold || 0.5,
      match_count: options.limit || 10
    }),
    { 
      requestId,
      query,
      params: { 
        threshold: options.threshold,
        limit: options.limit
      }
    }
  );
} 