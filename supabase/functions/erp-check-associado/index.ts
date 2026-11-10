import { loadCadastroRules, evaluateNewAdhesionEligibility } from "../_shared/cadastro-rules.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  createServiceClient,
  hashSensitiveValue,
  jsonResponse,
  normalizeDigits,
  requireInternalUser,
} from "../_shared/public-flow.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  const supabase = createServiceClient();
  const auth = await requireInternalUser(req, supabase);
  if (!auth) return jsonResponse({ error: "Autenticacao obrigatoria" }, 401);

  try {
    const body = await req.json() as { cpf?: string; codigoAssociado?: string | number };
    const cpf = normalizeDigits(body.cpf);
    if (!cpf && !body.codigoAssociado) return jsonResponse({ error: "CPF ou codigo do associado obrigatorio" }, 400);
    if (body.cpf && cpf.length !== 11) return jsonResponse({ error: "CPF invalido" }, 400);

    const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
    const ERP_BASE_URL = Deno.env.get("ERP_BASE_URL") || "https://odontoart.s4e.com.br";
    if (!ERP_TOKEN) throw new Error("ERP_TOKEN not configured");

    const params = new URLSearchParams({ token: ERP_TOKEN, incluirAns: "true" });
    if (body.codigoAssociado) params.set("codigoAssociado", String(body.codigoAssociado));
    else params.set("cpfAssociado", cpf);

    const startedAt = Date.now();
    const response = await fetch(`${ERP_BASE_URL}/v2/api/associados?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return jsonResponse({ error: "Erro ao consultar ERP" }, 502);
    const result = await response.json();

    let rules: Awaited<ReturnType<typeof loadCadastroRules>>;
    try {
      rules = await loadCadastroRules(supabase);
    } catch (configError) {
      console.error("[erp-check-associado] Falha ao carregar cadastro_config:", configError);
      return jsonResponse({
        error: "Não foi possível carregar as regras de cadastro. Tente novamente.",
        code: "CADASTRO_CONFIG_UNAVAILABLE",
      }, 503);
    }
    const records = Array.isArray(result?.dados) ? result.dados : [];
    const exists = Number(result?.totalRegistros || 0) > 0 || records.length > 0;
    let shouldBlock = false;
    let blockReason = "";
    let summary: Record<string, unknown> = {};

    const eligibility = evaluateNewAdhesionEligibility(records, cpf, rules);
    shouldBlock = eligibility.blocked;
    if (eligibility.matched) {
      const { associado, dep } = eligibility.matched;
      blockReason = eligibility.reason === "ACTIVE_IN_ERP"
        ? "Este CPF ja possui vinculo ativo no ERP e nao pode realizar outra adesao."
        : `Associado ja cadastrado na empresa ${associado?.nomeFantasiaDaEmpresa || "informada"} em situacao que nao permite recadastro`;
      summary = {
        empresa: associado?.codigoDaEmpresa ?? null,
        codigo: associado?.codigo ?? null,
        nomeFantasiaDaEmpresa: associado?.nomeFantasiaDaEmpresa ?? null,
        codigoPlano: dep?.codigoPlano ?? null,
        codigoSituacao: dep?.codigoSituacao ?? null,
        nomeSituacao: dep?.nomeSituacao ?? null,
      };
    }

    if (!shouldBlock && records[0]) {
      const dep = Array.isArray(records[0]?.dependentes) ? records[0].dependentes[0] : null;
      summary = {
        empresa: records[0]?.codigoDaEmpresa ?? null,
        codigo: records[0]?.codigo ?? null,
        nomeFantasiaDaEmpresa: records[0]?.nomeFantasiaDaEmpresa ?? null,
        codigoPlano: dep?.codigoPlano ?? null,
        codigoSituacao: dep?.codigoSituacao ?? null,
        nomeSituacao: dep?.nomeSituacao ?? null,
      };
    }

    // PostgrestBuilder é PromiseLike (thenable), não uma Promise com .catch().
    // Falha no log nunca pode impedir uma consulta de CPF bem-sucedida.
    try {
      const { error: logError } = await supabase.from("api_logs").insert({
        user_id: auth.user.id,
        user_email: auth.user.email,
        endpoint: "erp-check-associado",
        method: "POST",
        request_body: { cpf_hash: cpf ? await hashSensitiveValue(cpf) : null, codigoAssociado: body.codigoAssociado || null },
        response_body: { exists, shouldBlock, totalRegistros: Number(result?.totalRegistros || records.length) },
        status_code: 200,
        success: true,
        duration_ms: Date.now() - startedAt,
      });
      if (logError) console.warn("[erp-check-associado] Log não registrado:", logError.message);
    } catch (logException) {
      console.warn("[erp-check-associado] Erro não bloqueante no log:", logException);
    }

    return jsonResponse({
      exists,
      shouldBlock,
      blockReason,
      totalRegistros: Number(result?.totalRegistros || records.length),
      dados: records,
      summary,
    });
  } catch (error) {
    console.error("[erp-check-associado]", error);
    return jsonResponse({ error: "Erro ao consultar ERP", code: "ERP_CHECK_INTERNAL_ERROR" }, 500);
  }
});
