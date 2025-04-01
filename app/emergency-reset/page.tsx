'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { historyService } from '@/lib/api/history-service';

/**
 * Emergency Reset Page
 * 
 * This page is designed as a last resort for when the UI is completely frozen
 * or the application is in an unrecoverable state. It provides simple controls
 * to reset different aspects of the application state.
 */
export default function EmergencyResetPage() {
    const [message, setMessage] = useState('');
    const [isResetting, setIsResetting] = useState(false);

    // Function to reset all state
    const resetAll = async () => {
        setIsResetting(true);
        setMessage('Resetting application state...');

        try {
            // 1. Reset circuit breaker and auth failure state
            historyService.invalidateCache();

            // 2. Clear localStorage
            if (typeof window !== 'undefined') {
                localStorage.clear();
                sessionStorage.clear();
            }

            // 3. Clear cookies
            try {
                const cookies = document.cookie.split(';');

                for (let i = 0; i < cookies.length; i++) {
                    const cookie = cookies[i];
                    const eqPos = cookie.indexOf('=');
                    const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
                    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
                }

                setMessage('All cookies cleared.');
            } catch (e) {
                setMessage('Failed to clear cookies: ' + (e instanceof Error ? e.message : String(e)));
            }

            // 4. Make a logout API call to reset auth on server
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                setMessage(prev => prev + ' Logged out successfully.');
            } catch (e) {
                setMessage(prev => prev + ' Failed to logout: ' + (e instanceof Error ? e.message : String(e)));
            }

            // 5. Show success message with redirect countdown
            setMessage('Reset complete! Redirecting to login in 3 seconds...');

            // 6. Redirect to login page
            setTimeout(() => {
                window.location.href = '/login';
            }, 3000);
        } catch (error) {
            setMessage('Error during reset: ' + (error instanceof Error ? error.message : String(error)));
            setIsResetting(false);
        }
    };

    // Function to only reset circuit breaker
    const resetCircuitBreaker = () => {
        try {
            historyService.resetAuthFailure();
            historyService.invalidateCache();
            setMessage('Circuit breaker reset successfully. Refresh the page to continue.');
        } catch (e) {
            setMessage('Failed to reset circuit breaker: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    // Function to hard refresh the page
    const hardRefresh = () => {
        setMessage('Hard refreshing...');
        if (typeof window !== 'undefined') {
            window.location.href = window.location.href;
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="bg-red-500 text-white">
                    <CardTitle>Emergency Application Reset</CardTitle>
                    <CardDescription className="text-white opacity-90">
                        Use these options to recover from a frozen UI or authentication issues
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                    <div className="text-sm mb-4">
                        <p className="font-bold mb-2">Warning: These actions will reset application state!</p>
                        <p>If the application is completely frozen, try these options in order:</p>
                        <ol className="list-decimal pl-5 space-y-1 mt-2">
                            <li>Hard Refresh (safest option)</li>
                            <li>Reset Circuit Breaker (keeps you logged in)</li>
                            <li>Complete Reset (logs you out, clears all data)</li>
                        </ol>
                    </div>

                    {message && (
                        <div className="p-3 bg-slate-100 rounded text-sm">
                            {message}
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex flex-col space-y-2">
                    <Button
                        onClick={hardRefresh}
                        variant="outline"
                        className="w-full"
                        disabled={isResetting}
                    >
                        Hard Refresh
                    </Button>
                    <Button
                        onClick={resetCircuitBreaker}
                        variant="secondary"
                        className="w-full"
                        disabled={isResetting}
                    >
                        Reset Circuit Breaker Only
                    </Button>
                    <Button
                        onClick={resetAll}
                        variant="destructive"
                        className="w-full"
                        disabled={isResetting}
                    >
                        Complete Reset (Log Out)
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
} 