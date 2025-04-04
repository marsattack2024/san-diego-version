import type { Chat } from '@/lib/db/schema';

// Define a base type constraint for items that can be grouped by date
interface DateGroupable {
    createdAt: string;
    updatedAt?: string | null; // Allow null or undefined for updatedAt
}

// Make GroupedChats generic
export type GroupedChats<T extends DateGroupable> = {
    today: T[];
    yesterday: T[];
    pastWeek: T[];
    older: T[];
};

/**
 * Groups an array of objects by date relative to today.
 * Categories: Today, Yesterday, Past Week, Older.
 * 
 * @param items Array of objects conforming to DateGroupable (must have createdAt or updatedAt).
 * @returns An object with items grouped into arrays by date category.
 */
// Make groupChatsByDate generic
export const groupChatsByDate = <T extends DateGroupable>(items: T[]): GroupedChats<T> => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const lastWeekDate = new Date(today);
    lastWeekDate.setDate(lastWeekDate.getDate() - 7);

    // Use reduce for potentially better performance on very large arrays
    return items.reduce<GroupedChats<T>>(
        (acc, item) => {
            // Use updatedAt first, fallback to createdAt
            // Ensure we handle potential null/undefined updatedAt
            const referenceDateString = item.updatedAt || item.createdAt;
            if (!referenceDateString) {
                // Skip items without a valid date - or place in 'older'? Logging might be useful.
                console.warn('Item skipped in groupChatsByDate due to missing date:', item);
                return acc;
            }
            const itemDate = new Date(referenceDateString);
            const itemDay = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());

            if (itemDay >= today) {
                acc.today.push(item);
            } else if (itemDay.getTime() === yesterday.getTime()) {
                acc.yesterday.push(item);
            } else if (itemDay >= lastWeekDate) {
                acc.pastWeek.push(item);
            } else {
                acc.older.push(item);
            }
            return acc;
        },
        { today: [], yesterday: [], pastWeek: [], older: [] } // Initial value for the accumulator
    );
}; 