# Supabase Chat History Implementation

This document outlines the implementation of chat history storage and management using Supabase in our application.

## Overview

Our chat history system uses Supabase as a database backend with the following features:
- User-specific chat sessions
- Persistent message history
- Message voting (up/down)
- Chat deletion

## Database Schema

The chat history is stored using the following tables:

### 1. sd_chat_sessions
Stores information about each chat conversation.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key, auto-generated |
| title | TEXT | Title of the chat session |
| created_at | TIMESTAMP | When the session was created |
| updated_at | TIMESTAMP | When the session was last updated |
| user_id | UUID | Foreign key to auth.users |
| agent_id | TEXT | Type of agent used for this chat |
| deep_search_enabled | BOOLEAN | Whether deep search was enabled |
| metadata | JSONB | Additional session metadata |

### 2. sd_chat_histories
Stores individual messages in each chat session.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key, auto-generated |
| session_id | UUID | Foreign key to sd_chat_sessions |
| role | TEXT | Message role (user, assistant, system, tool) |
| content | TEXT | Message content |
| created_at | TIMESTAMP | When the message was created |
| user_id | UUID | Foreign key to auth.users |
| tools_used | JSONB | Tools used to generate the response |
| metadata | JSONB | Additional message metadata |
| vote | TEXT | User vote on the message (up, down, or null) |

## API Endpoints

The following API endpoints are used to interact with chat history:

### Chat History Management

- **GET /api/history**
  - Retrieves all chat sessions for the current user
  - Returns an array of Chat objects with basic session info

- **DELETE /api/history?id={chatId}**
  - Deletes a chat session and all its messages
  - Requires the user to own the chat session

### Individual Chat Sessions

- **GET /api/chat/{id}**
  - Retrieves a specific chat session with all its messages
  - Verifies the user has access to this session

- **PATCH /api/chat/{id}**
  - Updates chat session details (e.g., title)
  - Requires the user to own the chat session

- **POST /api/chat/{id}**
  - Saves an assistant message after streaming completes
  - Used internally by the Chat component

### Message Voting

- **POST /api/vote**
  - Updates the vote on a specific message
  - Accepts `messageId` and `vote` parameters
  - Ensures the user has access to the message's chat session

## Implementation Details

### Client-Side Components

The following components interact with the chat history system:

1. **SidebarHistory**
   - Displays a list of the user's chat sessions
   - Allows deleting chat sessions
   - Groups chats by time period (today, yesterday, etc.)

2. **Chat**
   - Manages the current chat session
   - Stores user and assistant messages in Supabase
   - Updates the chat session's updated_at timestamp

3. **MessageActions**
   - Provides voting functionality on assistant messages
   - Updates votes in Supabase

### Server-Side Implementation

1. **Session Creation**
   - When a user sends a message in a new conversation, a session is created in Supabase
   - UUIDs are generated client-side and passed to Supabase for consistency

2. **Message Storage**
   - User messages are stored when sent
   - Assistant messages are stored after streaming completes

3. **Deletion Behavior**
   - Deleting a chat session cascades to delete all messages
   - This is enforced through foreign key constraints

## User Experience Flow

1. **Starting a New Chat**
   - User navigates to /chat (or clicks "New Chat")
   - A new UUID is generated for the chat session
   - First message creates a session record in Supabase

2. **Viewing Chat History**
   - User's chat history is displayed in the sidebar
   - Chats are grouped by time periods for easy navigation
   - Each chat shows its title (or first message preview)

3. **Continuing a Conversation**
   - User clicks on a chat in the sidebar
   - Messages are fetched from Supabase
   - New messages are appended to the existing session

4. **Deleting a Chat**
   - User clicks delete icon on a chat in the sidebar
   - Confirmation dialog is shown
   - Upon confirmation, the chat and all messages are deleted from Supabase

## Security

- **Row-Level Security** ensures users can only access their own chats
- All APIs verify the user has proper access to the requested resources
- No chat sessions or messages can be accessed by other users

## Usage

To interact with chat history in components:

```typescript
// Fetch chat sessions
const { data: history } = useSWR<Array<Chat>>('/api/history', fetcher);

// Fetch messages for a specific chat
const { data: chatData } = useSWR<ChatWithMessages>(`/api/chat/${id}`, fetcher);

// Delete a chat
const deleteChat = async (chatId: string) => {
  await fetch(`/api/history?id=${chatId}`, { method: 'DELETE' });
};

// Update a message vote
const updateVote = async (messageId: string, vote: 'up' | 'down' | null) => {
  await fetch('/api/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId, vote }),
  });
};
```

## Limitations and Future Improvements

- **Chat Sharing**: Currently, chats are private to each user. A future improvement could add sharing functionality.
- **Search Functionality**: Text search across chat history could be implemented using Supabase's full-text search.
- **Pagination**: For users with many chats, pagination should be implemented to improve performance.
- **Bulk Operations**: Adding bulk delete and export functionality would be useful for managing large numbers of chats.

## Environment Variables

The system relies on the same Supabase environment variables used for authentication:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```