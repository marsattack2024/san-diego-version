'use client';

// Force dynamic rendering for all admin pages
export const dynamic = "force-dynamic";

import { useState, useEffect } from 'react';

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
          <p className="text-gray-500 mt-1 text-sm md:text-base">Users with Admin Privileges</p>
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
                  <div className="text-xs text-gray-400">
                    {new Date(activity.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-2 text-center text-gray-500">No recent activity</div>
          )}
        </div>
      </div>
    </div>
  );
}