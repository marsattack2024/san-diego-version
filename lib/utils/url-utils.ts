/**
 * URL Utilities
 * 
 * Centralized utilities for URL handling, validation, and extraction.
 * These utilities are used throughout the application for consistent URL processing.
 */

import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Enhanced URL detection regex pattern - more comprehensive to catch various URL formats
// This pattern is more precise to avoid false positives like 'e.g.' or 'i.e.'
// Updated to better catch naked domains
const URL_REGEX = /(?:https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*))|(?:(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})/gi;

// Common abbreviations and terms that might be falsely detected as URLs
const COMMON_FALSE_POSITIVES = [
    'e.g.', 'i.e.', 'etc.', 'vs.', 'a.m.', 'p.m.',
    'fig.', 'ca.', 'et al.', 'n.b.', 'p.s.'
];

// List of domains that should be banned from scraping
export const BANNED_DOMAINS = ['localhost', '127.0.0.1', 'internal', '.local'];

/**
 * Tests if a string looks like a domain name (without protocol)
 * @param text Text to check
 * @returns Boolean indicating if text looks like a domain
 */
export function isDomainLike(text: string): boolean {
    // Skip common abbreviations that might look like domains
    if (COMMON_FALSE_POSITIVES.includes(text.toLowerCase())) {
        return false;
    }

    // More strict domain validation - requires valid TLD
    // Match strings that look like domains (e.g., example.com, sub.domain.co.uk)
    return /^[a-zA-Z0-9][-a-zA-Z0-9]*(\.[a-zA-Z0-9][-a-zA-Z0-9]*)+$/.test(text) &&
        // Check if the TLD is at least 2 characters
        text.split('.').pop()!.length >= 2;
}

/**
 * Ensures a URL has a protocol (adds https:// if missing)
 * @param url URL to process
 * @returns URL with protocol
 */
export function ensureProtocol(url: string): string {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return `https://${url}`;
    }
    return url;
}

/**
 * Validates and sanitizes a URL to ensure it's safe and well-formed
 * @param url URL to validate
 * @param options Optional validation options
 * @returns Sanitized URL or null if invalid
 */
export function validateAndSanitizeUrl(
    url: string,
    options: {
        logErrors?: boolean,
        additionalBannedDomains?: string[]
    } = {}
): string | null {
    const { logErrors = true, additionalBannedDomains = [] } = options;

    try {
        // Check if URL is already well-formed
        const normalizedUrl = url.trim();

        // Add protocol if missing
        const processedUrl = ensureProtocol(normalizedUrl);

        // Test URL validity with URL constructor
        const urlObj = new URL(processedUrl);
        const sanitizedUrl = urlObj.toString();

        // Ban list check - combine default banned domains with any additional ones
        const bannedDomainsToCheck = [...BANNED_DOMAINS, ...additionalBannedDomains];
        const isBanned = bannedDomainsToCheck.some(domain => urlObj.hostname.includes(domain));

        if (isBanned) {
            if (logErrors) {
                edgeLogger.error('URL validation - banned domain detected', {
                    category: LOG_CATEGORIES.TOOLS,
                    operation: 'url_validation_failed',
                    reason: 'banned_domain',
                    url: sanitizedUrl
                });
            }
            return null;
        }

        return sanitizedUrl;
    } catch (error) {
        if (logErrors) {
            edgeLogger.error('URL validation failed', {
                category: LOG_CATEGORIES.TOOLS,
                operation: 'url_validation_failed',
                url,
                error: error instanceof Error ? error.message : String(error)
            });
        }
        return null;
    }
}

/**
 * Extracts URLs from text with improved detection
 * @param text Text to extract URLs from
 * @param options Optional extraction options
 * @returns Array of extracted URLs
 */
export function extractUrls(
    text: string,
    options: {
        shouldEnsureProtocol?: boolean,
        shouldValidate?: boolean,
        shouldLog?: boolean
    } = {}
): string[] {
    const {
        shouldEnsureProtocol = true,
        shouldValidate = false,
        shouldLog = true
    } = options;

    // First try the regex pattern
    const matches = text.match(URL_REGEX) || [];
    const result: string[] = [...matches];

    // Then check for potential domain-like words that might have been missed
    if (matches.length === 0) {
        const words = text.split(/\s+/);
        for (const word of words) {
            // Clean up the word (remove punctuation at the start/end)
            const cleanWord = word.replace(/^[.,;:!?]+|[.,;:!?]+$/g, '');

            // Skip if it's too short to be a valid domain
            if (cleanWord.length < 4) continue;
            
            // Check if it contains a dot with valid characters on both sides
            if (cleanWord.includes('.') && /^[a-z0-9].*\.[a-z0-9].*$/i.test(cleanWord)) {
                // Skip common abbreviations and false positives
                if (COMMON_FALSE_POSITIVES.some(fp => 
                    cleanWord.toLowerCase() === fp.toLowerCase()
                )) {
                    continue;
                }
                
                // More aggressive check for domain-like strings
                // If it has a dot and ends with a valid TLD, treat it as a URL
                const parts = cleanWord.split('.');
                const potentialTld = parts[parts.length - 1].toLowerCase();
                
                const commonTlds = ['com', 'org', 'net', 'edu', 'gov', 'io', 'ai', 'co', 'me', 
                                   'app', 'dev', 'tech', 'site', 'web', 'blog', 'info'];
                
                if (parts.length >= 2 && (
                    commonTlds.includes(potentialTld) || 
                    potentialTld.length >= 2 && potentialTld.length <= 4
                )) {
                    result.push(cleanWord);
                    
                    // Log potential URL detection
                    edgeLogger.info('Potential URL detected with enhanced detection', {
                        category: LOG_CATEGORIES.TOOLS,
                        operation: 'url_extraction_enhanced',
                        detectedUrl: cleanWord,
                        from: 'word_analysis'
                    });
                }
            }
        }
    }

    // Process the extracted URLs
    const processedUrls = result
        .map(url => shouldEnsureProtocol ? ensureProtocol(url) : url)
        .filter((url, index, self) => self.indexOf(url) === index) // Remove duplicates
        .filter(url => !shouldValidate || validateAndSanitizeUrl(url, { logErrors: false }) !== null);

    // Log URL detection results if enabled
    if (shouldLog && processedUrls.length > 0) {
        edgeLogger.info('URLs detected in text', {
            category: LOG_CATEGORIES.TOOLS,
            operation: 'url_extraction',
            urlCount: processedUrls.length,
            urls: processedUrls,
            detection: 'automatic'
        });
    }

    return processedUrls;
} 