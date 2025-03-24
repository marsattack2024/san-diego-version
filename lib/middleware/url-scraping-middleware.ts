import { Redis } from '@upstash/redis';
import {
  type LanguageModelV1Middleware,
  type LanguageModelV1CallOptions,
  type Message
} from 'ai';
import { extractUrls, ensureProtocol } from '@/lib/chat/url-utils';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { callPuppeteerScraper, validateAndSanitizeUrl } from '@/lib/agents/tools/web-scraper-tool';

// Initialize Redis client using environment variables
const redis = Redis.fromEnv();

// Cache configuration
const CACHE_CONFIG = {
  ttl: 60 * 60 * 6, // 6 hours TTL for scraped content
  maxKeySize: 1024, // 1KB max for cache keys
  maxUrls: 3, // Maximum number of URLs to scrape in one request
  timeout: 15000, // 15 seconds timeout for scraping
};

// Helper function to determine if an array is a valid array of messages
function isMessagesArray(arr: unknown): arr is Message[] {
  return Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null && 'role' in arr[0];
}

// Function to format scraped content in a structured way
function formatScrapedContent(content: ScrapedContent): string {
  const { title, description, content: mainContent, url } = content;
  
  return `
# SCRAPED CONTENT FROM URL: ${url}

## Title: ${title || 'Untitled Page'}

${description ? `## Description:\n${description}\n` : ''}

## Main Content:
${mainContent}

---
SOURCE: ${url}
`.trim();
}

// Type definition for scraped content
interface ScrapedContent {
  title: string;
  description: string;
  content: string;
  url: string;
  stats?: {
    headers: number;
    paragraphs: number;
    lists: number;
    other: number;
  };
}

// Add debug logging for puppeteer scraper calls
async function callScraperWithLogging(url: string): Promise<ScrapedContent> {
  edgeLogger.info('Calling puppeteer scraper function', {
    url,
    scraperFunction: 'callPuppeteerScraper',
    timestamp: new Date().toISOString()
  });
  
  try {
    const startTime = Date.now();
    const result = await callPuppeteerScraper(url);
    const duration = Date.now() - startTime;
    
    edgeLogger.info('Puppeteer scraper returned successfully', {
      url,
      duration,
      contentLength: result.content.length,
      titleLength: result.title.length,
      hasDescription: !!result.description
    });
    
    return result;
  } catch (error) {
    edgeLogger.error('Puppeteer scraper failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

/**
 * URL scraping middleware for Vercel AI SDK
 * Automatically detects and scrapes URLs in messages before they reach the AI
 */
export const urlScrapingMiddleware: LanguageModelV1Middleware = {
  transformParams: async ({ params, type }) => {
    const startTime = Date.now();
    
    try {
      // Only transform for stream operations
      if (type !== 'stream') {
        edgeLogger.info('Skipping URL scraping for non-stream operation', {
          operationType: type
        });
        return params;
      }

      // Debug log the received params structure
      edgeLogger.info('URL scraping middleware received params', {
        paramsType: typeof params,
        hasMessages: params && typeof params === 'object' && 'messages' in params,
        hasPrompt: params && typeof params === 'object' && 'prompt' in params,
        paramKeys: params && typeof params === 'object' ? Object.keys(params) : 'not an object'
      });
      
      // Try to extract content from either messages or prompt
      let userMessage = '';
      let systemPrompt = '';
      let enhancedParams = params;
      let systemMessageIndex = -1;
      let detectedUrls: string[] = [];
      
      // Helper function to extract URLs from special markers and messages
      function extractUrlsFromMarkers(): {urls: string[], userMessage?: string} {
        let extractedUrls: string[] = [];
        let extractedUserMessage = '';
        
        // Check if we have a messages array with a system message that might have our marker
        if (params && typeof params === 'object' && 'messages' in params) {
          const messagesParams = params as unknown as { messages: Array<{ role: string; content: string }> };
          
          if (Array.isArray(messagesParams.messages)) {
            // Look for system message with our special marker
            const systemMsg = messagesParams.messages.find(m => m.role === 'system');
            if (systemMsg && typeof systemMsg.content === 'string') {
              const markerMatch = systemMsg.content.match(/<!-- URL_SCRAPING_MIDDLEWARE_MARKER: (.*?) -->/);
              if (markerMatch && markerMatch[1]) {
                try {
                  const markerData = JSON.parse(markerMatch[1]);
                  if (markerData.urls && Array.isArray(markerData.urls)) {
                    edgeLogger.info('Found URLs from marker in system message', {
                      urlCount: markerData.urls.length,
                      urls: markerData.urls
                    });
                    extractedUrls = markerData.urls;
                    
                    // Also set the user message if available
                    if (markerData.userMessage && typeof markerData.userMessage === 'string') {
                      extractedUserMessage = markerData.userMessage;
                      edgeLogger.info('Found user message from marker', {
                        messageLength: extractedUserMessage.length
                      });
                    }
                  }
                } catch (error) {
                  edgeLogger.error('Error parsing URL marker data', {
                    error: error instanceof Error ? error.message : String(error),
                    markerData: markerMatch[1].substring(0, 100)
                  });
                }
              }
            }
          }
        }
        
        // Also check if we have a prompt object that might contain the marker as string
        if (extractedUrls.length === 0 && params && typeof params === 'object' && 'prompt' in params) {
          const promptParams = params as unknown as { prompt: unknown };
          
          if (typeof promptParams.prompt === 'string') {
            const markerMatch = promptParams.prompt.match(/<!-- URL_SCRAPING_MIDDLEWARE_MARKER: (.*?) -->/);
            if (markerMatch && markerMatch[1]) {
              try {
                const markerData = JSON.parse(markerMatch[1]);
                if (markerData.urls && Array.isArray(markerData.urls)) {
                  edgeLogger.info('Found URLs from marker in string prompt', {
                    urlCount: markerData.urls.length,
                    urls: markerData.urls
                  });
                  extractedUrls = markerData.urls;
                  
                  // Also set the user message if available
                  if (markerData.userMessage && typeof markerData.userMessage === 'string') {
                    extractedUserMessage = markerData.userMessage;
                  }
                }
              } catch (error) {
                edgeLogger.error('Error parsing URL marker data from prompt', {
                  error: error instanceof Error ? error.message : String(error)
                });
              }
            }
          }
        }
        
        return { urls: extractedUrls, userMessage: extractedUserMessage };
      }
      
      // First check for URLs in markers
      const markerData = extractUrlsFromMarkers();
      if (markerData.urls.length > 0) {
        detectedUrls = markerData.urls;
        if (markerData.userMessage) {
          userMessage = markerData.userMessage;
        }
      }
      
      // Check if we have a messages array (Vercel AI SDK format)
      if (params && typeof params === 'object' && 'messages' in params) {
        // Type assertion to help TypeScript understand the structure
        const messagesParams = params as unknown as { messages: Array<{ role: string; content: string }> };
        
        if (Array.isArray(messagesParams.messages) && messagesParams.messages.length > 0) {
          // Extract the last user message from messages array
          const lastUserMessageObj = [...messagesParams.messages]
            .reverse()
            .find(m => m.role === 'user');
            
          if (lastUserMessageObj && typeof lastUserMessageObj.content === 'string') {
            userMessage = lastUserMessageObj.content;
          }
          
          // Find the system message to enhance
          systemMessageIndex = messagesParams.messages.findIndex(m => m.role === 'system');
          if (systemMessageIndex !== -1 && typeof messagesParams.messages[systemMessageIndex].content === 'string') {
            systemPrompt = messagesParams.messages[systemMessageIndex].content;
          }
        }
      } 
      // Check if we have a prompt parameter (OpenAI format)
      else if (params && typeof params === 'object' && 'prompt' in params) {
        // Type assertion for prompt
        const promptParams = params as unknown as { prompt: unknown };
        const prompt = promptParams.prompt;
        
        // Log the prompt type and sample for debugging
        edgeLogger.info('Found prompt parameter', {
          promptType: typeof prompt,
          hasPromptMessages: prompt && typeof prompt === 'object' && 'messages' in prompt,
          isArray: prompt && typeof prompt === 'object' && Object.keys(prompt).every(k => !isNaN(Number(k))),
          promptKeys: prompt && typeof prompt === 'object' ? Object.keys(prompt).slice(0, 10) : []
        });
        
        // Handle string prompt
        if (typeof prompt === 'string') {
          // Try to extract the last user message from the prompt
          // This is a heuristic approach since the prompt format can vary
          const userMessageRegex = /(?:User:|Human:)\s*([\s\S]*?)(?=\nAI:|Assistant:|$)/i;
          const userMatch = prompt.match(userMessageRegex);
          
          if (userMatch && userMatch[1]) {
            userMessage = userMatch[1].trim();
            edgeLogger.info('Extracted user message from string prompt', {
              messageLength: userMessage.length,
              messageSample: userMessage.substring(0, 100) + '...'
            });
          } else {
            // If we can't parse it, just use the whole prompt for URL detection
            userMessage = prompt;
          }
          
          // The entire prompt is our system prompt in this case
          systemPrompt = prompt;
        }
        // Handle array-like object with numeric keys
        else if (prompt && typeof prompt === 'object' && 
                 Object.keys(prompt).every(k => !isNaN(Number(k)))) {
          
          edgeLogger.info('Processing array-like prompt object', {
            keyCount: Object.keys(prompt).length
          });
          
          // Convert the object to a proper array
          const promptArray = [];
          for (let i = 0; i < Object.keys(prompt).length; i++) {
            if (i in prompt) {
              promptArray.push((prompt as any)[i]);
            }
          }
          
          // Assume this is the tokenized version of the entire prompt
          // Extract text by joining array elements
          const fullText = promptArray.join(' ');
          
          // Try to extract user message with regex
          const userMessageRegex = /(?:User:|Human:)\s*([\s\S]*?)(?=\nAI:|Assistant:|$)/i;
          const userMatch = fullText.match(userMessageRegex);
          
          if (userMatch && userMatch[1]) {
            userMessage = userMatch[1].trim();
            edgeLogger.info('Extracted user message from array-like prompt', {
              messageLength: userMessage.length,
              messageSample: userMessage.substring(0, 100) + (userMessage.length > 100 ? '...' : '')
            });
          } else {
            // Fallback: look for URLs in the entire text
            userMessage = fullText;
            edgeLogger.info('Using entire array-like prompt for URL detection', {
              textLength: fullText.length
            });
          }
          
          // Use the entire prompt as system prompt for enhancement
          systemPrompt = fullText;
        }
      }
      
      if (!userMessage) {
        edgeLogger.info('No valid user message found, skipping URL scraping');
        return params;
      }
      
      // Extract URLs from the user message if we haven't already found them in markers
      if (detectedUrls.length === 0) {
        detectedUrls = extractUrls(userMessage);
      }
      
      if (detectedUrls.length === 0) {
        edgeLogger.info('No URLs detected, skipping URL scraping');
        return params;
      }
      
      // Log URLs detected
      edgeLogger.info('URLs detected in middleware', {
        urlCount: detectedUrls.length,
        urls: detectedUrls.slice(0, CACHE_CONFIG.maxUrls),
        source: markerData.urls.length > 0 ? 'marker' : 'extraction',
        processingMethod: 'middleware_scraping'
      });
      
      // If we don't have a system prompt to enhance, let's try a fallback approach
      if (!systemPrompt) {
        edgeLogger.info('No system prompt found, using fallback approach for enhancement');
        
        // For fallback, we'll create a temporary object with the scraped content
        // that can be accessed by the model later in the prompt
        const fallbackObj = {
          type: 'fallback',
          url_scraping_results: true,
          scraped_urls: detectedUrls.slice(0, CACHE_CONFIG.maxUrls),
          // We'll proceed with scraping and store it in this temporary object
        };
        
        // Continue with scraping and store results, but using a different approach to inject them
        let useStringFallback = false;
        
        // If we have a prompt parameter and it's a string, we can append to it
        if (params && typeof params === 'object' && 'prompt' in params) {
          if (typeof params.prompt === 'string') {
            systemPrompt = params.prompt;
            useStringFallback = true;
          }
        }
        
        // Scrape the URLs as normal, but be ready to use the fallback approach
        // Instead of having a real system message
        edgeLogger.info('Using fallback enhancement approach', {
          useStringFallback,
          detectedUrls: detectedUrls.length
        });
      } else {
        // We have a system prompt to enhance
        edgeLogger.info('Found system content to enhance', {
          format: systemMessageIndex !== -1 ? 'messages-array' : 'prompt-string',
          originalLength: systemPrompt.length
        });
      }
      
      edgeLogger.info('Processing URLs for scraping', {
        fallbackMode: !systemPrompt || systemPrompt === '',
        urlsToProcess: detectedUrls.length
      });
      
      // Scrape up to max URLs (limit to avoid overwhelming the system)
      const urlsToScrape = detectedUrls.slice(0, CACHE_CONFIG.maxUrls);
      const scrapedContents: string[] = [];
      
      for (const url of urlsToScrape) {
        const fullUrl = ensureProtocol(url);
        const cacheKey = `scrape:${fullUrl}`;
        
        try {
          // Validate URL for security
          const validUrl = validateAndSanitizeUrl(fullUrl);
          edgeLogger.info('Processing URL', { url: validUrl });
          
          // Check Redis cache first
          const cachedContentStr = await redis.get(cacheKey);
          
          if (cachedContentStr) {
            try {
              // Parse cached content from JSON string
              const cachedContent = JSON.parse(cachedContentStr as string) as ScrapedContent;
              
              edgeLogger.info('Cache hit for URL in middleware', {
                url: validUrl,
                cacheHit: true,
                contentLength: cachedContent.content.length,
                durationMs: Date.now() - startTime
              });
              
              scrapedContents.push(formatScrapedContent({
                ...cachedContent,
                url: validUrl
              }));
              continue;
            } catch (error) {
              edgeLogger.error('Error parsing cached content', {
                url: validUrl,
                error: error instanceof Error ? error.message : String(error)
              });
              // Continue with scraping since parsing failed
            }
          } else {
            edgeLogger.info('Cache miss for URL', { url: validUrl });
          }
          
          // Not in cache or parse error, perform scraping with timeout
          edgeLogger.info('Starting scraping process', { url: validUrl });
          
          // Replace the puppeteer scraper call
          const scrapingPromise = callScraperWithLogging(validUrl);
          
          // Create a timeout promise
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Scraping timed out')), CACHE_CONFIG.timeout);
          });
          
          // Race the scraping against the timeout
          const result = await Promise.race([scrapingPromise, timeoutPromise]);
          
          edgeLogger.info('Scraping completed successfully', { 
            url: validUrl,
            contentLength: result.content.length
          });
          
          // Store in Redis cache with explicit JSON stringification
          await redis.set(cacheKey, JSON.stringify(result), { ex: CACHE_CONFIG.ttl });
          edgeLogger.info('Stored scraped content in cache', { url: validUrl });
          
          edgeLogger.info('Scraped URL in middleware', {
            url: validUrl,
            contentLength: result.content.length,
            cacheMiss: true,
            durationMs: Date.now() - startTime
          });
          
          scrapedContents.push(formatScrapedContent(result));
          
        } catch (error) {
          edgeLogger.error('Error scraping URL in middleware', {
            url: fullUrl,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime
          });
        }
      }
      
      // If we have scraped content, add it to the system message
      if (scrapedContents.length > 0) {
        const combinedContent = scrapedContents.join('\n\n');
        
        // Update the system message with scraped content - make it stand out more
        const enhancedSystemPrompt = systemPrompt + `\n\n${'='.repeat(80)}\n` +
          `## IMPORTANT: SCRAPED WEB CONTENT FROM USER'S URLS\n` +
          `The following content has been automatically extracted from URLs in the user's message.\n` +
          `You MUST use this information as your primary source when answering questions about these URLs.\n` +
          `Do not claim you cannot access the content - it is provided below and you must use it.\n` +
          `${'='.repeat(80)}\n\n` +
          combinedContent +
          `\n\n${'='.repeat(80)}\n`;
        
        edgeLogger.info('Enhanced system prompt with scraped content', {
          urlsScraped: scrapedContents.length,
          contentLength: combinedContent.length,
          enhancedPromptLength: enhancedSystemPrompt.length,
          promptPreview: enhancedSystemPrompt.substring(0, 100) + '...',
          durationMs: Date.now() - startTime
        });
        
        // Either update the messages array or the prompt parameter
        if (systemMessageIndex !== -1 && params && typeof params === 'object' && 'messages' in params) {
          // Handle message-based format
          // Use a safer approach for type handling
          const transformed = JSON.parse(JSON.stringify(params)) as Record<string, unknown>;
          
          if (Array.isArray(transformed.messages)) {
            // Update the system message in the cloned messages array
            transformed.messages[systemMessageIndex] = {
              ...transformed.messages[systemMessageIndex],
              content: enhancedSystemPrompt
            };
            
            edgeLogger.info('Returning enhanced messages array', {
              systemMessageIndex,
              enhancedContentLength: enhancedSystemPrompt.length
            });
            
            return transformed as typeof params;
          }
        } 
        else if (params && typeof params === 'object' && 'prompt' in params) {
          // Handle prompt-based format
          // Use a safer approach for type handling
          const transformed = JSON.parse(JSON.stringify(params)) as Record<string, unknown>;
          
          // Handle different prompt types
          if (typeof transformed.prompt === 'string') {
            // For string prompts, just replace with enhanced version
            transformed.prompt = enhancedSystemPrompt;
            
            edgeLogger.info('Returning enhanced string prompt', {
              enhancedPromptLength: enhancedSystemPrompt.length
            });
          }
          else if (typeof transformed.prompt === 'object' && transformed.prompt !== null) {
            // Clone the prompt object to avoid reference issues
            const promptObj = JSON.parse(JSON.stringify(transformed.prompt)) as Record<string, unknown>;
            
            // Check if it has nested messages
            if ('messages' in promptObj && Array.isArray(promptObj.messages)) {
              // Find the system message in the nested messages array
              const nestedSystemIndex = promptObj.messages.findIndex(
                (m: any) => m && typeof m === 'object' && m.role === 'system'
              );
              
              if (nestedSystemIndex !== -1) {
                // Update system message
                promptObj.messages[nestedSystemIndex] = {
                  ...promptObj.messages[nestedSystemIndex],
                  content: enhancedSystemPrompt
                };
                
                // Update the prompt object in our transformed parameters
                transformed.prompt = promptObj;
                
                edgeLogger.info('Returning enhanced prompt object with nested messages', {
                  nestedSystemIndex,
                  enhancedContentLength: enhancedSystemPrompt.length
                });
              } else {
                // No system message found in nested messages
                edgeLogger.info('No system message found in nested messages, skipping enhancement');
              }
            }
            // Handle array-like object (tokenized prompt)
            else if (Object.keys(promptObj).every(k => !isNaN(Number(k)))) {
              edgeLogger.info('Enhancing array-like prompt object', {
                promptKeyCount: Object.keys(promptObj).length
              });
              
              // Convert to string, enhance, then convert back to tokens
              const promptArray = [];
              for (let i = 0; i < Object.keys(promptObj).length; i++) {
                if (i in promptObj) {
                  promptArray.push((promptObj as any)[i]);
                }
              }
              
              // Get the original text
              const originalText = promptArray.join(' ');
              
              // Create enhanced text
              const enhancedText = originalText + `\n\n${'='.repeat(40)}\n` +
                `IMPORTANT: SCRAPED WEB CONTENT FROM USER'S URLS\n` +
                `${'='.repeat(40)}\n\n` +
                combinedContent;
                
              // For array-like prompts, we'll append the enhancement as a simple string
              // This is a simplification, but should work for most cases
              transformed.prompt = enhancedText;
              
              edgeLogger.info('Enhanced array-like prompt converted to string', {
                originalLength: originalText.length,
                enhancedLength: enhancedText.length
              });
            } else {
              // For object prompts without nested messages, try to add enhanced content
              // to a content property if it exists
              if ('content' in promptObj && typeof promptObj.content === 'string') {
                promptObj.content = enhancedSystemPrompt;
                transformed.prompt = promptObj;
                
                edgeLogger.info('Returning enhanced prompt object with content property', {
                  enhancedContentLength: enhancedSystemPrompt.length
                });
              } else {
                // If we can't figure out how to enhance it, log and return original
                edgeLogger.info('Could not determine how to enhance object prompt', {
                  promptKeys: Object.keys(promptObj)
                });
                return params;
              }
            }
          }
          
          return transformed as typeof params;
        }
      } else {
        edgeLogger.info('No content was scraped successfully, returning original params');
      }
    } catch (error) {
      edgeLogger.error('Error in URL scraping middleware', {
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime
      });
    }
    
    // Return original params if no transformation was done
    return params;
  },
  
  // Enhanced pass-through for stream operation with better logging
  wrapStream: async ({ doStream, params }) => {
    // This function will receive the transformed params from transformParams
    // Log that we're about to execute the stream with potentially modified params
    const hasPrompt = params && typeof params === 'object' && 'prompt' in params;
    const promptType = hasPrompt ? typeof params.prompt : 'no-prompt';
    const hasNestedMessages = hasPrompt && 
      typeof params.prompt === 'object' && 
      params.prompt !== null && 
      'messages' in params.prompt;
    
    edgeLogger.info('Executing doStream in wrapStream', {
      hasMessages: params && typeof params === 'object' && 'messages' in params,
      hasPrompt,
      promptType,
      hasNestedMessages,
      promptKeys: hasPrompt && typeof params.prompt === 'object' && params.prompt !== null 
        ? Object.keys(params.prompt as object) 
        : [],
      messageCount: params && typeof params === 'object' && 'messages' in params && Array.isArray(params.messages) 
        ? params.messages.length 
        : (hasNestedMessages && Array.isArray((params.prompt as any).messages) 
            ? (params.prompt as any).messages.length 
            : 0),
      enhancedWithScraping: 
        // Check direct messages
        (params && typeof params === 'object' && 'messages' in params && Array.isArray(params.messages)
          ? params.messages.some(m => 
              typeof m === 'object' && 
              m !== null && 
              m.role === 'system' && 
              typeof m.content === 'string' && 
              m.content.includes('SCRAPED WEB CONTENT FROM USER')
            )
          : false) ||
        // Check nested messages
        (hasNestedMessages && Array.isArray((params.prompt as any).messages)
          ? (params.prompt as any).messages.some((m: any) => 
              typeof m === 'object' && 
              m !== null && 
              m.role === 'system' && 
              typeof m.content === 'string' && 
              m.content.includes('SCRAPED WEB CONTENT FROM USER')
            )
          : false) ||
        // Check string prompt
        (hasPrompt && typeof params.prompt === 'string' && 
          (params.prompt as string).includes('SCRAPED WEB CONTENT FROM USER'))
    });
    
    try {
      return await doStream();
    } catch (error) {
      edgeLogger.error('Error in URL scraping middleware doStream', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  },
  
  // Simple pass-through for non-streaming AI calls
  wrapGenerate: async ({ doGenerate }) => {
    return await doGenerate();
  }
}; 