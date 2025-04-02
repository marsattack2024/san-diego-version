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