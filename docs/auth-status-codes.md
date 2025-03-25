# Authentication Status Codes and Headers

## Authentication Response Codes

The application uses specific status codes for different authentication states:

| Status Code | Description |
|-------------|-------------|
| 200 | Authentication successful |
| 401 | Unauthorized - No valid authentication |
| 403 | Forbidden - Authentication valid but insufficient permissions |
| 409 | Authentication Pending - Auth cookies present but validation incomplete |

## Special Case: 409 Conflict

The 409 Conflict status code is used for a specific edge case:

- Auth cookies are present in the request
- The request includes a timestamp parameter
- Authentication validation is still pending or in progress

This represents a temporary state where the client has proper credentials but the server's authentication validation is incomplete (usually due to timing issues during initial page load or cross-tab communication).

The client should treat 409 responses as retryable after a short delay rather than triggering a circuit breaker.

## Authentication Headers

The middleware sets consistent authentication headers for all requests:

### For Authenticated Users

```
x-supabase-auth: [user_id]
x-auth-valid: true
x-auth-time: [timestamp]
x-has-profile: [true|false]
```

### For Unauthenticated Users

```
x-supabase-auth: anonymous
x-auth-valid: false
x-auth-time: [timestamp]
x-has-profile: false
x-has-auth-cookies: [true|false]
```

The `x-has-auth-cookies` header helps track cases where cookies are present but authentication failed.

## Error Response Headers

For 401 Unauthorized responses, additional headers are included:

```
x-unauthorized-count: [count] - Number of consecutive unauthorized requests
x-unauthorized-timestamp: [timestamp] - Timestamp of the unauthorized request
```

For 409 Conflict responses, retry information is provided:

```
Retry-After: 1 - Suggested retry delay in seconds
x-auth-pending: true - Indicates authentication is in progress
```

## Client-Side Handling

The client is expected to handle these status codes as follows:

1. **200 OK**: Process response normally
2. **401 Unauthorized**: 
   - Track consecutive 401s
   - Activate circuit breaker after threshold (3 consecutive 401s within 5s)
   - Use cached data during circuit breaker activation
3. **409 Conflict**:
   - Retry after suggested delay
   - Use cached data for temporary continuity
   - Do not count toward circuit breaker threshold

This multi-status approach provides more granular control over authentication states, improving the user experience during authentication transitions and edge cases.