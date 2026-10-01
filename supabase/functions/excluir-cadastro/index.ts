import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ExcluirCadastroRequest {
  cadastroId: string;
  motivoExclusao: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Token de autenticação não fornecido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { cadastroId, motivoExclusao }: ExcluirCadastroRequest = await req.json();

    if (!cadastroId || !motivoExclusao?.trim()) {
      return new Response(
        JSON.stringify({ error: 'ID do cadastro e motivo são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, role, team_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Perfil do usuário não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: cadastro, error: cadastroError } = await supabase
      .from('cadastros')
      .select('*')
      .eq('id', cadastroId)
      .single();

    if (cadastroError || !cadastro) {
      return new Response(
        JSON.stringify({ error: 'Cadastro não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (profile.role === 'VENDEDOR' && cadastro.vendedor_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Você só pode excluir suas próprias adesões' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (profile.role === 'ADESIONISTA' && cadastro.created_by !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Você só pode excluir suas próprias adesões' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (
      profile.role === 'CADASTRO' &&
      !['incompleto', 'adesoes_pendentes'].includes(String(cadastro.status || '').toLowerCase())
    ) {
      return new Response(
        JSON.stringify({ error: 'A função Cadastro só pode excluir adesões pendentes' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: insertError } = await supabase
      .from('cadastros_excluidos')
      .insert({
        cadastro_id: cadastro.id,
        dados_cadastro: cadastro,
        motivo_exclusao: motivoExclusao.trim(),
        excluido_por: user.id,
        excluido_por_nome: profile.name,
        excluido_por_role: profile.role,
        team_id: cadastro.team_id,
      });

    if (insertError) {
      console.error('Erro ao registrar exclusão:', insertError);
      return new Response(
        JSON.stringify({ error: 'Erro ao registrar exclusão', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: deleteError } = await supabase
      .from('cadastros')
      .delete()
      .eq('id', cadastroId);

    if (deleteError) {
      console.error('Erro ao excluir cadastro:', deleteError);
      return new Response(
        JSON.stringify({ error: 'Erro ao excluir cadastro', details: deleteError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Cadastro excluído com sucesso' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro ao processar exclusão:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});