'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { agents } from '@/config/agents';
import { Agent } from '@/types/chat';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AgentSelectorProps {
  selectedAgent: Agent;
  onSelectAgent: (agent: Agent) => void;
}

export function AgentSelector({ selectedAgent, onSelectAgent }: AgentSelectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="h-8 flex items-center gap-2 px-3"
                aria-label="Select an agent"
              >
                <Bot className="h-4 w-4" />
                <span className="text-sm">{selectedAgent.name}</span>
                <ChevronsUpDown className="h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0">
              <Command>
                <CommandInput placeholder="Search agents..." />
                <CommandEmpty>No agent found.</CommandEmpty>
                <CommandGroup>
                  {agents.map((agent) => (
                    <CommandItem
                      key={agent.id}
                      value={agent.id}
                      onSelect={() => {
                        onSelectAgent(agent);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedAgent.id === agent.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {agent.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Select an agent</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
