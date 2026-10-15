import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders, createServiceClient, jsonResponse, resolveAttempt,
} from "../_shared/public-flow.ts";

// Endpoint legado: nao permite concluir a solicitacao sem revisar e aceitar
// o contrato. O fluxo atual usa cadastro-public-contract-accept.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);
  try {
    const body = await req.json().catch(() => ({})) as { attemptToken?: string };
    if (!body.attemptToken) return jsonResponse({ error: "Sessao obrigatoria" }, 401);
    const supabase = createServiceClient();
    const attempt = await resolveAttempt(supabase, body.attemptToken);
    if (!attempt || attempt.status !== "authenticated") {
      return jsonResponse({ error: "Sessao expirada" }, 401);
    }
    const { data: link, error } = await supabase.from("cadastro_links")
      .select("requires_authorization").eq("id", attempt.link_id).maybeSingle();
    if (error) throw error;
    if (!link) return jsonResponse({ error: "Link indisponivel" }, 410);
    return jsonResponse({
      error: "Revise o contrato, confirme o e-mail e registre o aceite antes de enviar para analise.",
      code: "CONTRACT_ACCEPTANCE_REQUIRED",
    }, 409);
  } catch (error) {
    console.error("[cadastro-public-pending-finalize]", error);
    return jsonResponse({ error: "Nao foi possivel validar a solicitacao" }, 500);
  }
});
