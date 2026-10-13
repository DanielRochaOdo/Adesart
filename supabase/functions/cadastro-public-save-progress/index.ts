import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  resolveAttempt,
  upsertLinkPendingJourney,
} from "../_shared/public-flow.ts";

const allowedStages = new Set([
  "identified",
  "details",
  "dependents",
  "existing_contact",
  "review",
  "existing_review",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  try {
    const body = await req.json().catch(() => ({})) as {
      attemptToken?: string;
      stage?: string;
      snapshot?: Record<string, unknown>;
    };

    const attemptToken = String(body.attemptToken || "").trim();
    const stage = String(body.stage || "").trim();
    if (!attemptToken || !allowedStages.has(stage)) {
      return jsonResponse({ error: "Sessao ou etapa invalida" }, 400);
    }

    const snapshot = body.snapshot && typeof body.snapshot === "object" ? body.snapshot : {};
    const serialized = JSON.stringify(snapshot);
    if (serialized.length > 250_000) {
      return jsonResponse({ error: "Dados da solicitacao excedem o limite permitido" }, 413);
    }

    const supabase = createServiceClient();
    const attempt = await resolveAttempt(supabase, attemptToken);
    if (!attempt || attempt.status !== "authenticated") {
      return jsonResponse({ error: "Sessao expirada" }, 401);
    }

    const { data: link, error: linkError } = await supabase
      .from("cadastro_links")
      .select("*")
      .eq("id", attempt.link_id)
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link) return jsonResponse({ error: "Link nao encontrado" }, 404);

    const row = await upsertLinkPendingJourney({
      supabase,
      attempt,
      link,
      snapshot,
      stage,
      status: "aguardando_analise",
    });

    return jsonResponse({
      ok: true,
      pendingId: row?.id || null,
      stage,
    });
  } catch (error) {
    console.error("[cadastro-public-save-progress]", error);
    return jsonResponse({ error: "Nao foi possivel salvar o andamento da solicitacao" }, 500);
  }
});
