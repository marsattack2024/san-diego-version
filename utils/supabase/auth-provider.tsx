'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { Loader2 } from 'lucide-react';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

// Create context for Supabase client and loading state
const AuthContext = createContext({
  isLoading: true,
  supabase: null as ReturnType<typeof createClient> | null,
});

// Export hook for accessing auth client
export const useAuth = () => useContext(AuthContext);

// Provider component to wrap app with
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [supabase] = useState(() => createClient());
  const {
    isAuthenticated,
    setUser,
    logout,
    loadUserProfile
  } = useAuthStore();

  // Setup auth state change listener
  useEffect(() => {
    let mounted = true;

    // Initial auth check during mount
    const initAuth = async () => {
      try {
        edgeLogger.debug('Initializing authentication...', {
          category: LOG_CATEGORIES.AUTH
        });

        // Get user from supabase
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error) {
          edgeLogger.error('Authentication initialization error', {
            category: LOG_CATEGORIES.AUTH,
            error: error.message
          });

          // Clear user state on error
          setUser(null);
        } else if (user) {
          edgeLogger.debug('User authenticated during initialization', {
            category: LOG_CATEGORIES.AUTH,
            userId: user.id.substring(0, 8) + '...'
          });

          // Set user in store
          setUser(user);

          // Load profile in background
          loadUserProfile().catch(err => {
            edgeLogger.error('Error loading user profile during auth init', {
              category: LOG_CATEGORIES.AUTH,
              error: err instanceof Error ? err.message : String(err)
            });
          });
        } else {
          edgeLogger.debug('No user authenticated during initialization', {
            category: LOG_CATEGORIES.AUTH
          });

          // Ensure user state is clear
          setUser(null);
        }
      } catch (error) {
        edgeLogger.error('Error during auth initialization', {
          category: LOG_CATEGORIES.AUTH,
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        // Always update loading state when done
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        edgeLogger.debug('Auth state change event', {
          category: LOG_CATEGORIES.AUTH,
          event,
          hasSession: !!session
        });

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session?.user) {
            setUser(session.user);

            // Load profile in background
            loadUserProfile().catch(err => {
              edgeLogger.error('Error loading profile after auth change', {
                category: LOG_CATEGORIES.AUTH,
                error: err instanceof Error ? err.message : String(err)
              });
            });
          }
        } else if (event === 'SIGNED_OUT') {
          logout();
        }

        // Update loading state on auth events
        if (mounted) {
          setIsLoading(false);
        }
      }
    );

    // Run initial auth check
    initAuth();

    // Cleanup on unmount
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, setUser, logout, loadUserProfile]);

  // Show loading state while initial auth check completes
  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-lg">Loading authentication...</span>
      </div>
    );
  }

  // Provide Supabase client and loading state to children
  return (
    <AuthContext.Provider
      value={{
        isLoading,
        supabase,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
} 