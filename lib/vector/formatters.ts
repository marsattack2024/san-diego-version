import { RetrievedDocument } from '@/types/vector/vector';

/**
 * Formats retrieved documents for LLM context
 * 
 * @param documents - Array of retrieved documents
 * @returns Formatted context string for LLM
 */
export function formatDocumentsForLLM(documents: RetrievedDocument[]): string {
  if (!documents || documents.length === 0) return '';
  
  let context = 'RELEVANT INFORMATION:\n\n';
  
  documents.forEach((doc, i) => {
    const similarityPercent = Math.round(doc.similarity * 100);
    context += `DOCUMENT ${i + 1} (${similarityPercent}% relevance):\n${doc.content}\n\n`;
    
    if (doc.metadata) {
      context += `METADATA: ${JSON.stringify(doc.metadata)}\n\n`;
    }
  });
  
  return context;
}

/**
 * Formats retrieved documents for display in the UI
 * 
 * @param documents - Array of retrieved documents
 * @returns Array of formatted documents for UI display
 */
export function formatDocumentsForDisplay(documents: RetrievedDocument[]): {
  id: string;
  title: string;
  content: string;
  similarity: number;
  metadata?: Record<string, any>;
}[] {
  if (!documents || documents.length === 0) return [];
  
  return documents.map(doc => ({
    id: doc.id,
    title: doc.metadata?.title || `Document ${doc.id.substring(0, 8)}`,
    content: doc.content.length > 300 ? 
      doc.content.substring(0, 300) + '...' : 
      doc.content,
    similarity: doc.similarity,
    metadata: doc.metadata
  }));
}

/**
 * Formats retrieved documents as markdown
 * 
 * @param documents - Array of retrieved documents
 * @returns Markdown formatted string
 */
export function formatDocumentsAsMarkdown(documents: RetrievedDocument[]): string {
  if (!documents || documents.length === 0) return '';
  
  let markdown = '## Retrieved Documents\n\n';
  
  documents.forEach((doc, i) => {
    const similarityPercent = Math.round(doc.similarity * 100);
    
    markdown += `### Document ${i + 1} (${similarityPercent}% relevance)\n\n`;
    markdown += `${doc.content}\n\n`;
    
    if (doc.metadata) {
      markdown += '**Metadata:**\n\n';
      markdown += '```json\n';
      markdown += JSON.stringify(doc.metadata, null, 2);
      markdown += '\n```\n\n';
    }
    
    if (i < documents.length - 1) {
      markdown += '---\n\n';
    }
  });
  
  return markdown;
}

/**
 * Creates a prompt with retrieved documents for RAG
 * 
 * @param query - User query
 * @param documents - Retrieved documents
 * @returns Formatted prompt for RAG
 */
export function createRAGPrompt(query: string, documents: RetrievedDocument[]): string {
  const context = formatDocumentsForLLM(documents);
  
  return `
You are a helpful assistant that answers questions based on the provided information.
If the information doesn't contain the answer, say "I don't have enough information to answer that question."
Do not make up or infer information that is not explicitly provided.

USER QUERY: ${query}

${context}

Based on the information provided above, please answer the user's query.
`.trim();
} 