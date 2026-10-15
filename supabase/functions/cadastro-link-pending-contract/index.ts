import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, createServiceClient, jsonResponse, requireInternalUser } from "../_shared/public-flow.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);
  try {
    const supabase = createServiceClient();
    const actor = await requireInternalUser(req, supabase);
    if (!actor) return jsonResponse({ error: "Autenticacao obrigatoria" }, 401);
    const body = await req.json().catch(() => ({})) as { pendingId?: string };
    if (!body.pendingId) return jsonResponse({ error: "Pendencia obrigatoria" }, 400);
    const { data: pending, error: pendingError } = await supabase.from("link_pendencias")
      .select("id,created_by,vendedor_id,team_id,contract_session_id")
      .eq("id", body.pendingId).maybeSingle();
    if (pendingError) throw pendingError;
    if (!pending || !pending.contract_session_id) return jsonResponse({ error: "Contrato indisponivel" }, 404);
    const role = String(actor.profile.role || "").toUpperCase();
    const userId = String(actor.profile.id);
    if (role === "VENDEDOR" && String(pending.vendedor_id || "") !== userId) {
      return jsonResponse({ error: "Sem permissao para visualizar o contrato" }, 403);
    }
    if (role === "SUPERVISOR" && String(pending.team_id || "") !== String(actor.profile.team_id || "")) {
      return jsonResponse({ error: "Sem permissao para visualizar o contrato" }, 403);
    }
    const { data: session, error: sessionError } = await supabase.from("public_contract_sessions")
      .select("pdf_storage_path,accepted_at").eq("id", pending.contract_session_id).maybeSingle();
    if (sessionError) throw sessionError;
    if (!session?.pdf_storage_path || !session.accepted_at) {
      return jsonResponse({ error: "Contrato aceito ainda nao disponivel" }, 404);
    }
    const { data: signed, error: storageError } = await supabase.storage.from("contracts")
      .createSignedUrl(session.pdf_storage_path, 300, { download: `Contrato-Aceito-${pending.id}.pdf` });
    if (storageError || !signed?.signedUrl) throw storageError || Error("SIGNED_URL_FAILED");
    return jsonResponse({ ok: true, url: signed.signedUrl });
  } catch (error) {
    console.error("[cadastro-link-pending-contract]", error);
    return jsonResponse({ error: "Nao foi possivel disponibilizar o contrato" }, 500);
  }
});
