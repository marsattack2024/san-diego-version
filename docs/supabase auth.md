Setting up Server-Side Auth for Next.js

Next.js comes in two flavors: the App Router and the Pages Router. You can set up Server-Side Auth with either strategy. You can even use both in the same application.


App Router

Pages Router

Hybrid router strategies
1
Install Supabase packages
Install the @supabase/supabase-js package and the helper @supabase/ssr package.

npm install @supabase/supabase-js @supabase/ssr
2
Set up environment variables
Create a .env.local file in your project root directory.

Fill in your NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY:

Project URL
Photography to Profits / P2P - Botimus prime
https://uwdpcfysqkkfkwssjzhw.supabase.co

Anon key
Photography to Profits / P2P - Botimus prime
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3ZHBjZnlzcWtrZmt3c3Nqemh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDEzNjcxMTUsImV4cCI6MjA1Njk0MzExNX0.W1usPv51ZyeFX5J2upxlKxxRYim-5_UxqPFWbuu0NMI


.env.local
NEXT_PUBLIC_SUPABASE_URL=<your_supabase_project_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_supabase_anon_key>
3
Write utility functions to create Supabase clients
To access Supabase from your Next.js app, you need 2 types of Supabase clients:

Client Component client - To access Supabase from Client Components, which run in the browser.
Server Component client - To access Supabase from Server Components, Server Actions, and Route Handlers, which run only on the server.
Create a utils/supabase folder with a file for each type of client. Then copy the utility functions for each client type.


What does the `cookies` object do?

Do I need to create a new client for every route?

utils/supabase/client.ts

utils/supabase/server.ts
import { createBrowserClient } from '@supabase/ssr'
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
4
Hook up middleware
Create a middleware.ts file at the root of your project.

Since Server Components can't write cookies, you need middleware to refresh expired Auth tokens and store them.

The middleware is responsible for:

Refreshing the Auth token (by calling supabase.auth.getUser).
Passing the refreshed Auth token to Server Components, so they don't attempt to refresh the same token themselves. This is accomplished with request.cookies.set.
Passing the refreshed Auth token to the browser, so it replaces the old token. This is accomplished with response.cookies.set.
Copy the middleware code for your app.

Add a matcher so the middleware doesn't run on routes that don't access Supabase.

Be careful when protecting pages. The server gets the user session from the cookies, which can be spoofed by anyone.

Always use supabase.auth.getUser() to protect pages and user data.

Never trust supabase.auth.getSession() inside server code such as middleware. It isn't guaranteed to revalidate the Auth token.

It's safe to trust getUser() because it sends a request to the Supabase Auth server every time to revalidate the Auth token.


middleware.ts

utils/supabase/middleware.ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
export async function middleware(request: NextRequest) {
  return await updateSession(request)
}
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
5
Create a login page
Create a login page for your app. Use a Server Action to call the Supabase signup function.

Since Supabase is being called from an Action, use the client defined in @/utils/supabase/server.ts.

Note that cookies is called before any calls to Supabase, which opts fetch calls out of Next.js's caching. This is important for authenticated data fetches, to ensure that users get access only to their own data.

See the Next.js docs to learn more about opting out of data caching.


app/login/page.tsx

app/login/actions.ts

app/error/page.tsx
import { login, signup } from './actions'
export default function LoginPage() {
  return (
    <form>
      <label htmlFor="email">Email:</label>
      <input id="email" name="email" type="email" required />
      <label htmlFor="password">Password:</label>
      <input id="password" name="password" type="password" required />
      <button formAction={login}>Log in</button>
      <button formAction={signup}>Sign up</button>
    </form>
  )
}
6
Change the Auth confirmation path
If you have email confirmation turned on (the default), a new user will receive an email confirmation after signing up.

Change the email template to support a server-side authentication flow.

