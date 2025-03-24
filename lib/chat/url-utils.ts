// Enhanced URL detection regex pattern - more comprehensive to catch various URL formats
// This pattern is more precise to avoid false positives like 'e.g.' or 'i.e.'
const URL_REGEX = /(?:https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*))|(?:www\.[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*))/gi;

// Common abbreviations and terms that might be falsely detected as URLs
const COMMON_FALSE_POSITIVES = [
  'e.g.', 'i.e.', 'etc.', 'vs.', 'a.m.', 'p.m.', 
  'fig.', 'ca.', 'et al.', 'n.b.', 'p.s.'
];

// Import logger
import { edgeLogger } from '@/lib/logger/edge-logger';

// Test if a string looks like a domain name (without protocol)
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

// Ensures URL has a protocol
export function ensureProtocol(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
}

// Extracts URLs from text with improved detection
export function extractUrls(text: string): string[] {
  // First try the regex pattern
  const matches = text.match(URL_REGEX) || [];
  const result: string[] = [...matches];
  
  // Then check for potential domain-like words that might have been missed
  if (matches.length === 0) {
    const words = text.split(/\s+/);
    for (const word of words) {
      // Clean up the word (remove punctuation at the end)
      const cleanWord = word.replace(/[.,;:!?]$/, '');
      
      // Skip if it's too short to be a valid domain
      if (cleanWord.length < 5) continue;
      
      // Skip common abbreviations and false positives
      if (COMMON_FALSE_POSITIVES.some(fp => cleanWord.toLowerCase().includes(fp))) {
        continue;
      }
      
      if (isDomainLike(cleanWord)) {
        result.push(cleanWord);
      }
    }
  }
  
  // Log URL detection results
  if (result.length > 0) {
    edgeLogger.info('URLs detected in text', {
      urlCount: result.length,
      urls: result.map(url => ensureProtocol(url)),
      detection: 'automatic',
      actionRequired: 'AI tool call needed to process'
    });
  }
  
  return Array.from(new Set(result)); // Remove duplicates
} 