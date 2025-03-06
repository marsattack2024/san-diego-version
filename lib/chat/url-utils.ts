// Enhanced URL detection regex pattern - more comprehensive to catch various URL formats
const URL_REGEX = /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

// Test if a string looks like a domain name (without protocol)
export function isDomainLike(text: string): boolean {
  // Match strings that look like domains (e.g., example.com, sub.domain.co.uk)
  return /^[a-zA-Z0-9][-a-zA-Z0-9]*(\.[a-zA-Z0-9][-a-zA-Z0-9]*)+$/.test(text);
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
      if (isDomainLike(cleanWord)) {
        result.push(cleanWord);
      }
    }
  }
  
  return Array.from(new Set(result)); // Remove duplicates
} 