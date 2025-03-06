'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { agents } from '@/lib/ai/agents';
import { cn } from '@/lib/utils';
import { CheckCircleFillIcon, ChevronDownIcon } from './icons';
import { useChatStore } from '@/stores/chat-store';
import { type AgentType } from '@/lib/agents/prompts';

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
        {agents.map((agent) => {
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