'use client';

import { UserProfile } from '@/lib/admin/api-client';
import { UsersTable } from '@/components/admin/features/users/components/users-table';
import { columns } from '@/components/admin/features/users/components/users-columns';
import { User } from '@/components/admin/features/users/data/schema';

interface UsersAdapterProps {
  initialUsers: UserProfile[];
}

// This component adapts the Supabase data to the format expected by the UsersTable component
export function UsersAdapter({ initialUsers }: UsersAdapterProps) {
  // Transform the Supabase data to match the expected schema
  const adaptedUsers: User[] = initialUsers.map((profile) => {
    const email = profile.users?.email || '';
    const name = profile.name || email.split('@')[0] || '';
    const nameParts = name.split(' ');
    
    return {
      id: profile.user_id,
      firstName: nameParts[0] || '',
      lastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : '',
      username: email.split('@')[0] || '',
      email: email,
      phoneNumber: '', // Not available in our data
      status: profile.is_admin ? 'active' : 'active', // Default to active
      role: profile.is_admin ? 'admin' : 'manager', // Default non-admins to manager
      createdAt: new Date(profile.created_at || Date.now()),
      updatedAt: new Date(profile.updated_at || Date.now()),
    };
  });

  return <UsersTable data={adaptedUsers} columns={columns} />;
}