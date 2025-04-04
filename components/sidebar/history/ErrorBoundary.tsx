'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error; // Store the error object
}

export class ChatHistoryErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: undefined,
    };

    public static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error: error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Log the error using the standardized logger
        edgeLogger.error('[ChatHistoryErrorBoundary] Caught error', {
            category: LOG_CATEGORIES.CHAT, // Or SYSTEM? CHAT seems appropriate
            error: error.message,
            componentStack: errorInfo.componentStack,
            important: true, // Errors caught by boundary are important
        });
    }

    private handleRetry = () => {
        // Attempt to recover by resetting the error state
        // This assumes the error was transient or caused by temporary state
        edgeLogger.info('[ChatHistoryErrorBoundary] Attempting retry', {
            category: LOG_CATEGORIES.CHAT
        });
        this.setState({ hasError: false, error: undefined });
        // Optionally, trigger a refresh action if passed as a prop
    };

    public render() {
        if (this.state.hasError) {
            // You can render any custom fallback UI
            return (
                <div className="p-4 text-center text-sm text-muted-foreground border border-dashed border-destructive/50 rounded-md m-2">
                    <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
                    <h3 className="font-semibold mb-2">Chat History Error</h3>
                    <p className="text-xs mb-4">
                        {this.state.error?.message || 'Sorry, something went wrong while displaying the chat history.'}
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={this.handleRetry}
                        className="flex items-center gap-1 mx-auto"
                    >
                        <RefreshCw className="h-3 w-3" /> Try Again
                    </Button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ChatHistoryErrorBoundary; 