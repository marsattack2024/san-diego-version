import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createClient } from '@/utils/supabase/client';

interface User {
  id: string;
  email?: string;
  name?: string;
  user_metadata?: any;
  last_sign_in_at?: string;
}

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  company_name?: string;
  website_url?: string;
  location?: string;
  company_description?: string;
  website_summary?: string;
  created_at?: string;
  updated_at?: string;
  is_admin?: boolean;
}

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hasProfile: boolean;
  lastChecked: number | null; // timestamp of last auth check
  authCheckInterval: number; // how often to check auth in ms
  
  // Actions
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  checkAuth: () => Promise<User | null>;
  loadUserProfile: () => Promise<UserProfile | null>;
  checkAdminRole: () => Promise<boolean>;
  checkProfileStatus: () => Promise<boolean>;
  shouldRefreshAuth: () => boolean;
  
  // Admin Actions
  adminDeleteUser: (userId: string) => Promise<{ success: boolean, error?: string }>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      isAuthenticated: false,
      isAdmin: false,
      hasProfile: false,
      lastChecked: null,
      authCheckInterval: 15 * 60 * 1000, // 15 minutes
      
      login: async (email, password) => {
        try {
          const supabase = createClient();
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          
          if (error) {
            console.error('Login error:', error);
            return false;
          }
          
          if (data?.user) {
            const hasProfile = data.user.user_metadata?.has_profile === true;
            
            set({ 
              user: data.user, 
              isAuthenticated: true,
              hasProfile,
              lastChecked: Date.now()
            });
            
            // Load user profile after successful login
            get().loadUserProfile();
            return true;
          }
          
          return false;
        } catch (error) {
          console.error('Login error:', error);
          return false;
        }
      },
      
      logout: async () => {
        try {
          const supabase = createClient();
          await supabase.auth.signOut();
          set({ 
            user: null, 
            profile: null,
            isAuthenticated: false,
            isAdmin: false,
            hasProfile: false,
            lastChecked: null
          });
        } catch (error) {
          console.error('Logout error:', error);
        }
      },
      
      setUser: (user) => {
        set({ 
          user, 
          isAuthenticated: !!user,
          hasProfile: user?.user_metadata?.has_profile === true,
          lastChecked: user ? Date.now() : null
        });
        
        // Load profile when user is set
        if (user) {
          get().loadUserProfile();
          get().checkProfileStatus();
        }
      },
      
      checkAuth: async () => {
        const state = get();
        
        // Skip check if we checked recently
        if (!state.shouldRefreshAuth()) {
          return state.user;
        }
        
        try {
          const supabase = createClient();
          const { data, error } = await supabase.auth.getUser();
          
          if (error) {
            console.error('Auth check error:', error);
            set({ 
              user: null, 
              isAuthenticated: false,
              isAdmin: false,
              hasProfile: false,
              lastChecked: Date.now()
            });
            return null;
          }
          
          const hasProfile = data?.user?.user_metadata?.has_profile === true;
          
          set({ 
            user: data?.user || null,
            isAuthenticated: !!data?.user,
            hasProfile,
            lastChecked: Date.now()
          });
          
          // Load profile if user exists and we don't have it yet
          if (data?.user && !state.profile) {
            await get().loadUserProfile();
          }
          
          // Check admin status if user exists
          if (data?.user) {
            await get().checkAdminRole();
            
            // Verify profile status if metadata doesn't indicate having a profile
            if (!hasProfile) {
              await get().checkProfileStatus();
            }
          }
          
          return data?.user || null;
        } catch (error) {
          console.error('Auth check error:', error);
          return state.user;
        }
      },
      
      loadUserProfile: async () => {
        const state = get();
        
        if (!state.user?.id) {
          return null;
        }
        
        try {
          const supabase = createClient();
          const { data, error } = await supabase
            .from('sd_user_profiles')
            .select('*')
            .eq('user_id', state.user.id)
            .single();
            
          if (error) {
            console.error('Profile load error:', error);
            set({ hasProfile: false });
            return null;
          }
          
          // Update hasProfile state based on actual profile data
          set({ 
            profile: data as UserProfile,
            hasProfile: !!data
          });
          
          // If we have a profile but metadata doesn't show it, update metadata
          if (data && state.user?.user_metadata?.has_profile !== true) {
            try {
              await supabase.auth.updateUser({
                data: { has_profile: true }
              });
            } catch (err) {
              console.error('Error updating profile metadata:', err);
            }
          }
          
          return data as UserProfile;
        } catch (error) {
          console.error('Profile load error:', error);
          return null;
        }
      },
      
      checkAdminRole: async () => {
        const state = get();
        
        if (!state.user?.id) {
          set({ isAdmin: false });
          return false;
        }
        
        try {
          const supabase = createClient();
          
          // First check if the profile has is_admin flag
          if (state.profile?.is_admin) {
            set({ isAdmin: true });
            return true;
          }
          
          // Then check with the is_admin RPC function
          const { data, error } = await supabase.rpc('is_admin', { uid: state.user.id });
          
          if (error) {
            console.error('Admin check error:', error);
            set({ isAdmin: false });
            return false;
          }
          
          set({ isAdmin: !!data });
          return !!data;
        } catch (error) {
          console.error('Admin check error:', error);
          set({ isAdmin: false });
          return false;
        }
      },
      
      checkProfileStatus: async () => {
        const state = get();
        
        if (!state.user?.id) {
          set({ hasProfile: false });
          return false;
        }
        
        try {
          // First check user metadata (fastest)
          if (state.user.user_metadata?.has_profile === true) {
            // If we have profile metadata but no profile object, try to load it
            if (!state.profile) {
              // Check if we have enough metadata to create a minimal profile object
              if (state.user.user_metadata?.profile_summary) {
                const summary = state.user.user_metadata.profile_summary;
                // Create a minimal profile from metadata to avoid a DB query
                const metadataProfile: UserProfile = {
                  id: state.user.id,
                  user_id: state.user.id,
                  full_name: summary.full_name || '',
                  company_name: summary.company_name || '',
                  is_admin: summary.is_admin || false,
                  // Other fields will be loaded when full profile is requested
                };
                set({ 
                  profile: metadataProfile,
                  hasProfile: true
                });
              } else {
                // If not enough metadata, load the full profile in the background
                get().loadUserProfile();
              }
            }
            
            set({ hasProfile: true });
            return true;
          }
          
          // If not in metadata, check database
          const supabase = createClient();
          
          // First try the more efficient RPC function
          try {
            const { data, error } = await supabase.rpc('has_profile', { 
              uid: state.user.id 
            });
            
            if (!error) {
              const hasProfile = !!data;
              set({ hasProfile });
              
              // Update user metadata if profile exists but metadata doesn't reflect it
              if (hasProfile && state.user.user_metadata?.has_profile !== true) {
                await supabase.auth.updateUser({
                  data: { has_profile: true }
                });
              }
              
              // Load full profile if needed
              if (hasProfile && !state.profile) {
                get().loadUserProfile();
              }
              
              return hasProfile;
            }
          } catch (rpcError) {
            console.warn('RPC has_profile failed, falling back to direct query', rpcError);
          }
          
          // Fallback to direct query if RPC fails
          const { data: profile } = await supabase
            .from('sd_user_profiles')
            .select('user_id')
            .eq('user_id', state.user.id)
            .maybeSingle();
            
          const hasProfile = !!profile;
          set({ hasProfile });
          
          // Update user metadata if profile exists
          if (hasProfile) {
            await supabase.auth.updateUser({
              data: { has_profile: true }
            });
            
            // Load full profile if needed
            if (!state.profile) {
              get().loadUserProfile();
            }
          }
          
          return hasProfile;
        } catch (error) {
          console.error('Profile check error:', error);
          return false;
        }
      },
      
      shouldRefreshAuth: () => {
        const state = get();
        const now = Date.now();
        
        // If we haven't checked yet, or it's been longer than the interval
        return !state.lastChecked || 
          (now - state.lastChecked) > state.authCheckInterval;
      },
      
      // Admin function to delete a user
      adminDeleteUser: async (userId: string) => {
        const state = get();
        
        // Check if the current user is an admin
        if (!state.isAdmin) {
          console.error('Attempted to delete user without admin privileges');
          return { success: false, error: 'Unauthorized: Admin privileges required' };
        }
        
        try {
          // Call the admin API to delete the user
          const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
          });
          
          const data = await response.json();
          
          if (!response.ok) {
            console.error('Error deleting user:', data.error);
            return { success: false, error: data.error || 'Failed to delete user' };
          }
          
          return { success: true };
        } catch (error) {
          console.error('Exception deleting user:', error);
          return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error occurred'
          };
        }
      }
    }),
    {
      name: 'auth-storage',
      // Don't persist sensitive data to localStorage
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        lastChecked: state.lastChecked,
      }),
    }
  )
);

