// Force dynamic route handling for the admin widget page
export const dynamic = 'force-dynamic';
// Force all requests to revalidate for this route
export const fetchCache = 'force-no-store';
// Set revalidation time to 0 to prevent caching
export const revalidate = 0;

// Export display name for debugging
module.exports = { 
  display: 'Admin Widget', 
  requiresAuth: true,
  requiresAdmin: true
};