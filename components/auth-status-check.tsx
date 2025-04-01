'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { historyService } from '@/lib/api/history-service';

/**
 * Component that checks authentication status and offers a reset option
 * This is useful for debugging auth issues
 */
export function AuthStatusCheck() {
    const [isChecking, setIsChecking] = useState(false);
    const [authStatus, setAuthStatus] = useState<any>(null);
    const [showDetails, setShowDetails] = useState(false);

    // Function to check auth status
    const checkAuthStatus = async () => {
        setIsChecking(true);
        try {
            const response = await fetch('/api/auth/debug-session', {
                method: 'GET',
                credentials: 'include',
            });

            if (response.ok) {
                const data = await response.json();
                setAuthStatus(data);

                // Log to console for debugging
                console.log('[AUTH STATUS]', data);

                if (data.authenticated) {
                    toast.success('Authenticated as ' + (data.email || data.userId));

                    // Reset circuit breaker if it's active
                    if (historyService.isInAuthFailure()) {
                        historyService.resetAuthFailure();
                        toast.info('Auth failure circuit breaker has been reset');
                    }
                } else {
                    toast.error('Not authenticated');
                }
            } else {
                toast.error('Failed to check auth status');
            }
        } catch (error) {
            console.error('Auth check error:', error);
            toast.error('Error checking auth status');
        } finally {
            setIsChecking(false);
        }
    };

    // Function to reset auth
    const resetAuth = async () => {
        setIsChecking(true);
        try {
            const response = await fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
            });

            if (response.ok) {
                toast.success('Auth reset successful. Please refresh the page.');

                // Reset circuit breaker
                historyService.resetAuthFailure();

                // Force refresh history data
                await historyService.invalidateCache();

                // Clear the auth status
                setAuthStatus(null);
            } else {
                toast.error('Auth reset failed');
            }
        } catch (error) {
            console.error('Auth reset error:', error);
            toast.error('Error resetting auth');
        } finally {
            setIsChecking(false);
        }
    };

    return (
        <div className="fixed bottom-4 right-4 z-50">
            <div className="flex flex-col gap-2 bg-background border rounded-lg p-3 shadow-lg">
                <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium">
                        {authStatus?.authenticated
                            ? 'Authenticated ✓'
                            : authStatus === null
                                ? 'Auth Status Unknown'
                                : 'Not Authenticated ✗'}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto h-8"
                        onClick={checkAuthStatus}
                        disabled={isChecking}
                    >
                        {isChecking ? (
                            <RefreshCcw className="h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCcw className="h-4 w-4" />
                        )}
                        <span className="sr-only">Check Auth</span>
                    </Button>
                    <Button
                        variant="destructive"
                        size="sm"
                        className="h-8"
                        onClick={resetAuth}
                        disabled={isChecking}
                    >
                        Reset Auth
                    </Button>
                </div>

                {authStatus && (
                    <div className="mt-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs w-full"
                            onClick={() => setShowDetails(!showDetails)}
                        >
                            {showDetails ? 'Hide Details' : 'Show Details'}
                        </Button>

                        {showDetails && (
                            <div className="mt-2 text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                                <pre>{JSON.stringify(authStatus, null, 2)}</pre>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
} 