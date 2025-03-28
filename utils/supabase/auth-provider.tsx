'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';

// Create context for user and profile data with defaults
const AuthContext = createContext({
  user: null as any,
  profile: null as any,
  isLoading: true,
  isAuthenticated: false,
  isAdmin: false,
  refreshAdminStatus: async (): Promise<boolean> => false,
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

  // Function to explicitly refresh admin status - memoized to avoid recreating function
  const refreshAdminStatus = useCallback(async () => {
    console.log('Explicitly refreshing admin status');
    try {
      const result = await checkAdminRole();
      console.log('Admin status refresh result:', result);
      return result;
    } catch (error) {
      console.error('Error refreshing admin status:', error);
      return false;
    }
  }, [checkAdminRole]);

  // Check authentication on component mount
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        console.log('Initializing authentication...');
        if (shouldRefreshAuth()) {
          await checkAuth();

          // Ensure admin status is always checked during initial auth
          // but don't wait for it to complete rendering
          checkAdminRole().then(adminStatus => {
            if (mounted) {
              console.log('Initial auth complete, admin status:', adminStatus);
            }
          });
        } else {
          console.log('Using cached auth state, admin status:', isAdmin);
        }
      } catch (error) {
        console.error('Error during auth initialization:', error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initAuth();

    return () => {
      mounted = false;
    };
  }, [checkAuth, shouldRefreshAuth, checkAdminRole, isAdmin]);

  // Re-check auth periodically if necessary
  useEffect(() => {
    // Only set up interval if the user is authenticated
    if (!isAuthenticated) return;

    // Check auth every 15 minutes (reduced from 30 for better responsiveness)
    const intervalId = setInterval(() => {
      if (shouldRefreshAuth()) {
        console.log('Performing periodic auth check');
        // Don't wait for admin check to complete
        checkAuth().then(() => {
          checkAdminRole().catch(err => {
            console.error('Periodic admin check error:', err);
          });
        });
      }
    }, 15 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [isAuthenticated, checkAuth, shouldRefreshAuth, checkAdminRole]);

  // Debug changes to admin status
  useEffect(() => {
    console.log('Auth context: Admin status updated to', isAdmin);
  }, [isAdmin]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        isAuthenticated,
        isAdmin,
        refreshAdminStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
} 