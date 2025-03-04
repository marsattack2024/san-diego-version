'use client';

import { Search } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DeepSearchToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export function DeepSearchToggle({ enabled, onToggle }: DeepSearchToggleProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={enabled ? "default" : "outline"}
            size="sm"
            className={cn(
              "gap-2",
              enabled ? "bg-primary text-primary-foreground" : "bg-background text-foreground"
            )}
            onClick={() => onToggle(!enabled)}
            aria-label={enabled ? "Disable deep search" : "Enable deep search"}
          >
            <Search className="h-4 w-4" />
            <span>DeepSearch</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{enabled ? 'Deep search enabled' : 'Deep search disabled'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
} 