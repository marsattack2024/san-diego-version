import { echoTool, dateTimeTool } from '../core/agent-tools.js';
import { webScraperTool, urlDetectionTool } from './web-scraper-tool.js';
import { deepSearchTool, streamingDeepSearch } from './perplexity/index.js';
import { vectorSearchTool, extractRelevantContext, createContextEnhancedPrompt } from './vector-search-tool.js';

export {
  // Basic tools
  echoTool,
  dateTimeTool,
  
  // Web scraping tools
  webScraperTool,
  urlDetectionTool,
  
  // Web search tools
  deepSearchTool,
  streamingDeepSearch,
  
  // Vector search tools
  vectorSearchTool,
  extractRelevantContext,
  createContextEnhancedPrompt,
};

// Export utility functions from web-scraper-tool
// Note: Make sure extractUrls is exported from web-scraper-tool.ts
export { extractUrls } from './web-scraper-tool.js'; 