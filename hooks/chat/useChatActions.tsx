import { useState, useCallback } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { toast } from 'sonner';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Type definition for the state managed by this hook
interface ChatActionsState {
    isDeleting: Record<string, boolean>;
    deleteId: string | null;
    showDeleteDialog: boolean;
    isRenaming: Record<string, boolean>;
    renameId: string | null;
    showRenameDialog: boolean;
    renameTitle: string;
}

export function useChatActions() {
    // Zustand store actions
    const deleteConversationAction = useChatStore((state) => state.deleteConversation);
    // Assuming renameConversation action exists and returns a Promise<boolean>
    const renameConversationAction = useChatStore((state) => state.updateConversationTitle);

    // Local state for dialogs and operations
    const [actionState, setActionState] = useState<ChatActionsState>({
        isDeleting: {},
        deleteId: null,
        showDeleteDialog: false,
        isRenaming: {},
        renameId: null,
        showRenameDialog: false,
        renameTitle: '',
    });

    // --- Delete Logic ---
    const handleDeleteClick = useCallback((chatId: string) => {
        edgeLogger.debug('[useChatActions] Delete button clicked', {
            category: LOG_CATEGORIES.CHAT,
            chatId,
        });
        setActionState(prev => ({ ...prev, deleteId: chatId, showDeleteDialog: true }));
    }, []);

    const handleDeleteCancel = useCallback(() => {
        setActionState(prev => ({ ...prev, deleteId: null, showDeleteDialog: false }));
    }, []);

    const handleDeleteConfirm = useCallback(async () => {
        if (!actionState.deleteId) return;
        const idToDelete = actionState.deleteId;

        setActionState(prev => ({ ...prev, isDeleting: { ...prev.isDeleting, [idToDelete]: true } }));
        const startTime = performance.now();

        try {
            // Call store action (which should handle backend call)
            await deleteConversationAction(idToDelete); // Assuming store action handles everything
            const durationMs = performance.now() - startTime;
            toast.success('Chat deleted successfully');
            edgeLogger.info('[useChatActions] Chat deleted successfully', {
                category: LOG_CATEGORIES.CHAT,
                chatId: idToDelete,
                durationMs: Math.round(durationMs),
            });
            // Reset state after success
            setActionState(prev => ({ ...prev, isDeleting: { ...prev.isDeleting, [idToDelete]: false }, deleteId: null, showDeleteDialog: false }));
        } catch (error: unknown) {
            const durationMs = performance.now() - startTime;
            edgeLogger.error('[useChatActions] Failed to delete chat', {
                category: LOG_CATEGORIES.CHAT,
                chatId: idToDelete,
                error: error instanceof Error ? error.message : String(error),
                durationMs: Math.round(durationMs),
                important: true,
            });
            toast.error('Failed to delete chat');
            // Reset loading state on error, keep dialog open?
            setActionState(prev => ({ ...prev, isDeleting: { ...prev.isDeleting, [idToDelete]: false } }));
            // Optionally close dialog on error: handleDeleteCancel();
        }
    }, [actionState.deleteId, deleteConversationAction]);

    // --- Rename Logic ---
    const handleRenameClick = useCallback((chatId: string, currentTitle: string) => {
        edgeLogger.debug('[useChatActions] Rename button clicked', {
            category: LOG_CATEGORIES.CHAT,
            chatId,
        });
        setActionState(prev => ({
            ...prev,
            renameId: chatId,
            renameTitle: currentTitle || '', // Ensure initial value
            showRenameDialog: true,
        }));
    }, []);

    const handleRenameCancel = useCallback(() => {
        setActionState(prev => ({
            ...prev,
            renameId: null,
            showRenameDialog: false,
            renameTitle: '',
        }));
    }, []);

    const handleRenameTitleChange = useCallback((newTitle: string) => {
        setActionState(prev => ({ ...prev, renameTitle: newTitle }));
    }, []);

    const handleRenameConfirm = useCallback(async () => {
        if (!actionState.renameId || !actionState.renameTitle.trim()) return;
        const idToRename = actionState.renameId;
        const newTitle = actionState.renameTitle.trim();

        setActionState(prev => ({ ...prev, isRenaming: { ...prev.isRenaming, [idToRename]: true } }));
        const startTime = performance.now();

        try {
            // Call store action
            const success = await renameConversationAction(idToRename, newTitle);
            const durationMs = performance.now() - startTime;

            if (success) {
                toast.success('Chat renamed successfully');
                edgeLogger.info('[useChatActions] Chat renamed successfully', {
                    category: LOG_CATEGORIES.CHAT,
                    chatId: idToRename,
                    durationMs: Math.round(durationMs),
                });
                // Reset state on success
                setActionState(prev => ({
                    ...prev,
                    isRenaming: { ...prev.isRenaming, [idToRename]: false },
                    renameId: null,
                    showRenameDialog: false,
                    renameTitle: '',
                }));
            } else {
                // Handle failure case where store action returns false (e.g., validation)
                throw new Error('Rename action returned false');
            }
        } catch (error: unknown) {
            const durationMs = performance.now() - startTime;
            edgeLogger.error('[useChatActions] Failed to rename chat', {
                category: LOG_CATEGORIES.CHAT,
                chatId: idToRename,
                newTitle: newTitle, // Be cautious logging user input
                error: error instanceof Error ? error.message : String(error),
                durationMs: Math.round(durationMs),
                important: true,
            });
            toast.error('Failed to rename chat');
            // Reset loading state on error, keep dialog open
            setActionState(prev => ({ ...prev, isRenaming: { ...prev.isRenaming, [idToRename]: false } }));
        }
    }, [actionState.renameId, actionState.renameTitle, renameConversationAction]);

    // --- Return Value ---
    return {
        // Delete state and handlers
        isDeleting: actionState.isDeleting,
        deleteId: actionState.deleteId,
        showDeleteDialog: actionState.showDeleteDialog,
        handleDeleteClick,
        handleDeleteConfirm,
        handleDeleteCancel,

        // Rename state and handlers
        isRenaming: actionState.isRenaming,
        renameId: actionState.renameId,
        showRenameDialog: actionState.showRenameDialog,
        renameTitle: actionState.renameTitle,
        handleRenameClick,
        handleRenameConfirm,
        handleRenameCancel,
        handleRenameTitleChange,
    };
} 