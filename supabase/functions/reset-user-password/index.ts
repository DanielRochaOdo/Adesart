import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Método não permitido' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { success: false, error: 'Configuração interna indisponível' },
        500,
      );
    }

    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return jsonResponse({ success: false, error: 'Não autorizado' }, 401);
    }

    const token = authorization.replace(/^Bearer\s+/i, '').trim();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user: requestingUser },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !requestingUser) {
      return jsonResponse({ success: false, error: 'Não autorizado' }, 401);
    }

    const { data: requestingProfile, error: requestingProfileError } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', requestingUser.id)
      .maybeSingle();

    if (
      requestingProfileError ||
      !requestingProfile ||
      requestingProfile.is_active !== true
    ) {
      return jsonResponse({ success: false, error: 'Perfil inválido ou inativo' }, 403);
    }

    const requestingRole = String(requestingProfile.role || '').toUpperCase();
    if (!['ADMINISTRADOR', 'CADASTRO'].includes(requestingRole)) {
      return jsonResponse(
        { success: false, error: 'Sem permissão para redefinir senhas' },
        403,
      );
    }

    const body = await req.json().catch(() => ({}));
    const userId = String(body?.user_id || '').trim();
    const newPassword = typeof body?.new_password === 'string'
      ? body.new_password
      : '';

    if (!userId) {
      return jsonResponse({ success: false, error: 'Usuário não informado' }, 400);
    }

    if (newPassword.length < 6) {
      return jsonResponse(
        { success: false, error: 'A nova senha deve ter no mínimo 6 caracteres' },
        400,
      );
    }

    if (newPassword.length > 72) {
      return jsonResponse(
        { success: false, error: 'A nova senha excede o limite permitido' },
        400,
      );
    }

    const { data: targetProfile, error: targetProfileError } = await supabase
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', userId)
      .maybeSingle();

    if (targetProfileError || !targetProfile) {
      return jsonResponse({ success: false, error: 'Usuário não encontrado' }, 404);
    }

    const targetRole = String(targetProfile.role || '').toUpperCase();

    if (requestingRole === 'CADASTRO' && targetRole === 'ADMINISTRADOR') {
      return jsonResponse(
        {
          success: false,
          error: 'A função Cadastro não pode redefinir a senha de administradores',
        },
        403,
      );
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      console.error('[reset-user-password] Falha ao atualizar senha:', updateError.message);
      return jsonResponse(
        { success: false, error: 'Não foi possível redefinir a senha' },
        500,
      );
    }

    return jsonResponse({
      success: true,
      user_id: userId,
      reset_by_role: requestingRole,
    });
  } catch (error) {
    console.error(
      '[reset-user-password] Erro inesperado:',
      error instanceof Error ? error.message : String(error),
    );
    return jsonResponse(
      { success: false, error: 'Erro interno ao redefinir a senha' },
      500,
    );
  }
});
