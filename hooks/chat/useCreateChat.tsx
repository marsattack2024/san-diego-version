import { useCallback } from 'react';
import { useRouter } from 'next/navigation'; // Use next/navigation for App Router
import { useChatStore } from '@/stores/chat-store';
import { toast } from 'sonner';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

export function useCreateChat() {
    const router = useRouter();
    // Get the createConversation action from the store
    // Note: The store action itself handles optimistic updates and backend calls
    const createConversationAction = useChatStore((state) => state.createConversation);

    const createNewChat = useCallback(() => {
        edgeLogger.info('[useCreateChat] Attempting to create new chat', {
            category: LOG_CATEGORIES.CHAT,
        });
        try {
            // Call the store action - it returns the new chat ID
            const newChatId = createConversationAction();

            if (newChatId) {
                edgeLogger.info(`[useCreateChat] New chat created optimistically (ID: ${newChatId}), navigating...`, {
                    category: LOG_CATEGORIES.CHAT,
                    chatId: newChatId,
                });
                // Navigate to the new chat page using Next.js router
                router.push(`/chat/${newChatId}`);
            } else {
                // This case should ideally not happen if createConversation always returns an ID
                edgeLogger.error('[useCreateChat] createConversationAction did not return a chat ID', {
                    category: LOG_CATEGORIES.CHAT,
                    important: true
                });
                toast.error('Failed to start new chat session.');
            }
        } catch (error: unknown) {
            // Catch potential synchronous errors in the store action itself (though less likely)
            edgeLogger.error('[useCreateChat] Error calling createConversation action', {
                category: LOG_CATEGORIES.CHAT,
                error: error instanceof Error ? error.message : String(error),
                important: true,
            });
            toast.error('Failed to create new chat');
        }
    }, [createConversationAction, router]);

    return { createNewChat };
} 