'use client';

import React, { useState, useEffect } from 'react';
import { Trash2, UserPlus, Eye, UserCog } from 'lucide-react';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function UsersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [viewUser, setViewUser] = useState<any>(null);
  const [viewOpen, setViewOpen] = useState(false);
  
  // State for data fetching
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // State for mutations
  const [isSending, setIsSending] = useState(false);
  const [isMakingAdmin, setIsMakingAdmin] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch users data
  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      console.log("Admin page - Fetching users");
      const response = await fetch('/api/admin/users');
      
      // Get detailed error information if available
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Admin page - Fetch error details:", errorData);
        
        throw new Error(
          `Error ${response.status}: ${response.statusText}${errorData.message ? ' - ' + errorData.message : ''}`
        );
      }
      
      const data = await response.json();
      console.log("Admin page - Users data received:", data.users?.length || 0, "users");
      setUsers(data.users || []);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch users';
      setError(new Error(errorMessage));
      console.error('Error fetching users:', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Load users on component mount
  useEffect(() => {
    fetchUsers();
  }, []);

  // Send invitation
  const inviteUser = async (email: string) => {
    setIsSending(true);
    try {
      const response = await fetch('/api/admin/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error ${response.status}`);
      }
      
      toast({
        title: "User invited",
        description: "The user invitation has been sent.",
      });
      
      setInviteEmail('');
      setInviteOpen(false);
      fetchUsers(); // Refresh user list
    } catch (error) {
      toast({
        title: "Invitation failed",
        description: error instanceof Error ? error.message : "Could not send invitation",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  // Make user an admin
  const makeAdmin = async (email: string) => {
    setIsMakingAdmin(true);
    try {
      const response = await fetch('/api/admin/users/make-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error ${response.status}`);
      }
      
      toast({
        title: "Admin role granted",
        description: "The user has been made an admin.",
      });
      
      fetchUsers(); // Refresh user list
    } catch (error) {
      toast({
        title: "Action failed",
        description: error instanceof Error ? error.message : "Could not make user admin",
        variant: "destructive",
      });
    } finally {
      setIsMakingAdmin(false);
    }
  };

  // Delete a user
  const deleteUser = async (userId: string) => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error ${response.status}`);
      }
      
      toast({
        title: "User deleted",
        description: "The user and all associated data have been removed.",
      });
      
      fetchUsers(); // Refresh user list
    } catch (error) {
      toast({
        title: "Deletion failed",
        description: error instanceof Error ? error.message : "Could not delete user",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter users based on search query
  const filteredUsers = users?.filter(
    (user) => 
      (user.full_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (user.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (user.email?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (user.company_name?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  ) || [];

  // Handle user invitation
  const handleInviteUser = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (inviteEmail) {
      inviteUser(inviteEmail);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        
        <div className="flex gap-4 items-center">
          {/* Search input */}
          <div className="relative">
            <Input
              type="text"
              placeholder="Search users..."
              className="w-64"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          {/* Invite user button */}
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Invite New User</DialogTitle>
                <DialogDescription>
                  Send an invitation email to add a new user to the platform.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleInviteUser}>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="email" className="text-right">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      className="col-span-3"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="user@example.com"
                      required
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isSending}>
                    {isSending ? "Sending..." : "Send Invitation"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      {/* User table */}
      {isLoading ? (
        <div className="flex justify-center items-center min-h-[400px]">
          <p>Loading users...</p>
        </div>
      ) : error ? (
        <div className="p-4 text-red-500 border border-red-200 rounded-md">
          <h3 className="font-bold">Error loading users:</h3> 
          <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
          <div className="mt-4">
            <Button onClick={fetchUsers} variant="outline" size="sm">
              Retry
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Admin
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.user_id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {user.full_name || user.name || '-'}
                      </div>
                      {user.company_name && (
                        <div className="text-xs text-gray-500">
                          {user.company_name}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {user.email || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Active
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.is_admin ? 'Yes' : 'No'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium flex gap-2">
                      {/* View user details */}
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setViewUser(user);
                          setViewOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>

                      {/* Make admin button */}
                      {!user.is_admin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => user.email && makeAdmin(user.email)}
                          disabled={isMakingAdmin}
                        >
                          <UserCog className="h-4 w-4" />
                        </Button>
                      )}

                      {/* Delete user button */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently delete the user
                              account and remove all associated data.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => user.user_id && deleteUser(user.user_id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* User details dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">User Details</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Complete information about the selected user.
            </DialogDescription>
          </DialogHeader>
          
          {viewUser && (
            <div className="grid gap-4 py-4">
              {/* Consistent styling for all user detail sections */}
              <div className="border-b pb-3 mb-3">
                <h3 className="font-semibold mb-3 text-base">Account Information</h3>
                
                <div className="grid grid-cols-4 items-center gap-4 mb-2">
                  <Label className="text-right font-medium text-sm text-gray-600">User ID</Label>
                  <div className="col-span-3 text-sm font-mono">{viewUser.user_id}</div>
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4 mb-2">
                  <Label className="text-right font-medium text-sm text-gray-600">Email</Label>
                  <div className="col-span-3 text-sm">{viewUser.email || '-'}</div>
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4 mb-2">
                  <Label className="text-right font-medium text-sm text-gray-600">Admin Status</Label>
                  <div className="col-span-3">
                    {viewUser.is_admin ? 
                      <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800 font-medium">Yes</span> : 
                      <span className="px-2 py-1 rounded text-xs bg-gray-100 font-medium">No</span>}
                  </div>
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4 mb-2">
                  <Label className="text-right font-medium text-sm text-gray-600">Created</Label>
                  <div className="col-span-3 text-sm">
                    {viewUser.created_at ? new Date(viewUser.created_at).toLocaleString() : '-'}
                  </div>
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4 mb-2">
                  <Label className="text-right font-medium text-sm text-gray-600">Last Sign In</Label>
                  <div className="col-span-3 text-sm">
                    {viewUser.last_sign_in_at ? 
                      new Date(viewUser.last_sign_in_at).toLocaleString() : 
                      'Never'}
                  </div>
                </div>
              </div>
              
              {/* Profile Information with consistent styling */}
              <div>
                <h3 className="font-semibold mb-3 text-base">Profile Information</h3>
                
                <div className="grid grid-cols-4 items-center gap-4 mb-2">
                  <Label className="text-right font-medium text-sm text-gray-600">Full Name</Label>
                  <div className="col-span-3 text-sm">{viewUser.full_name || viewUser.name || '-'}</div>
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4 mb-2">
                  <Label className="text-right font-medium text-sm text-gray-600">Company</Label>
                  <div className="col-span-3 text-sm">{viewUser.company_name || '-'}</div>
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4 mb-2">
                  <Label className="text-right font-medium text-sm text-gray-600">Website</Label>
                  <div className="col-span-3 text-sm">
                    {viewUser.website_url ? (
                      <a href={viewUser.website_url} target="_blank" rel="noopener noreferrer" 
                         className="text-blue-600 hover:underline">
                        {viewUser.website_url}
                      </a>
                    ) : '-'}
                  </div>
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4 mb-2">
                  <Label className="text-right font-medium text-sm text-gray-600">Location</Label>
                  <div className="col-span-3 text-sm">{viewUser.location || '-'}</div>
                </div>
                
                {viewUser.company_description && (
                  <div className="grid grid-cols-4 items-start gap-4 mb-2">
                    <Label className="text-right font-medium text-sm text-gray-600 mt-1">Description</Label>
                    <div className="col-span-3 text-sm">
                      {viewUser.company_description}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setViewOpen(false)}
              className="text-sm font-medium"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}