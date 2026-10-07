import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  normalizeDate,
  normalizeDigits,
  resolveAttempt,
  sanitizePlan,
  sha256,
  stableStringify,
} from "../_shared/public-flow.ts";

type DepInput = {
  tipo?: number;
  nome?: string;
  cpf?: string;
  dataNascimento?: string;
  sexo?: number;
  nomeMae?: string;
  plano?: number;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isActive = (dep: any) => {
  const code = Number(dep?.codigoSituacao);
  const name = String(dep?.nomeSituacao || "")
    .trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return code === 1 || name === "ATIVO";
};
const validCpf = (value?: string | null) => {
  const cpf = normalizeDigits(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (n: number) => {
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += Number(cpf[i]) * (n + 1 - i);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
};
const baseUrl = () => {
  let base = Deno.env.get("ERP_BASE_URL") || "https://odontoart.s4e.com.br";
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return base.replace(/\/+$/, "");
};
const erpToken = () => {
  const token = Deno.env.get("ERP_TOKEN");
  if (!token) throw new Error("ERP_TOKEN_NOT_CONFIGURED");
  return token;
};
const fetchAssociados = async (params: Record<string, string>) => {
  const query = new URLSearchParams({ token: erpToken(), incluirAns: "true", ...params });
  const response = await fetch(`${baseUrl()}/v2/api/associados?${query.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("ERP_VALIDATION_UNAVAILABLE");
  const result = await response.json();
  return Array.isArray(result?.dados) ? result.dados : [];
};
const holderActive = (record: any, cpf: string) => {
  if (normalizeDigits(record?.cpf) !== cpf) return false;
  const deps = Array.isArray(record?.dependentes) ? record.dependentes : [];
  const exact = deps.filter((dep: any) => normalizeDigits(dep?.numeroCpfDependente) === cpf);
  const candidates = exact.length ? exact : deps.slice(0, 1);
  return candidates.some(isActive);
};
const anyActive = async (cpf: string) => {
  const records = await fetchAssociados({ cpfAssociado: cpf });
  return records.some((record: any) => {
    const deps = Array.isArray(record?.dependentes) ? record.dependentes : [];
    const exact = deps.filter((dep: any) => normalizeDigits(dep?.numeroCpfDependente) === cpf);
    const candidates = exact.length
      ? exact
      : normalizeDigits(record?.cpf) === cpf
        ? deps.slice(0, 1)
        : [];
    return candidates.some(isActive);
  });
};
const companyPlans = async (companyCode: number) => {
  const response = await fetch(
    `${baseUrl()}/api/empresa/BuscaEmpresas?token=${encodeURIComponent(erpToken())}&empresaId=${encodeURIComponent(String(companyCode))}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error("ERP_CATALOG_UNAVAILABLE");
  const result = await response.json();
  const company = Array.isArray(result?.dados) ? result.dados[0] : null;
  if (!company) throw new Error("ERP_COMPANY_NOT_FOUND");
  const raw = Array.isArray(company?.PrecoPlano)
    ? company.PrecoPlano
    : Array.isArray(company?.precoPlano)
      ? company.precoPlano
      : [];
  const plans = raw.map(sanitizePlan).filter((plan: any) =>
    Number(plan.Plano) > 0 &&
    Number(plan.ValorTitular) > 0 &&
    Number(plan.ValorDependente) > 0
  );
  return { company, raw, plans };
};
const erpDate = (value: string) => {
  const [year, month, day] = normalizeDate(value).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "";
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const memberHasDependentCpf = (record: any, cpf: string) => {
  const target = normalizeDigits(cpf);
  const dependents = Array.isArray(record?.dependentes) ? record.dependentes : [];
  return dependents.some((dep: any) => normalizeDigits(dep?.numeroCpfDependente) === target);
};

const resolveSellerCode = async (supabase: any, link: any) => {
  const direct = Number.parseInt(String(link?.vendedor_codigo || ""), 10);
  if (direct > 0) return direct;

  for (const id of [link?.vendedor_id, link?.created_by].filter(Boolean)) {
    const { data } = await supabase
      .from("profiles")
      .select("external_id")
      .eq("id", id)
      .maybeSingle();
    const code = Number.parseInt(String(data?.external_id || ""), 10);
    if (code > 0) return code;
  }

  return 0;
};

const reconcileDependentsInErp = async (memberCode: number, cpfs: string[]) => {
  const delays = [0, 1200, 2500];
  for (const delay of delays) {
    if (delay > 0) await sleep(delay);
    try {
      const records = await fetchAssociados({ codigoAssociado: String(memberCode) });
      const holder = records.find((item: any) => Number(item?.codigo) === memberCode);
      if (!holder) continue;
      if (cpfs.every((cpf) => memberHasDependentCpf(holder, cpf))) {
        return { reconciled: true, holder };
      }
    } catch (error) {
      console.warn("[cadastro-public-dependent-submit] reconcile", error);
    }
  }
  return { reconciled: false, holder: null };
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  const supabase = createServiceClient();
  let submissionId: string | null = null;

  try {
    const body = await req.json() as {
      attemptToken?: string;
      confirmedPhone?: string;
      confirmedEmail?: string;
      dependents?: DepInput[];
    };
    const attemptToken = String(body.attemptToken || "").trim();
    const phone = normalizeDigits(body.confirmedPhone).slice(0, 13);
    const email = String(body.confirmedEmail || "").trim().toLowerCase();
    const deps = Array.isArray(body.dependents) ? body.dependents : [];

    if (!attemptToken) return jsonResponse({ error: "Sessao obrigatoria" }, 401);
    if (phone.length < 10) return jsonResponse({ error: "Informe um telefone valido" }, 400);
    if (!emailRegex.test(email)) return jsonResponse({ error: "Informe um e-mail valido" }, 400);
    if (!deps.length) return jsonResponse({ error: "Adicione ao menos um dependente" }, 400);

    const attempt = await resolveAttempt(supabase, attemptToken);
    if (attempt?.status === "completed") {
      const { data: done } = await supabase.from("public_dependent_submissions")
        .select("cadastro_id").eq("attempt_id", attempt.id).eq("status", "succeeded").maybeSingle();
      return jsonResponse({
        ok: true,
        state: "completed",
        cadastroId: done?.cadastro_id || null,
        message: "Dependente(s) ja incluido(s) com sucesso.",
      });
    }
    if (!attempt || attempt.status !== "authenticated") {
      return jsonResponse({ error: "Sessao expirada. Inicie novamente.", code: "SESSION_EXPIRED" }, 401);
    }
    if (attempt.flow_mode !== "existing_member" || !attempt.erp_member_snapshot) {
      return jsonResponse({ error: "Esta sessao nao permite inclusao de dependentes", code: "INVALID_FLOW_MODE" }, 409);
    }

    const holderCpf = normalizeDigits(attempt.profile_snapshot?.cpf);
    const memberCode = Number(attempt.erp_member_snapshot?.codigoAssociado);
    if (!validCpf(holderCpf) || !Number.isInteger(memberCode) || memberCode <= 0) {
      return jsonResponse({ error: "Vinculo do associado invalido. Inicie novamente." }, 409);
    }

    const normalized = deps.map((dep) => ({
      tipo: Number(dep?.tipo || 0),
      nome: String(dep?.nome || "").trim(),
      cpf: normalizeDigits(dep?.cpf),
      dataNascimento: normalizeDate(dep?.dataNascimento),
      sexo: Number(dep?.sexo),
      nomeMae: String(dep?.nomeMae || "").trim(),
      plano: Number(dep?.plano || 0),
    }));

    const seen = new Set<string>([holderCpf]);
    for (let i = 0; i < normalized.length; i += 1) {
      const dep = normalized[i];
      if (!dep.nome || !dep.nomeMae || !dep.dataNascimento || dep.tipo <= 0 || dep.plano <= 0 || ![0, 1].includes(dep.sexo)) {
        return jsonResponse({ error: `Preencha todos os dados obrigatorios do dependente ${i + 1}` }, 400);
      }
      if (!validCpf(dep.cpf)) return jsonResponse({ error: `CPF invalido no dependente ${i + 1}` }, 400);
      if (seen.has(dep.cpf)) return jsonResponse({ error: "Existem CPFs duplicados na solicitacao" }, 400);
      seen.add(dep.cpf);
    }

    const records = await fetchAssociados({ codigoAssociado: String(memberCode) });
    const holder = records.find((item: any) => Number(item?.codigo) === memberCode);
    if (!holder || !holderActive(holder, holderCpf)) {
      return jsonResponse({ error: "O vinculo do associado nao esta mais ativo.", code: "MEMBER_NOT_ACTIVE" }, 409);
    }

    const companyCode = Number(holder?.codigoDaEmpresa);
    if (!Number.isInteger(companyCode) || companyCode <= 0) {
      return jsonResponse({ error: "Empresa do associado nao identificada no ERP", code: "MEMBER_COMPANY_NOT_FOUND" }, 409);
    }
    const catalog = await companyPlans(companyCode);
    const planMap = new Map<number, any>(
      catalog.plans.map((plan: any): [number, any] => [Number(plan.Plano), plan]),
    );
    for (const dep of normalized) {
      if (!planMap.has(dep.plano)) {
        return jsonResponse({ error: "Um dos planos selecionados nao esta mais disponivel.", code: "PLAN_NOT_AVAILABLE" }, 409);
      }
      if (memberHasDependentCpf(holder, dep.cpf)) {
        return jsonResponse({
          error: `${dep.nome} ja consta vinculado a este associado no ERP.`,
          code: "DEPENDENT_ALREADY_LINKED",
        }, 409);
      }
      if (await anyActive(dep.cpf)) {
        return jsonResponse({ error: `${dep.nome} ja possui plano ativo e nao pode ser incluido novamente.`, code: "DEPENDENT_ACTIVE_IN_ERP" }, 409);
      }
    }

    const requestHash = await sha256(stableStringify({
      attemptId: attempt.id,
      phone,
      email,
      dependents: normalized,
    }));
    const { data: previous } = await supabase.from("public_dependent_submissions")
      .select("*").eq("attempt_id", attempt.id).maybeSingle();

    if (previous?.status === "succeeded") {
      return jsonResponse({
        ok: true,
        state: "completed",
        cadastroId: previous.cadastro_id || null,
        message: "Dependente(s) ja incluido(s) com sucesso.",
      });
    }
    if (previous?.status === "processing" && Date.now() - new Date(previous.updated_at).getTime() < 120000) {
      return jsonResponse({ error: "Sua solicitacao ja esta sendo processada.", code: "SUBMISSION_PROCESSING" }, 409);
    }

    if (previous) {
      const { data: claimed } = await supabase.from("public_dependent_submissions").update({
        request_hash: requestHash,
        status: "processing",
        confirmed_phone: phone,
        confirmed_email: email,
        dependents_snapshot: normalized,
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", previous.id).neq("status", "succeeded").select("id").maybeSingle();
      if (!claimed) return jsonResponse({ error: "Sua solicitacao ja esta sendo processada." }, 409);
      submissionId = claimed.id;
    } else {
      const { data: inserted, error } = await supabase.from("public_dependent_submissions").insert({
        attempt_id: attempt.id,
        request_hash: requestHash,
        status: "processing",
        confirmed_phone: phone,
        confirmed_email: email,
        dependents_snapshot: normalized,
      }).select("id").single();
      if (error || !inserted) return jsonResponse({ error: "Sua solicitacao ja esta sendo processada." }, 409);
      submissionId = inserted.id;
    }

    const { data: link } = await supabase.from("cadastro_links").select("*")
      .eq("id", attempt.link_id).eq("is_active", true).maybeSingle();
    if (!link) throw new Error("LINK_UNAVAILABLE");

    const sellerCode = await resolveSellerCode(supabase, link);
    if (!Number.isInteger(sellerCode) || sellerCode <= 0) throw new Error("SELLER_CODE_INVALID");
    const adesionistaCode = Number(link.adesionista_codigo || 0) || 0;
    const monthYear = new Date().toISOString().slice(0, 7);

    const erpDeps = normalized.map((dep) => ({
      tipo: dep.tipo,
      nome: dep.nome,
      cpf: dep.cpf,
      sexo: dep.sexo,
      plano: dep.plano,
      planoValor: Number(planMap.get(dep.plano)?.ValorDependente || 0).toFixed(2),
      nomeMae: dep.nomeMae,
      numeroProposta: "",
      carenciaAtendimento: 1,
      rcaId: 0,
      cd_orientacao_sexual: 0,
      OutraOrientacaoSexual: "",
      cd_ident_genero: 0,
      OutraIdentidadeGenero: "",
      idExterno: "",
      MMYYYY1Pagamento: monthYear,
      numeroCarteira: "",
      observacaoUsuario: "",
      dataNascimento: erpDate(dep.dataNascimento),
      funcionarioCadastro: sellerCode,
      dataCadastroLoteContrato: "",
      estadoCivil: 0,
    }));

    const erpPayload = {
      parceiro: { codigo: sellerCode, adesionista: adesionistaCode },
      responsavelFinanceiro: { codigo: memberCode, dataAssinaturaContrato: "" },
      dependente: erpDeps,
      contatoDependente: [],
    };

    const erpUrl = Deno.env.get("ERP_URL_NOVO_DEPENDENTE") || "https://odontoart.s4e.com.br/api/vendedor/NovoDependente";
    let erpStatus = 502;
    let erpResult: any = {};
    let erpOk = false;
    let transportError: unknown = null;

    try {
      const erpResponse = await fetchWithTimeout(erpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: erpToken(), dados: erpPayload }),
      }, 20_000);
      erpStatus = erpResponse.status;
      erpResult = await erpResponse.json().catch(() => ({}));
      erpOk = erpResponse.ok && Boolean(erpResult?.dados);
    } catch (error) {
      transportError = error;
    }

    if (!erpOk) {
      const reconciliation = await reconcileDependentsInErp(
        memberCode,
        normalized.map((dep) => dep.cpf),
      );
      if (reconciliation.reconciled) {
        erpOk = true;
        erpResult = {
          reconciled: true,
          message: "Inclusao confirmada por reconciliacao no ERP.",
          original_response: erpResult,
        };
      }
    }

    if (!erpOk) {
      const errorMessage = transportError
        ? "Nao foi possivel confirmar o resultado do envio ao ERP. Tente novamente em alguns instantes."
        : String(erpResult?.message || erpResult?.mensagem || "Erro ao incluir dependente no ERP");
      await supabase.from("public_dependent_submissions").update({
        status: "failed",
        erp_response: erpResult,
        last_error: errorMessage,
        updated_at: new Date().toISOString(),
      }).eq("id", submissionId);
      return jsonResponse({
        error: errorMessage,
        code: transportError ? "ERP_DEPENDENT_RESULT_UNCERTAIN" : "ERP_DEPENDENT_FAILED",
      }, transportError ? 503 : Math.max(erpStatus, 400));
    }

    const historyPayload = {
      status: "enviado",
      tipo_cadastro: "inclusao_dependente",
      created_by: link.created_by,
      team_id: link.team_id || null,
      responsavel_financeiro_codigo: memberCode,
      responsavel_financeiro_nome: String(holder?.nome || attempt.profile_snapshot?.nome || ""),
      responsavel_financeiro_cpf: holderCpf,
      contatos_responsavel_financeiro: [
        { tipo: "whatsapp", valor: phone, principal: true },
        { tipo: "email", valor: email, principal: true },
      ],
      empresa_id: companyCode,
      empresa_codigo: companyCode,
      empresa_nome: String(holder?.nomeFantasiaDaEmpresa || catalog.company?.nomeFantasia || catalog.company?.razaoSocial || ""),
      empresa_raw: catalog.company,
      planos_raw: catalog.raw,
      vendedor_id: link.vendedor_id || null,
      vendedor_codigo: String(link.vendedor_codigo || ""),
      vendedor_nome: String(link.vendedor_nome || ""),
      adesionista_id: link.adesionista_id || null,
      adesionista_codigo: link.adesionista_codigo || null,
      adesionista_nome: link.adesionista_nome || null,
      dependentes: normalized.map((dep) => ({
        tipo: dep.tipo,
        nome: dep.nome,
        cpf: dep.cpf,
        data_nascimento: dep.dataNascimento,
        sexo: dep.sexo === 1 ? "Masculino" : "Feminino",
        plano_codigo: dep.plano,
        plano_valor: Number(planMap.get(dep.plano)?.ValorDependente || 0).toFixed(2),
        nome_mae: dep.nomeMae,
      })),
      payload_erp: { dados: erpPayload },
      erp_response: erpResult,
      fluxo_publico: true,
      origem_link_id: link.id,
    };

    const { data: history, error: historyError } = await supabase.from("cadastros")
      .insert(historyPayload).select("id").single();
    const cadastroId = history?.id || null;
    const warning = historyError
      ? "Inclusao concluida no ERP, mas o historico gerencial nao foi gravado."
      : null;

    await supabase.from("public_dependent_submissions").update({
      status: "succeeded",
      erp_response: erpResult,
      cadastro_id: cadastroId,
      last_error: warning,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", submissionId);

    await supabase.from("public_adesao_attempts").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", attempt.id);

    return jsonResponse({
      ok: true,
      state: "completed",
      cadastroId,
      warning,
      message: "Dependente(s) incluido(s) com sucesso!",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    console.error("[cadastro-public-dependent-submit]", error);
    if (submissionId) {
      await supabase.from("public_dependent_submissions").update({
        status: "failed",
        last_error: message,
        updated_at: new Date().toISOString(),
      }).eq("id", submissionId);
    }
    if (message === "ERP_VALIDATION_UNAVAILABLE" || message === "ERP_CATALOG_UNAVAILABLE") {
      return jsonResponse({ error: "Nao foi possivel validar os dados no ERP neste momento.", code: message }, 503);
    }
    if (message === "LINK_UNAVAILABLE") return jsonResponse({ error: "Link indisponivel" }, 410);
    if (message === "SELLER_CODE_INVALID") return jsonResponse({ error: "O link nao possui vendedor valido para concluir a inclusao." }, 409);
    return jsonResponse({ error: "Nao foi possivel concluir a inclusao de dependentes" }, 500);
  }
});
