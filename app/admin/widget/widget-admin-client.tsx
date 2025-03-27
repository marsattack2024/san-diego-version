'use client';

import React, { useState, useEffect } from 'react';

export default function WidgetAdminClient() {
    const [timestamp, setTimestamp] = useState(new Date().toISOString());
    const [apiTestResult, setApiTestResult] = useState<any>(null);
    const [apiTestError, setApiTestError] = useState<string | null>(null);

    // Add a diagnostic API call test
    useEffect(() => {
        async function testAdminApi() {
            try {
                console.log('[Widget Admin] Testing admin API access...');
                const response = await fetch('/api/admin/dashboard');

                const headers: Record<string, string> = {};
                response.headers.forEach((value, key) => {
                    headers[key] = value;
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('[Widget Admin] API test failed:', {
                        status: response.status,
                        statusText: response.statusText,
                        headers,
                        error: errorText
                    });
                    setApiTestError(`${response.status}: ${response.statusText}`);
                    return;
                }

                const data = await response.json();
                console.log('[Widget Admin] API test succeeded:', {
                    status: response.status,
                    headers,
                    data: typeof data === 'object' ? 'Data received' : data
                });

                setApiTestResult({
                    status: response.status,
                    success: true,
                    receivedData: !!data
                });
            } catch (error) {
                console.error('[Widget Admin] API test error:', error);
                setApiTestError(error instanceof Error ? error.message : String(error));
            }
        }

        // Run API test on component mount
        testAdminApi();
    }, []);

    // Enhanced logging to help debug production issues
    useEffect(() => {
        console.log('--- WidgetAdminClient: Component mounted', {
            environment: process.env.NODE_ENV,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            pathname: window.location.pathname
        });

        // Log when component unmounts
        return () => {
            console.log('--- WidgetAdminClient: Component unmounted');
        };
    }, []);

    return (
        <>
            {/* API Test Results */}
            <div className="border rounded-md p-4 bg-yellow-50">
                <h3 className="font-medium mb-2">Admin API Test Results</h3>
                {apiTestError ? (
                    <div className="text-red-600 text-sm">
                        <p>Error: {apiTestError}</p>
                        <p className="mt-1">This indicates there may be an issue with the API endpoint.</p>
                    </div>
                ) : apiTestResult ? (
                    <div className="text-green-600 text-sm">
                        <p>Success! API responded with status: {apiTestResult.status}</p>
                        <p className="mt-1">The admin API access is working correctly.</p>
                    </div>
                ) : (
                    <p className="text-gray-500 text-sm">Testing API access...</p>
                )}
            </div>

            <div className="border rounded-md p-4 bg-slate-50">
                <p><strong>Current Time:</strong> {timestamp}</p>
                <p><strong>NODE_ENV:</strong> {process.env.NODE_ENV}</p>
                <p><strong>Pathname:</strong> {window.location.pathname}</p>
                <p><strong>Server Authentication:</strong> <span className="text-green-600">✓ Verified</span></p>
                <p><strong>Admin Status:</strong> <span className="text-green-600">✓ Confirmed</span></p>
                <button
                    className="px-4 py-2 mt-2 bg-blue-500 text-white rounded-md"
                    onClick={() => {
                        console.log('Update timestamp clicked in widget admin client');
                        setTimestamp(new Date().toISOString());
                    }}
                >
                    Update Timestamp
                </button>
            </div>
        </>
    );
} 