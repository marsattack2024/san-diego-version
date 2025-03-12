'use client';

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
    <div className="flex flex-col space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      </div>
      
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium mb-2">User Accounts</h2>
          <p className="text-3xl font-bold">
            {isLoading ? 'Loading...' : stats?.userCount || 0}
          </p>
          <p className="text-gray-500 mt-1">Total registered users</p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium mb-2">Chat Sessions</h2>
          <p className="text-3xl font-bold">
            {isLoading ? 'Loading...' : stats?.chatCount || 0}
          </p>
          <p className="text-gray-500 mt-1">Total conversations</p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium mb-2">Admin Users</h2>
          <p className="text-3xl font-bold">
            {isLoading ? 'Loading...' : stats?.adminCount || 0}
          </p>
          <p className="text-gray-500 mt-1">Users with admin privileges</p>
        </div>
      </div>
      
      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">Recent Activity</h2>
        </div>
        <div className="p-6">
          {isLoading ? (
            <p>Loading activity data...</p>
          ) : error ? (
            <p className="text-red-500">Error loading activity data</p>
          ) : stats?.recentActivity?.length ? (
            <div className="space-y-4">
              {stats.recentActivity.map((activity: any, index: number) => (
                <div key={index} className="flex items-start pb-4 border-b last:border-0">
                  <div className="flex-1">
                    <p className="font-medium">{activity.user?.email || 'Unknown user'}</p>
                    <p className="text-sm text-gray-500">{activity.content || 'Activity recorded'}</p>
                  </div>
                  <div className="text-sm text-gray-500">
                    {new Date(activity.created_at || Date.now()).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No recent activities to display</p>
          )}
        </div>
      </div>
    </div>
  );
}