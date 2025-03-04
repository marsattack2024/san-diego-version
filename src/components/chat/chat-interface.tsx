'use client';

import { useState } from 'react';
import { useChat } from 'ai/react';
import { AgentSelector } from './agent-selector';
import { ChatInput } from './chat-input';
import { ChatMessages } from './chat-messages';
import { createLogger } from '../../utils/client-logger';
import { Button } from '../../../components/ui/button';
import { Search } from 'lucide-react';

// Define AgentType if it can't be imported
type AgentType = 'default' | 'google-ads' | 'facebook-ads' | 'copywriting' | 'quiz';

const logger = createLogger('components:chat-interface');

// Simple DeepSearchToggle component
interface DeepSearchToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

function DeepSearchToggle({ enabled, onToggle }: DeepSearchToggleProps) {
  return (
    <Button
      variant={enabled ? "default" : "outline"}
      size="sm"
      onClick={() => onToggle(!enabled)}
      className="gap-2"
      title={enabled ? "Deep search is enabled" : "Deep search is disabled"}
    >
      <Search className="h-4 w-4" />
      {enabled ? "DeepSearch On" : "DeepSearch Off"}
    </Button>
  );
}

/**
 * Main chat interface component
 * Orchestrates the chat experience with agent selection and message display
 */
export function ChatInterface() {
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('default');
  const [deepSearchEnabled, setDeepSearchEnabled] = useState(false);
  
  const {
    messages,
    input,
    setInput,
    handleSubmit,
    isLoading,
    error,
  } = useChat({
    api: '/api/chat',
    body: {
      agentId: selectedAgent,
      deepSearch: deepSearchEnabled
    },
    onResponse: (response) => {
      logger.debug('Chat response received');
    },
    onError: (error) => {
      logger.error('Error in chat', { error });
    }
  });
  
  const handleAgentChange = (agentId: AgentType) => {
    logger.info('Switching agent', { agentId });
    setSelectedAgent(agentId);
  };
  
  const handleDeepSearchToggle = (enabled: boolean) => {
    logger.info('Deep search setting changed', { enabled });
    setDeepSearchEnabled(enabled);
  };
  
  // Adapter function for ChatInput's handleInputChange
  const handleInputChangeAdapter = (value: string) => {
    setInput(value);
  };
  
  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-4">
        <AgentSelector 
          selectedAgent={selectedAgent} 
          onAgentChange={handleAgentChange} 
        />
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        <ChatMessages 
          messages={messages} 
          isLoading={isLoading} 
        />
        
        {error && (
          <div className="p-4 text-red-500 bg-red-50 rounded-md mt-4">
            Error: {error.message}
          </div>
        )}
      </div>
      
      <div className="border-t p-4">
        <ChatInput 
          input={input} 
          handleInputChange={handleInputChangeAdapter}
          handleSubmit={handleSubmit} 
          isLoading={isLoading}
        />
        
        <div className="flex justify-end mt-2">
          <DeepSearchToggle 
            enabled={deepSearchEnabled} 
            onToggle={handleDeepSearchToggle} 
          />
        </div>
      </div>
    </div>
  );
}