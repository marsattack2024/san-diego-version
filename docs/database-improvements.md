# Database Schema Improvements

This document describes the planned improvements to the database schema to address several issues and enhance the security, validation, and functionality of the system.

## Current Issues

1. **RLS Policies**: The document policies relied on hardcoded admin email rather than proper roles.
2. **NULL Constraints**: Inconsistent enforcement of NOT NULL constraints across tables.
3. **Role Validation**: No validation on roles in chat_histories (e.g., CHECK for "user", "assistant", etc.).
4. **Pagination**: Limited pagination support in vector search functions.
5. **Access Controls**: Limited to basic user-level security without application roles or granular access.

## Improvement Plan

The improvements are organized into two phases with ten main areas:

### 1. Role-Based Access Control

Replaces hardcoded admin emails with a proper role system:

- Creates a dedicated `sd_user_roles` table to store user roles
- Implements an `is_admin()` function to check admin status
- Updates document policies to use roles instead of hardcoded emails

### 2. Granular Access Levels

Enables more fine-grained control over document access:

- Adds a `sd_document_access` table for document sharing 
- Creates policies for viewing, editing, and deleting shared documents
- Supports different access levels (owner, editor, viewer)

### 3. Improved Data Validation

Enhances data integrity through constraints:

- Adds validation for message roles (user, assistant, system, tool)
- Enforces NOT NULL constraints on critical fields
- Validates JSON/JSONB fields to ensure proper structure

### 4. Pagination Support

Enhances the `match_documents` function with pagination capabilities:

- Adds `offset_count` parameter for pagination
- Returns total count of potential matches for UI pagination controls
- Preserves the adaptive threshold mechanism

### 5. Security Auditing

Implements audit logging for sensitive operations:

- Creates an audit log table to track changes
- Implements trigger functions for logging
- Tracks user actions on sensitive tables

### 6. Session Sharing and Collaboration

Enables users to collaborate on chat sessions:

- Adds a `sd_session_shares` table for session sharing
- Creates policies for shared session access
- Supports different collaboration levels

### 7. Performance Optimization

Adds strategic indexes to improve query performance:

- **Essential indexes** for core functionality
  - Indexes on foreign keys (user_id, session_id)
  - Composite index for message retrieval by session (session_id, created_at)
  - Vector search index for embeddings

- **Chat session optimization**
  - Index on updated_at for recent sessions
  - Composite index (user_id, updated_at) for user's recent sessions

- **Message retrieval optimization**
  - Index on role for filtering message types
  - Composite index (session_id, role, created_at) for filtered chronological retrieval

- **Specialized indexes**
  - Agent filtering via agent_id index
  - JSON indexes for metadata and tools_used (when frequently queried)

### 8. Table Partitioning for Historical Data

Implements time-based partitioning for message history:

- Partitions the `sd_chat_histories` table by month
- Adds automatic partition management function
- Preserves indexes and constraints on partitioned table
- Enables easy archiving of older partitions

### 9. Materialized Views for Common Query Patterns

Creates pre-computed result sets for frequently needed data:

- **User activity metrics**: Sessions and message counts per user
- **Session summary**: Message counts and duration statistics
- **Popular documents**: Usage metrics for knowledge base content
- Includes automatic refresh functions

### 10. Vacuum and Maintenance Operations

Configures optimal database maintenance:

- Custom autovacuum settings for different tables
- Enhanced statistics collection for query optimization
- Scheduled maintenance function for regular upkeep

### 11. Consistent Cascade Behaviors

Standardizes foreign key behaviors across the database:

- Ensures all foreign keys have explicit ON DELETE behaviors
- Makes all related user_id columns NOT NULL
- Creates documentation for cascade behaviors
- Provides a view to inspect foreign key relationships

## Implementation

Three migration files have been created to implement these improvements:

1. **schema_improvements.sql**: Base improvements (roles, constraints, basic indexes)
2. **advanced_performance.sql**: Advanced optimization (partitioning, materialized views)
3. **cascade_behaviors.sql**: Foreign key standardization and documentation

### Deployment Plan

To apply these improvements:

1. Apply the baseline schema first (20240306_initial_schema.sql)
2. Apply the base improvements (schema_improvements.sql)
3. Verify policies and constraints were successfully applied
4. Apply advanced performance improvements (advanced_performance.sql)
5. Apply cascade behavior standardization (cascade_behaviors.sql)
6. Monitor performance and adjust as needed

## Key Considerations

- **Backward Compatibility**: These changes are designed to be backward compatible with existing code
- **Performance**: Additional indexes are included where needed for performance
- **Security**: Row-level security (RLS) is used to enforce access controls
- **Scalability**: The design supports future growth and additional features