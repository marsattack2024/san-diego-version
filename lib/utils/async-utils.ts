/**
 * Creates a timeout handler that rejects a promise after a specified duration.
 * @param timeoutMs - The timeout duration in milliseconds (default: 30000).
 * @returns Object containing the timeout promise and an abort function.
 */
export function createTimeoutHandler(timeoutMs: number = 30000): { promise: Promise<void>; abort: () => void } {
    let timeoutId: ReturnType<typeof setTimeout>;
    let abortFunc: () => void;

    const promise = new Promise<void>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`Request timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        abortFunc = () => {
            clearTimeout(timeoutId);
        };
    });

    // The non-null assertion (!) is safe here because abortFunc is assigned within the Promise constructor before it's returned.
    return { promise, abort: abortFunc! };
} 