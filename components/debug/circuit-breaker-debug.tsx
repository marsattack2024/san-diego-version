'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { historyService } from '@/lib/api/history-service';

/**
 * CircuitBreakerDebug - Development-only component for monitoring circuit breaker status
 * This component allows developers to view and control the circuit breaker state
 * Only visible in development mode
 * 
 * @param inline - If true, displays as an inline element in the header instead of a floating card
 */
export function CircuitBreakerDebug({ inline = false }: { inline?: boolean }) {
    // Only show in development mode
    if (process.env.NODE_ENV === 'production') {
        return null;
    }

    const [circuitState, setCircuitState] = useState<{
        state: 'Closed' | 'Open' | 'HalfOpen' | 'Isolated',
        failureCount: number,
        lastAttempt: Date | null,
        lastSuccess: Date | null
    }>({
        state: 'Closed',
        failureCount: 0,
        lastAttempt: null,
        lastSuccess: null
    });

    // State for collapsing/expanding the card
    const [isCollapsed, setIsCollapsed] = useState(true);

    // Update circuit state every second
    useEffect(() => {
        const updateState = () => {
            try {
                const state = historyService.getCircuitState();
                setCircuitState(state);
            } catch (error) {
                console.error('Error updating circuit breaker state:', error);
            }
        };

        // Update immediately
        updateState();

        // Then update every second
        const intervalId = setInterval(updateState, 1000);
        return () => clearInterval(intervalId);
    }, []);

    // Calculate time since last attempt
    const timeSinceLastAttempt = circuitState.lastAttempt
        ? Math.floor((Date.now() - circuitState.lastAttempt.getTime()) / 1000)
        : null;

    // Calculate time since last success
    const timeSinceLastSuccess = circuitState.lastSuccess
        ? Math.floor((Date.now() - circuitState.lastSuccess.getTime()) / 1000)
        : null;

    // Get badge color based on state
    const getBadgeColor = () => {
        switch (circuitState.state) {
            case 'Closed': return 'bg-green-500';
            case 'Open': return 'bg-red-500';
            case 'HalfOpen': return 'bg-yellow-500';
            case 'Isolated': return 'bg-purple-500';
            default: return 'bg-gray-500';
        }
    };

    // Handle manual reset
    const handleReset = () => {
        historyService.resetCircuitBreaker();
    };

    // Handle manual isolation
    const handleIsolate = () => {
        historyService.isolateCircuitBreaker();
    };

    // If inline mode is enabled, render a simple badge with a tooltip-style popup
    if (inline) {
        return (
            <div className="relative">
                <Badge
                    className={`${getBadgeColor()} text-white cursor-pointer`}
                    onClick={() => setIsCollapsed(!isCollapsed)}
                >
                    CB: {circuitState.state}
                </Badge>

                {!isCollapsed && (
                    <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-white rounded-md shadow-lg border border-gray-200">
                        <div className="p-2 text-xs">
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span>Status:</span>
                                    <span className="font-semibold">{circuitState.state}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Failure Count:</span>
                                    <span className="font-semibold">{circuitState.failureCount}</span>
                                </div>
                            </div>
                        </div>
                        <div className="border-t border-gray-200 p-2 flex justify-between">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleReset}
                                className="text-xs"
                            >
                                Reset
                            </Button>
                            <Button
                                size="sm"
                                variant="destructive"
                                onClick={handleIsolate}
                                className="text-xs"
                            >
                                Isolate
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Otherwise render the floating card version
    return (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm opacity-90 hover:opacity-100 transition-opacity">
            <Card className="shadow-lg border border-gray-300">
                <CardHeader className="py-2 cursor-pointer" onClick={() => setIsCollapsed(!isCollapsed)}>
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-sm">Circuit Breaker</CardTitle>
                        <Badge className={`${getBadgeColor()} text-white`}>
                            {circuitState.state}
                        </Badge>
                    </div>
                </CardHeader>

                {!isCollapsed && (
                    <>
                        <CardContent className="py-2 text-xs">
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span>Status:</span>
                                    <span className="font-semibold">{circuitState.state}</span>
                                </div>

                                <div className="flex justify-between">
                                    <span>Failure Count:</span>
                                    <span className="font-semibold">{circuitState.failureCount}</span>
                                </div>

                                {timeSinceLastAttempt !== null && (
                                    <div className="flex justify-between">
                                        <span>Last Attempt:</span>
                                        <span className="font-semibold">{timeSinceLastAttempt}s ago</span>
                                    </div>
                                )}

                                {timeSinceLastSuccess !== null && (
                                    <div className="flex justify-between">
                                        <span>Last Success:</span>
                                        <span className="font-semibold">{timeSinceLastSuccess}s ago</span>
                                    </div>
                                )}
                            </div>
                        </CardContent>

                        <CardFooter className="py-2 flex justify-between">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleReset}
                                className="text-xs"
                            >
                                Reset
                            </Button>
                            <Button
                                size="sm"
                                variant="destructive"
                                onClick={handleIsolate}
                                className="text-xs"
                            >
                                Isolate
                            </Button>
                        </CardFooter>
                    </>
                )}
            </Card>
        </div>
    );
} 