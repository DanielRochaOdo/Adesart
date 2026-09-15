import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  createServiceClient,
  hashSensitiveValue,
  jsonResponse,
  normalizeDigits,
  requireInternalUser,
} from "../_shared/public-flow.ts";

const LEMMIT_COST = 0.12;

const safeInsertLog = async (supabase: any, payload: Record<string, unknown>) => {
  try {
    const { error } = await supabase.from("api_logs").insert(payload);
    if (error) console.warn("[lemit-consulta-pessoa] Falha ao gravar api_logs:", error.message);
  } catch (error) {
    console.warn("[lemit-consulta-pessoa] Falha inesperada ao gravar api_logs:", error);
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  const supabase = createServiceClient();
  const auth = await requireInternalUser(req, supabase);
  if (!auth) return jsonResponse({ error: "Autenticacao obrigatoria" }, 401);

  try {
    const { cpf } = await req.json() as { cpf?: string };
    const normalizedCpf = normalizeDigits(cpf);
    if (normalizedCpf.length !== 11) return jsonResponse({ error: "CPF invalido" }, 400);

    const { data: canUse } = await supabase.rpc("can_use_lemmit", { p_user_id: auth.user.id });
    if (canUse === false) return jsonResponse({ error: "Limite de consultas Lemmit atingido", code: "LEMMIT_LIMIT_EXCEEDED" }, 429);

    const apiKey = Deno.env.get("LEMMIT_API_KEY");
    const endpoint = Deno.env.get("LEMMIT_ENDPOINT") || Deno.env.get("LEMMIT_API_URL") || "http://189.84.127.130:8080/webhook/5e534e38-6f87-400b-a441-821559c6c2e9";
    if (!apiKey) throw new Error("LEMMIT_API_KEY not configured");

    const startedAt = Date.now();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { ApiKey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ documento: normalizedCpf }),
    });
    const result = await response.json().catch(() => ({}));

    await supabase.rpc("decrement_lemmit_balance", { user_id: auth.user.id, amount: LEMMIT_COST });
    await safeInsertLog(supabase, {
      user_id: auth.user.id,
      user_email: auth.user.email,
      endpoint: "lemit-consulta-pessoa",
      method: "POST",
      request_body: { cpf_hash: await hashSensitiveValue(normalizedCpf) },
      response_body: { ok: response.ok, has_person: Boolean(result?.pessoa) },
      status_code: response.status,
      success: response.ok && Boolean(result?.pessoa),
      duration_ms: Date.now() - startedAt,
      cost: LEMMIT_COST,
    });

    if (!response.ok) {
      if (response.status === 404) return jsonResponse({ error: "CPF nao encontrado", notFound: true, canContinue: true }, 404);
      if (response.status === 422) return jsonResponse({ error: "CPF invalido", invalidCPF: true, canContinue: true }, 422);
      return jsonResponse({ error: "Consulta Lemmit indisponivel", workflowError: true, canContinue: true }, 503);
    }
    if (!result?.pessoa) return jsonResponse({ error: "Dados nao encontrados", empty: true, canContinue: true }, 404);
    return jsonResponse(result);
  } catch (error) {
    console.error("[lemit-consulta-pessoa]", error);
    return jsonResponse({ error: "Erro ao consultar Lemmit" }, 500);
  }
});
