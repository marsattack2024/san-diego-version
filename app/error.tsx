'use client';

import { useEffect } from 'react';
import { createLogger } from '@/utils/client-logger';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

const logger = createLogger('app:global-error');

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error when it occurs
    logger.error({
      errorMessage: error.message,
      errorName: error.name,
      errorStack: error.stack,
      errorDigest: error.digest,
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : undefined
    }, 'Global application error');
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-md">
        <div className="flex items-center justify-center mb-6">
          <AlertCircle className="h-12 w-12 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-4">
          Something went wrong
        </h1>
        <p className="text-gray-600 text-center mb-6">
          We apologize for the inconvenience. The application encountered an unexpected error.
        </p>
        <div className="text-sm text-gray-500 bg-gray-50 p-4 rounded mb-6 overflow-auto max-h-32">
          {error.message || 'An unknown error occurred'}
        </div>
        <div className="flex justify-center">
          <Button 
            onClick={reset}
            className="flex items-center justify-center"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-6">
          If the problem persists, please contact support.
        </p>
      </div>
    </div>
  );
} 