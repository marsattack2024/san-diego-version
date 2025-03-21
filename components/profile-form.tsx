'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createBrowserClient } from '@/lib/supabase/client';
import { UserProfile } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

interface ProfileFormProps {
  initialProfile: Partial<UserProfile>;
  userId: string;
  isFirstLogin: boolean;
}

// Character limits for form fields
const CHAR_LIMITS = {
  FULL_NAME: 50,
  COMPANY_NAME: 60,
  COMPANY_DESCRIPTION: 300,
  LOCATION: 60
};

// Define our own profile state interface to ensure type safety
interface ProfileState {
  full_name: string;
  company_name: string;
  website_url: string;
  company_description: string;
  location: string;
  website_summary: string;
}

export default function ProfileForm({ initialProfile, userId, isFirstLogin }: ProfileFormProps) {
  // Add state to track if the website URL has changed from the initial value
  const [urlChanged, setUrlChanged] = useState(false);
  
  const [profile, setProfile] = useState<ProfileState>({
    full_name: initialProfile.full_name || '',
    company_name: initialProfile.company_name || '',
    website_url: initialProfile.website_url || '',
    company_description: initialProfile.company_description || '',
    location: initialProfile.location || '',
    website_summary: initialProfile.website_summary || ''
  });
  const [loading, setLoading] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const router = useRouter();
  const supabase = createBrowserClient();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Apply character limits based on field name
    let limitedValue = value;
    if (name === 'full_name' && value.length > CHAR_LIMITS.FULL_NAME) {
      limitedValue = value.slice(0, CHAR_LIMITS.FULL_NAME);
    } else if (name === 'company_name' && value.length > CHAR_LIMITS.COMPANY_NAME) {
      limitedValue = value.slice(0, CHAR_LIMITS.COMPANY_NAME);
    } else if (name === 'company_description' && value.length > CHAR_LIMITS.COMPANY_DESCRIPTION) {
      limitedValue = value.slice(0, CHAR_LIMITS.COMPANY_DESCRIPTION);
    } else if (name === 'location' && value.length > CHAR_LIMITS.LOCATION) {
      limitedValue = value.slice(0, CHAR_LIMITS.LOCATION);
    }
    
    // For website_url, validate it starts with https:// or clear website_summary if changed
    if (name === 'website_url') {
      const isUrlChanged = limitedValue !== initialProfile.website_url;
      setUrlChanged(isUrlChanged);
      
      if (limitedValue && limitedValue !== profile.website_url) {
        // When URL changes from what's in the form
        const hasExistingSummary = initialProfile.website_summary && 
          !initialProfile.website_summary.includes('[Summary will be');
        
        let newSummaryText = '';
        
        if (!limitedValue) {
          // If URL is cleared
          newSummaryText = '';
        } else if (limitedValue === initialProfile.website_url && hasExistingSummary) {
          // If URL is changed back to the original and there was a summary
          newSummaryText = initialProfile.website_summary || '';
        } else {
          // If URL is new or different from original
          newSummaryText = 'Website Summary: [Pending generation]';
        }
        
        setProfile(prev => ({
          ...prev,
          [name]: limitedValue,
          website_summary: newSummaryText
        }));
      } else {
        setProfile(prev => ({ ...prev, [name]: limitedValue }));
      }
    } else {
      setProfile(prev => ({ ...prev, [name]: limitedValue }));
    }
    
    // Show a toast if the user exceeds the character limit
    if (limitedValue !== value) {
      toast.error(`${name.replace('_', ' ')} exceeds maximum character limit`);
    }
  };

  const generateWebsiteSummary = async (url: string) => {
    if (!url.startsWith('https://')) {
      // Don't show error toast, just return silently
      console.error('Website URL must start with https://');
      return;
    }

    try {
      setIsSummarizing(true);
      
      // Call the API to generate the summary - this will now complete the entire process
      const response = await fetch('/api/profile/update-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url, userId })
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate website summary');
      }
      
      const data = await response.json();
      
      if (data.success && data.summary) {
        // Update the local state with the new summary
        setProfile(prev => ({
          ...prev,
          website_summary: data.summary
        }));
        
        // Only show a toast notification when the summary is actually completed
        toast.success('Website summary generated successfully');
        
        // Force a refresh to get the latest profile data
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to generate website summary:', error);
      // Don't show error toast
    } finally {
      setIsSummarizing(false);
    }
  };

  const validateUrl = (url: string): boolean => {
    if (!url) return true; // Empty URL is valid (not required)
    return url.startsWith('https://');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userId) {
      toast.error('User not authenticated. Please log in again.');
      return;
    }
    
    // Validate website URL format if one is provided
    if (profile.website_url && !validateUrl(profile.website_url)) {
      toast.error('Website URL must start with https://');
      return;
    }
    
    setLoading(true);
    
    try {
      // Prepare data with correct types
      const profileData = {
        user_id: userId,
        full_name: profile.full_name || '',
        company_name: profile.company_name || '',
        website_url: profile.website_url || '',
        company_description: profile.company_description || '',
        location: profile.location || '',
        updated_at: new Date().toISOString(),
        // Use the existing website_summary or a placeholder
        website_summary: profile.website_summary || ''
      };
      
      // Perform the upsert operation
      const { error } = await supabase
        .from('sd_user_profiles')
        .upsert(profileData);
        
      if (error) {
        throw error;
      }
      
      // Update user metadata to indicate they have a profile
      // This optimization reduces the need for database queries in middleware
      const metadata = {
        has_profile: true,
        profile_updated_at: new Date().toISOString(),
        profile_summary: {
          full_name: profile.full_name,
          company_name: profile.company_name,
          // Don't include is_admin here as it should only be set by admin functions
        }
      };
      
      const { error: metadataError } = await supabase.auth.updateUser({
        data: metadata
      });
      
      if (metadataError) {
        console.error('Error updating user metadata:', metadataError);
        // Continue even if metadata update fails - the trigger will sync it eventually
      }
      
      // No toast notification on save
      console.log('Profile saved successfully');
      
      // Generate the website summary if URL provided and valid
      if (profile.website_url && validateUrl(profile.website_url)) {
        // Generate the website summary immediately without any delay
        generateWebsiteSummary(profile.website_url!);
      }
      
      // Handle navigation based on context
      if (isFirstLogin) {
        // First-time setup: redirect to chat page
        router.push('/chat');
      } else {
        // Update state and refresh the profile data
        router.refresh();
        
        // Normal profile update: go back to previous page
        setTimeout(() => {
          router.back();
        }, 1000); // Small delay to show success message
      }
    } catch (error: any) {
      const errorMessage = error?.message || "Unknown error occurred";
      console.error('Error saving profile:', error);
      toast.error(`Failed to save profile: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // Use a single form for both first login and regular profile editing
  return (
    <div className="flex justify-center items-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {isFirstLogin 
              ? "Welcome! Let's set up your profile:" 
              : "Update Your Photography Business Profile"}
          </CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Your Full Name</Label>
              <div className="relative">
                <Input
                  id="full_name"
                  name="full_name"
                  value={profile.full_name || ''}
                  onChange={handleChange}
                  required
                  maxLength={CHAR_LIMITS.FULL_NAME}
                  placeholder="John Doe"
                />
                {(profile.full_name?.length || 0) > CHAR_LIMITS.FULL_NAME * 0.8 && (
                  <div className="absolute right-3 top-2 text-xs text-muted-foreground">
                    {(profile.full_name?.length || 0)}/{CHAR_LIMITS.FULL_NAME}
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name</Label>
              <div className="relative">
                <Input
                  id="company_name"
                  name="company_name"
                  value={profile.company_name || ''}
                  onChange={handleChange}
                  required
                  maxLength={CHAR_LIMITS.COMPANY_NAME}
                />
                {(profile.company_name?.length || 0) > CHAR_LIMITS.COMPANY_NAME * 0.8 && (
                  <div className="absolute right-3 top-2 text-xs text-muted-foreground">
                    {(profile.company_name?.length || 0)}/{CHAR_LIMITS.COMPANY_NAME}
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="website_url">Website URL</Label>
              <div className="relative">
                <Input
                  id="website_url"
                  name="website_url"
                  type="url"
                  placeholder="https://yourstudio.com"
                  value={profile.website_url || ''}
                  onChange={handleChange}
                  className={
                    !urlChanged && initialProfile.website_summary && 
                    !initialProfile.website_summary.includes('[Summary will be')
                    ? 'border-green-300 focus:border-green-500 bg-green-50'
                    : profile.website_url && !profile.website_url.startsWith('https://')
                      ? 'border-red-300 focus:border-red-500'
                      : ''
                  }
                />
                {isSummarizing && (
                  <div className="absolute right-3 top-2 h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></div>
                )}
              </div>
              <p className={`text-xs ${
                // Error state for invalid URL
                profile.website_url && !profile.website_url.startsWith('https://') 
                  ? 'text-red-500'
                  // Success state for unchanged URL with existing summary
                  : !urlChanged && initialProfile.website_summary && 
                    !initialProfile.website_summary.includes('[Summary will be') 
                    ? 'text-green-600 font-medium' 
                    // Pending state for changed URL
                    : 'text-muted-foreground'
              }`}>
                {profile.website_url && !profile.website_url.startsWith('https://') 
                  ? 'URL must start with https://' 
                  : !urlChanged && initialProfile.website_summary && 
                    !initialProfile.website_summary.includes('[Summary will be')
                    ? 'Website summary already generated ✓' 
                    : profile.website_url
                      ? 'Save profile to generate website summary'
                      : 'Add a URL to generate a website summary'}
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="company_description">Company Description</Label>
              <div className="relative">
                <Textarea
                  id="company_description"
                  name="company_description"
                  placeholder={isFirstLogin 
                    ? "Tell us about your team, yearly revenue, years in business, etc." 
                    : "Tell us about your team, yearly revenue, years in business, etc."}
                  rows={4}
                  value={profile.company_description || ''}
                  onChange={handleChange}
                  required
                  maxLength={CHAR_LIMITS.COMPANY_DESCRIPTION}
                  className={
                    (profile.company_description?.length || 0) > CHAR_LIMITS.COMPANY_DESCRIPTION * 0.9
                      ? 'border-yellow-500 focus:border-yellow-500'
                      : ''
                  }
                />
                {(profile.company_description?.length || 0) > CHAR_LIMITS.COMPANY_DESCRIPTION * 0.7 && (
                  <div 
                    className={`absolute right-3 bottom-2 text-xs ${
                      (profile.company_description?.length || 0) > CHAR_LIMITS.COMPANY_DESCRIPTION * 0.9
                        ? 'text-yellow-600'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {(profile.company_description?.length || 0)}/{CHAR_LIMITS.COMPANY_DESCRIPTION}
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <div className="relative">
                <Input
                  id="location"
                  name="location"
                  placeholder="City, State"
                  value={profile.location || ''}
                  onChange={handleChange}
                  maxLength={CHAR_LIMITS.LOCATION}
                />
                {(profile.location?.length || 0) > CHAR_LIMITS.LOCATION * 0.8 && (
                  <div className="absolute right-3 top-2 text-xs text-muted-foreground">
                    {(profile.location?.length || 0)}/{CHAR_LIMITS.LOCATION}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
          
          <CardFooter className={isFirstLogin ? '' : 'flex justify-between'}>
            {/* Show different buttons based on if it's first login or regular profile edit */}
            {isFirstLogin ? (
              <Button
                type="submit"
                className="w-full"
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Continue to Dashboard'}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                >
                  {loading ? 'Saving...' : 'Save Profile'}
                </Button>
              </>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}