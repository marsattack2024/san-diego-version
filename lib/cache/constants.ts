/**
 * Redis Cache Constants
 * 
 * This file centralizes all constants related to Redis caching, such as
 * TTL values and namespace prefixes, to ensure consistency across the application.
 */

/**
 * TTL values for different cache types (in seconds)
 */
export const CACHE_TTL = {
  RAG_RESULTS: 12 * 60 * 60,     // 12 hours for RAG results
  SCRAPER: 12 * 60 * 60,         // 12 hours for web scraper content
  EMBEDDINGS: 7 * 24 * 60 * 60,  // 7 days for embeddings
  CONTEXT: 24 * 60 * 60,         // 1 day for context
  DEEP_SEARCH: 1 * 60 * 60,      // 1 hour for deep search results
  SHORT: 1 * 60 * 60,            // 1 hour for short-lived cache items
};

/**
 * Cache namespaces for different data types
 */
export const CACHE_NAMESPACES = {
  DEFAULT: 'app',               // Default namespace
  RAG: 'rag',                   // RAG results
  SCRAPER: 'scrape',            // Web scraper content
  EMBEDDINGS: 'embedding',      // Embeddings
  CONTEXT: 'context',           // Context
  DEEP_SEARCH: 'deepsearch',    // Deep search results
}; 