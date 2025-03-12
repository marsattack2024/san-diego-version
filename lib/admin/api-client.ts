import axios from 'axios';

// Define response types
export interface UserProfile {
  id: string;
  user_id: string;
  name?: string;
  company_name?: string;
  website_url?: string;
  location?: string;
  is_admin?: boolean;
  created_at?: string;
  updated_at?: string;
  users?: {
    email: string;
    last_sign_in_at: string;
    created_at: string;
  };
}

export interface DashboardStats {
  userCount: number;
  chatCount: number;
  adminCount: number;
  recentActivity: any[];
}

// API client for admin endpoints
export const adminApi = {
  // Users
  getUsers: async (): Promise<UserProfile[]> => {
    const res = await axios.get('/api/admin/users');
    return res.data.users;
  },
  
  createUser: async (userData: {
    email: string;
    password: string;
    name?: string;
    role?: string;
  }) => {
    const res = await axios.post('/api/admin/users', userData);
    return res.data.user;
  },
  
  inviteUser: async (email: string): Promise<string> => {
    const res = await axios.post('/api/admin/users/invite', { email });
    return res.data.message;
  },
  
  deleteUser: async (userId: string): Promise<string> => {
    const res = await axios.delete(`/api/admin/users/${userId}`);
    return res.data.message;
  },
  
  // Dashboard
  getDashboardStats: async (): Promise<DashboardStats> => {
    const res = await axios.get('/api/admin/dashboard');
    return res.data.stats;
  },
  
  // Error handling wrapper
  apiWrapper: async <T>(fn: () => Promise<T>): Promise<[T | null, Error | null]> => {
    try {
      const result = await fn();
      return [result, null];
    } catch (error) {
      console.error('API Error:', error);
      return [null, error as Error];
    }
  }
};

// React Query keys
export const queryKeys = {
  users: 'admin-users',
  dashboard: 'admin-dashboard',
};