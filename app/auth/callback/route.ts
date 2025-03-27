import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { edgeLogger } from '@/lib/logger/edge-logger';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/chat';

  if (code) {
    const supabase = await createClient();

    // Exchange the code for a session
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Get the current user
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Check if the user has a profile
        try {
          edgeLogger.info('Auth callback: Checking if user has profile', { userId: user.id });
          const { data: profile, error: profileError } = await supabase
            .from('sd_user_profiles')
            .select('user_id')
            .eq('user_id', user.id)
            .single();

          if (profileError || !profile) {
            // User doesn't have a profile, redirect to profile setup
            edgeLogger.info('Auth callback: No profile found, redirecting to profile setup', { userId: user.id });
            return NextResponse.redirect(`${origin}/profile`);
          }

          // User has a profile, redirect to the next page
          edgeLogger.info('Auth callback: Profile found, redirecting to next page', { userId: user.id, next });
          return NextResponse.redirect(`${origin}${next}`);
        } catch (error) {
          // Log the error but continue with the redirect
          edgeLogger.error('Auth callback: Error checking profile', {
            error: error instanceof Error ? error.message : String(error),
            userId: user.id
          });
          // In case of error, redirect to profile page to be safe
          return NextResponse.redirect(`${origin}/profile`);
        }
      }

      // If we couldn't get the user, redirect to the next page anyway
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If there's no code or an error occurred, redirect to the login page
  return NextResponse.redirect(`${origin}/login`);
}