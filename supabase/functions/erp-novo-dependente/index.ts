import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, createServiceClient, jsonResponse, requireInternalUser } from "../_shared/public-flow.ts";

const ERP_DEPENDENTE_FALHA_INTERNA =
  "Não foi possível concluir a inclusão do dependente. Verifique se ele já aparece no cadastro antes de tentar novamente. Se o problema continuar, entre em contato com o suporte.";

const isTechnicalErpFailure = (message: string) => {
  const normalized = message.toLowerCase().replace(/\s+/g, " ").trim();
  return normalized.includes("the select list for the insert statement contains more items than the insert list") ||
    normalized.includes("the number of select values must match the number of insert columns") ||
    normalized.includes("incorrect syntax near");
};

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const normalizeText = (value: unknown) => String(value ?? "")
  .trim()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toUpperCase();
const normalizeDate = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [d, m, y] = raw.split("/");
    return `${y}-${m}-${d}`;
  }
  return "";
};
const isActive = (dep: any) => {
  const code = Number(dep?.codigoSituacao);
  const name = normalizeText(dep?.nomeSituacao);
  return code === 1 || name === "ATIVO";
};

const erpBaseUrl = () => {
  let base = Deno.env.get("ERP_BASE_URL") || Deno.env.get("ERP_ENDPOINT") || "https://odontoart.s4e.com.br";
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return base.replace(/\/+$/, "");
};

const fetchAssociados = async (token: string, params: Record<string, string>) => {
  const query = new URLSearchParams({ token, incluirAns: "true", ...params });
  const response = await fetch(
    `${erpBaseUrl()}/v2/api/associados?${query.toString()}`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) },
  );
  if (!response.ok) throw new Error("ERP_PREFLIGHT_UNAVAILABLE");
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload?.dados) ? payload.dados : [];
};

const dependentIdentityMatch = (erpDep: any, requestDep: any) => {
  const requestCpf = digits(requestDep?.cpf);
  const erpCpf = digits(erpDep?.numeroCpfDependente ?? erpDep?.cpfDependente ?? erpDep?.cpf);
  if (requestCpf) return erpCpf === requestCpf;

  const requestName = normalizeText(requestDep?.nome);
  const erpName = normalizeText(erpDep?.nomeDependente ?? erpDep?.nome);
  const requestBirth = normalizeDate(requestDep?.dataNascimento);
  const erpBirth = normalizeDate(
    erpDep?.dataNascimento ??
      erpDep?.dataNascimentoDependente ??
      erpDep?.dtNascimento,
  );
  return Boolean(requestName && requestBirth && requestName === erpName && requestBirth === erpBirth);
};

