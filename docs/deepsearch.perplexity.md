# Perplexity DeepSearch Integration Guide

This document explains how the Perplexity DeepSearch feature is implemented in the application, including key files, configuration, prompting strategy, and how results are processed.

## Overview

Perplexity DeepSearch provides advanced web search capabilities through the Perplexity API. It's used to enrich the AI's responses with up-to-date information from the web, significantly improving the quality and relevance of answers to user queries. The feature is enabled through a toggle in the UI and performs real-time web searches for relevant information.

## Key Components

### 1. Configuration and Setup

The DeepSearch feature requires a valid Perplexity API key configured in the environment:

```
PERPLEXITY_API_KEY=pplx-xxxxxxxxxxxxxxxxxxxxxxxxx
```

The API key must use the `pplx-` prefix format to be valid.

### 2. Key Files

| File | Purpose |
|------|---------|
| `/lib/chat-engine/tools/deepsearch-tool.ts` | Defines the DeepSearch tool interface and imports the implementation |
| `/lib/agents/tools/perplexity/api.ts` | Core client implementation for Perplexity API, handles auth and URL construction |
| `/app/api/perplexity/route.ts` | Internal API endpoint that communicates with Perplexity |
| `/app/api/chat/route.ts` | Manages when and how DeepSearch is triggered |
| `/app/api/events/route.ts` | Handles server-sent events for DeepSearch status |
| `/components/deep-search-tracker.tsx` | Client component for tracking DeepSearch progress |
| `/components/multimodal-input.tsx` | Contains the DeepSearch toggle button |
| `/stores/chat-store.ts` | Manages DeepSearch state |
| `/middleware.ts` | Configures authentication exemptions for internal API calls |

## Implementation Details

### Architecture Flow

The DeepSearch implementation follows this architecture pattern:

1. User enables DeepSearch via toggle button in `multimodal-input.tsx`
2. Toggle state is passed to `chat-store.ts` and persisted
3. When the user submits a query, the `deepSearchEnabled` flag is included in the request
4. Chat API route detects DeepSearch is enabled and initiates the search process
5. Internal client in `/lib/agents/tools/perplexity/api.ts` constructs a proper URL based on environment:
   - For development: `http://localhost:3000/api/perplexity`
   - For production: `https://[actual-domain]/api/perplexity`
6. The client sends a request with special `User-Agent: Mozilla/5.0 SanDiego/1.0` header
7. The `/api/perplexity` route identifies internal requests via the User-Agent header
8. The API correctly formats the authentication header as `Bearer pplx-xxxxxxxxxx`
9. Perplexity API returns search results which are cached in Redis
10. Results are added to the system prompt to enhance AI responses

### API Authentication Details

To authenticate with the Perplexity API correctly:

```typescript
// Ensure there's a single space between "Bearer" and the token
const apiKey = perplexityApiKey.trim();
const authorizationHeader = `Bearer ${apiKey}`;

const headers = {
  'Content-Type': 'application/json',
  'Authorization': authorizationHeader,
  'User-Agent': 'Mozilla/5.0 SanDiego/1.0'
};
```

### Internal Authentication Mechanism

For server-to-server communication without user authentication issues:

1. The internal API utility sets a special User-Agent header:
   ```typescript
   headers: {
     "Content-Type": "application/json",
     "User-Agent": "Mozilla/5.0 SanDiego/1.0"
   }
   ```

2. The API endpoint checks for this header to identify internal requests:
   ```typescript
   const userAgent = req.headers.get('user-agent') || '';
   const isInternalRequest = userAgent.includes('SanDiego');
   if (isInternalRequest) {
     // Skip authentication for internal requests
   }
   ```

3. The middleware completely bypasses auth checks for requests to `/api/perplexity`

### URL Construction Logic

The correct URL construction is critical to ensure production environment works properly:

