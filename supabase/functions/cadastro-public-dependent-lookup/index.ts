import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  createServiceClient,
  hashSensitiveValue,
  jsonResponse,
  normalizeDigits,
  resolveAttempt,
} from "../_shared/public-flow.ts";

const LEMMIT_COST = 0.12;
const LEMMIT_ENDPOINT = "http://189.84.127.130:8080/webhook/5e534e38-6f87-400b-a441-821559c6c2e9";

const validateCpf = (cpf: string) => {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (baseLength: number) => {
    let sum = 0;
    for (let i = 0; i < baseLength; i += 1) sum += Number(cpf[i]) * (baseLength + 1 - i);
    const value = (sum * 10) % 11;
    return value === 10 ? 0 : value;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
};

const safeLog = async (supabase: any, payload: Record<string, unknown>) => {
  try {
    const { error } = await supabase.from("api_logs").insert(payload);
    if (error) console.warn("[cadastro-public-dependent-lookup] log", error.message);
  } catch (error) {
    console.warn("[cadastro-public-dependent-lookup] log inesperado", error);
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  const startedAt = Date.now();

  try {
    const body = await req.json() as { attemptToken?: string; cpf?: string };
    const attemptToken = String(body.attemptToken || "").trim();
    const cpf = normalizeDigits(body.cpf);

    if (!attemptToken) return jsonResponse({ error: "Sessao de adesao obrigatoria" }, 401);
    if (!validateCpf(cpf)) return jsonResponse({ error: "CPF do dependente invalido", code: "INVALID_CPF" }, 400);

    const supabase = createServiceClient();
    const attempt = await resolveAttempt(supabase, attemptToken);
    if (!attempt || attempt.status !== "authenticated") {
      return jsonResponse({ error: "Sessao expirada. Inicie novamente.", code: "SESSION_EXPIRED" }, 401);
    }

    const titularCpf = normalizeDigits(attempt.profile_snapshot?.cpf);
    if (titularCpf && titularCpf === cpf) {
      return jsonResponse({ error: "O CPF do dependente nao pode ser o mesmo do responsavel financeiro", code: "SAME_AS_HOLDER" }, 400);
    }

    const apiKey = Deno.env.get("LEMMIT_API_KEY");
    if (!apiKey) throw new Error("LEMMIT_API_KEY not configured");

    const response = await fetch(LEMMIT_ENDPOINT, {
      method: "POST",
      headers: {
        ApiKey: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ documento: cpf }),
    });

    const rawText = await response.text();
    let result: any = {};
    try {
      result = rawText ? JSON.parse(rawText) : {};
    } catch {
      result = {};
    }

    await safeLog(supabase, {
      endpoint: "cadastro-public-dependent-lookup:lemmit",
      method: "POST",
      request_body: { attempt_id: attempt.id, cpf_hash: await hashSensitiveValue(cpf) },
      response_body: { ok: response.ok, has_person: Boolean(result?.pessoa) },
      status_code: response.status,
      success: response.ok && Boolean(result?.pessoa),
      duration_ms: Date.now() - startedAt,
      cost: LEMMIT_COST,
    });

    if (response.status === 404) {
      return jsonResponse({ error: "CPF nao encontrado na Lemmit", code: "NOT_FOUND", canContinue: true }, 404);
    }
    if (response.status === 422) {
      return jsonResponse({ error: "CPF invalido", code: "INVALID_CPF", canContinue: true }, 422);
    }
    if (!response.ok) {
      return jsonResponse({ error: "Nao foi possivel consultar os dados do dependente", code: "LEMMIT_UNAVAILABLE", canContinue: true }, 503);
    }
    if (!result?.pessoa || Object.keys(result.pessoa).length === 0) {
      return jsonResponse({ error: "Dados do dependente nao encontrados", code: "EMPTY_RESULT", canContinue: true }, 404);
    }

    return jsonResponse({ ok: true, pessoa: result.pessoa });
  } catch (error) {
    console.error("[cadastro-public-dependent-lookup]", error);
    return jsonResponse({ error: "Nao foi possivel consultar os dados do dependente", code: "DEPENDENT_LOOKUP_FAILED" }, 500);
  }
});