Go to the Auth templates page in your dashboard. In the Confirm signup template, change {{ .ConfirmationURL }} to {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email.

7
Create a route handler for Auth confirmation
Create a Route Handler for auth/confirm. When a user clicks their confirmation email link, exchange their secure code for an Auth token.

Since this is a Router Handler, use the Supabase client from @/utils/supabase/server.ts.


app/auth/confirm/route.ts
import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'
  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })
    if (!error) {
      // redirect user to specified redirect URL or root of app
      redirect(next)
    }
  }
  // redirect the user to an error page with some instructions
  redirect('/error')
}
8
Access user info from Server Component
Server Components can read cookies, so you can get the Auth status and user info.

Since you're calling Supabase from a Server Component, use the client created in @/utils/supabase/server.ts.

Create a private page that users can only access if they're logged in. The page displays their email.

Be careful when protecting pages. The server gets the user session from the cookies, which can be spoofed by anyone.

Always use supabase.auth.getUser() to protect pages and user data.

Never trust supabase.auth.getSession() inside Server Components. It isn't guaranteed to revalidate the Auth token.

It's safe to trust getUser() because it sends a request to the Supabase Auth server every time to revalidate the Auth token.


app/private/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
export default async function PrivatePage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect('/login')
  }
  return <p>Hello {data.user.email}</p>
}
Congratulations#
You're done! To recap, you've successfully:

Called Supabase from a Server Action.
Called Supabase from a Server Component.
Set up a Supabase client utility to call Supabase from a Client Component. You can use this if you need to call Supabase from a Client Component, for example to set up a realtime subscription.
Set up middleware to automatically refresh the Supabase Auth session.
You can now use any Supabase features from your client or server code!

Migrating to the SSR package from Auth Helpers

The new ssr package takes the core concepts of the Auth Helpers and makes them available to any server language or framework. This page will guide you through migrating from the Auth Helpers package to ssr.

Replacing Supabase packages#

Next.js

SvelteKit

Remix
npm uninstall @supabase/auth-helpers-nextjs
npm install @supabase/ssr
Creating a client#
The new ssr package exports two functions for creating a Supabase client. The createBrowserClient function is used in the client, and the createServerClient function is used in the server.

Check out the Creating a client page for examples of creating a client in your framework.

Next steps#
Implement Authentication using Email and Password
Implement Authentication using OAuth
Learn more about SSR

Creating a Supabase client for SSR

Configure your Supabase client to use cookies

To use Server-Side Rendering (SSR) with Supabase, you need to configure your Supabase client to use cookies. The @supabase/ssr package helps you do this for JavaScript/TypeScript applications.

Install#
Install the @supabase/ssr and @supabase/supabase-js packages:


npm

yarn

pnpm
npm install @supabase/ssr @supabase/supabase-js
Set environment variables#
In your environment variables file, set your Supabase URL and Supabase Anon Key:

Project URL
Photography to Profits / P2P - Botimus prime
https://uwdpcfysqkkfkwssjzhw.supabase.co

Anon key
Photography to Profits / P2P - Botimus prime
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3ZHBjZnlzcWtrZmt3c3Nqemh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDEzNjcxMTUsImV4cCI6MjA1Njk0MzExNX0.W1usPv51ZyeFX5J2upxlKxxRYim-5_UxqPFWbuu0NMI


Next.js

SvelteKit

Astro

Remix

Express

Hono
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
Create a client#
You'll need some one-time setup code to configure your Supabase client to use cookies. Once your utility code is set up, you can use your new createClient utility functions to get a properly configured Supabase client.

Use the browser client in code that runs on the browser, and the server client in code that runs on the server.


Next.js

SvelteKit

Astro

Remix

Express

Hono
The following code samples are for App Router. For help with Pages Router, see the Next.js Server-Side Auth guide.


Client-side

import { createBrowserClient } from '@supabase/ssr'
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

Server-side

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

Middleware

In Next.js, because Server Components cannot set cookies, you'll also need a middleware client to handle cookie refreshes. The middleware should run before every route that needs access to Supabase, or that is protected by Supabase Auth.

