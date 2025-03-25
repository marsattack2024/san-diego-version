# Issues Tracking and Improvements

This document tracks known issues, optimizations, and improvements for the application.

## Resolved Issues

### Performance Optimizations

| Issue | Solution | Date | Reference |
|-------|----------|------|-----------|
| Redundant API calls to `/api/vote` | Consolidated data flow by extracting vote data directly from chat messages, removed GET endpoint from vote API | 2023-07-05 | [docs/performance-optimizations.md](./performance-optimizations.md) |

### UI/Accessibility

| Issue | Solution | Date | Reference |
|-------|----------|------|-----------|
| Accessibility warning for `DialogContent` | Added `SheetTitle` with sr-only class to mobile sidebar's `SheetContent` | 2023-07-01 | N/A |
| Next.js Link warning | Moved onClick handler from Link component to child component, removed legacyBehavior prop | 2023-07-01 | N/A |

## Active Issues

### Authentication

| Issue | Status | Priority | Notes |
|-------|--------|----------|-------|
| Occasional 401 errors with `/api/history` endpoint | In progress | High | Current mitigations: error handling with retry logic, auth failure cooldown, background refresh mechanism |

### Performance

| Issue | Status | Priority | Notes |
|-------|--------|----------|-------|
| Authentication cache | Not started | Medium | Consider implementing client-side caching for authentication tokens |
| History data caching | Not started | Medium | Consider implementing a caching mechanism for chat history |

## Backlog

| Issue | Type | Priority | Description |
|-------|------|----------|-------------|
| WebSocket for votes | Enhancement | Low | Consider using WebSockets for real-time vote updates in collaborative scenarios |
| Vote analytics | Enhancement | Low | Add tracking to understand user feedback patterns |

## How to Contribute

1. When fixing an issue, move it from "Active Issues" to "Resolved Issues"
2. Add new issues to the appropriate section
3. Update the priority as needed
4. Link to any relevant documentation or PRs 