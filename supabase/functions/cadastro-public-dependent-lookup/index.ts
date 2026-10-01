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

const isActiveErpStatus = (dep: any) => {
  const statusCode = Number(dep?.codigoSituacao);
  const statusName = String(dep?.nomeSituacao || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return statusCode === 1 || statusName === "ATIVO";
};

const checkErpEligibility = async (cpf: string) => {
  const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
  let ERP_BASE_URL = Deno.env.get("ERP_BASE_URL") || "https://odontoart.s4e.com.br";

  if (!ERP_TOKEN) throw new Error("ERP_TOKEN not configured");
  if (!/^https?:\/\//i.test(ERP_BASE_URL)) ERP_BASE_URL = `https://${ERP_BASE_URL}`;
  ERP_BASE_URL = ERP_BASE_URL.replace(/\/+$/, "");

  const url = `${ERP_BASE_URL}/v2/api/associados?token=${encodeURIComponent(ERP_TOKEN)}&cpfAssociado=${cpf}&incluirAns=true`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("ERP_VALIDATION_UNAVAILABLE");

  const result = await response.json();
  const records = Array.isArray(result?.dados) ? result.dados : [];

  for (const associado of records) {
    const dependentes = Array.isArray(associado?.dependentes) ? associado.dependentes : [];
    const exactMatches = dependentes.filter(
      (dep: any) => normalizeDigits(dep?.numeroCpfDependente) === cpf,
    );

    let candidates = exactMatches;

    if (candidates.length === 0 && normalizeDigits(associado?.cpf) === cpf && dependentes.length > 0) {
      candidates = [dependentes[0]];
    }

    for (const dep of candidates) {
      if (isActiveErpStatus(dep)) {
        return {
          eligible: false,
          activeRecord: {
            codigoAssociado: associado?.codigo ?? null,
            codigoEmpresa: associado?.codigoDaEmpresa ?? null,
            codigoDependente: dep?.codigoDependente ?? null,
            codigoPlano: dep?.codigoPlano ?? null,
            codigoSituacao: dep?.codigoSituacao ?? null,
            nomeSituacao: dep?.nomeSituacao ?? null,
          },
        };
      }
    }
  }

  return { eligible: true, activeRecord: null };
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

    let erpEligibility: Awaited<ReturnType<typeof checkErpEligibility>>;
    try {
      erpEligibility = await checkErpEligibility(cpf);
    } catch (erpError) {
      await safeLog(supabase, {
        endpoint: "cadastro-public-dependent-lookup:erp-eligibility",
        method: "GET",
        request_body: { attempt_id: attempt.id, cpf_hash: await hashSensitiveValue(cpf) },
        response_body: { eligible: null },
        status_code: 503,
        success: false,
        error_message: erpError instanceof Error ? erpError.message : "ERP_VALIDATION_UNAVAILABLE",
        duration_ms: Date.now() - startedAt,
      });
      return jsonResponse({
        error: "Nao foi possivel verificar a situacao do dependente no ERP. Tente novamente.",
        code: "ERP_UNAVAILABLE",
      }, 503);
    }

    await safeLog(supabase, {
      endpoint: "cadastro-public-dependent-lookup:erp-eligibility",
      method: "GET",
      request_body: { attempt_id: attempt.id, cpf_hash: await hashSensitiveValue(cpf) },
      response_body: { eligible: erpEligibility.eligible, activeRecord: erpEligibility.activeRecord },
      status_code: 200,
      success: true,
      duration_ms: Date.now() - startedAt,
    });

    if (!erpEligibility.eligible) {
      return jsonResponse({
        error: "Este CPF ja possui plano ativo no sistema e nao pode ser incluido como dependente por este link.",
        code: "ACTIVE_IN_ERP",
        activeRecord: erpEligibility.activeRecord,
      }, 409);
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
