'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, RefreshCcw, History, Database, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { historyService } from '@/lib/api/history-service';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

/**
 * Component that checks authentication status and offers a reset option
 * This is useful for debugging auth issues
 */
export function AuthStatusCheck() {
    const [isChecking, setIsChecking] = useState(false);
    const [authStatus, setAuthStatus] = useState<any>(null);
    const [showDetails, setShowDetails] = useState(false);
    const [circuitBreakerInfo, setCircuitBreakerInfo] = useState<any>(null);
    const [historyTestStatus, setHistoryTestStatus] = useState<any>(null);
    const [isTestingHistory, setIsTestingHistory] = useState(false);
    const [directHistoryStatus, setDirectHistoryStatus] = useState<any>(null);
    const [isTestingDirectHistory, setIsTestingDirectHistory] = useState(false);

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

                // Update circuit breaker info
                updateCircuitBreakerInfo();

                if (data.authenticated) {
                    toast.success('Authenticated as ' + (data.email || data.userId));
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

                // Invalidate cache completely
                historyService.invalidateCache();

                // Clear the auth status
                setAuthStatus(null);

                // Update circuit breaker info
                updateCircuitBreakerInfo();
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

    // Function to update circuit breaker info
    const updateCircuitBreakerInfo = () => {
        try {
            const info = historyService.getAuthFailureInfo();
            const isActive = historyService.isInAuthFailure();

            setCircuitBreakerInfo({
                ...info,
                isActive,
                remainingTimeFormatted: info.remainingTime > 0
                    ? `${Math.round(info.remainingTime / 1000)}s`
                    : 'None'
            });
        } catch (error) {
            console.error('Error getting circuit breaker info:', error);
        }
    };

    // Function to reset circuit breaker
    const resetCircuitBreaker = () => {
        try {
            historyService.resetAuthFailure();
            toast.success('Circuit breaker reset');
            updateCircuitBreakerInfo();
        } catch (error) {
            console.error('Error resetting circuit breaker:', error);
            toast.error('Failed to reset circuit breaker');
        }
    };

    // Function to test history API directly
    const testHistoryApi = async () => {
        setIsTestingHistory(true);
        try {
            // Create a timestamp for cache busting
            const timestamp = Date.now();

            // Start timer to measure response time
            const startTime = performance.now();

            // Make the request with credentials to include auth cookies
            const response = await fetch(`/api/history?t=${timestamp}`, {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });

            // Calculate response time
            const responseTime = Math.round(performance.now() - startTime);

            // Get response headers
            const headers: Record<string, string> = {};
            response.headers.forEach((value, key) => {
                headers[key] = value;
            });

            // Parse the response if possible
            let data = null;
            let errorText = null;
            try {
                if (response.ok) {
                    data = await response.json();
                } else {
                    errorText = await response.text();
                }
            } catch (e) {
                errorText = 'Failed to parse response';
            }

            // Set the test result
            setHistoryTestStatus({
                success: response.ok,
                status: response.status,
                statusText: response.statusText,
                responseTime,
                dataCount: Array.isArray(data) ? data.length : null,
                headers: headers,
                timestamp: new Date().toISOString(),
                error: errorText
            });

            // Update circuit breaker info
            updateCircuitBreakerInfo();

            // Show toast with result
            if (response.ok) {
                toast.success(`History API returned ${Array.isArray(data) ? data.length : 0} items`);
            } else {
                toast.error(`History API failed: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.error('History API test error:', error);
            setHistoryTestStatus({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date().toISOString()
            });
            toast.error('Error testing History API');
        } finally {
            setIsTestingHistory(false);
        }
    };

    // Function to test direct history API endpoint (bypasses circuit breaker)
    const testDirectHistoryApi = async () => {
        setIsTestingDirectHistory(true);
        try {
            // Create a timestamp for cache busting
            const timestamp = Date.now();

            // Start timer to measure response time
            const startTime = performance.now();

            // Make the request with credentials to include auth cookies
            const response = await fetch(`/api/debug/history?t=${timestamp}`, {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });

            // Calculate response time
            const responseTime = Math.round(performance.now() - startTime);

            // Parse the response if possible
            let data = null;
            let debugInfo = null;
            let errorText = null;

            try {
                if (response.ok) {
                    const json = await response.json();
                    data = json.data;
                    debugInfo = json.debug;
                } else {
                    errorText = await response.text();
                }
            } catch (e) {
                errorText = 'Failed to parse response';
            }

            // Set the test result
            setDirectHistoryStatus({
                success: response.ok,
                status: response.status,
                statusText: response.statusText,
                responseTime,
                dataCount: Array.isArray(data) ? data.length : null,
                debugInfo,
                timestamp: new Date().toISOString(),
                error: errorText
            });

            // Show toast with result
            if (response.ok) {
                toast.success(`Direct History API returned ${Array.isArray(data) ? data.length : 0} items`);
            } else {
                toast.error(`Direct History API failed: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.error('Direct History API test error:', error);
            setDirectHistoryStatus({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date().toISOString()
            });
            toast.error('Error testing Direct History API');
        } finally {
            setIsTestingDirectHistory(false);
        }
    };

    // Initialize on mount
    useEffect(() => {
        updateCircuitBreakerInfo();
        // Don't auto-check auth status to avoid extra requests
    }, []);

    return (
        <div className="fixed bottom-4 right-4 z-50">
            <div className="flex flex-col gap-2 bg-background border rounded-lg p-3 shadow-lg max-w-md">
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
                        <span className="ml-1">Check</span>
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

                <Separator />

                <div className="flex items-center gap-2">
                    <Power className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium">Circuit Breaker</span>
                    <Badge variant={circuitBreakerInfo?.isActive ? "destructive" : "outline"}>
                        {circuitBreakerInfo?.isActive ? "ACTIVE" : "Inactive"}
                    </Badge>
                    <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto h-8"
                        onClick={resetCircuitBreaker}
                        disabled={isChecking}
                    >
                        Reset Breaker
                    </Button>
                </div>

                {circuitBreakerInfo && (
                    <div className="text-xs text-muted-foreground">
                        <div>Failures: {circuitBreakerInfo.failureCount}</div>
                        <div>Cooldown: {circuitBreakerInfo.remainingTimeFormatted}</div>
                    </div>
                )}

                <div className="flex items-center gap-2 mt-1">
                    <History className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium">History API</span>
                    {historyTestStatus && (
                        <Badge
                            variant={historyTestStatus.success ? "secondary" : "destructive"}
                            className={historyTestStatus.success ? "bg-green-500" : ""}
                        >
                            {historyTestStatus.success
                                ? `${historyTestStatus.status} OK`
                                : `${historyTestStatus.status || 'ERROR'}`}
                        </Badge>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto h-8"
                        onClick={testHistoryApi}
                        disabled={isTestingHistory}
                    >
                        {isTestingHistory ? (
                            <RefreshCcw className="h-4 w-4 animate-spin" />
                        ) : (
                            <Database className="h-4 w-4" />
                        )}
                        <span className="ml-1">Test API</span>
                    </Button>
                </div>

                {historyTestStatus && (
                    <div className="text-xs text-muted-foreground">
                        {historyTestStatus.success ? (
                            <div>Fetched {historyTestStatus.dataCount} items in {historyTestStatus.responseTime}ms</div>
                        ) : (
                            <div className="text-red-500">{historyTestStatus.error || `Error ${historyTestStatus.status}`}</div>
                        )}
                    </div>
                )}

                {/* Direct history API test button */}
                <div className="flex items-center gap-2 mt-1">
                    <AlertCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">Direct API</span>
                    {directHistoryStatus && (
                        <Badge
                            variant={directHistoryStatus.success ? "secondary" : "destructive"}
                            className={directHistoryStatus.success ? "bg-green-500" : ""}
                        >
                            {directHistoryStatus.success
                                ? `${directHistoryStatus.status} OK`
                                : `${directHistoryStatus.status || 'ERROR'}`}
                        </Badge>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto h-8"
                        onClick={testDirectHistoryApi}
                        disabled={isTestingDirectHistory}
                    >
                        {isTestingDirectHistory ? (
                            <RefreshCcw className="h-4 w-4 animate-spin" />
                        ) : (
                            <Database className="h-4 w-4" />
                        )}
                        <span className="ml-1">Direct API</span>
                    </Button>
                </div>

                {directHistoryStatus && (
                    <div className="text-xs text-muted-foreground">
                        {directHistoryStatus.success ? (
                            <div>Direct: {directHistoryStatus.dataCount} items in {directHistoryStatus.responseTime}ms</div>
                        ) : (
                            <div className="text-red-500">{directHistoryStatus.error || `Error ${directHistoryStatus.status}`}</div>
                        )}
                    </div>
                )}

                <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs w-full mt-1"
                    onClick={() => setShowDetails(!showDetails)}
                >
                    {showDetails ? 'Hide Details' : 'Show Details'}
                </Button>

                {showDetails && (
                    <div className="mt-2 text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                        {authStatus && (
                            <>
                                <div className="font-semibold mb-1">Auth Status:</div>
                                <pre className="text-[10px]">{JSON.stringify(authStatus, null, 2)}</pre>
                            </>
                        )}

                        {circuitBreakerInfo && (
                            <>
                                <div className="font-semibold mt-2 mb-1">Circuit Breaker:</div>
                                <pre className="text-[10px]">{JSON.stringify(circuitBreakerInfo, null, 2)}</pre>
                            </>
                        )}

                        {historyTestStatus && (
                            <>
                                <div className="font-semibold mt-2 mb-1">History API Test:</div>
                                <pre className="text-[10px]">{JSON.stringify(historyTestStatus, null, 2)}</pre>
                            </>
                        )}

                        {directHistoryStatus && (
                            <>
                                <div className="font-semibold mt-2 mb-1">Direct History API Test:</div>
                                <pre className="text-[10px]">{JSON.stringify(directHistoryStatus, null, 2)}</pre>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
} 