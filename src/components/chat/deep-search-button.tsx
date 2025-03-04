import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { createLogger } from '@/utils/client-logger';
import { businessEvents } from '@/utils/client-logger';
import { getUserId } from '@/utils/user-id';

// Create a logger for this component
const log = createLogger('components:deep-search-button');

interface DeepSearchButtonProps {
  query: string;
  onSearchComplete: (results: any) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * DeepSearch button component
 * Triggers a deep search using the Perplexity API
 */
export function DeepSearchButton({
  query,
  onSearchComplete,
  disabled = false,
  className = '',
}: DeepSearchButtonProps) {
  const [isSearching, setIsSearching] = useState(false);

  const handleClick = async () => {
    // Don't search if query is empty or already searching
    if (!query.trim() || isSearching) {
      log.debug('Search skipped', { 
        reason: !query.trim() ? 'empty query' : 'already searching',
        queryLength: query.length
      });
      return;
    }

    const startTime = performance.now();
    setIsSearching(true);
    
    log.debug('Deep search button clicked', { 
      query, 
      queryLength: query.length,
      timestamp: new Date().toISOString()
    });

    try {
      const response = await fetch('/api/deep-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(`Search failed with status: ${response.status}`);
      }

      const results = await response.json();
      const duration = performance.now() - startTime;
      
      // Log business event for deep search
      businessEvents.deepSearchPerformed(
        // Use the centralized getUserId function
        getUserId(),
        query,
        results.length || 0
      );
      
      log.info('Deep search completed', { 
        duration: Math.round(duration),
        success: true,
        query,
        queryLength: query.length,
        resultCount: results.length || 0
      });

      onSearchComplete(results);
    } catch (error) {
      const duration = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      log.error('Deep search failed', {
        duration: Math.round(duration),
        error: errorMessage,
        errorObject: error,
        query,
        queryLength: query.length
      });
      
      // Still log the business event, but with 0 results
      businessEvents.deepSearchPerformed(
        // Use the centralized getUserId function
        getUserId(),
        query,
        0
      );
      
      onSearchComplete({ error: errorMessage });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleClick}
      disabled={disabled || isSearching}
      className={className}
      data-testid="deep-search-button"
    >
      {isSearching ? (
        <span className="animate-spin">
          <Search className="h-4 w-4" />
        </span>
      ) : (
        <Search className="h-4 w-4" />
      )}
    </Button>
  );
} 