'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import { UserProfile } from '@/lib/db/schema';
import { generateWebsiteSummary } from '@/lib/agents/tools/website-summarizer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export default function ProfileSetup() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Partial<UserProfile>>({
    company_name: '',
    website_url: '',
    company_description: '',
    location: '',
    website_summary: ''
  });
  const [loading, setLoading] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const previousWebsiteUrl = useRef<string>('');
  const urlDebounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const supabase = createBrowserClient();

  useEffect(() => {
    async function checkUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        
        // Check if user already has a profile
        const { data, error } = await supabase
          .from('sd_user_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();
          
        if (data) {
          setProfile(data);
          setHasProfile(true);
          setIsFirstLogin(false);
        }
      } else {
        router.push('/auth/login');
      }
    }
    
    checkUser();
  }, [supabase, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setProfile({ ...profile, [e.target.name]: e.target.value });
  };

  // Set up debounced website URL handling
  const generateSummaryForUrl = async (url: string) => {
    if (!url || !url.startsWith('http')) return;
    
    console.log("Generating summary for URL:", url);
    setIsSummarizing(true);
    
    try {
      const summary = await generateWebsiteSummary(url);
      if (summary) {
        console.log("Website summary generated successfully");
        setProfile(prev => ({ ...prev, website_summary: summary }));
      }
    } catch (error) {
      console.error("Failed to generate website summary:", error);
    } finally {
      setIsSummarizing(false);
      previousWebsiteUrl.current = url;
    }
  };
  
  // Track URL changes but don't auto-generate summaries
  useEffect(() => {
    const websiteUrl = profile.website_url || '';
    const previousUrl = previousWebsiteUrl.current;
    
    // Clear any existing timeout
    if (urlDebounceTimeout.current) {
      clearTimeout(urlDebounceTimeout.current);
    }
    
    // Just track when URL changes - we'll generate summary on form submit
    if (websiteUrl && websiteUrl !== previousUrl) {
      console.log("Website URL changed, will generate summary when form is saved");
      
      // If URL changes, clear the website summary so it will be regenerated
      if (profile.website_summary && !profile.website_summary.includes('[Summary will be generated')) {
        console.log("Clearing previous summary since URL changed");
        setProfile(prev => ({ 
          ...prev, 
          website_summary: 'Website Summary: [Summary will be generated after saving...]'
        }));
      }
      
      // Update the previous URL reference
      previousWebsiteUrl.current = websiteUrl;
    }
  }, [profile.website_url]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userId) {
      setError("User not authenticated. Please log in again.");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Generate website summary if needed when saving (not during typing)
      // Use a local variable to track if we need to wait for summarization
      let summarizationInProgress = false;
      
      // Important: We should NEVER attempt to generate a summary here
      // The summary should be generated independently and not as part of the profile save
      // This prevents race conditions and ensures the summary is not overwritten

      // Instead, we'll preserve any existing summary in the database
      // We're removing the summary generation code from the save flow
      console.log("Preserving any existing website summary during profile save");
      
      // The website summary will now be managed separately by the summarization tool
      
      // Prepare data with correct types - INCLUDE website_summary but with a placeholder
      const profileData = {
        user_id: userId,
        company_name: profile.company_name || '',
        website_url: profile.website_url || '',
        company_description: profile.company_description || '',
        location: profile.location || '',
        updated_at: new Date().toISOString(),
        // Use a placeholder summary if the URL has changed or there's no summary
        website_summary: (profile.website_url || '').startsWith('http')
          ? 'Website Summary: [Summary will be generated in background...]' 
          : ''
      };
      
      // Log if we're starting a website summarization process
      if ((profile.website_url || '').startsWith('http')) {
        console.log(`Website URL provided - will start background summary generation after saving profile`);
      }
      
      // Log the profile data being saved
      console.log("Profile data being saved:", {
        ...profileData,
        website_summary: profileData.website_summary
          ? `${profileData.website_summary.substring(0, 50)}... (${profileData.website_summary.length} chars)` 
          : 'none'
      });
      
      console.log("Submitting profile data:", profileData);
      
      // Make sure table exists before trying to insert (only in development)
      if (process.env.NODE_ENV === 'development') {
        const { error: checkError } = await supabase
          .from('sd_user_profiles')
          .select('count')
          .limit(1);
          
        if (checkError) {
          console.error("Table check error:", checkError);
          setError(`Database error: ${checkError.message}. Please make sure the sd_user_profiles table exists.`);
          setLoading(false);
          return;
        }
      }
      
      // Perform the upsert operation
      const { data, error } = await supabase
        .from('sd_user_profiles')
        .upsert(profileData)
        .select();
        
      if (error) {
        console.error("Upsert error:", error);
        throw error;
      }
      
      console.log("Profile saved successfully:", data);
      previousWebsiteUrl.current = profile.website_url || '';
      
      // If we have a website URL, trigger the website summary generation in the background
      // This happens AFTER the profile is saved, so it won't interfere with the save
      const websiteUrl = profile.website_url || '';
      if (websiteUrl && websiteUrl.startsWith('http')) {
        // Do this in a non-blocking way
        (async () => {
          try {
            console.log("Starting background website summary generation...");
            // Use the websiteUrl variable we already defined above
            console.log(`Starting summary generation for URL: ${websiteUrl}`);
            // Call the function with the guaranteed string value
            const summary = await generateWebsiteSummary(websiteUrl, 400, userId);
            console.log("Background website summary generation completed:", 
              summary ? `${summary.substring(0, 50)}... (${summary.length} chars)` : 'none');
              
            // Now we need to save the summary back to the database
            if (summary && userId) {
              console.log("Saving generated summary to database...");
              try {
                // Update just the website_summary field
                const { data, error } = await supabase
                  .from('sd_user_profiles')
                  .update({ 
                    website_summary: summary,
                    updated_at: new Date().toISOString()
                  })
                  .eq('user_id', userId);
                  
                if (error) {
                  console.error("Failed to save summary to database:", error);
                } else {
                  console.log("Summary successfully saved to database!");
                  
                  // Verify the update worked
                  const { data: verifyData, error: verifyError } = await supabase
                    .from('sd_user_profiles')
                    .select('website_summary')
                    .eq('user_id', userId)
                    .single();
                    
                  if (verifyError) {
                    console.error("Error verifying summary save:", verifyError);
                  } else if (verifyData?.website_summary === summary) {
                    console.log("Summary verified in database");
                  } else {
                    console.warn("Summary may not have been saved correctly");
                  }
                }
              } catch (saveError) {
                console.error("Exception saving summary to database:", saveError);
              }
            }
          } catch (error) {
            console.error("Background website summary generation failed:", error);
          }
        })();
      }
      
      // Handle navigation based on context
      if (isFirstLogin) {
        // First-time setup: redirect to chat page
        router.push('/chat');
      } else if (window.location.pathname === '/profile') {
        // Standalone profile page: go back to previous page (likely chat)
        console.log("Profile updated, navigating back");
        router.back();
      } else {
        // Editing from sidebar dropdown: stay on current page
        setHasProfile(true);
        // Use toast notification instead of alert for better UX
        console.log("Profile updated successfully");
        // Just update state and avoid disruptive alerts
      }
    } catch (error: any) {
      const errorMessage = error?.message || "Unknown error occurred";
      console.error('Error saving profile:', error);
      setError(`Failed to save profile: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  if (isFirstLogin && !hasProfile) {
    return (
      <div className="flex justify-center items-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Welcome! Let's set up your profile:</CardTitle>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name</Label>
                <Input
                  id="company_name"
                  name="company_name"
                  value={profile.company_name || ''}
                  onChange={handleChange}
                  required
                />
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
                  />
                  {isSummarizing && (
                    <div className="absolute right-3 top-2 h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {profile.website_summary ? 'Website summary generated ✓' : 'Website summary will be generated when you save'}
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="company_description">Company Description</Label>
                <Textarea
                  id="company_description"
                  name="company_description"
                  placeholder="Tell us about your photography studio..."
                  rows={4}
                  value={profile.company_description || ''}
                  onChange={handleChange}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  name="location"
                  placeholder="City, State"
                  value={profile.location || ''}
                  onChange={handleChange}
                />
              </div>
              
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}
            </CardContent>
            
            <CardFooter>
              <Button
                type="submit"
                className="w-full"
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Continue to Dashboard'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="flex justify-center items-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Update Your Photography Business Profile</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input
                id="company_name"
                name="company_name"
                value={profile.company_name || ''}
                onChange={handleChange}
                required
              />
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
                />
                {isSummarizing && (
                  <div className="absolute right-3 top-2 h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {profile.website_summary ? 'Website summary generated ✓' : 'Website summary will be generated when you save'}
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="company_description">Company Description</Label>
              <Textarea
                id="company_description"
                name="company_description"
                placeholder="Tell us about your photography studio..."
                rows={4}
                value={profile.company_description || ''}
                onChange={handleChange}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                name="location"
                placeholder="City, State"
                value={profile.location || ''}
                onChange={handleChange}
              />
            </div>
            
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}
          </CardContent>
          
          <CardFooter className="flex justify-between">
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
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}