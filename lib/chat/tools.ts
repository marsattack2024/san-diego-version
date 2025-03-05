import { tool } from 'ai';
import { z } from 'zod';
import { findSimilarDocumentsOptimized } from '../vector/documentRetrieval';
import { createResource } from '../actions/resources';
import { edgeLogger } from '../logger/edge-logger';

export const chatTools = {
  getInformation: tool({
    description: 'Search the knowledge base before answering any question',
    parameters: z.object({
      query: z.string().describe('the question to search for')
    }),
    execute: async ({ query }) => {
      try {
        const { documents, metrics } = await findSimilarDocumentsOptimized(query, {
          limit: 4,
          similarityThreshold: 0.5
        });
        
        if (!documents.length) {
          return { 
            found: false,
            message: 'No relevant information found',
            documents: [],
            metrics: {
              count: 0,
              averageSimilarity: 0,
              retrievalTimeMs: metrics.retrievalTimeMs
            }
          };
        }

        // Log the number of documents found but don't expose full content to UI
        edgeLogger.info('Knowledge base search results', { 
          documentCount: documents.length,
          averageSimilarity: metrics?.averageSimilarity || 0
        });

        return {
          found: true,
          documents: documents.map(doc => ({
            content: doc.content,
            similarity: doc.similarity
          })),
          metrics: {
            count: documents.length,
            averageSimilarity: metrics.averageSimilarity,
            retrievalTimeMs: metrics.retrievalTimeMs
          }
        };
      } catch (error) {
        edgeLogger.error('Failed to search knowledge base', { error });
        throw new Error('Failed to search knowledge base');
      }
    }
  }),

  addResource: tool({
    description: 'Store new information in the knowledge base',
    parameters: z.object({
      content: z.string().describe('the information to store')
    }),
    execute: async ({ content }) => {
      try {
        await createResource({ content });
        return { 
          success: true,
          message: 'Information stored successfully'
        };
      } catch (error) {
        edgeLogger.error('Failed to store information', { error });
        throw new Error('Failed to store information');
      }
    }
  })
}; 