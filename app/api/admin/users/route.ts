import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { successResponse, errorResponse, unauthorizedError } from '@/lib/utils/route-handler';
import { handleCors } from '@/lib/utils/http-utils';
import { LOG_CATEGORIES } from '@/lib/logger/constants';
import { createRouteHandlerAdminClient } from '@/lib/supabase/route-client';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Helper to check if a user is an admin
async function isAdmin(supabase: any, userId: string) {
  edgeLogger.debug("[isAdmin] Checking admin status", { category: LOG_CATEGORIES.AUTH, userId });

  const knownAdminIds = ['5c80df74-1e2b-4435-89eb-b61b740120e9'];

  try {
    const { data, error } = await supabase.rpc('is_admin', { uid: userId });

    if (error) {
      edgeLogger.error("[isAdmin] Error checking admin status via RPC", { category: LOG_CATEGORIES.AUTH, error: error.message });
      return knownAdminIds.includes(userId);
    }

    edgeLogger.debug("[isAdmin] Admin role check result", { category: LOG_CATEGORIES.AUTH, isAdmin: !!data });
    return !!data;
  } catch (err) {
    edgeLogger.error("[isAdmin] Exception checking admin status", { category: LOG_CATEGORIES.AUTH, error: err instanceof Error ? err.message : String(err) });
    return knownAdminIds.includes(userId);
  }
}

// Helper function to find field values in a case-insensitive way
function findFieldCaseInsensitive(obj: any, fieldName: string): any {
  if (!obj) return null;

  // Direct match
  if (obj[fieldName] !== undefined) return obj[fieldName];

  // Case-insensitive match
  const lowerFieldName = fieldName.toLowerCase();
  const keys = Object.keys(obj);

  for (const key of keys) {
    if (key.toLowerCase() === lowerFieldName) {
      return obj[key];
    }
  }

  return null;
}

