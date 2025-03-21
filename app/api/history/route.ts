import { NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { createServerClient } from '@/lib/supabase/server';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Chat } from '@/lib/db/schema';

export async function GET() {
  try {
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
      edgeLogger.warn('User not authenticated when fetching history');
      return NextResponse.json([], { status: 401 });
    }
    
    // Create Supabase client for database operations
    const serverClient = await createServerClient();
    
    // Only log at debug level to reduce log noise in development
    edgeLogger.debug('Fetching chat history for user', { userId: user.id });
    
    // Fetch chat history for the current user
    const { data, error } = await serverClient
      .from('sd_chat_sessions')
      .select('id, title, created_at, updated_at, user_id, agent_id')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
      
    if (error) {
      edgeLogger.error('Failed to fetch chat history from Supabase', { error });
      return NextResponse.json(
        { error: 'Failed to fetch chat history' },
        { status: 500 }
      );
    }
    
    // Log only if there's new data or issues
    if (data?.length > 0) {
      edgeLogger.debug('Chat history fetch results', { 
        count: data.length,
        // Only log IDs in development, not in production
        chatIds: process.env.NODE_ENV === 'development' 
          ? data.map((chat: { id: string }) => chat.id).slice(0, 5) 
          : undefined
      });
    }
    
    // Map the Supabase data to the Chat interface
    const chats: Chat[] = data.map((chat: { 
      id: string; 
      title: string | null; 
      created_at: string; 
      updated_at: string;
      user_id: string;
    }) => ({
      id: chat.id,
      title: chat.title || 'New Chat',
      createdAt: chat.created_at,
      updatedAt: chat.updated_at,
      userId: chat.user_id,
      messages: [] // We'll fetch messages separately when needed
    }));
    
    // Add cache control headers for better client-side caching
    // Assuming history can be stale for 30 seconds
    const response = NextResponse.json(chats);
    response.headers.set('Cache-Control', 'private, max-age=30');
    
    return response;
  } catch (error) {
    edgeLogger.error('Failed to fetch chat history', { error });
    
    return NextResponse.json(
      { error: 'Failed to fetch chat history' },
      { status: 500 }
    );
  }
}

// Handle chat deletion
export async function DELETE(request: Request) {
  try {
    // Get the chat ID from the URL
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    
    if (!id) {
      edgeLogger.warn('No chat ID provided for deletion');
      return NextResponse.json(
        { error: 'Chat ID is required' },
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
      edgeLogger.warn('User not authenticated when deleting chat');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Create Supabase client for database operations
    const serverClient = await createServerClient();
    
    // Delete the chat session (this will cascade to chat_histories due to foreign key constraint)
    const { error } = await serverClient
      .from('sd_chat_sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id); // Ensure the user owns this chat
    
    if (error) {
      edgeLogger.error('Failed to delete chat from Supabase', { error, chatId: id });
      return NextResponse.json(
        { error: 'Failed to delete chat' },
        { status: 500 }
      );
    }
    
    edgeLogger.info('Successfully deleted chat', { chatId: id, userId: user.id });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    edgeLogger.error('Failed to delete chat', { error });
    
    return NextResponse.json(
      { error: 'Failed to delete chat' },
      { status: 500 }
    );
  }
}