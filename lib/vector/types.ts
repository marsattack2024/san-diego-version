/**
 * Represents a document retrieved from vector search
 */
export interface RetrievedDocument {
  id: string;
  content: string;
  metadata: {
    title?: string;
    url?: string;
    source?: string;
    [key: string]: any;
  };
  score?: number;
  similarity?: number;
} 