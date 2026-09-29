import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, createServiceClient, jsonResponse, requireInternalUser } from "../_shared/public-flow.ts";

const ERP_DEPENDENTE_FALHA_INTERNA =
  "Nao foi possivel concluir a inclusao do dependente. Verifique se ele ja aparece no cadastro antes de tentar novamente. Se o problema continuar, entre em contato com o suporte.";

const isTechnicalErpFailure = (message: string) => {
  const normalized = message.toLowerCase().replace(/\s+/g, " ").trim();
  return normalized.includes("the select list for the insert statement contains more items than the insert list") ||
    normalized.includes("the number of select values must match the number of insert columns") ||
    normalized.includes("incorrect syntax near");
};

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
    const technicalMessage = String(
      result?.message || result?.mensagem || "Erro ao incluir dependente no ERP",
    );
    const userMessage = isTechnicalErpFailure(technicalMessage)
      ? ERP_DEPENDENTE_FALHA_INTERNA
      : technicalMessage;
    const responseBody = ok
      ? { success: true, data: result }
      : { error: userMessage };

    await supabase.from("api_logs").insert({
      user_id: auth.user.id,
      user_email: auth.user.email,
      endpoint: "erp-novo-dependente",
      method: "POST",
      request_body: { sanitized: true },
      response_body: ok
        ? { success: true }
        : {
            error: userMessage,
            technical_error: technicalMessage,
          },
      status_code: ok ? 200 : response.status,
      success: ok,
      error_message: ok ? null : technicalMessage,
      duration_ms: Date.now() - startedAt,
    }).catch(() => undefined);

    return jsonResponse(responseBody, ok ? 200 : Math.max(response.status, 400));
  } catch (error) {
    console.error("[erp-novo-dependente]", error);
    return jsonResponse({ error: "Erro interno do servidor" }, 500);
  }
});
