import type { Chat } from '@/lib/db/schema';

// Consistent type definition for grouped chats
export type GroupedChats = {
    today: Chat[];
    yesterday: Chat[];
    pastWeek: Chat[];
    older: Chat[];
};

/**
 * Groups an array of chat objects by date relative to today.
 * Categories: Today, Yesterday, Past Week, Older.
 * 
 * @param chats Array of Chat objects (must have createdAt or updatedAt).
 * @returns An object with chats grouped into arrays by date category.
 */
export const groupChatsByDate = (chats: Array<Chat>): GroupedChats => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const lastWeekDate = new Date(today);
    lastWeekDate.setDate(lastWeekDate.getDate() - 7);

    // Use reduce for potentially better performance on very large arrays
    return chats.reduce<GroupedChats>(
        (acc, chat) => {
            // Use updatedAt first, fallback to createdAt
            const chatDate = new Date(chat.updatedAt || chat.createdAt);
            const chatDay = new Date(chatDate.getFullYear(), chatDate.getMonth(), chatDate.getDate());

            if (chatDay >= today) {
                acc.today.push(chat);
            } else if (chatDay.getTime() === yesterday.getTime()) {
                acc.yesterday.push(chat);
            } else if (chatDay >= lastWeekDate) {
                acc.pastWeek.push(chat);
            } else {
                acc.older.push(chat);
            }
            return acc;
        },
        { today: [], yesterday: [], pastWeek: [], older: [] } // Initial value for the accumulator
    );
}; 