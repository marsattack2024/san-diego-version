import { createClient } from '@/utils/supabase/server';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { LOG_CATEGORIES } from '@/lib/logger/constants';

export const runtime = 'edge';

/**
 * Auth callback handler for Supabase authentication
 * Manages redirects after successful authentication based on profile status
 */
export async function GET(request: Request): Promise<Response> {
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
          edgeLogger.info('Auth callback: Checking if user has profile', {
            category: LOG_CATEGORIES.AUTH,
            userId: user.id
          });

          const { data: profile, error: profileError } = await supabase
            .from('sd_user_profiles')
            .select('user_id')
            .eq('user_id', user.id)
            .single();

          if (profileError || !profile) {
            // User doesn't have a profile, redirect to profile setup
            edgeLogger.info('Auth callback: No profile found, redirecting to profile setup', {
              category: LOG_CATEGORIES.AUTH,
              userId: user.id
            });

            return Response.redirect(`${origin}/profile`);
          }

          // User has a profile, redirect to the next page
          edgeLogger.info('Auth callback: Profile found, redirecting to next page', {
            category: LOG_CATEGORIES.AUTH,
            userId: user.id,
            next
          });

          return Response.redirect(`${origin}${next}`);
        } catch (error) {
          // Log the error but continue with the redirect
          edgeLogger.error('Auth callback: Error checking profile', {
            category: LOG_CATEGORIES.AUTH,
            error: error instanceof Error ? error.message : String(error),
            userId: user.id
          });

          // In case of error, redirect to profile page to be safe
          return Response.redirect(`${origin}/profile`);
        }
      }

      // If we couldn't get the user, redirect to the next page anyway
      return Response.redirect(`${origin}${next}`);
    }
  }

  // If there's no code or an error occurred, redirect to the login page
  return Response.redirect(`${origin}/login`);
}