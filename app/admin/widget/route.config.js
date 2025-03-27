// Route configuration for admin widget page
// This file is processed by Next.js during build time

// Force dynamic rendering for proper authentication 
export const dynamic = "force-dynamic";

// Force all requests to revalidate for this route
export const fetchCache = 'force-no-store';

// Disable caching for this route
export const revalidate = 0; 