// Helper function to find company name with multiple fallbacks
function findCompanyName(profile: any): string {
  if (!profile) return "No profile";

  // Try all possible field names for company
  const possibleFields = [
    'company_name', 'companyName', 'company', 'Company', 'CompanyName',
    'company_title', 'companyTitle', 'business_name', 'businessName',
    'organization', 'organization_name', 'organizationName'
  ];

  // Try each field
  for (const field of possibleFields) {
    const value = profile[field];
    if (value && typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }

  // Try case-insensitive approach
  for (const field of possibleFields) {
    const value = findFieldCaseInsensitive(profile, field);
    if (value && typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }

  return "Not specified";
}

// GET /api/admin/users - List all users
export async function GET(request: Request): Promise<Response> {
  const operationId = `admin_get_users_${Math.random().toString(36).substring(2, 8)}`;
  edgeLogger.debug("Admin users GET request started", { operationId });

  try {
    const supabase = await createRouteHandlerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const errRes = unauthorizedError('Authentication required for admin access');
      return handleCors(errRes, request, true);
    }

    const admin = await isAdmin(supabase, user.id);
    if (!admin) {
      const errRes = errorResponse('Admin privileges required', null, 403);
      return handleCors(errRes, request, true);
    }

    edgeLogger.debug("Admin API - Verifying database connection");
    const { data: tableCheck, error: tablesError } = await supabase
      .from('sd_user_profiles')
      .select('user_id')
      .limit(1);

    if (tablesError) {
      edgeLogger.error('Error connecting to database:', {
        error: tablesError.message
      });
      const errRes = errorResponse('Database connection failed', tablesError.message, 500);
      return handleCors(errRes, request, true);
    }

    edgeLogger.debug("Admin API - Database connection successful");

    const { count, error: countError } = await supabase
      .from('sd_user_profiles')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      edgeLogger.error('Error counting user profiles:', {
        error: countError.message
      });
    } else {
      edgeLogger.debug(`Admin API - Count query shows ${count} user profiles exist`);
    }

    edgeLogger.debug("Admin API - TRYING MULTIPLE METHODS TO GET ALL PROFILES");

    const { data: profiles1, error: profilesError1 } = await supabase
      .from('sd_user_profiles')
      .select('*');

    edgeLogger.debug(`Admin API - Method 1 found ${profiles1?.length || 0} profiles`);

    let profiles2 = null;
    try {
      const result = await supabase.rpc('admin_get_all_profiles');
      profiles2 = result.data;
      edgeLogger.debug(`Admin API - Method 2 found ${profiles2?.length || 0} profiles`);
    } catch (err) {
      edgeLogger.debug('Admin API - Method 2 failed (RPC not available)');
    }

    edgeLogger.debug("Admin API - Getting auth users to check for profiles");
    const { data: authData } = await supabase.auth.admin.listUsers();

    if (authData?.users && authData.users.length > 0) {
      edgeLogger.debug(`Admin API - Found ${authData.users.length} auth users to check for profiles`);

      authData.users.forEach((user, index) => {
        edgeLogger.debug(`Auth User ${index + 1}: ID=${user.id}, Email=${user.email}`);
      });

      for (const authUser of authData.users) {
        try {
          const { data: profile } = await supabase
            .from('sd_user_profiles')
            .select('*')
            .eq('user_id', authUser.id)
            .single();

          edgeLogger.debug(`Auth user ${authUser.email} has profile: ${!!profile}`);
          if (profile) {
            edgeLogger.debug(`Profile for ${authUser.email}:`, profile);
          }
        } catch (err) {
          edgeLogger.debug(`No profile for ${authUser.email}`);
        }
      }
    }

    const profiles = profiles1;
    const profilesError = profilesError1;

    if (profilesError) {
      edgeLogger.error('Error fetching user profiles:', {
        error: profilesError.message
      });
      const errRes = errorResponse('Failed to fetch users', profilesError.message, 500);
      return handleCors(errRes, request, true);
    }

    edgeLogger.debug(`Admin API - Successfully retrieved ${profiles?.length || 0} user profiles`);

    edgeLogger.debug("Admin API - Raw profiles data:", {
      count: profiles?.length || 0,
      hasProfiles: !!profiles
    });

    const users = authData?.users?.map(authUser => {
      const profile = profiles?.find(p => String(p.user_id) === String(authUser.id));

      if (authUser.email === "garciah24@gmail.com") {
        edgeLogger.debug("Problem user detection:", {
          userId: authUser.id,
          userIdType: typeof authUser.id,
          hasProfile: !!profile,
          profileDetails: profile,
          allProfileIds: profiles?.map(p => String(p.user_id))
        });

        if (profile) {
          const companyField = findFieldCaseInsensitive(profile, 'company_name');
          const companyFieldAlt = findFieldCaseInsensitive(profile, 'company');

          const allPossibleCompanyFields = [
            'company_name', 'companyName', 'company', 'Company', 'CompanyName',
            'company_title', 'companyTitle', 'business_name', 'businessName',
            'organization', 'organization_name', 'organizationName'
          ];

          const foundCompanyFields = allPossibleCompanyFields
            .filter(field => profile[field] !== undefined)
            .map(field => ({ field, value: profile[field] }));

          edgeLogger.debug("DETAILED PROFILE INSPECTION:", {
            allFields: Object.keys(profile),
            companyField: profile.company_name,
            companyFieldType: typeof profile.company_name,
            companyFieldCaseInsensitive: companyField,
            companyFieldAlt: companyFieldAlt,
            foundCompanyFields,
            fullName: profile.full_name,
            rawProfile: JSON.stringify(profile)
          });
        }
      }

      return {
        user_id: authUser.id,
        full_name: profile ? (findFieldCaseInsensitive(profile, 'full_name') || authUser.user_metadata?.name || "Unknown Name") : (authUser.user_metadata?.name || "Unknown Name"),
        email: authUser.email,
        is_admin: profile ? (profile.is_admin === true || profile.is_admin === 'true') : false,
        company: findCompanyName(profile),
        has_profile: !!profile,
        created_at: authUser.created_at || (profile ? profile.created_at : null),
        ...(profile ? {
          company_name: profile.company_name,
          website_url: profile.website_url,
          company_description: profile.company_description,
          location: profile.location,
          updated_at: profile.updated_at,
          website_summary: profile.website_summary
        } : {}),
        last_sign_in_at: authUser.last_sign_in_at
      };
    }) || [];

    edgeLogger.debug(`Admin API - Created list of ${users.length} users`);

    const problemUser = authData?.users?.find(u => u.email === "garciah24@gmail.com");
    const problemUserProfile = profiles?.find(p => String(p.user_id) === String(problemUser?.id));
    edgeLogger.debug("RAW DATA CHECK - Problem user:", problemUser);
    edgeLogger.debug("RAW DATA CHECK - Problem user profile:", problemUserProfile);

    edgeLogger.debug(`RAW DATA CHECK - Found ${profiles?.length || 0} profiles`);

    if (problemUser) {
      edgeLogger.debug("DETAILED ID CHECK - Problem user ID:", {
        id: problemUser.id,
        length: problemUser.id.length,
        charCodes: Array.from(problemUser.id).map(c => c.charCodeAt(0))
      });

      profiles?.forEach((profile, index) => {
        const profileId = String(profile.user_id);
        const authId = String(problemUser.id);
        const exactMatch = profileId === authId;
        const lowercaseMatch = profileId.toLowerCase() === authId.toLowerCase();
        const trimmedMatch = profileId.trim() === authId.trim();

        if (lowercaseMatch || trimmedMatch) {
          edgeLogger.debug(`POTENTIAL MATCH FOUND - Profile #${index}:`, {
            profileId,
            authId,
            exactMatch,
            lowercaseMatch,
            trimmedMatch,
            profileIdLength: profileId.length,
            authIdLength: authId.length,
            profileIdChars: Array.from(profileId).map(c => c.charCodeAt(0)),
            authIdChars: Array.from(authId).map(c => c.charCodeAt(0))
          });
        }
      });

      try {
        edgeLogger.debug("DIRECT QUERY - Attempting direct database query for problem user");

        const { data: exactMatch, error: exactError } = await supabase
          .from('sd_user_profiles')
          .select('*')
          .eq('user_id', problemUser.id)
          .maybeSingle();

        edgeLogger.debug("DIRECT QUERY - Exact match result:", {
          data: exactMatch,
          error: exactError ? exactError.message : undefined
        });

        const { data: ilikeMatch, error: ilikeError } = await supabase
          .from('sd_user_profiles')
          .select('*')
          .ilike('user_id', problemUser.id)
          .maybeSingle();

        edgeLogger.debug("DIRECT QUERY - ILIKE match result:", {
          data: ilikeMatch,
          error: ilikeError ? ilikeError.message : undefined
        });

        const { data: patternMatches, error: patternError } = await supabase
          .from('sd_user_profiles')
          .select('*')
          .like('user_id', `%${problemUser.id.substring(4, 12)}%`);

        edgeLogger.debug("DIRECT QUERY - Pattern match results:", {
          data: patternMatches,
          error: patternError ? patternError.message : undefined,
          count: patternMatches?.length || 0
        });
      } catch (queryError) {
        const errorMessage = queryError instanceof Error ? queryError.message : String(queryError);
        edgeLogger.error("DIRECT QUERY - Error performing direct queries:", {
          error: errorMessage
        });
      }
    }

    const finalProblemUser = users.find(u => u.email === "garciah24@gmail.com");
    edgeLogger.debug("FINAL DATA CHECK - Problem user in response:", finalProblemUser);

    if (problemUser) {
      try {
        edgeLogger.debug("DIRECT SQL QUERY - Attempting to get raw profile data");

        const { data: rawProfileData, error: rawProfileError } = await supabase.rpc(
          'get_raw_profile_data',
          { user_id_param: problemUser.id }
        );

        if (rawProfileError) {
          edgeLogger.error("DIRECT SQL QUERY - Error:", {
            error: rawProfileError.message || 'Unknown error'
          });

          const { data: directData, error: directError } = await supabase
            .from('sd_user_profiles')
            .select('*')
            .eq('user_id', problemUser.id);

          edgeLogger.debug("DIRECT SQL QUERY - Fallback result:", {
            data: directData,
            error: directError ? directError.message : undefined
          });
        } else {
          edgeLogger.debug("DIRECT SQL QUERY - Result:", rawProfileData);
        }
      } catch (sqlError) {
        const errorMessage = sqlError instanceof Error ? sqlError.message : String(sqlError);
        edgeLogger.error("DIRECT SQL QUERY - Exception:", {
          error: errorMessage
        });
      }
    }

    edgeLogger.debug("Admin API - User details:", users.map(u => ({
      id: u.user_id,
      name: u.full_name,
      email: u.email,
      has_profile: u.has_profile
    })));

    const response = successResponse({
      totalUsers: users.length,
      users
    });
    return handleCors(response, request, true);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    edgeLogger.error('Error in users API:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : 'No stack trace'
    });
    const errRes = errorResponse('Internal Server Error', error, 500);
    return handleCors(errRes, request, true);
  }
}

