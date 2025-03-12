import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// Helper to check if a user is an admin
async function isAdmin(supabase: any, userId: string) {
  console.log("[isAdmin] Checking admin status for user:", userId);
  
  // Hard-code known admin users for now as a fallback
  const knownAdminIds = ['5c80df74-1e2b-4435-89eb-b61b740120e9'];
  
  try {
    // Use the RPC function that checks sd_user_roles
    const { data, error } = await supabase.rpc('is_admin', { uid: userId });
    
    if (error) {
      console.error("[isAdmin] Error checking admin status:", error);
      // Fall back to hard-coded admin check
      return knownAdminIds.includes(userId);
    }
    
    console.log("[isAdmin] Admin role check result:", data);
    return !!data;
  } catch (err) {
    console.error("[isAdmin] Exception checking admin status:", err);
    // Fall back to hard-coded admin check
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
export async function GET(request: Request) {
  // Log some debug info
  console.log("Admin users API - Using service role key if available");
  console.log("Admin users API - Using URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log("Admin users API - Service key exists:", !!process.env.SUPABASE_KEY);
  
  // Try to use service role key if available, otherwise fall back to anon key
  const apiKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  // Get cookies with proper handler
  const cookieStore = await cookies();
  
  // Create supabase client with proper cookie handling
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    apiKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
  
  // Verify the user is authenticated and an admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Check if user is an admin
  const admin = await isAdmin(supabase, user.id);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  
  try {
    // Try to get the table names first to verify connection
    console.log("Admin API - Verifying database connection");
    const { data: tables, error: tablesError } = await supabase
      .from('sd_user_profiles')
      .select('user_id')
      .limit(1);
      
    if (tablesError) {
      console.error('Error connecting to database:', tablesError);
      return NextResponse.json({ error: 'Database connection failed', details: tablesError }, { status: 500 });
    }
    
    console.log("Admin API - Database connection successful");
    
    // Let's do a simple count first to verify how many profiles exist in the database
    const { count, error: countError } = await supabase
      .from('sd_user_profiles')
      .select('*', { count: 'exact', head: true });
      
    if (countError) {
      console.error('Error counting user profiles:', countError);
    } else {
      console.log(`Admin API - Count query shows ${count} user profiles exist`);
    }
    
    // Try using multiple methods to get ALL users
    console.log("Admin API - TRYING MULTIPLE METHODS TO GET ALL PROFILES");
    
    // Method 1: Regular query 
    const { data: profiles1, error: profilesError1 } = await supabase
      .from('sd_user_profiles')
      .select('*');
      
    console.log(`Admin API - Method 1 found ${profiles1?.length || 0} profiles`);
    
    // Method 2: Try direct query - wrapped in try/catch to handle errors
    let profiles2 = null;
    try {
      // Try to use RPC if it exists
      const result = await supabase.rpc('admin_get_all_profiles');
      profiles2 = result.data;
      console.log(`Admin API - Method 2 found ${profiles2?.length || 0} profiles`);
    } catch (err) {
      console.log('Admin API - Method 2 failed (RPC not available)');
    }
    
    // Method 3: List all auth users and check if they have profiles
    console.log("Admin API - Getting auth users to check for profiles");
    const { data: authData } = await supabase.auth.admin.listUsers();
    
    if (authData?.users && authData.users.length > 0) {
      console.log(`Admin API - Found ${authData.users.length} auth users to check for profiles`);
      
      // List each auth user
      authData.users.forEach((user, index) => {
        console.log(`Auth User ${index + 1}: ID=${user.id}, Email=${user.email}`);
      });
      
      // Check each one to see if they have a profile
      for (const authUser of authData.users) {
        try {
          const { data: profile } = await supabase
            .from('sd_user_profiles')
            .select('*')
            .eq('user_id', authUser.id)
            .single();
            
          console.log(`Auth user ${authUser.email} has profile: ${!!profile}`);
          if (profile) {
            console.log(`Profile for ${authUser.email}:`, profile);
          }
        } catch (err) {
          console.log(`No profile for ${authUser.email}`);
        }
      }
    }
    
    // Use the results from Method 1
    const profiles = profiles1;
    const profilesError = profilesError1;
    
    if (profilesError) {
      console.error('Error fetching user profiles:', profilesError);
      return NextResponse.json({ error: 'Failed to fetch users', details: profilesError }, { status: 500 });
    }
    
    console.log(`Admin API - Successfully retrieved ${profiles?.length || 0} user profiles`);
    
    // Debug: show raw profile data with special focus on is_admin
    console.log("Admin API - Raw profiles data:", profiles);
    
    // SIMPLIFIED APPROACH: Map auth users to include profile data
    const users = authData?.users?.map(authUser => {
      // Find profile by user_id (ensuring string comparison)
      const profile = profiles?.find(p => String(p.user_id) === String(authUser.id));
      
      // Only log for the specific problematic user
      if (authUser.email === "garciah24@gmail.com") {
        console.log("Problem user detection:", {
          userId: authUser.id,
          userIdType: typeof authUser.id,
          hasProfile: !!profile,
          profileDetails: profile,
          allProfileIds: profiles?.map(p => String(p.user_id))
        });
        
        // Add detailed profile inspection
        if (profile) {
          // Try to find company field with different approaches
          const companyField = findFieldCaseInsensitive(profile, 'company_name');
          const companyFieldAlt = findFieldCaseInsensitive(profile, 'company');
          
          // Check all possible field names for company
          const allPossibleCompanyFields = [
            'company_name', 'companyName', 'company', 'Company', 'CompanyName',
            'company_title', 'companyTitle', 'business_name', 'businessName',
            'organization', 'organization_name', 'organizationName'
          ];
          
          const foundCompanyFields = allPossibleCompanyFields
            .filter(field => profile[field] !== undefined)
            .map(field => ({ field, value: profile[field] }));
          
          console.log("DETAILED PROFILE INSPECTION:", {
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
        // Use the comprehensive helper function
        company: findCompanyName(profile),
        has_profile: !!profile,
        // Include auth user's created_at
        created_at: authUser.created_at || (profile ? profile.created_at : null),
        // Include all profile fields if available
        ...(profile ? {
          company_name: profile.company_name,
          website_url: profile.website_url,
          company_description: profile.company_description,
          location: profile.location,
          updated_at: profile.updated_at,
          website_summary: profile.website_summary
        } : {}),
        // Include auth user fields
        last_sign_in_at: authUser.last_sign_in_at
      };
    }) || [];
    
    console.log(`Admin API - Created list of ${users.length} users`);
    
    // Add this debug log to verify profile data right before returning
    const problemUser = authData?.users?.find(u => u.email === "garciah24@gmail.com");
    const problemUserProfile = profiles?.find(p => String(p.user_id) === String(problemUser?.id));
    console.log("RAW DATA CHECK - Problem user:", problemUser);
    console.log("RAW DATA CHECK - Problem user profile:", problemUserProfile);
    console.log("RAW DATA CHECK - All profiles user_ids:", profiles?.map(p => ({ id: p.user_id, type: typeof p.user_id })));
    
    // Check for case sensitivity or other subtle differences
    if (problemUser) {
      console.log("DETAILED ID CHECK - Problem user ID:", {
        id: problemUser.id,
        length: problemUser.id.length,
        charCodes: Array.from(problemUser.id).map(c => c.charCodeAt(0))
      });
      
      // Check each profile for potential near-matches
      profiles?.forEach((profile, index) => {
        const profileId = String(profile.user_id);
        const authId = String(problemUser.id);
        const exactMatch = profileId === authId;
        const lowercaseMatch = profileId.toLowerCase() === authId.toLowerCase();
        const trimmedMatch = profileId.trim() === authId.trim();
        
        if (lowercaseMatch || trimmedMatch) {
          console.log(`POTENTIAL MATCH FOUND - Profile #${index}:`, {
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
      
      // Try a direct database query with alternative approaches
      try {
        console.log("DIRECT QUERY - Attempting direct database query for problem user");
        
        // Try exact match
        const { data: exactMatch, error: exactError } = await supabase
          .from('sd_user_profiles')
          .select('*')
          .eq('user_id', problemUser.id)
          .maybeSingle();
          
        console.log("DIRECT QUERY - Exact match result:", { data: exactMatch, error: exactError });
        
        // Try with ILIKE for case insensitivity
        const { data: ilikeMatch, error: ilikeError } = await supabase
          .from('sd_user_profiles')
          .select('*')
          .ilike('user_id', problemUser.id)
          .maybeSingle();
          
        console.log("DIRECT QUERY - ILIKE match result:", { data: ilikeMatch, error: ilikeError });
        
        // Try with pattern matching
        const { data: patternMatches, error: patternError } = await supabase
          .from('sd_user_profiles')
          .select('*')
          .like('user_id', `%${problemUser.id.substring(4, 12)}%`);
          
        console.log("DIRECT QUERY - Pattern match results:", { 
          data: patternMatches, 
          error: patternError,
          count: patternMatches?.length || 0
        });
      } catch (queryError) {
        console.error("DIRECT QUERY - Error performing direct queries:", queryError);
      }
    }
    
    // Check if the problem user appears in the final list with correct data
    const finalProblemUser = users.find(u => u.email === "garciah24@gmail.com");
    console.log("FINAL DATA CHECK - Problem user in response:", finalProblemUser);
    
    // Add a direct SQL query to get the raw profile data
    if (problemUser) {
      try {
        console.log("DIRECT SQL QUERY - Attempting to get raw profile data");
        
        // Use RPC to run a direct SQL query
        const { data: rawProfileData, error: rawProfileError } = await supabase.rpc(
          'get_raw_profile_data',
          { user_id_param: problemUser.id }
        );
        
        if (rawProfileError) {
          console.error("DIRECT SQL QUERY - Error:", rawProfileError);
          
          // Fallback: Try a direct query with the service role
          const { data: directData, error: directError } = await supabase
            .from('sd_user_profiles')
            .select('*')
            .eq('user_id', problemUser.id);
            
          console.log("DIRECT SQL QUERY - Fallback result:", {
            data: directData,
            error: directError
          });
        } else {
          console.log("DIRECT SQL QUERY - Result:", rawProfileData);
        }
      } catch (sqlError) {
        console.error("DIRECT SQL QUERY - Exception:", sqlError);
      }
    }
    
    // Log final user data
    console.log("Admin API - User details:", users.map(u => ({
      id: u.user_id, 
      name: u.full_name, 
      email: u.email,
      has_profile: u.has_profile
    })));
    
    return NextResponse.json({ 
      totalUsers: users.length,
      users 
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in users API:', errorMessage);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ 
      error: 'Internal Server Error', 
      message: errorMessage 
    }, { status: 500 });
  }
}

// POST /api/admin/users - Create a new user
export async function POST(request: Request) {
  // Try to use service role key if available, otherwise fall back to anon key
  const apiKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  // Get cookies with proper handler
  const cookieStore = await cookies();
  
  // Create supabase client with proper cookie handling
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    apiKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
  
  // Verify the user is authenticated and an admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Check if user is an admin
  const admin = await isAdmin(supabase, user.id);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  
  try {
    const body = await request.json();
    const { email, password, name, role } = body;
    
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    
    // Create user in Supabase Auth
    const { data: newUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    });
    
    if (authError) {
      console.error('Error creating user:', authError);
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }
    
    // Create user profile
    const { error: profileError } = await supabase
      .from('sd_user_profiles')
      .insert([
        { user_id: newUser.user.id, name: name || email.split('@')[0] }
      ]);
    
    if (profileError) {
      console.error('Error creating user profile:', profileError);
      return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 });
    }
    
    // Assign role if provided
    if (role) {
      const { error: roleError } = await supabase
        .from('sd_user_roles')
        .insert([
          { user_id: newUser.user.id, role }
        ]);
      
      if (roleError) {
        console.error('Error assigning role:', roleError);
        return NextResponse.json({ error: 'Failed to assign role' }, { status: 500 });
      }
    }
    
    return NextResponse.json({ user: newUser.user });
  } catch (error) {
    console.error('Error in create user API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}