import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
export async function middleware(request: NextRequest) {
  return await updateSession(request)
}
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}


Advanced guide

Details about SSR Auth flows and implementation for advanced users.

When a user authenticates with Supabase Auth, two pieces of information are issued by the server:

Access token in the form of a JWT.
Refresh token which is a randomly generated string.
The default behavior if you're not using SSR is to store this information in local storage. Local storage isn't accessible by the server, so for SSR, the tokens instead need to be stored in a secure cookie. The cookie can then be passed back and forth between your app code in the client and your app code in the server.

If you're not using SSR, you might also be using the implicit flow to get the access and refresh tokens. The server can't access the tokens in this flow, so for SSR, you should change to the PKCE flow. You can change the flow type when initiating your Supabase client if your client library provides this option.

In the @supabase/ssr package, Supabase clients are initiated to use the PKCE flow by default. They are also automatically configured to handle the saving and retrieval of session information in cookies.

How it works#
In the PKCE flow, a redirect is made to your app, with an Auth Code contained in the URL. When you exchange this code using exchangeCodeForSession, you receive the session information, which contains the access and refresh tokens.

To maintain the session, these tokens must be stored in a storage medium securely shared between client and server, which is traditionally cookies. Whenever the session is refreshed, the auth and refresh tokens in the shared storage medium must be updated. Supabase client libraries provide a customizable storage option when a client is initiated, allowing you to change where tokens are stored.

For an implementation example, see the @supabase/ssr package.

Frequently asked questions#
No session on the server side with Next.js route prefetching?#
When you use route prefetching in Next.js using <Link href="/..."> components or the Router.push() APIs can send server-side requests before the browser processes the access and refresh tokens. This means that those requests may not have any cookies set and your server code will render unauthenticated content.

To improve experience for your users, we recommend redirecting users to one specific page after sign-in that does not include any route prefetching from Next.js. Once the Supabase client library running in the browser has obtained the access and refresh tokens from the URL fragment, you can send users to any pages that use prefetching.

How do I make the cookies HttpOnly?#
This is not necessary. Both the access token and refresh token are designed to be passed around to different components in your application. The browser-based side of your application needs access to the refresh token to properly maintain a browser session anyway.

My server is getting invalid refresh token errors. What's going on?#
It is likely that the refresh token sent from the browser to your server is stale. Make sure the onAuthStateChange listener callback is free of bugs and is registered relatively early in your application's lifetime

When you receive this error on the server-side, try to defer rendering to the browser where the client library can access an up-to-date refresh token and present the user with a better experience.

Should I set a shorter Max-Age parameter on the cookies?#
The Max-Age or Expires cookie parameters only control whether the browser sends the value to the server. Since a refresh token represents the long-lived authentication session of the user on that browser, setting a short Max-Age or Expires parameter on the cookies only results in a degraded user experience.

The only way to ensure that a user has logged out or their session has ended is to get the user's details with getUser().

What should I use for the SameSite property?#
Make sure you understand the behavior of the property in different situations as some properties can degrade the user experience.

A good default is to use Lax which sends cookies when users are navigating to your site. Cookies typically require the Secure attribute, which only sends them over HTTPS. However, this can be a problem when developing on localhost.

Can I use server-side rendering with a CDN or cache?#
Yes, but you need to be careful to include at least the refresh token cookie value in the cache key. Otherwise you may be accidentally serving pages with data belonging to different users!

Also be sure you set proper cache control headers. We recommend invalidating cache keys every hour or less.

Which authentication flows have PKCE support?#
At present, PKCE is supported on the Magic Link, OAuth, Sign Up, and Password Recovery routes. These correspond to the signInWithOtp, signInWithOAuth, signUp, and resetPasswordForEmail methods on the Supabase client library. When using PKCE with Phone and Email OTPs, there is no behavior change with respect to the implicit flow - an access token will be returned in the body when a request is successful.