const preflightPendingDependentInclusion = async (
  erpToken: string,
  holderCode: number,
  requestedDependents: any[],
) => {
  const holderRecords = await fetchAssociados(erpToken, { codigoAssociado: String(holderCode) });
  const holder = holderRecords.find((item: any) => Number(item?.codigo) === holderCode) || holderRecords[0] || null;
  if (!holder) {
    return { holderActive: false, duplicates: [] as any[] };
  }

  const holderDeps = Array.isArray(holder?.dependentes) ? holder.dependentes : [];
  const holderActive = holderDeps.some((dep: any) => isActive(dep));
  const duplicates: any[] = [];

  for (const requestDep of requestedDependents) {
    const localMatch = holderDeps.find((dep: any) => isActive(dep) && dependentIdentityMatch(dep, requestDep));
    if (localMatch) {
      duplicates.push({
        nome: String(requestDep?.nome || localMatch?.nomeDependente || localMatch?.nome || ""),
        cpf: digits(requestDep?.cpf),
        codigoDependente: Number(localMatch?.codigoDependente || localMatch?.codigo || 0) || null,
        reason: "already_linked_to_holder",
      });
      continue;
    }

    const requestCpf = digits(requestDep?.cpf);
    if (!requestCpf) continue;

    const records = await fetchAssociados(erpToken, { cpfDependente: requestCpf });
    let activeElsewhere: any = null;
    for (const associado of records) {
      const deps = Array.isArray(associado?.dependentes) ? associado.dependentes : [];
      activeElsewhere = deps.find((dep: any) =>
        isActive(dep) &&
        digits(dep?.numeroCpfDependente ?? dep?.cpfDependente ?? dep?.cpf) === requestCpf
      );
      if (activeElsewhere) break;
    }

    if (activeElsewhere) {
      duplicates.push({
        nome: String(requestDep?.nome || activeElsewhere?.nomeDependente || activeElsewhere?.nome || ""),
        cpf: requestCpf,
        codigoDependente: Number(activeElsewhere?.codigoDependente || activeElsewhere?.codigo || 0) || null,
        reason: "active_in_erp",
      });
    }
  }

  return { holderActive, duplicates };
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

    const cadastroId = (req.headers.get("X-Cadastro-Id") || req.headers.get("x-cadastro-id") || "").trim();
    let pendingCadastro: any = null;
    if (cadastroId) {
      const { data, error: cadastroError } = await supabase
        .from("cadastros")
        .select("id,tipo_cadastro,link_pendencia_id,responsavel_financeiro_codigo")
        .eq("id", cadastroId)
        .maybeSingle();
      if (cadastroError) throw cadastroError;
      pendingCadastro = data || null;
    }

    const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
    const ERP_URL = Deno.env.get("ERP_URL_NOVO_DEPENDENTE") || "https://odontoart.s4e.com.br/api/vendedor/NovoDependente";
    if (!ERP_TOKEN) throw new Error("ERP_TOKEN not configured");

    if (pendingCadastro?.link_pendencia_id) {
      if (pendingCadastro?.tipo_cadastro !== "inclusao_dependente") {
        return jsonResponse({
          error: "Tipo de operacao invalido para inclusao de dependente.",
          code: "INVALID_PENDING_OPERATION",
        }, 409);
      }

      const holderCode = Number(
        pendingCadastro?.responsavel_financeiro_codigo ??
          body?.dados?.responsavelFinanceiro?.codigo ??
          0,
      );
      const requestedDependents = Array.isArray(body?.dados?.dependente) ? body.dados.dependente : [];
      if (!Number.isInteger(holderCode) || holderCode <= 0 || requestedDependents.length === 0) {
        return jsonResponse({
          error: "Dados insuficientes para validar a inclusao no S4E.",
          code: "PENDING_PREFLIGHT_INVALID",
        }, 409);
      }

      let preflight: { holderActive: boolean; duplicates: any[] };
      try {
        preflight = await preflightPendingDependentInclusion(
          ERP_TOKEN,
          holderCode,
          requestedDependents,
        );
      } catch (preflightError) {
        const now = new Date().toISOString();
        await supabase.from("link_pendencias").update({
          status: "aguardando_analise",
          last_error: "Nao foi possivel confirmar a situacao atual do associado e dos dependentes no S4E.",
          last_activity_at: now,
          updated_at: now,
        }).eq("id", pendingCadastro.link_pendencia_id);
        return jsonResponse({
          error: "Nao foi possivel validar a situacao atual no S4E. Tente novamente.",
          code: "ERP_PREFLIGHT_UNAVAILABLE",
        }, 503);
      }

      if (!preflight.holderActive) {
        const now = new Date().toISOString();
        await supabase.from("link_pendencias").update({
          status: "aguardando_analise",
          last_error: "O vinculo do titular nao esta ativo no S4E.",
          last_activity_at: now,
          updated_at: now,
        }).eq("id", pendingCadastro.link_pendencia_id);
        return jsonResponse({
          error: "O titular nao possui vinculo ativo no S4E para receber novos dependentes.",
          code: "MEMBER_NOT_ACTIVE",
        }, 409);
      }

      if (preflight.duplicates.length > 0) {
        const labels = preflight.duplicates.map((item) =>
          item.cpf ? `${item.nome || "Dependente"} (${item.cpf})` : item.nome || "Dependente"
        );
        const now = new Date().toISOString();
        await supabase.from("link_pendencias").update({
          status: "aguardando_analise",
          last_error: `Dependente(s) ja ativo(s) no S4E: ${labels.join(", ")}`,
          erp_response: { preflight: true, duplicates: preflight.duplicates },
          last_activity_at: now,
          updated_at: now,
        }).eq("id", pendingCadastro.link_pendencia_id);
        return jsonResponse({
          error: `Revise a solicitacao. Ja existe(m) dependente(s) ativo(s) no S4E: ${labels.join(", ")}.`,
          code: "DEPENDENT_ACTIVE_IN_ERP",
          duplicates: preflight.duplicates,
        }, 409);
      }
    }

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
      request_body: { sanitized: true, cadastro_id: cadastroId || null, link_pending: Boolean(pendingCadastro?.link_pendencia_id) },
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
