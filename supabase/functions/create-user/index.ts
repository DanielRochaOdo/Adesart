import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface CreateUserRequest {
  name: string;
  email: string;
  password: string;
  role: 'ADMINISTRADOR' | 'GERENTE' | 'CADASTRO' | 'SUPERVISOR' | 'VENDEDOR' | 'ADESIONISTA';
  external_id?: string;
  team_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: requestingUser }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !requestingUser) {
      throw new Error('Unauthorized');
    }

    const { data: requestingProfile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role, team_id, is_active')
      .eq('id', requestingUser.id)
      .maybeSingle();

    if (profileError || !requestingProfile || !requestingProfile.is_active) {
      throw new Error('User profile not found or inactive');
    }

    const requestData: CreateUserRequest = await req.json();
    const { name, email, password, role, external_id, team_id } = requestData;

    if (!name || !email || !password || !role) {
      throw new Error('Missing required fields: name, email, password, role');
    }

    const validRoles = ['ADMINISTRADOR', 'GERENTE', 'CADASTRO', 'SUPERVISOR', 'VENDEDOR', 'ADESIONISTA'];
    if (!validRoles.includes(role)) {
      throw new Error('Invalid role');
    }

    if (['CADASTRO', 'VENDEDOR', 'ADESIONISTA', 'SUPERVISOR'].includes(role)) {
      if (!external_id || !team_id) {
        throw new Error(`${role} requires external_id and team_id`);
      }
    }

    if (['ADMINISTRADOR', 'GERENTE'].includes(role)) {
      if (external_id || team_id) {
        throw new Error(`${role} should not have external_id or team_id`);
      }
    }

    if (requestingProfile.role === 'SUPERVISOR') {
      if (team_id !== requestingProfile.team_id) {
        throw new Error('Supervisors can only create users in their own team');
      }
    }

    if (!['ADMINISTRADOR', 'SUPERVISOR'].includes(requestingProfile.role)) {
      throw new Error('Insufficient permissions to create users');
    }

    const { data: authData, error: createAuthError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createAuthError || !authData.user) {
      throw new Error(`Failed to create auth user: ${createAuthError?.message}`);
    }

    const { data: profile, error: createProfileError } = await supabaseClient
      .from('profiles')
      .insert({
        id: authData.user.id,
        name,
        email,
        role,
        external_id: external_id || null,
        team_id: team_id || null,
        is_active: true,
      })
      .select()
      .single();

    if (createProfileError) {
      await supabaseClient.auth.admin.deleteUser(authData.user.id);
      throw new Error(`Failed to create profile: ${createProfileError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: profile,
      }),
      {
        status: 201,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});