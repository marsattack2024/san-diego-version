import { NextRequest, NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { createServerClient } from '@/lib/supabase/server';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// API route to fetch chat messages and handle chat-specific operations
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Extract ID from params
    const { id } = await Promise.resolve(params);
    
    edgeLogger.info('GET chat by ID request', { chatId: id });
    
    // Create Supabase client for auth
    const cookieStore = await cookies();
    const supabase = createSupabaseServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // This can be ignored if you have middleware refreshing users
            }
          },
        },
      }
    );
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      edgeLogger.warn('User not authenticated when fetching chat messages');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Create Supabase client for database operations
    const serverClient = await createServerClient();
    
    // Fetch the chat session first to ensure user has access
    const { data: chatSession, error: sessionError } = await serverClient
      .from('sd_chat_sessions')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (sessionError) {
      edgeLogger.error('Database error when fetching chat session', { 
        error: sessionError, 
        chatId: id,
        userId: user.id 
      });
      return NextResponse.json(
        { error: 'Database error when fetching chat' },
        { status: 500 }
      );
    }
    
    if (!chatSession) {
      edgeLogger.warn('Chat session not found or user not authorized', { 
        chatId: id,
        userId: user.id 
      });
      
      // Let's create a new chat session for this ID if it doesn't exist yet
      try {
        const { data: newChat, error: createError } = await serverClient
          .from('sd_chat_sessions')
          .insert({
            id,
            user_id: user.id,
            title: 'New Chat',
            agent_id: 'default',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();
          
        if (createError) {
          edgeLogger.error('Failed to create new chat session', { 
            error: createError, 
            chatId: id 
          });
          return NextResponse.json(
            { error: 'Failed to create chat session' },
            { status: 500 }
          );
        }
        
        edgeLogger.info('Created new chat session on the fly', { 
          chatId: id,
          userId: user.id
        });
        
        // Return empty chat session
        return NextResponse.json({
          id: id,
          title: 'New Chat',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          userId: user.id,
          agentId: 'default',
          deepSearchEnabled: false,
          messages: []
        });
      } catch (createError) {
        edgeLogger.error('Error creating new chat session', { error: createError });
        return NextResponse.json(
          { error: 'Chat not found or access denied' },
          { status: 404 }
        );
      }
    }
    
    // Fetch chat messages
    const { data: messages, error: messagesError } = await serverClient
      .from('sd_chat_histories')
      .select('*')
      .eq('session_id', id)
      .order('created_at', { ascending: true });
    
    if (messagesError) {
      edgeLogger.error('Failed to fetch chat messages', { 
        error: messagesError, 
        chatId: id 
      });
      return NextResponse.json(
        { error: 'Failed to fetch chat messages' },
        { status: 500 }
      );
    }
    
    // Return chat session with messages
    return NextResponse.json({
      id: chatSession.id,
      title: chatSession.title,
      createdAt: chatSession.created_at,
      updatedAt: chatSession.updated_at,
      userId: chatSession.user_id,
      agentId: chatSession.agent_id,
      deepSearchEnabled: chatSession.deep_search_enabled,
      messages: messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.created_at,
        vote: msg.vote,
        toolsUsed: msg.tools_used
      }))
    });
  } catch (error) {
    edgeLogger.error('Error in chat/[id] route', { error });
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

// Update chat details (title, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Extract ID from params
    const { id } = await Promise.resolve(params);
    const body = await request.json();
    const { title } = body;
    
    // Create Supabase client for auth
    const cookieStore = await cookies();
    const supabase = createSupabaseServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // This can be ignored if you have middleware refreshing users
            }
          },
        },
      }
    );
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Create Supabase client for database operations
    const serverClient = await createServerClient();
    
    // Update the chat session
    const { error } = await serverClient
      .from('sd_chat_sessions')
      .update({ title })
      .eq('id', id)
      .eq('user_id', user.id);
    
    if (error) {
      edgeLogger.error('Failed to update chat title', { error, chatId: id });
      return NextResponse.json(
        { error: 'Failed to update chat' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    edgeLogger.error('Error updating chat title', { error });
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

// Save assistant message (called from frontend after streaming completes)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Extract ID from params 
    const { id } = await Promise.resolve(params);
    const body = await request.json();
    const { message, toolsUsed } = body;
    
    if (!message || !message.content || !message.role) {
      return NextResponse.json(
        { error: 'Invalid message format' },
        { status: 400 }
      );
    }
    
    // Create Supabase client for auth
    const cookieStore = await cookies();
    const supabase = createSupabaseServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // This can be ignored if you have middleware refreshing users
            }
          },
        },
      }
    );
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Create Supabase client for database operations
    const serverClient = await createServerClient();
    
    // Store the assistant message
    const { error } = await serverClient
      .from('sd_chat_histories')
      .insert({
        session_id: id,
        role: message.role,
        content: message.content,
        user_id: user.id,
        tools_used: toolsUsed || null
      });
    
    if (error) {
      edgeLogger.error('Failed to save assistant message', { error, chatId: id });
      return NextResponse.json(
        { error: 'Failed to save message' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    edgeLogger.error('Error saving assistant message', { error });
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}