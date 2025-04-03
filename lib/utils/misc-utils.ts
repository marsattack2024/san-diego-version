/**
 * Masks a user ID for logging purposes.
 * @param userId - The original user ID.
 * @returns The masked user ID or 'anonymous' if no ID is provided.
 */
export const maskUserId = (userId: string): string => {
    return userId ? userId.substring(0, 5) + '...' + userId.substring(userId.length - 4) : 'anonymous';
};

/**
 * Generates a short, random operation ID with a prefix.
 * @param prefix - The prefix for the operation ID.
 * @returns A prefixed random string.
 */
export const generateOperationId = (prefix: string): string => {
    return `${prefix}-${Math.random().toString(36).substring(2, 8)}`;
};

/**
 * Miscellaneous utility functions
 */

/**
 * Creates a promise that resolves after a specified number of milliseconds.
 * @param ms - The number of milliseconds to wait.
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper to safely convert various representations of boolean values
 * Handles true/false, "true"/"false", 1/0, "1"/"0" and similar variations
 * @param value - The value to parse.
 * @returns boolean - The parsed boolean value, defaulting to false.
 */
export function parseBooleanValue(value: any): boolean {
    // Handle direct boolean values
    if (typeof value === 'boolean') {
        return value;
    }

    // Handle string representations ("true", "false", "1", "0")
    if (typeof value === 'string') {
        const lowercaseValue = value.toLowerCase().trim();
        return lowercaseValue === 'true' || lowercaseValue === '1' || lowercaseValue === 'yes';
    }

    // Handle numeric values (1, 0)
    if (typeof value === 'number') {
        return value === 1;
    }

    // Default to false for null, undefined, or any other type
    return false;
} 