```typescript
// For development, use localhost, for production use the actual domain
// But never use the VERCEL_URL which causes auth issues
let host;
if (process.env.NODE_ENV === 'development') {
  host = 'localhost:3000';
} else {
  // In production, use the actual host from the request if possible, or a hardcoded value
  host = process.env.NEXT_PUBLIC_HOST || 'app.photographytoprofits.com';
}

const apiUrl = `${protocol}://${host}${INTERNAL_API_URL}`;
```

### Perplexity API Configuration

The actual API call to Perplexity uses these parameters:

```typescript
const requestBody = {
  model: "sonar",  // Default model
  messages: [{ role: "user", content: query }],
  temperature: 0.5,
  max_tokens: 1000,
  stream: false,
  web_search_options: {
    search_context_size: "high"
  }
};
```

### Caching and Performance

1. Search results are cached in Redis to improve performance:
   ```
   {"level":"info","message":"Stored DeepSearch content in Redis cache","operation":"deep_search_cache_set","operationId":"deepsearch-m8t9x251","contentLength":1510,"jsonStringLength":1671,"ttl":3600,"model":"sonar"}
   ```

2. When identical queries are made, results are served from cache:
   ```
   {"level":"info","message":"Deep Search results found in cache","operation":"deep_search_success","operationId":"deepsearch-m8t9x251","contentLength":1510,"firstChars":"Here are some key results...","fromCache":true,"durationMs":138}
   ```

3. Typical processing time ranges from 5-15 seconds for new searches

## User Experience

1. User submits a query with DeepSearch enabled
2. "Thinking & searching..." indicator appears
3. DeepSearch queries the Perplexity API
4. Results are appended to the system prompt:
   ```
   // Add deep search results to the system prompt if available
   if (toolResults.deepSearch) {
     enhancedSystemPrompt += `\n\n### DEEP SEARCH RESULTS ###\nThe following information was retrieved through deep web research:\n\n${toolResults.deepSearch}\n\n`;
     toolsUsed.push('Deep Search');
   }
   ```
5. AI generates a response using the enhanced prompt
6. Response includes acknowledgment of DeepSearch usage

## Troubleshooting

### Common Issues and Solutions

1. **401 Unauthorized Errors**
   - **Cause**: Incorrect authentication header format or API key format
   - **Solution**: Ensure the API key starts with `pplx-` and the header uses format `Bearer pplx-xxxx`
   
2. **URL Construction Issues**
   - **Cause**: Using `process.env.VERCEL_URL` in production causes auth errors
   - **Solution**: Use the actual domain name instead of internal Vercel URLs

3. **Cached Error Responses**
   - **Cause**: Redis caches errors, perpetuating problems even after fixes
   - **Solution**: Clear Redis cache using the debug endpoint when fixing issues

4. **User-Agent Detection Failures**
   - **Cause**: Headers may be modified by infrastructure
   - **Solution**: Ensure `SanDiego` string is present and properly detected in User-Agent

### Debugging Tools

Enhanced logging statements are strategically placed throughout the flow:

1. API key validation:
   ```typescript
   edgeLogger.info('Authorization header format check', {
     operation: 'perplexity_auth_header_check',
     startsWithBearer: authorizationHeader.startsWith('Bearer '),
     hasSpaceAfterBearer: authorizationHeader.charAt(6) === ' ',
     keyStartsWithPplx: apiKey.startsWith('pplx-')
   });
   ```

2. URL construction debugging:
   ```typescript
   logger.info("Perplexity URL construction details", {
     operation: "perplexity_url_construction",
     protocol,
     host,
     fullUrl: apiUrl
   });
   ```

3. Authentication flow:
   ```typescript
   edgeLogger.info('Perplexity authentication decision details', {
     operation: 'perplexity_auth_details',
     userAgent,
     isInternalRequest,
     containsSanDiego: userAgent.includes('SanDiego')
   });
   ```

## Production Considerations

1. **Environment Variables**
   - Ensure `PERPLEXITY_API_KEY` is set in all environments
   - Consider adding `NEXT_PUBLIC_HOST` for domain name control

2. **Redis Cache Management**
   - Cache TTL is set to 3600 seconds (1 hour)
   - Consider implementing a cache clearing mechanism for updates

3. **Error Handling**
   - Failed searches return a graceful degradation message
   - Errors are fully logged with detailed information

4. **Authentication Flow**
   - The User-Agent header is crucial for internal communication
   - Middleware must bypass the `/api/perplexity` endpoint

5. **URL Construction**
   - Never use `VERCEL_URL` environment variable for production URLs
   - Use the actual domain or `NEXT_PUBLIC_HOST` environment variable

By carefully managing these components, the DeepSearch feature provides valuable real-time web information to enhance AI responses while maintaining reliability in production.
