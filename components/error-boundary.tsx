'use client';

import React from 'react';
import { createLogger } from '@/utils/client-logger';

const logger = createLogger('components:error-boundary');

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  componentName?: string;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

/**
 * Error boundary component to catch and log errors in React components
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { 
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { 
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const { componentName } = this.props;
    
    // Create structured log entry
    logger.error({
      componentName: componentName || 'unknown',
      errorMessage: error.message,
      errorName: error.name,
      errorStack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString()
    }, `Error in component ${componentName || 'unknown'}`);
  }

  render() {
    const { hasError, error } = this.state;
    const { children, fallback, componentName } = this.props;
    
    if (hasError) {
      // Use custom fallback or default error UI
      if (fallback) {
        return fallback;
      }
      
      return (
        <div className="p-4 border border-red-300 bg-red-50 rounded-md">
          <h2 className="text-lg font-semibold text-red-800">
            Something went wrong in {componentName || 'this component'}
          </h2>
          <p className="text-sm text-red-600 mt-2">
            {error?.message || 'An unexpected error occurred'}
          </p>
          <button
            className="mt-3 px-3 py-1 text-sm bg-red-100 hover:bg-red-200 text-red-800 rounded"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      );
    }

    return children;
  }
} 