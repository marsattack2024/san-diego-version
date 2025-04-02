/**
 * Logging categories for structured logging
 */
export const LOG_CATEGORIES = {
  SYSTEM: 'system',
  CACHE: 'cache',
  API: 'api',
  AUTH: 'auth',
  DB: 'db',
  SEARCH: 'search',
  RAG: 'rag',
  LLM: 'llm',
  CHAT: 'chat',
  TOOLS: 'tools',
  VECTOR: 'vector',
  WEBSCRAPER: 'webscraper',
  DEEPSEARCH: 'deepsearch'
} as const;

/**
 * Log levels with their numeric priorities
 */
export const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
} as const;

/**
 * Operation types for tracking
 */
export const OPERATION_TYPES = {
  RAG_SEARCH: 'rag_search',
  WEB_SCRAPE: 'web_scrape',
  DEEP_SEARCH: 'deep_search',
  CACHE_ACCESS: 'cache_access',
  VECTOR_SEARCH: 'vector_search',
  AI_REQUEST: 'ai_request'
} as const;

export type LogCategory = typeof LOG_CATEGORIES[keyof typeof LOG_CATEGORIES];
export type LogLevel = typeof LOG_LEVELS[keyof typeof LOG_LEVELS];
export type OperationType = typeof OPERATION_TYPES[keyof typeof OPERATION_TYPES];

export interface LogMetadata {
  category?: LogCategory;
  important?: boolean;
  error?: string | Error;
  [key: string]: any;
}