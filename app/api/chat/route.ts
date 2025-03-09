import { validateChatRequest } from '@/lib/chat/validator';
import { chatTools } from '@/lib/chat/tools';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { streamText } from 'ai';
import { Message } from 'ai/react';
import { myProvider } from '@/lib/ai/providers';
import { extractUrls } from '@/lib/chat/url-utils';
import { AgentRouter } from '@/lib/agents/agent-router';
import { type ToolResults, type AgentType } from '@/lib/agents/prompts';
import { logger } from '@/lib/logger/edge-logger';
import { createServerClient } from '@/lib/supabase/server';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Allow streaming responses up to 120 seconds
export const maxDuration = 120;
export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, id, agentId = 'default', deepSearchEnabled = false } = validateChatRequest(body);
    const modelName = 'gpt-4o';
    
    // Create Supabase client for auth
    const cookieStore = await cookies();
    const authClient = createSupabaseServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // This can be ignored if you have middleware refreshing users
            }
          },
        },
      }
    );
    
    // Get the current user
    const { data: { user } } = await authClient.auth.getUser();
    const userId = user?.id;
    
    // Create Supabase client if user is authenticated
    const supabase = userId ? await createServerClient() : null;

    // Use the agentId from the request body, which comes from the user's selection in the UI
    let selectedAgentId: AgentType = agentId as AgentType;
    
    // Log the agent selection details for debugging
    logger.info('Agent selection details', {
      requestBodyAgentId: agentId,
      selectedAgentId,
      important: true
    });
    
    // Get the last user message for processing
    const lastMessage = messages[messages.length - 1];
    const userQuery = lastMessage?.role === 'user' ? lastMessage.content : '';
    
    logger.info('Processing chat request', {
      selectedAgentId,
      isAutoRouting: selectedAgentId === 'default',
      messageCount: messages.length,
      queryLength: userQuery.length,
      hasUrls: extractUrls(userQuery).length > 0,
      deepSearchEnabled,
      important: true
    });

    // Initialize agent router
    const agentRouter = new AgentRouter();
    
    // Auto-route if using the default agent
    if (selectedAgentId === 'default') {
      edgeLogger.info('Attempting to auto-route message based on content');
      const previousAgentId = selectedAgentId;
      selectedAgentId = agentRouter.routeMessage(selectedAgentId, messages);
      
      if (selectedAgentId !== previousAgentId) {
        edgeLogger.info(`Auto-routed to specialized agent: ${selectedAgentId}`);
        logger.info('Auto-routing result', {
          previousAgentId,
          newAgentId: selectedAgentId,
          isChanged: true,
          important: true
        });
      }
    } else {
      // Log that we're using an explicitly selected agent
      edgeLogger.info(`Using explicitly selected agent: ${selectedAgentId}`);
      logger.info('Using explicitly selected agent', {
        agentId: selectedAgentId,
        selectionMethod: 'user-selected',
        important: true
      });
    }

    // Extract URLs from the last message
    const urls = lastMessage?.role === 'user' ? extractUrls(lastMessage.content) : [];
    
    // Initialize tool results
    let toolResults: ToolResults = {};
    
    // Run RAG for queries over 15 characters
    if (userQuery.length > 15) {
      try {
        edgeLogger.info('Running RAG for query', { 
          queryLength: userQuery.length,
          query: userQuery.substring(0, 100) // Log first 100 chars of query
        });
        
        const ragResult = await chatTools.getInformation.execute({ query: userQuery }, {
          toolCallId: 'rag-search',
          messages: []
        });
        
        // Log the RAG result details
        edgeLogger.info('RAG result details', {
          resultLength: ragResult ? ragResult.length : 0,
          hasResults: ragResult ? !ragResult.includes("No relevant information found") : false,
          firstChars: ragResult ? ragResult.substring(0, 100) : 'No result'
        });
        
        if (ragResult && !ragResult.includes("No relevant information found")) {
          // Use the full RAG result without truncation
          toolResults.ragContent = ragResult;
          
          edgeLogger.info('RAG search successful', { 
            contentLength: ragResult.length,
            hasResults: true
          });
        } else {
          edgeLogger.info('RAG search completed with no relevant results');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        edgeLogger.error('RAG search failed', { 
          error: errorMessage,
          query: userQuery.substring(0, 100)
        });
      }
    }

    // Pre-scrape URLs if present
    if (urls.length > 0) {
      try {
        edgeLogger.info('Pre-scraping URLs', { urls });
        
        // Scrape all URLs in parallel
        const scrapedResults = await Promise.all(
          urls.map(async (url, index) => {
            try {
              return await chatTools.comprehensiveScraper.execute({ url }, {
                toolCallId: `pre-scrape-${index}`,
                messages: []
              });
            } catch (error) {
              edgeLogger.error('Failed to scrape URL', { url, error });
              return null;
            }
          })
        );
        
        // Filter out failed scrapes and format the results
        const validResults = scrapedResults.filter((result): result is NonNullable<typeof result> => result !== null);
        if (validResults.length > 0) {
          toolResults.webScraper = validResults.map(result => (
            `URL: ${result.url}\n` +
            `Title: ${result.title || 'No title'}\n` +
            `Description: ${result.description || 'No description'}\n\n` +
            `${result.content || 'No content available'}`
          )).join('\n\n---\n\n');
          
          edgeLogger.info('Successfully pre-scraped URLs', { 
            urlCount: urls.length,
            successCount: validResults.length,
            totalContentLength: toolResults?.webScraper?.length || 0,
            contentStats: validResults.map(result => ({
              url: result.url,
              contentLength: result.content.length,
              stats: result.stats
            }))
          });
        }
      } catch (error) {
        edgeLogger.error('Failed to pre-scrape URLs', { urls, error });
      }
    }
    
    // Run DeepSearch ONLY if explicitly enabled by the user
    if (deepSearchEnabled && userQuery.length > 0) {
      try {
        edgeLogger.info('Running DeepSearch (explicitly enabled)', { queryLength: userQuery.length });
        
        const deepSearchResult = await chatTools.deepSearch.execute({ query: userQuery }, {
          toolCallId: 'deep-search',
          messages: []
        });
        
        if (deepSearchResult) {
          toolResults.deepSearch = deepSearchResult;
          edgeLogger.info('DeepSearch successful', { contentLength: deepSearchResult.length });
        }
      } catch (error) {
        edgeLogger.error('DeepSearch failed', { error });
      }
    }

    // Get system prompt without tool results
    const systemPrompt = agentRouter.getSystemPrompt(selectedAgentId, deepSearchEnabled);

    // Check system prompt length
    const systemPromptLength = systemPrompt.length;
    if (systemPromptLength > 25000) {
      edgeLogger.warn('System prompt is very long', { 
        systemPromptLength,
        selectedAgentId
      });
    } else {
      edgeLogger.info('System prompt length is acceptable', { 
        systemPromptLength,
        selectedAgentId
      });
    }

    // Enhance the system prompt with tool results instead of using tool messages
    // This approach is more compatible with the Vercel AI SDK
    let enhancedSystemPrompt = systemPrompt;
    
    // Track which tools were used to inform the model
    const toolsUsed = [];
    
    // Add RAG results to the system prompt if available
    if (toolResults.ragContent) {
      enhancedSystemPrompt += `\n\n### RAG KNOWLEDGE BASE TOOL RESULTS ###\nThe following information was retrieved from the knowledge base using the RAG tool:\n\n${toolResults.ragContent}\n\n`;
      toolsUsed.push('RAG Knowledge Base');
      edgeLogger.info('Added RAG results to system prompt', { 
        contentLength: toolResults.ragContent.length 
      });
    }
    
    // Add web scraper results to the system prompt if available
    if (toolResults.webScraper) {
      enhancedSystemPrompt += `\n\n### WEB SCRAPER TOOL RESULTS ###\nThe following information was scraped from the web using the Web Scraper tool:\n\n${toolResults.webScraper}\n\n`;
      toolsUsed.push('Web Scraper');
      edgeLogger.info('Added web scraper results to system prompt', { 
        contentLength: toolResults.webScraper.length 
      });
    }
    
    // Add deep search results to the system prompt if available
    if (toolResults.deepSearch) {
      enhancedSystemPrompt += `\n\n### PERPLEXITY DEEP SEARCH TOOL RESULTS ###\nThe following information was retrieved using the Perplexity Deep Search tool:\n\n${toolResults.deepSearch}\n\n`;
      toolsUsed.push('Perplexity Deep Search');
      edgeLogger.info('Added deep search results to system prompt', { 
        contentLength: toolResults.deepSearch.length 
      });
    }
    
    // Add a reminder about which tools were used
    if (toolsUsed.length > 0) {
      enhancedSystemPrompt += `\n\n### RESPONSE STRUCTURE REQUIREMENTS ###
Your response MUST end with a section formatted exactly like this:

--- Tools and Resources Used ---
${toolsUsed.map(tool => {
  if (tool === 'RAG Knowledge Base' && toolResults.ragContent) {
    return `- Knowledge Base: Retrieved ${toolResults.ragContent.length} characters of relevant information about ${userQuery.substring(0, 50)}...`;
  }
  if (tool === 'Web Scraper' && toolResults.webScraper) {
    return `- Web Scraper: Analyzed ${urls.length} URLs with ${toolResults.webScraper.length} characters of content`;
  }
  if (tool === 'Perplexity Deep Search' && toolResults.deepSearch) {
    return `- Deep Search: Retrieved ${toolResults.deepSearch.length} characters of additional context through web search`;
  }
  return `- ${tool}: No content retrieved`;
}).join('\n')}

IMPORTANT INSTRUCTIONS:
1. You MUST include this exact section at the end of your response
2. DO NOT say "I did not use any specific resources" or similar disclaimers
3. If you used the tools above, you MUST acknowledge them in this format
4. The tools section should be separated from your main response by a blank line

Example acknowledgment format:
[Your detailed response here]

--- Tools and Resources Used ---
- Knowledge Base: Retrieved 1500 characters of relevant information about pricing strategies...
- Web Scraper: Analyzed 2 URLs with 5000 characters of content
\n\n`;
      
      edgeLogger.info('Added structured tools used reminder to system prompt', { 
        toolsUsed,
        toolResults: {
          ragLength: toolResults.ragContent?.length || 0,
          webScraperLength: toolResults.webScraper?.length || 0,
          deepSearchLength: toolResults.deepSearch?.length || 0
        }
      });
    }

    edgeLogger.info('Generating response', {
      selectedAgentId,
      hasRagContent: !!toolResults.ragContent,
      hasWebScraperContent: !!toolResults.webScraper,
      hasDeepSearchContent: !!toolResults.deepSearch,
      urlCount: urls.length,
      maxSteps: urls.length > 0 ? 5 : 3
    });

    // Calculate total message size for debugging
    const totalMessageSize = JSON.stringify(messages).length + enhancedSystemPrompt.length;
    edgeLogger.info('Total message size', { 
      totalMessageSize,
      messageCount: messages.length,
      systemPromptLength: enhancedSystemPrompt.length
    });

    // Check if total size is approaching limits
    if (totalMessageSize > 100000) {
      edgeLogger.warn('Total message size is very large', { totalMessageSize });
    }

    // Use AI SDK to generate response with more steps if URLs are present
    try {
      // Create or update chat session if user is authenticated and sessionId is provided
      if (supabase && userId && id) {
        try {
          // Check if this is a new session or existing one
          const { data: existingSession } = await supabase
            .from('sd_chat_sessions')
            .select('id')
            .eq('id', id)
            .maybeSingle();
          
          if (existingSession) {
            // Update existing session's update_at timestamp
            await supabase
              .from('sd_chat_sessions')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', id)
              .eq('user_id', userId);
            
            edgeLogger.info('Updated existing chat session', { sessionId: id, userId });
          } else {
            // Create new session with the provided ID
            await supabase
              .from('sd_chat_sessions')
              .insert({
                id,
                user_id: userId,
                title: messages.length > 0 && messages[0].role === 'user' 
                  ? messages[0].content.substring(0, 50) + (messages[0].content.length > 50 ? '...' : '')
                  : 'New Chat',
                agent_id: selectedAgentId,
                deep_search_enabled: deepSearchEnabled
              });
            
            edgeLogger.info('Created new chat session', { sessionId: id, userId });
          }
          
          // Store the user message in chat_histories
          if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
            const userMessage = messages[messages.length - 1];
            await supabase
              .from('sd_chat_histories')
              .insert({
                session_id: id,
                role: userMessage.role,
                content: userMessage.content,
                user_id: userId
              });
            
            edgeLogger.info('Stored user message', { sessionId: id, userId });
          }
        } catch (dbError) {
          // Log error but continue with response generation
          edgeLogger.error('Failed to update Supabase', { error: dbError, sessionId: id });
        }
      }
      
      // For Google Ads agent, modify the system prompt to emphasize format preservation
      if (selectedAgentId === 'google-ads') {
        enhancedSystemPrompt = `${enhancedSystemPrompt}

IMPORTANT: You must preserve all line breaks exactly as they appear in your response. Each headline, description, and ad asset must be on its own separate line. Do not combine items into paragraphs. This format is critical for the user to read the content properly.`;
      }
      
      const response = await streamText({
        model: myProvider.languageModel(modelName),
        system: enhancedSystemPrompt,
        messages: messages,
        tools: {
          // Only include the comprehensive scraper and other tools, not the basic webScraper
          getInformation: chatTools.getInformation,
          deepSearch: chatTools.deepSearch,
          comprehensiveScraper: chatTools.comprehensiveScraper,
          detectAndScrapeUrls: chatTools.detectAndScrapeUrls,
          addResource: chatTools.addResource
        },
        maxSteps: urls.length > 0 ? 5 : 3, // More steps if URLs need processing
        temperature: 0.4 // Lower temperature for more consistent formatting
      });
      
      // Store the AI response after generation
      if (supabase && userId && id) {
        // We'll handle this in a custom handler in the frontend
        // because we need to capture the full streamed response
      }

      return response.toDataStreamResponse();
    } catch (streamError) {
      // Log specific error from streamText
      const errorMessage = streamError instanceof Error ? streamError.message : 'Unknown streamText error';
      const errorStack = streamError instanceof Error ? streamError.stack : 'No stack trace';
      
      edgeLogger.error('Error in streamText', { 
        error: errorMessage,
        stack: errorStack,
        systemPromptLength: enhancedSystemPrompt.length,
        messageCount: messages.length
      });
      
      return new Response(
        JSON.stringify({ 
          error: 'An error occurred while generating the response',
          details: errorMessage
        }),
        { status: 500 }
      );
    }
  } catch (error) {
    // Improved error logging with more details
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : 'No stack trace';
    
    edgeLogger.error('Error in chat route', { 
      error: errorMessage,
      stack: errorStack
    });
    
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request', details: errorMessage }),
      { status: 500 }
    );
  }
}