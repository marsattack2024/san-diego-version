'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';

// Create context for user and profile data with defaults
const AuthContext = createContext({
  user: null as any,
  profile: null as any,
  isLoading: true,
  isAuthenticated: false,
  isAdmin: false,
});

// Export hook for accessing auth data
export const useAuth = () => useContext(AuthContext);

// Provider component to wrap app with
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const {
    user,
    profile,
    isAuthenticated,
    isAdmin,
    checkAuth,
    shouldRefreshAuth,
    checkAdminRole,
  } = useAuthStore();

  // Check authentication on component mount
  useEffect(() => {
    const initAuth = async () => {
      if (shouldRefreshAuth()) {
        await checkAuth();
        // Check admin status during initial auth
        await checkAdminRole();
        console.log('Initial auth complete, admin status:', isAdmin);
      }
      setIsLoading(false);
    };

    initAuth();
  }, [checkAuth, shouldRefreshAuth, checkAdminRole, isAdmin]);

  // Log admin status changes
  useEffect(() => {
    console.log('Auth context: Admin status is now', isAdmin);
  }, [isAdmin]);

  // Re-check auth periodically if necessary
  useEffect(() => {
    // Only set up interval if the user is authenticated
    if (!isAuthenticated) return;

    // Check auth every 60 minutes for long-lived sessions
    const intervalId = setInterval(() => {
      if (shouldRefreshAuth()) {
        checkAuth();
        checkAdminRole();
      }
    }, 60 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [isAuthenticated, checkAuth, shouldRefreshAuth, checkAdminRole]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        isAuthenticated,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
} 