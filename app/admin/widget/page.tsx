'use client';

// Force dynamic rendering for proper authentication
export const dynamic = "force-dynamic";

import React, { useState, useEffect } from 'react';

export default function SimpleAdminWidgetPage() {
  const [timestamp, setTimestamp] = useState(new Date().toISOString());
  
  // Enhanced logging to help debug production issues
  useEffect(() => {
    console.log('--- SimpleAdminWidgetPage: Component mounted', {
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : 'server-side',
    });
    
    // Log when component unmounts
    return () => {
      console.log('--- SimpleAdminWidgetPage: Component unmounted');
    };
  }, []);

  return (
    <div className="space-y-6 p-6 border rounded-md">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Widget Page - Minimal Test</h1>
        <p className="text-sm text-muted-foreground mt-2">
          If you see this, the basic page routing and build worked.
        </p>
      </div>
      
      <div className="border rounded-md p-4 bg-slate-50">
        <p><strong>Current Time:</strong> {timestamp}</p>
        <p><strong>NODE_ENV:</strong> {process.env.NODE_ENV}</p>
        <button 
          className="px-4 py-2 mt-2 bg-blue-500 text-white rounded-md"
          onClick={() => setTimestamp(new Date().toISOString())}
        >
          Update Timestamp
        </button>
      </div>
    </div>
  );
} 