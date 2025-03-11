import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createBrowserClient } from '@/lib/supabase/client';

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
  company_name?: string;
  website_url?: string;
  location?: string;
  company_description?: string;
  website_summary?: string;
  created_at?: string;
  updated_at?: string;
}

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;
  lastChecked: number | null; // timestamp of last auth check
  authCheckInterval: number; // how often to check auth in ms
  
  // Actions
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  checkAuth: () => Promise<User | null>;
  loadUserProfile: () => Promise<UserProfile | null>;
  shouldRefreshAuth: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      isAuthenticated: false,
      lastChecked: null,
      authCheckInterval: 5 * 60 * 1000, // 5 minutes
      
      login: async (email, password) => {
        try {
          const supabase = createBrowserClient();
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          
          if (error) {
            console.error('Login error:', error);
            return false;
          }
          
          if (data?.user) {
            set({ 
              user: data.user, 
              isAuthenticated: true,
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
          const supabase = createBrowserClient();
          await supabase.auth.signOut();
          set({ 
            user: null, 
            profile: null,
            isAuthenticated: false,
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
          lastChecked: user ? Date.now() : null
        });
        
        // Load profile when user is set
        if (user) {
          get().loadUserProfile();
        }
      },
      
      checkAuth: async () => {
        const state = get();
        
        // Skip check if we checked recently
        if (!state.shouldRefreshAuth()) {
          return state.user;
        }
        
        try {
          const supabase = createBrowserClient();
          const { data, error } = await supabase.auth.getUser();
          
          if (error) {
            console.error('Auth check error:', error);
            set({ 
              user: null, 
              isAuthenticated: false,
              lastChecked: Date.now()
            });
            return null;
          }
          
          set({ 
            user: data?.user || null,
            isAuthenticated: !!data?.user,
            lastChecked: Date.now()
          });
          
          // Load profile if user exists and we don't have it yet
          if (data?.user && !state.profile) {
            get().loadUserProfile();
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
          const supabase = createBrowserClient();
          const { data, error } = await supabase
            .from('sd_user_profiles')
            .select('*')
            .eq('user_id', state.user.id)
            .single();
            
          if (error) {
            console.error('Profile load error:', error);
            return null;
          }
          
          set({ profile: data as UserProfile });
          return data as UserProfile;
        } catch (error) {
          console.error('Profile load error:', error);
          return null;
        }
      },
      
      shouldRefreshAuth: () => {
        const state = get();
        const now = Date.now();
        
        // If we haven't checked yet, or it's been longer than the interval
        return !state.lastChecked || 
          (now - state.lastChecked) > state.authCheckInterval;
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

