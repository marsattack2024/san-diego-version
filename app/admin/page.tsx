'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// Widget diagnostics component
function WidgetDiagnostics() {
  const [diagnosticData, setDiagnosticData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch widget diagnostic data
  useEffect(() => {
    async function checkWidgetAccess() {
      try {
        setIsLoading(true);
        const response = await fetch('/api/admin/debug');

        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        setDiagnosticData(data);
        setError(null);
      } catch (err) {
        console.error('Error checking widget access:', err);
        setError(err instanceof Error ? err.message : 'Failed to check widget access');
      } finally {
        setIsLoading(false);
      }
    }

    checkWidgetAccess();
  }, []);

  if (isLoading) {
    return (
      <div className="p-4 border rounded-md bg-gray-50">
        <p className="text-sm">Checking widget access permissions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-red-300 rounded-md bg-red-50">
        <p className="text-sm font-medium text-red-800">Error checking widget access: {error}</p>
      </div>
    );
  }

  const canAccessWidget = diagnosticData?.adminAccess?.isAdmin === true;

  return (
    <div className="p-4 border rounded-md bg-white">
      <h3 className="text-lg font-medium mb-2">Chat Widget Status</h3>

      <div className="space-y-2 mb-3">
        <p className="text-sm">
          <span className="font-medium">Admin Status:</span>{' '}
          {canAccessWidget ? (
            <span className="text-green-600">✓ You have admin access</span>
          ) : (
            <span className="text-red-600">✗ You don't have admin privileges</span>
          )}
        </p>

        {diagnosticData?.sessionInfo?.hasSessionCookie ? (
          <p className="text-sm text-green-600">✓ Session cookie detected</p>
        ) : (
          <p className="text-sm text-red-600">✗ No session cookie found</p>
        )}
      </div>

      <div className="pt-2 border-t">
        <Link
          href="/admin/widget"
          className="block w-full py-2 px-4 bg-blue-100 hover:bg-blue-200 text-blue-800 text-center rounded-md transition-colors"
        >
          Go to Widget Admin Page
        </Link>
        <p className="text-xs text-gray-500 mt-1 text-center">
          Click to diagnose if the widget page is accessible
        </p>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  // State for dashboard stats
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch dashboard stats
  useEffect(() => {
    const fetchDashboardStats = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/admin/dashboard');
        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        setStats(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch dashboard stats'));
        console.error('Error fetching dashboard stats:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardStats();
  }, []);

  return (
    <div className="flex flex-col space-y-4 md:space-y-6 px-2 sm:px-0">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
      </div>

      {/* Widget Diagnostics Component */}
      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold text-yellow-800 mb-2">Troubleshooting Widget Page</h2>
        <p className="text-sm text-yellow-700 mb-4">
          If you're having trouble accessing the widget admin page, use this diagnostic tool:
        </p>
        <WidgetDiagnostics />
      </div>

      {/* Stats Overview - Enhanced responsive grid with better spacing */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <h2 className="text-base md:text-lg font-medium mb-2">User Accounts</h2>
          <p className="text-2xl md:text-3xl font-bold">
            {isLoading ? 'Loading...' : stats?.userCount || 0}
          </p>
          <p className="text-gray-500 mt-1 text-sm md:text-base">Total registered users</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <h2 className="text-base md:text-lg font-medium mb-2">Chat Sessions</h2>
          <p className="text-2xl md:text-3xl font-bold">
            {isLoading ? 'Loading...' : stats?.chatCount || 0}
          </p>
          <p className="text-gray-500 mt-1 text-sm md:text-base">Total conversations</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4 md:p-6 sm:col-span-2 md:col-span-1">
          <h2 className="text-base md:text-lg font-medium mb-2">Admin Users</h2>
          <p className="text-2xl md:text-3xl font-bold">
            {isLoading ? 'Loading...' : stats?.adminCount || 0}
          </p>
          <p className="text-gray-500 mt-1 text-sm md:text-base">Users with admin privileges</p>
        </div>
      </div>

      {/* Recent Activity - Enhanced mobile optimization */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 md:px-6 py-3 md:py-4 border-b">
          <h2 className="text-lg md:text-xl font-semibold">Recent Activity</h2>
        </div>
        <div className="p-3 md:p-6">
          {isLoading ? (
            <div className="py-2 text-center">Loading activity data...</div>
          ) : error ? (
            <div className="py-2 text-center text-red-500">Error loading activity data</div>
          ) : stats?.recentActivity?.length ? (
            <div className="space-y-3">
              {stats.recentActivity.map((activity: any, index: number) => (
                <div
                  key={index}
                  className="flex flex-col sm:flex-row sm:items-start pb-3 border-b last:border-0"
                >
                  <div className="flex-1 mb-2 sm:mb-0 min-w-0">
                    <p className="font-medium text-sm md:text-base truncate">{activity.user?.email || 'Unknown user'}</p>
                    <p className="text-xs md:text-sm text-gray-500 line-clamp-2">{activity.content || 'Activity recorded'}</p>
                  </div>
                  <div className="text-xs md:text-sm text-gray-500 sm:ml-4 sm:shrink-0">
                    {new Date(activity.created_at || Date.now()).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-2 text-center text-sm md:text-base">No recent activities to display</div>
          )}
        </div>
      </div>
    </div>
  );
}