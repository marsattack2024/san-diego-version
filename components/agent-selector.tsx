'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { CheckCircleFillIcon, ChevronDownIcon } from './icons';
import { useChatStore } from '@/stores/chat-store';
import { type AgentType } from '@/lib/chat-engine/prompts';

// Define Agent interface
interface Agent {
  id: AgentType;
  name: string;
  description: string;
}

// Define available agents
const agents: Agent[] = [
  {
    id: 'default',
    name: 'General Assistant',
    description: 'General photography marketing assistant'
  },
  {
    id: 'copywriting',
    name: 'Copywriting',
    description: 'Specialized in creating marketing copy and content'
  },
  {
    id: 'google-ads',
    name: 'Google Ads',
    description: 'Expert in Google Ads campaign creation and optimization'
  },
  {
    id: 'facebook-ads',
    name: 'Facebook Ads',
    description: 'Specialized in Facebook and Instagram ad campaigns'
  },
  {
    id: 'quiz',
    name: 'Quiz Creator',
    description: 'Creates interactive quizzes for lead generation'
  }
];

export function AgentSelector({
  className,
}: React.ComponentProps<typeof Button>) {
  const selectedAgentId = useChatStore(state => state.selectedAgentId);
  const setSelectedAgent = useChatStore(state => state.setSelectedAgent);

  const selectedAgent = useMemo(
    () => agents.find(agent => agent.id === selectedAgentId) || agents[0],
    [selectedAgentId],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        asChild
        className={cn(
          'w-fit data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
          className,
        )}
      >
        <Button variant="outline" className="md:px-2 md:h-[34px]">
          {selectedAgent?.name}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[300px]">
        {agents.map((agent: Agent) => {
          const { id } = agent;
          const isSelected = id === selectedAgentId;

          return (
            <DropdownMenuItem
              key={id}
              onSelect={() => {
                setSelectedAgent(id as AgentType);
              }}
              className="gap-4 group/item flex flex-row justify-between items-center"
              data-active={isSelected}
            >
              <div className="flex flex-col gap-1 items-start">
                <div>{agent.name}</div>
                <div className="text-xs text-muted-foreground">
                  {agent.description}
                </div>
              </div>

              <div className="text-foreground dark:text-foreground opacity-0 group-data-[active=true]/item:opacity-100">
                <CheckCircleFillIcon />
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
} 