/**
 * UUID generation utility that works in both browser and Edge Runtime
 * Provides a consistent interface for generating UUIDs without relying on Node.js crypto module
 */

/**
 * Generate a RFC4122 version 4 compliant UUID
 * @returns A UUID string
 */
export function generateUUID(): string {
    // Use crypto.randomUUID() if available (modern browsers and Edge Runtime)
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    // Fallback implementation using Web Crypto API
    const getRandomValues = (array: Uint8Array): Uint8Array => {
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            return crypto.getRandomValues(array);
        }
        // Extremely unlikely fallback - only for environments without Web Crypto API
        for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256);
        }
        return array;
    };

    // RFC4122 version 4 compliant UUID generation
    const byteArray = new Uint8Array(16);
    getRandomValues(byteArray);

    // Set version bits
    byteArray[6] = (byteArray[6] & 0x0f) | 0x40; // Version 4
    byteArray[8] = (byteArray[8] & 0x3f) | 0x80; // Variant

    // Convert to hex string
    const hexValues = Array.from(byteArray).map(b => b.toString(16).padStart(2, '0'));
    return [
        hexValues.slice(0, 4).join(''),
        hexValues.slice(4, 6).join(''),
        hexValues.slice(6, 8).join(''),
        hexValues.slice(8, 10).join(''),
        hexValues.slice(10).join('')
    ].join('-');
}

/**
 * Generate a UUID and return a shortened version
 * @param length Length of the shortened UUID (default: 8)
 * @returns A shortened UUID string
 */
export function generateShortId(length: number = 8): string {
    const uuid = generateUUID();
    return uuid.replace(/-/g, '').substring(0, length);
}

/**
 * Default export for easier imports
 */
export default {
    generateUUID,
    generateShortId
}; 