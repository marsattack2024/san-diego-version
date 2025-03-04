'use client';

import { AlertCircle, RefreshCw, XCircle, AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ErrorState } from '@/lib/error-utils';

interface ErrorDisplayProps {
  error: ErrorState;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorDisplay({
  error,
  onRetry,
  onDismiss,
  className = ''
}: ErrorDisplayProps) {
  // Choose icon based on error type
  const IconComponent = () => {
    switch (error.type) {
      case 'network':
        return <AlertTriangle className="h-4 w-4" />;
      case 'rate_limit':
        return <Info className="h-4 w-4" />;
      case 'server':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <XCircle className="h-4 w-4" />;
    }
  };
  
  // Choose variant based on error type
  const getVariant = () => {
    switch (error.type) {
      case 'network':
      case 'rate_limit':
        return 'default';
      case 'server':
      case 'auth':
        return 'destructive';
      default:
        return 'destructive';
    }
  };

  return (
    <Alert variant={getVariant()} className={`my-4 ${className}`}>
      <IconComponent />
      <AlertTitle>
        {error.type === 'network' ? 'Connection Error' : 
         error.type === 'rate_limit' ? 'Too Many Requests' :
         error.type === 'server' ? 'Server Error' :
         error.type === 'auth' ? 'Authentication Error' :
         error.type === 'validation' ? 'Invalid Input' : 'Error'}
      </AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>{error.message}</span>
        <div className="flex space-x-2">
          {error.retryable && onRetry && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onRetry}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          )}
          {onDismiss && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onDismiss}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Dismiss
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
} 