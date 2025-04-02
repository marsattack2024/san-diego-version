// Import core AI SDK types
import { Message } from 'ai';

/**
 * Chat Engine Context Interface
 * Contains all context for a specific chat request, including
 * request details, messages, extracted information, and metrics.
 */
export interface ChatEngineContext {
    // Request specific context
    requestId: string;       // Unique ID for this specific request/process cycle
    sessionId: string;       // Identifier for the overall chat session
    userId?: string;         // Identifier for the authenticated user
    startTime: number;       // Timestamp when the request processing started (Date.now())

    // Processing context
    messages: Message[];     // The current messages being processed (usually the latest user message)
    previousMessages?: Message[]; // Messages loaded from history for context

    // Extracted context
    urls?: string[];         // URLs extracted from the latest user message

    // Metrics and diagnostics (to be populated during processing)
    metrics: {
        ragTimeMs?: number;          // Time spent on RAG retrieval
        webScraperTimeMs?: number;   // Time spent on web scraping
        deepSearchTimeMs?: number;   // Time spent on deep search
        totalProcessingTimeMs?: number; // Total time from request start to response stream end
        tokenCount?: number;         // Tokens used in the LLM call
        cacheHits?: number;          // Number of cache hits (e.g., RAG cache)
    };

    // Session metadata (loaded or updated during processing)
    sessionMetadata?: {
        title?: string;          // The title of the chat session
    };
} 