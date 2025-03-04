'use client';

import { useState } from 'react';
import { AgentType } from '../../agents';
import { createLogger } from '../../utils/client-logger';

const logger = createLogger('chat:agent-selector');

interface AgentSelectorProps {
  selectedAgent: AgentType;
  onAgentChange: (agentId: AgentType) => void;
}

interface AgentOption {
  id: AgentType;
  name: string;
  description: string;
  icon: string;
}

// Agent options with their details
const agentOptions: AgentOption[] = [
  {
    id: 'default',
    name: 'Default Assistant',
    description: 'General-purpose assistant for various tasks',
    icon: '🤖'
  },
  {
    id: 'google-ads',
    name: 'Google Ads Specialist',
    description: 'Expert in Google Ads campaign creation and optimization',
    icon: '🔍'
  },
  {
    id: 'facebook-ads',
    name: 'Facebook Ads Specialist',
    description: 'Expert in Facebook and Instagram advertising strategies',
    icon: '📱'
  },
  {
    id: 'copywriting',
    name: 'Copywriting Specialist',
    description: 'Expert in creating compelling marketing copy and content',
    icon: '✍️'
  },
  {
    id: 'quiz',
    name: 'Quiz Specialist',
    description: 'Expert in creating and managing interactive quizzes',
    icon: '❓'
  }
];

export function AgentSelector({ selectedAgent, onAgentChange }: AgentSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const selectedOption = agentOptions.find(option => option.id === selectedAgent) || agentOptions[0];
  
  const handleSelect = (agentId: AgentType) => {
    logger.info({ agentId, previousAgent: selectedAgent }, 'Agent selected');
    onAgentChange(agentId);
    setIsOpen(false);
  };
  
  return (
    <div className="relative">
      <button
        type="button"
        className="flex items-center justify-between w-full p-3 border rounded-md bg-white"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center">
          <span className="text-xl mr-2">{selectedOption.icon}</span>
          <div>
            <div className="font-medium">{selectedOption.name}</div>
            <div className="text-sm text-gray-500">{selectedOption.description}</div>
          </div>
        </div>
        <svg
          className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg">
          {agentOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`flex items-center w-full p-3 text-left hover:bg-gray-100 ${
                option.id === selectedAgent ? 'bg-blue-50' : ''
              }`}
              onClick={() => handleSelect(option.id)}
            >
              <span className="text-xl mr-2">{option.icon}</span>
              <div>
                <div className="font-medium">{option.name}</div>
                <div className="text-sm text-gray-500">{option.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
} 