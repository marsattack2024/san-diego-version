'use client';

import type { Attachment, Message } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useState, useEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { toast } from 'sonner';
import { useChatStore } from '@/stores/chat-store';
import { TooltipProvider } from './ui/tooltip';
import { historyService } from '@/lib/api/history-service';

const MessagesDebug = ({ 
  messages, 
  messageIdMap, 
  debugInfo 
}: { 
  messages: any[], 
  messageIdMap: Record<string, string>,
  debugInfo?: any
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Record<string, boolean>>({});
  
  // Function to toggle expansion of specific message
  const toggleMessage = (msgId: string) => {
    setExpandedMessages(prev => ({
      ...prev,
      [msgId]: !prev[msgId]
    }));
  };
  
  // Log debug data
  const logDebugData = () => {
    console.log('Message debug data:', {
      messages: messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        contentLength: msg.content.length,
        hasMapping: !!messageIdMap[msg.id],
        dbId: messageIdMap[msg.id]
      })),
      messageIdMap,
      debugInfo
    });
  };
  
  // Function to download debug data as JSON
  const downloadDebugData = () => {
    const debugData = {
      timestamp: new Date().toISOString(),
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        contentLength: m.content.length,
        content: m.content.substring(0, 500) + (m.content.length > 500 ? '...' : ''),
        hasDatabaseId: !!messageIdMap[m.id],
        databaseId: messageIdMap[m.id]
      })),
      messageIdMap,
      debugInfo
    };
    
    const dataStr = JSON.stringify(debugData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', `chat-debug-${Date.now()}.json`);
    document.body.appendChild(linkElement);
    linkElement.click();
    document.body.removeChild(linkElement);
  };
  
  // Message status component
  const MessageStatus = ({ messageId }: { messageId: string }) => {
    // Find if this message has a database ID mapping
    const savedId = messageIdMap[messageId];
    
    return (
      <div className="flex items-center gap-1">
        <span className={`w-2 h-2 rounded-full ${savedId ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
        <span>{savedId ? 'Saved' : 'Pending'}</span>
        {savedId && <span className="text-xs text-gray-500">{savedId.substring(0, 8)}...</span>}
      </div>
    );
  };
  
  return (
    <div className="text-xs border-t border-gray-200 pt-4 pb-2">
      <div className="flex justify-between items-center">
        <button 
          onClick={() => setIsOpen(!isOpen)} 
          className="text-gray-500 hover:text-gray-700 underline"
        >
          {isOpen ? 'Hide Debug Info' : 'Show Debug Info'}
        </button>
        
        <div className="flex gap-2">
          <button 
            onClick={logDebugData} 
            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
          >
            Log Debug Data
          </button>
          <button 
            onClick={downloadDebugData} 
            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
          >
            Download Debug Data
          </button>
        </div>
      </div>
      
      {isOpen && (
        <div className="mt-2 border rounded p-2">
          <h4 className="font-semibold mb-2">Message Status</h4>
          <div className="max-h-40 overflow-auto space-y-1">
            {messages.map(msg => (
              <div key={msg.id} className="flex justify-between border-b pb-1">
                <div>
                  <span>{msg.role}</span>
                  <span className="ml-2 font-mono text-xs">{msg.id.substring(0, 8)}...</span>
                </div>
                <MessageStatus messageId={msg.id} />
              </div>
            ))}
          </div>
          
          {debugInfo?.lastError && (
            <div className="mt-2 text-red-500">
              <div className="font-semibold">Last Error:</div>
              <div className="whitespace-pre-wrap">{debugInfo.lastError}</div>
            </div>
          )}
          
          {debugInfo?.lastUserMessageId && (
            <div className="mt-2">
              <span className="font-semibold">Last User Message ID:</span>
              <span className="ml-1 font-mono">{debugInfo.lastUserMessageId}</span>
            </div>
          )}
          
          {debugInfo?.lastAssistantMessageId && (
            <div>
              <span className="font-semibold">Last Assistant Message ID:</span>
              <span className="ml-1 font-mono">{debugInfo.lastAssistantMessageId}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export function Chat({
  id,
  initialMessages,
  isReadonly,
}: {
  id: string;
  initialMessages: Array<Message>;
  isReadonly: boolean;
}) {
  const { mutate } = useSWRConfig();
  const deepSearchEnabled = useChatStore(state => state.getDeepSearchEnabled());
  const selectedAgentId = useChatStore(state => state.selectedAgentId);
  const updateConversationMetadata = useChatStore(state => state.updateConversationMetadata);

  // Update conversation metadata when agent changes
  useEffect(() => {
    if (id) {
      updateConversationMetadata(id, { agentId: selectedAgentId });
    }
  }, [id, selectedAgentId, updateConversationMetadata]);

  // Add a state to track message chat IDs
  const [messageIdMap, setMessageIdMap] = useState<Record<string, string>>({});
  
  // Add debug state to track message recording
  const [debugInfo, setDebugInfo] = useState<{
    lastUserMessageId: string | null,
    lastAssistantMessageId: string | null,
    lastError: string | null
  }>({
    lastUserMessageId: null,
    lastAssistantMessageId: null,
    lastError: null
  });
  
  useEffect(() => {
    // Log debug info to console when it changes
    if (debugInfo.lastError) {
      console.error('Chat debug info:', debugInfo);
    } else if (debugInfo.lastUserMessageId || debugInfo.lastAssistantMessageId) {
      console.log('Chat debug info:', debugInfo);
    }
  }, [debugInfo]);

  const {
    messages,
    setMessages,
    handleSubmit,
    input,
    setInput,
    append,
    isLoading,
    stop,
    reload,
  } = useChat({
    id,
    body: { 
      id,
      deepSearchEnabled,
      agentId: selectedAgentId
    },
    initialMessages,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    onFinish: async (message) => {
      // Store assistant message in Supabase after streaming completes
      try {
        // Extract tools used from message content
        let toolsUsed = null;
        const toolsSection = message.content.match(/--- Tools and Resources Used ---\s*([\s\S]*?)(?:\n\n|$)/);
        if (toolsSection && toolsSection[1]) {
          toolsUsed = {
            tools: toolsSection[1]
              .split('\n')
              .filter(line => line.trim().startsWith('-'))
              .map(line => line.trim())
          };
        }
        
        // Check if the message content is excessively large
        const contentLength = message.content.length;
        const isLargeMessage = contentLength > 100000; // ~100KB threshold
        
        // If message is very large, trim it to prevent database issues
        const trimmedContent = isLargeMessage 
          ? message.content.substring(0, 100000) + `\n\n[Content truncated due to size. Original length: ${contentLength} characters]`
          : message.content;
        
        // Look up the corresponding request messageId that triggered this response
        const previousUserMessage = messages.slice().reverse().find(m => m.role === 'user');
        const requestMessageId = previousUserMessage ? messageIdMap[previousUserMessage.id] : null;
        
        console.log('Saving assistant message with request ID:', { 
          requestMessageId, 
          hasUserMessage: !!previousUserMessage,
          userMessageId: previousUserMessage?.id
        });
        
        // Generate a fallback ID if no requestMessageId is found
        const messageId = requestMessageId || crypto.randomUUID();
        console.log('Saving assistant message with ID:', messageId);
        
        // Save the assistant message to Supabase
        const response = await fetch(`/api/chat/${id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              role: message.role,
              content: trimmedContent,
            },
            toolsUsed,
            messageId // Consistent parameter name (was chatId)
          }),
        });
        
        if (response.ok) {
          // Store the chatId for this message
          const data = await response.json();
          const savedMessageId = data.messageId || messageId;
          
          setMessageIdMap(prev => ({
            ...prev,
            [message.id]: savedMessageId
          }));
          
          setDebugInfo(prev => ({
            ...prev,
            lastAssistantMessageId: savedMessageId,
            lastError: null
          }));
          
          console.log('Successfully saved assistant message:', { 
            messageId: savedMessageId, 
            responseMessageId: message.id
          });
        } else {
          // Get detailed error information from the response
          response.json().then(data => {
            console.error('Failed to save assistant message:', data);
            setDebugInfo(prev => ({
              ...prev,
              lastError: `Failed to save assistant message: ${JSON.stringify(data)}`
            }));
          }).catch(err => {
            console.error('Failed to save assistant message, could not parse error:', err);
            setDebugInfo(prev => ({
              ...prev,
              lastError: `Failed to parse error: ${err.message || 'Unknown error'}`
            }));
          });
        }
      } catch (error) {
        console.error('Error saving assistant message:', error);
        setDebugInfo(prev => ({
          ...prev,
          lastError: `Error saving assistant message: ${(error as Error).message || 'Unknown error'}`
        }));
      }
      
      // Update chat history
      mutate('/api/history');
    },
    onError: (error) => {
      // Only show toast for non-vote related errors
      console.error('Chat error:', error);
      
      // Check if the error is related to voting (if it contains vote in the URL)
      const errorUrl = error?.message || '';
      if (!errorUrl.includes('/api/vote')) {
        toast.error('An error occurred, please try again!');
      }
    },
  });

  // Wrap the original handleSubmit to save the user message first
  const handleSubmitWithSave = async (event?: { preventDefault?: (() => void) } | undefined, chatRequestOptions?: any) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    
    // Only proceed if there's input to send
    if (!input.trim()) {
      return handleSubmit(event, chatRequestOptions);
    }
    
    try {
      console.log(`Creating chat session for ID: ${id}`);
      
      // Add timeout and retry logic for session creation
      let sessionResponse = null;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          // Call the session endpoint to make sure the session exists FIRST
          // with a timeout to prevent hanging
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          sessionResponse = await fetch(`/api/chat/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              id,
              agentId: selectedAgentId,
              deepSearchEnabled
            }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (sessionResponse.ok) {
            break; // Success, exit retry loop
          } else {
            console.warn(`Session creation attempt ${retryCount + 1} failed with status: ${sessionResponse.status}`);
            retryCount++;
            
            if (retryCount < maxRetries) {
              // Wait before retrying (exponential backoff)
              await new Promise(r => setTimeout(r, 500 * Math.pow(2, retryCount)));
            }
          }
        } catch (fetchError) {
          console.error(`Session creation fetch error (attempt ${retryCount + 1}):`, fetchError);
          retryCount++;
          
          if (retryCount < maxRetries) {
            // Wait before retrying
            await new Promise(r => setTimeout(r, 500 * Math.pow(2, retryCount)));
          }
        }
      }
      
      // Check if we eventually succeeded
      if (!sessionResponse || !sessionResponse.ok) {
        const errorText = sessionResponse ? await sessionResponse.text() : 'Network error';
        console.error('Error ensuring chat session exists after retries:', errorText);
        toast.error('Failed to create chat session. Please try again.');
        return;
      }
      
      const sessionData = await sessionResponse.json();
      console.log('Session creation response:', sessionData);
      
      // Check if this is the first message in the conversation to update title
      const isFirstMessage = messages.filter(m => m.role === 'user').length === 0;

      console.log('Is first message:', isFirstMessage, 'User message count:', messages.filter(m => m.role === 'user').length);
      
      // Generate a consistent message ID for tracking
      const messageId = crypto.randomUUID();
      console.log(`Creating message with ID: ${messageId}`);
      
      // Add retry logic for saving the user message
      let messageResponse = null;
      retryCount = 0;
      
      while (retryCount < maxRetries) {
        try {
          // Save the user message to Supabase BEFORE sending to AI
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          console.log('Sending user message save request', {
            endpoint: `/api/chat/${id}`,
            method: 'POST',
            messageRole: 'user',
            contentLength: input.length,
            messageId,
            timestamp: new Date().toISOString()
          });

          messageResponse = await fetch(`/api/chat/${id}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: {
                role: 'user',
                content: input,
              },
              messageId, // Use consistent parameter naming (was chatId in some places)
              updateTimestamp: true, // Signal to update the session timestamp
            }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (messageResponse.ok) {
            // Get a copy of the response text but don't consume the original response
            const responseText = await messageResponse.clone().text();
            console.log(`Message save request succeeded with status: ${messageResponse.status}`, {
              responseText,
              timestamp: new Date().toISOString()
            });

            // Attempt to parse the response as JSON for more detailed logging
            try {
              const jsonResponse = JSON.parse(responseText);
              console.log('Parsed message save response:', {
                success: jsonResponse.success,
                messageId: jsonResponse.messageId,
                responseDetails: jsonResponse,
                timestamp: new Date().toISOString()
              });
            } catch (parseError) {
              console.warn('Could not parse response as JSON:', parseError);
            }
            
            break; // Success, exit retry loop
          } else {
            console.warn(`Message save attempt ${retryCount + 1} failed with status: ${messageResponse.status}`, {
              statusText: messageResponse.statusText,
              timestamp: new Date().toISOString()
            });
            
            // Try to get the response text for better debugging
            try {
              const errorText = await messageResponse.clone().text();
              console.error('Error response text:', errorText);
              
              // Attempt to parse error as JSON for more details
              try {
                const jsonError = JSON.parse(errorText);
                console.error('Parsed error details:', {
                  error: jsonError.error,
                  details: jsonError.details,
                  code: jsonError.code,
                  fullError: jsonError
                });
              } catch (jsonError) {
                // Not JSON, continue with text
              }
            } catch (e) {
              console.error('Could not read error response text:', e);
            }
            
            retryCount++;
            
            if (retryCount < maxRetries) {
              // Wait before retrying (exponential backoff)
              const delay = 500 * Math.pow(2, retryCount);
              console.log(`Retrying in ${delay}ms...`);
              await new Promise(r => setTimeout(r, delay));
            }
          }
        } catch (fetchError) {
          console.error(`Message save fetch error (attempt ${retryCount + 1}):`, fetchError);
          retryCount++;
          
          if (retryCount < maxRetries) {
            // Wait before retrying
            await new Promise(r => setTimeout(r, 500 * Math.pow(2, retryCount)));
          }
        }
      }
      
      // Check if we eventually succeeded
      if (!messageResponse) {
        console.error('Failed to save user message: Network error');
        setDebugInfo(prev => ({
          ...prev,
          lastError: `Failed to save user message: Network error`
        }));
        toast.error('Failed to save your message. Please try again.');
        return;
      }
      
      // Get full response to debug
      let messageData: any;
      let responseText: string;
      
      try {
        responseText = await messageResponse.text();
        console.log('Raw message save response:', responseText);
        
        try {
          messageData = JSON.parse(responseText);
        } catch (e) {
          console.error('Failed to parse message response as JSON:', e);
          messageData = { error: 'Failed to parse response' };
        }
      } catch (e) {
        console.error('Failed to read message response text:', e);
        responseText = 'Failed to read response text';
      }
      
      if (!messageResponse.ok) {
        console.error('Failed to save user message:', {
          statusCode: messageResponse.status,
          statusText: messageResponse.statusText,
          responseData: messageData,
          responseText
        });
        
        setDebugInfo(prev => ({
          ...prev,
          lastError: `Failed to save user message: Status ${messageResponse.status}, Response: ${responseText}`
        }));
        
        toast.error('Failed to save your message. Please try again.');
        return;
      }
      
      // Log success with detailed information
      console.log('Message save successful:', {
        response: messageData,
        statusCode: messageResponse.status,
        messageId: messageData?.messageId || messageId
      });
      
      // Store the message ID for the next user message that will be appended to state
      const actualMessageId = messageData?.messageId || messageId;
      
      // Update debug state with latest info
      setDebugInfo(prev => ({
        ...prev,
        lastUserMessageId: actualMessageId,
        lastError: null
      }));
      
      // Try to find if the message is already in state (optimistic update)
      const userMessage = messages.find(m => m.role === 'user' && m.content === input);
      if (userMessage) {
        // If found, update the mapping for the existing message
        console.log('Found existing user message in state, updating mapping:', userMessage.id, '->', actualMessageId);
        
        setMessageIdMap(prev => ({
          ...prev,
          [userMessage.id]: actualMessageId
        }));
      } else {
        console.log('No matching user message found in state yet, will update when added');
        
        // Create a function to update the mapping when the message is added
        const handleNewMessage = () => {
          // Find the newly added user message by checking what messages don't have an ID mapping
          const newMessages = messages.filter(m => 
            m.role === 'user' && 
            m.content === input && 
            !messageIdMap[m.id]
          );
          
          if (newMessages.length > 0) {
            console.log('Found new user messages, updating mapping:', newMessages.map(m => m.id));
            
            // Update the message ID map for all matching messages
            const updates = newMessages.reduce((acc, msg) => ({
              ...acc,
              [msg.id]: actualMessageId
            }), {});
            
            setMessageIdMap(prev => ({
              ...prev,
              ...updates
            }));
          }
        };
        
        // Call immediately and set a fallback timeout
        handleNewMessage();
        setTimeout(handleNewMessage, 500);
      }
      
      // Update the title if this is the first message
      if (isFirstMessage) {
        try {
          // Get truncated title from first message
          const title = input.length > 30 
            ? `${input.substring(0, 30)}...` 
            : input;
            
          console.log(`Updating chat title to: "${title}"`);
            
          // Update the chat title
          const titleResponse = await fetch(`/api/chat/${id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title }),
          });
            
          // Get the full response text for debugging
          const titleResponseText = await titleResponse.text();
          console.log('Title update raw response:', titleResponseText);
            
          // Parse the response text as JSON
          let titleData;
          try {
            titleData = JSON.parse(titleResponseText);
            console.log('Parsed title response:', titleData);
          } catch (parseError) {
            console.error('Failed to parse title response as JSON:', parseError);
          }
            
          if (!titleResponse.ok) {
            throw new Error(`Failed to update title: ${titleResponse.status} - ${titleResponseText}`);
          }
            
          console.log('Successfully updated chat title');
          
          // Update local state as well
          updateConversationMetadata(id, { title });
            
          // Force refresh the chat history to show updated title
          historyService.invalidateCache();
        } catch (titleError) {
          console.error('Error updating chat title:', titleError);
          // Still invalidate the cache to refresh the history
          historyService.invalidateCache();
        }
      }
      
      console.log('Proceeding to AI API call with handleSubmit');
      
      // Submit to the AI after saving to database
      return handleSubmit(event, chatRequestOptions);
    } catch (error) {
      console.error('Error in handleSubmitWithSave:', error);
      setDebugInfo(prev => ({
        ...prev,
        lastError: `Error in handleSubmitWithSave: ${(error as Error).message}`
      }));
      toast.error('An error occurred. Please try again.');
    }
  };

  // Use SWR to fetch votes with error handling and retry configuration
  const { data: votes, error: voteError } = useSWR<Array<Vote>>(
    id ? `/api/vote?chatId=${id}` : null, // Only fetch if we have an ID
    fetcher,
    {
      // Add additional options for SWR
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      refreshInterval: 30000, // Only poll every 30 seconds instead of continuously
      dedupingInterval: 30000, // Dedupe calls within 30 seconds
      onError: (err) => {
        console.warn('Failed to load votes:', err);
        // Don't show toast for this error as it's not critical
      }
    }
  );
  
  // If we had a vote error, log it but continue with empty votes
  useEffect(() => {
    if (voteError) {
      console.warn('Vote loading error:', voteError);
    }
  }, [voteError]);

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  return (
    <TooltipProvider>
      <>
        <div className="flex flex-col min-w-0 h-dvh bg-background">
          <ChatHeader
            chatId={id}
            isReadonly={isReadonly}
          />

          <Messages
            chatId={id}
            isLoading={isLoading}
            votes={votes}
            messages={messages}
            setMessages={setMessages}
            reload={reload}
            isReadonly={isReadonly}
            isArtifactVisible={isArtifactVisible}
          />

          {process.env.NODE_ENV === 'development' && (
            <div className="px-4 max-w-3xl mx-auto w-full">
              <MessagesDebug 
                messages={messages} 
                messageIdMap={messageIdMap}
                debugInfo={debugInfo} 
              />
            </div>
          )}

          <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
            {!isReadonly && (
              <MultimodalInput
                chatId={id}
                input={input}
                setInput={setInput}
                handleSubmit={handleSubmitWithSave}
                isLoading={isLoading}
                stop={stop}
                attachments={attachments}
                setAttachments={setAttachments}
                messages={messages}
                setMessages={setMessages}
                append={append}
              />
            )}
          </form>
        </div>

        <Artifact
          chatId={id}
          input={input}
          setInput={setInput}
          handleSubmit={handleSubmitWithSave}
          isLoading={isLoading}
          stop={stop}
          attachments={attachments}
          setAttachments={setAttachments}
          append={append}
          messages={messages}
          setMessages={setMessages}
          reload={reload}
          votes={votes}
          isReadonly={isReadonly}
        />
      </>
    </TooltipProvider>
  );
}
