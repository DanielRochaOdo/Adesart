import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, createServiceClient, jsonResponse, requireInternalUser } from "../_shared/public-flow.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  const supabase = createServiceClient();
  const auth = await requireInternalUser(req, supabase);
  if (!auth) return jsonResponse({ error: "Autenticacao obrigatoria" }, 401);

  try {
    const body = await req.json();
    if (!body?.dados?.responsavelFinanceiro || !body?.dados?.parceiro?.codigo) {
      return jsonResponse({ error: "Payload invalido" }, 400);
    }

    const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
    const ERP_URL = Deno.env.get("ERP_URL_NOVO_DEPENDENTE") || "https://odontoart.s4e.com.br/api/vendedor/NovoDependente";
    if (!ERP_TOKEN) throw new Error("ERP_TOKEN not configured");

    const startedAt = Date.now();
    const response = await fetch(ERP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: ERP_TOKEN, dados: body.dados }),
    });
    const result = await response.json().catch(() => ({}));
    const ok = response.ok && Boolean(result?.dados);
    const responseBody = ok
      ? { success: true, data: result }
      : { error: String(result?.message || result?.mensagem || "Erro ao incluir dependente no ERP") };

    await supabase.from("api_logs").insert({
      user_id: auth.user.id,
      user_email: auth.user.email,
      endpoint: "erp-novo-dependente",
      method: "POST",
      request_body: { sanitized: true },
      response_body: ok ? { success: true } : responseBody,
      status_code: ok ? 200 : response.status,
      success: ok,
      error_message: ok ? null : responseBody.error,
      duration_ms: Date.now() - startedAt,
    }).catch(() => undefined);

    return jsonResponse(responseBody, ok ? 200 : Math.max(response.status, 400));
  } catch (error) {
    console.error("[erp-novo-dependente]", error);
    return jsonResponse({ error: "Erro interno do servidor" }, 500);
  }
});
