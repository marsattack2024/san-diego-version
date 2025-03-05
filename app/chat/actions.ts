'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

export async function deleteTrailingMessages(
  chatId: string,
  messageId: string
): Promise<void> {
  try {
    // For MVP, we're not implementing actual deletion
    // This would typically connect to a database to delete messages
    
    // Revalidate the chat path to refresh the UI
    revalidatePath(`/chat/${chatId}`);
  } catch (error) {
    console.error('Error deleting trailing messages:', error);
    throw new Error('Failed to delete trailing messages');
  }
}

export async function saveAgentAsCookie(agentId: string): Promise<{ success: boolean }> {
  try {
    const cookieStore = await cookies();
    cookieStore.set({
      name: 'selectedAgent',
      value: agentId,
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      httpOnly: true,
      sameSite: 'strict',
    });
    return { success: true };
  } catch (error) {
    console.error('Failed to save agent cookie:', error);
    throw new Error('Failed to save agent cookie');
  }
} 