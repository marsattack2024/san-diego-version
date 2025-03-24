import { tool } from 'ai';
import { z } from 'zod';
import { findSimilarDocumentsOptimized } from '../vector/documentRetrieval';
import { createResource } from '../actions/resources';
import { edgeLogger } from '../logger/edge-logger';
import type { RetrievedDocument } from '../vector/types';
import { callPerplexityAPI } from '../agents/tools/perplexity/api';
import { webScraperTool, detectAndScrapeUrlsTool } from '../agents/tools/web-scraper-tool';

// Define interfaces for scraped content
interface ScrapedContent {
  title: string;
  description: string;
  content: string;
  url: string;
}

// Stats interface for scraper metrics
interface ScraperStats {
  headers: number;
  paragraphs: number;
  lists: number;
  other: number;
  characterCount?: number;
  wordCount?: number;
}

// Define the tools object
export const chatTools = {
  getInformation: tool({
    description: 'Search the internal knowledge base for relevant information',
    parameters: z.object({
      query: z.string().describe('the question to search for')
    }),
    execute: async ({ query }): Promise<string> => {
      try {
        const { documents, metrics } = await findSimilarDocumentsOptimized(query, {
          limit: 5, // Changed back to 5 from 10
          similarityThreshold: 0.65
        });
        
        if (!documents || documents.length === 0) {
          return "No relevant information found in the knowledge base.";
        }

        // Only use the top 3 most relevant documents for the agent
        const topDocuments = documents.slice(0, 3);
        
        // Format the results with more detail including IDs and similarity scores
        const formattedResults = topDocuments.map((doc, index) => {
          // Use doc.score instead of doc.similarity since we're using the lib/vector/types version
          const similarityPercent = Math.round((doc.score || 0) * 100);
          // Safely handle ID - ensure it's a string
          const idString = typeof doc.id === 'string' ? doc.id : String(doc.id);
          const idPreview = idString.length > 8 ? idString.substring(0, 8) : idString;
          
          // Format content with proper line breaks
          const content = typeof doc.content === 'string' ? doc.content : String(doc.content);
          // Replace any existing line breaks with proper formatting
          const formattedContent = content
            .split(/\r?\n/)
            .filter(line => line.trim() !== '')
            .map(line => `    ${line.trim()}`)
            .join('\n');
          
          return `Document #${index + 1} [ID: ${idPreview}] (${similarityPercent}% relevant):\n${formattedContent}\n`;
        }).join('\n-------------------------------------------\n\n');

        // Add aggregate metrics
        const avgSimilarity = Math.round(
          topDocuments.reduce((sum, doc) => sum + (doc.score || 0), 0) / topDocuments.length * 100
        );

        return `Found ${topDocuments.length} most relevant documents (out of ${documents.length} retrieved, average similarity of top 3: ${avgSimilarity}%):\n\n${formattedResults}`;
      } catch (error) {
        edgeLogger.error('Knowledge base search failed', {
          query,
          error: error instanceof Error ? error.message : String(error)
        });
        
        return `Knowledge base search failed: ${error instanceof Error ? error.message : String(error)}`;
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
        edgeLogger.error('Failed to store information', { 
          error: error instanceof Error ? error.message : String(error) 
        });
        throw new Error(`Failed to store information: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }),

  // Note: Deep Search is now exclusively a pre-processing step controlled by UI toggle
  // The deepSearch tool has been removed to prevent the AI from calling it directly

  // URL detection tool - now uses the puppeteer-based implementation
  detectAndScrapeUrls: detectAndScrapeUrlsTool,

  // Comprehensive web scraper tool - now uses the puppeteer-based implementation
  comprehensiveScraper: webScraperTool
};