// POST /api/admin/users - Create a new user
export async function POST(request: Request): Promise<Response> {
  const operationId = `admin_post_user_${Math.random().toString(36).substring(2, 8)}`;
  edgeLogger.debug("Admin users POST request started", { operationId });

  try {
    // Use standard client for checking the *requester's* auth/admin status
    const supabase = await createRouteHandlerClient();

    const { data: { user }, error: authErrorReq } = await supabase.auth.getUser(); // Renamed variable
    if (!user) {
      const errRes = unauthorizedError('Authentication required for admin access');
      return handleCors(errRes, request, true);
    }

    const isAdminRequester = await isAdmin(supabase, user.id);
    if (!isAdminRequester) {
      const errRes = errorResponse('Admin privileges required', null, 403);
      return handleCors(errRes, request, true);
    }

    // --- Body Validation --- 
    let body;
    try {
      body = await request.json();
    } catch (e) {
      const errRes = errorResponse('Invalid JSON body', null, 400);
      return handleCors(errRes, request, true);
    }

    const { email, password, name, role } = body;
    if (!email || !password) {
      const errRes = errorResponse('Email and password are required', null, 400);
      return handleCors(errRes, request, true);
    }
    // --- End Body Validation --- 

    // --- Use Admin Client for creating user and profile --- 
    const supabaseAdmin = await createRouteHandlerAdminClient();

    const { data: newUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    });

    if (authError) {
      edgeLogger.error('Error creating user:', { operationId, error: authError.message });
      const errRes = errorResponse(authError.message, authError, 500);
      return handleCors(errRes, request, true);
    }

    if (!newUser?.user?.id) {
      edgeLogger.error('Failed to create user (no ID returned)', { operationId, email });
      const errRes = errorResponse('Failed to create user (no ID returned)', authError, 500);
      return handleCors(errRes, request, true);
    }

    // Create user profile using admin client
    const { error: profileError } = await supabaseAdmin
      .from('sd_user_profiles')
      .insert({ user_id: newUser.user.id, full_name: name || email.split('@')[0] });

    if (profileError) {
      edgeLogger.error('Error creating user profile', { operationId, userId: newUser.user.id, error: profileError.message });
      // Consider attempting to delete the auth user if profile creation fails
      const errRes = errorResponse('Failed to create user profile', profileError.message, 500);
      return handleCors(errRes, request, true);
    }

    // Assign role if provided using admin client
    if (role) {
      const { error: roleError } = await supabaseAdmin
        .from('sd_user_roles')
        .insert({ user_id: newUser.user.id, role });

      if (roleError) {
        edgeLogger.error('Error assigning role', { operationId, userId: newUser.user.id, role, error: roleError.message });
        const errRes = errorResponse('Failed to assign role', roleError.message, 500);
        return handleCors(errRes, request, true);
      }
    }

    const response = successResponse({ user: newUser.user });
    return handleCors(response, request, true);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    edgeLogger.error('Error in create user API:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });
    const errRes = errorResponse('Internal Server Error', error, 500);
    return handleCors(errRes, request, true);
  }
}