import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, createServiceClient, jsonResponse, requireInternalUser } from "../_shared/public-flow.ts";

const extractMessage = (payload: any) => {
  for (const value of [payload?.message, payload?.mensagem, payload?.error, payload?.dados?.mensagem, payload?.data?.mensagem]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "Erro ao enviar cadastro para o ERP";
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  const supabase = createServiceClient();
  const auth = await requireInternalUser(req, supabase);
  if (!auth) return jsonResponse({ error: "Autenticacao obrigatoria" }, 401);

  try {
    const requestBody = await req.json();
    if (!requestBody?.dados?.responsavelFinanceiro) return jsonResponse({ error: "Payload invalido" }, 400);

    const cadastroId = (req.headers.get("X-Cadastro-Id") || req.headers.get("x-cadastro-id") || "").trim();
    const idempotencyKey = (req.headers.get("X-Idempotency-Key") || req.headers.get("x-idempotency-key") || "").trim();

    if (cadastroId) {
      const { data: existing } = await supabase.from("cadastros").select("status, erp_response").eq("id", cadastroId).maybeSingle();
      if (existing?.status === "enviado" && existing?.erp_response) {
        return jsonResponse({ ...(existing.erp_response as Record<string, unknown>), idempotent: true, reused: true });
      }
    }

    if (idempotencyKey) {
      const { data: existingLog } = await supabase.from("api_logs")
        .select("response_body")
        .eq("endpoint", "erp-novo-usuario2")
        .eq("success", true)
        .contains("request_body", { idempotency_key: idempotencyKey })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingLog?.response_body) {
        return jsonResponse({ ...(existingLog.response_body as Record<string, unknown>), idempotent: true, reused: true });
      }
    }

    const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
    const ERP_URL = Deno.env.get("ERP_URL") || "https://odontoart.s4e.com.br/api/vendedor/NovoUsuario2";
    if (!ERP_TOKEN) throw new Error("ERP_TOKEN not configured");

    const startedAt = Date.now();
    const response = await fetch(ERP_URL, {
      method: "POST",
      headers: { token: ERP_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const result = await response.json().catch(() => ({}));
    const hasCode = result?.dados?.codigo || result?.data?.dados?.codigo;
    const ok = response.ok && Boolean(hasCode);
    const responseBody = ok ? { success: true, data: result } : { error: extractMessage(result), details: result };

    await supabase.from("api_logs").insert({
      user_id: auth.user.id,
      user_email: auth.user.email,
      endpoint: "erp-novo-usuario2",
      method: "POST",
      request_body: { cadastro_id: cadastroId || null, idempotency_key: idempotencyKey || null },
      response_body: ok ? { success: true, erp_code: hasCode } : { error: responseBody.error },
      status_code: ok ? 200 : response.status,
      success: ok,
      error_message: ok ? null : responseBody.error,
      duration_ms: Date.now() - startedAt,
    }).catch(() => undefined);

    return jsonResponse(responseBody, ok ? 200 : Math.max(response.status, 400));
  } catch (error) {
    console.error("[erp-novo-usuario2]", error);
    return jsonResponse({ error: "Erro interno do servidor" }, 500);
  }
});
