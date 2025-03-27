'use client';

import React, { useState, useEffect } from 'react';
import { toast } from '@/components/toast';

// Force dynamic rendering for this admin page
export const dynamic = "force-dynamic";

export default function AdminWidgetPage() {
  const [timestamp, setTimestamp] = useState(new Date().toISOString());
  const [isLoading, setIsLoading] = useState(true);
  const [apiTestResult, setApiTestResult] = useState<any>(null);
  const [apiTestError, setApiTestError] = useState<string | null>(null);
  const [adminStatus, setAdminStatus] = useState<boolean | null>(null);

  // Fetch admin status and test API access
  useEffect(() => {
    const fetchAdminData = async () => {
      setIsLoading(true);
      try {
        console.log("Widget page - Testing admin API access");
        const response = await fetch('/api/admin/dashboard');

        // Get detailed error information if available
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error("Widget page - API test failed:", errorData);

          setApiTestError(`Error ${response.status}: ${response.statusText}`);
          setAdminStatus(false);
          return;
        }

        const data = await response.json();
        console.log("Widget page - Admin API test successful");

        setApiTestResult({
          status: response.status,
          success: true
        });
        setAdminStatus(true);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to test admin access';
        setApiTestError(errorMessage);
        console.error('Error testing admin access:', errorMessage);
        setAdminStatus(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAdminData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-lg font-medium">Loading admin panel...</p>
          <p className="text-sm text-muted-foreground">Verifying admin permissions</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 border rounded-md">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Widget Page</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Configure and manage your chat widget
        </p>
      </div>

      {/* API Test Results */}
      <div className="border rounded-md p-4 bg-yellow-50">
        <h3 className="font-medium mb-2">Admin API Test Results</h3>
        {apiTestError ? (
          <div className="text-red-600 text-sm">
            <p>Error: {apiTestError}</p>
            <p className="mt-1">This may indicate an issue with admin permissions.</p>
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
        <p><strong>Environment:</strong> {process.env.NODE_ENV}</p>
        <p><strong>Admin Status:</strong> {adminStatus ? 'Yes' : 'No'}</p>
        <button
          className="px-4 py-2 mt-2 bg-blue-500 text-white rounded-md"
          onClick={() => {
            console.log('Update timestamp clicked in widget page');
            setTimestamp(new Date().toISOString());
            toast({
              title: "Timestamp updated",
              description: "Current time has been refreshed."
            });
          }}
        >
          Update Timestamp
        </button>
      </div>
    </div>
  );
} 