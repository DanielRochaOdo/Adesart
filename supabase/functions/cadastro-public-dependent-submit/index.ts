import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";
import {
  corsHeaders,
  createServiceClient,
  getRequestIp,
  hashSensitiveValue,
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


const makeAcceptedPdf = async (text: string, acceptedAt: string) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 595.28;
  const height = 841.89;
  const margin = 48;
  const size = 9.5;
  const lineHeight = 13;
  const maxWidth = width - margin * 2;

  const clean = (value: string) => value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");

  const wrap = (value: string) => {
    const out: string[] = [];
    let line = "";
    for (const word of clean(value).split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
    return out.length ? out : [""];
  };

  let page = pdf.addPage([width, height]);
  let y = height - margin;
  const ensure = () => {
    if (y < margin + lineHeight * 2) {
      page = pdf.addPage([width, height]);
      y = height - margin;
    }
  };

  page.drawText("ODONTOART - CONTRATO DE ADESAO", { x: margin, y, size: 13, font: bold });
  y -= 24;

  for (const paragraph of clean(text).split("\n")) {
    ensure();
    if (!paragraph.trim()) {
      y -= lineHeight;
      continue;
    }
    for (const line of wrap(paragraph)) {
      ensure();
      page.drawText(line, { x: margin, y, size, font });
      y -= lineHeight;
    }
    y -= 3;
  }

  y -= 8;
  for (const line of wrap(`Aceite eletrônico realizado em ${acceptedAt}`)) {
    ensure();
    page.drawText(line, { x: margin, y, size, font });
    y -= lineHeight;
  }

  return new Uint8Array(await pdf.save());
};

const triggerDeliveryWorker = async (contractSessionId: string) => {
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const base = Deno.env.get("SUPABASE_URL") || "";
  if (!service || !base) return { ok: false, error: "DELIVERY_WORKER_CONFIG_MISSING" };

  try {
    const response = await fetch(`${base}/functions/v1/process-contract-deliveries`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${service}`,
        apikey: service,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "cadastro-public-dependent-submit",
        contractSessionId,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn("[cadastro-public-dependent-submit] delivery worker HTTP", response.status, result);
      return { ok: false, status: response.status, error: result?.error || "DELIVERY_WORKER_FAILED" };
    }
    return result;
  } catch (error) {
    console.warn("[cadastro-public-dependent-submit] delivery trigger", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "DELIVERY_WORKER_FAILED",
    };
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  const supabase = createServiceClient();
  let submissionId: string | null = null;
  let contractSessionId: string | null = null;
  let erpCommitted = false;

  try {
    const body = await req.json() as {
      attemptToken?: string;
      contractToken?: string;
      acceptedTerms?: boolean;
      acceptedData?: boolean;
      acceptedCoverage?: boolean;
      confirmedPhone?: string;
      confirmedEmail?: string;
      dependents?: DepInput[];
    };
    const attemptToken = String(body.attemptToken || "").trim();
    const contractToken = String(body.contractToken || "").trim();
    const phone = normalizeDigits(body.confirmedPhone).slice(0, 13);
    const email = String(body.confirmedEmail || "").trim().toLowerCase();
    const deps = Array.isArray(body.dependents) ? body.dependents : [];

    if (!attemptToken) return jsonResponse({ error: "Sessao obrigatoria" }, 401);
    if (!contractToken || body.acceptedTerms !== true || body.acceptedData !== true) {
      return jsonResponse({
        error: "Leia e aceite os termos da inclusao e confirme os dados antes de concluir.",
        code: "CONTRACT_ACCEPTANCE_REQUIRED",
      }, 400);
    }
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

    const tokenHash = await sha256(contractToken);
    const { data: initialContractSession, error: contractSessionError } = await supabase
      .from("public_contract_sessions")
      .select("*")
      .eq("attempt_id", attempt.id)
      .eq("contract_token_hash", tokenHash)
      .maybeSingle();
    if (contractSessionError || !initialContractSession) {
      return jsonResponse({ error: "Termos nao encontrados ou expirados. Revise novamente antes de concluir." }, 404);
    }
    if (initialContractSession.snapshot?.flowMode !== "existing_member") {
      return jsonResponse({ error: "Os termos apresentados nao pertencem a esta inclusao.", code: "INVALID_CONTRACT_FLOW" }, 409);
    }

    if (initialContractSession.status === "completed") {
      return jsonResponse({
        ok: true,
        state: "completed",
        cadastroId: initialContractSession.cadastro_id || null,
        message: "Dependente(s) ja incluido(s) com sucesso.",
      });
    }
    if (["erp_registered", "deliveries_pending"].includes(initialContractSession.status)) {
      const deliveryResult = await triggerDeliveryWorker(initialContractSession.id);
      return jsonResponse({
        ok: true,
        state: initialContractSession.status,
        cadastroId: initialContractSession.cadastro_id || null,
        deliveryPending: !deliveryResult?.ok,
        message: "Inclusao concluida. O termo aceito esta sendo enviado por e-mail e anexado ao ERP.",
      });
    }
    if (initialContractSession.status === "needs_attention") {
      return jsonResponse({
        ok: true,
        state: "needs_attention",
        cadastroId: initialContractSession.cadastro_id || null,
        deliveryPending: true,
        warning: "A inclusao foi concluida, mas a entrega do termo precisa de reprocessamento.",
        message: "Dependente(s) incluido(s) com sucesso.",
      });
    }
    if (initialContractSession.status === "erp_processing") {
      return jsonResponse({
        ok: true,
        state: "processing",
        cadastroId: initialContractSession.cadastro_id || null,
        message: "Sua solicitacao ja esta sendo processada.",
      }, 202);
    }
    if (!["prepared", "erp_failed"].includes(initialContractSession.status)) {
      return jsonResponse({ error: "Estes termos nao podem mais ser utilizados. Revise a solicitacao novamente." }, 409);
    }

    const preparedCadastro = initialContractSession.snapshot?.cadastro;
    const requiresCoverageConsent = preparedCadastro?.coberturaDisponivel === true ||
      (preparedCadastro?.coberturaDisponivel == null &&
        Array.isArray(preparedCadastro?.coberturaPlanoArquivos) &&
        preparedCadastro.coberturaPlanoArquivos.length > 0);
    if (requiresCoverageConsent && body.acceptedCoverage !== true) {
      return jsonResponse({ error: "Leia e aceite a cobertura disponibilizada antes de concluir." }, 400);
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
      const label = `Dependente ${i + 1}`;
      if (!validCpf(dep.cpf)) return jsonResponse({ error: `${label}: informe um CPF valido.` }, 400);
      if (seen.has(dep.cpf)) return jsonResponse({ error: `${label}: este CPF ja foi informado na solicitacao.` }, 400);
      seen.add(dep.cpf);
      if (dep.tipo <= 1) return jsonResponse({ error: `${label}: selecione o grau de parentesco.` }, 400);
      if (!dep.nome) return jsonResponse({ error: `${label}: informe o nome completo.` }, 400);
      if (!dep.dataNascimento) return jsonResponse({ error: `${label}: informe uma data de nascimento valida.` }, 400);
      if (![0, 1].includes(dep.sexo)) return jsonResponse({ error: `${label}: selecione o sexo.` }, 400);
      if (!dep.nomeMae) return jsonResponse({ error: `${label}: informe o nome da mae.` }, 400);
      if (dep.plano <= 0) return jsonResponse({ error: `${label}: selecione o plano.` }, 400);
    }

    const preparedDependents = Array.isArray(preparedCadastro?.dependentes)
      ? preparedCadastro.dependentes.map((dep: any) => ({
        tipo: Number(dep?.tipo || 0),
        nome: String(dep?.nome || "").trim(),
        cpf: normalizeDigits(dep?.cpf),
        dataNascimento: normalizeDate(dep?.dataNascimento),
        sexo: Number(dep?.sexo),
        nomeMae: String(dep?.nomeMae || "").trim(),
        plano: Number(dep?.plano || 0),
      }))
      : [];
    const preparedPhone = (Array.isArray(preparedCadastro?.contatos) ? preparedCadastro.contatos : [])
      .filter((item: any) => ["celular", "whatsapp", "fixo"].includes(String(item?.tipo || "")))
      .map((item: any) => normalizeDigits(item?.valor))
      .find((value: string) => value.length >= 10) || "";
    const preparedEmail = String(initialContractSession.confirmed_email || "").trim().toLowerCase();

    if (
      preparedPhone !== phone ||
      preparedEmail !== email ||
      stableStringify(preparedDependents) !== stableStringify(normalized)
    ) {
      return jsonResponse({
        error: "Os dados foram alterados depois da apresentacao dos termos. Revise os termos novamente.",
        code: "CONTRACT_DATA_CHANGED",
      }, 409);
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

    const now = new Date().toISOString();
    const ipHash = await hashSensitiveValue(getRequestIp(req));
    const { data: claimedContractSession, error: claimContractError } = await supabase
      .from("public_contract_sessions")
      .update({
        status: "erp_processing",
        accepted_terms: true,
        accepted_data: true,
        accepted_at: initialContractSession.accepted_at || now,
        accepted_ip_hash: initialContractSession.accepted_ip_hash || ipHash,
        accepted_user_agent: initialContractSession.accepted_user_agent || req.headers.get("user-agent") || "unknown",
        updated_at: now,
      })
      .eq("id", initialContractSession.id)
      .in("status", ["prepared", "erp_failed"])
      .select("*")
      .maybeSingle();
    if (claimContractError) throw claimContractError;
    if (!claimedContractSession) {
      return jsonResponse({ ok: true, state: "processing", message: "Sua solicitacao ja esta sendo processada." }, 202);
    }
    contractSessionId = claimedContractSession.id;

    const requestHash = await sha256(stableStringify({
      attemptId: attempt.id,
      contractHash: claimedContractSession.contract_hash,
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
      if (contractSessionId) {
        await supabase.from("public_contract_sessions").update({
          status: "erp_failed",
          erp_response: { error: errorMessage, response: erpResult },
          updated_at: new Date().toISOString(),
        }).eq("id", contractSessionId).eq("status", "erp_processing");
      }
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
    erpCommitted = true;

    if (!contractSessionId) throw new Error("CONTRACT_SESSION_MISSING_AFTER_ERP");

    const { data: acceptedSession, error: acceptedSessionError } = await supabase
      .from("public_contract_sessions")
      .update({
        status: "erp_registered",
        cadastro_id: cadastroId,
        erp_response: erpResult,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contractSessionId)
      .select("*")
      .single();
    if (acceptedSessionError || !acceptedSession) throw acceptedSessionError || new Error("CONTRACT_SESSION_SYNC_FAILED");

    const acceptedAt = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Fortaleza",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(acceptedSession.accepted_at || new Date().toISOString())).replace(",", "");

    const pdf = await makeAcceptedPdf(String(acceptedSession.contract_text || ""), acceptedAt);
    const pdfHash = await sha256(pdf);
    const storageOwner = cadastroId || submissionId || acceptedSession.id;
    const storagePath = `${new Date().getUTCFullYear()}/${storageOwner}/contrato-${acceptedSession.id}.pdf`;
    const { error: uploadError } = await supabase.storage.from("contracts").upload(storagePath, pdf, {
      contentType: "application/pdf",
      upsert: true,
    });

    if (uploadError) {
      await supabase.from("public_contract_sessions").update({
        status: "needs_attention",
        updated_at: new Date().toISOString(),
      }).eq("id", acceptedSession.id);
      await supabase.from("public_adesao_attempts").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", attempt.id);
      return jsonResponse({
        ok: true,
        state: "needs_attention",
        cadastroId,
        warning: "Inclusao concluida no ERP, mas o termo precisa de reprocessamento.",
        message: "Dependente(s) incluido(s) com sucesso.",
      });
    }

    await supabase.from("public_contract_sessions").update({
      status: "deliveries_pending",
      pdf_storage_path: storagePath,
      pdf_hash: pdfHash,
      updated_at: new Date().toISOString(),
    }).eq("id", acceptedSession.id);

    let vendedorTelefone: string | null = null;
    if (link.vendedor_id) {
      const { data: vendedorProfile } = await supabase
        .from("profiles")
        .select("telefone")
        .eq("id", link.vendedor_id)
        .maybeSingle();
      vendedorTelefone = vendedorProfile?.telefone ?? null;
    }

    const fileName = `Contrato-Odontoart-Inclusao-Dependentes-${memberCode}.pdf`;
    const prepared = acceptedSession.snapshot?.cadastro || {};
    const memberSnapshot = acceptedSession.snapshot?.member || {};
    const { error: jobsError } = await supabase.from("contract_delivery_jobs").upsert([
      {
        contract_session_id: acceptedSession.id,
        channel: "email",
        payload: {
          email: acceptedSession.confirmed_email,
          nome: String(holder?.nome || attempt.profile_snapshot?.nome || ""),
          vendedorNome: String(link.vendedor_nome || "") || null,
          vendedorTelefone,
          storagePath,
          fileName,
          pdfHash,
          coveragePlanCodes: Array.isArray(prepared.coberturaPlanoCodigos) ? prepared.coberturaPlanoCodigos : [],
          coverageFiles: Array.isArray(prepared.coberturaPlanoArquivos) ? prepared.coberturaPlanoArquivos : [],
        },
        status: "pending",
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
      },
      {
        contract_session_id: acceptedSession.id,
        channel: "erp_document",
        payload: {
          cpf: holderCpf,
          empresaCodigo: companyCode,
          idFuncionario: sellerCode,
          idDependente: Number(memberSnapshot.codigoDependente || attempt.erp_member_snapshot?.codigoDependente || 0) || null,
          storagePath,
          fileName,
          pdfHash,
        },
        status: "pending",
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
      },
    ], { onConflict: "contract_session_id,channel" });
    if (jobsError) throw jobsError;

    await supabase.from("public_adesao_attempts").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", attempt.id);

    const deliveryResult = await triggerDeliveryWorker(acceptedSession.id);
    const results = Array.isArray(deliveryResult?.results) ? deliveryResult.results : [];
    const deliveryPending = !deliveryResult?.ok || results.some((item: any) => item?.status !== "sent");

    return jsonResponse({
      ok: true,
      state: "completed",
      cadastroId,
      warning,
      contractHash: acceptedSession.contract_hash,
      pdfHash,
      deliveryPending,
      message: deliveryPending
        ? "Dependente(s) incluido(s) com sucesso! O termo aceito esta sendo enviado por e-mail e anexado ao ERP."
        : "Dependente(s) incluido(s) com sucesso! O termo aceito foi enviado por e-mail e anexado ao ERP.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    console.error("[cadastro-public-dependent-submit]", error);
    if (submissionId && !erpCommitted) {
      await supabase.from("public_dependent_submissions").update({
        status: "failed",
        last_error: message,
        updated_at: new Date().toISOString(),
      }).eq("id", submissionId);
    }
    if (contractSessionId) {
      await supabase.from("public_contract_sessions").update({
        status: erpCommitted ? "needs_attention" : "erp_failed",
        erp_response: { error: message, failed_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      }).eq("id", contractSessionId).in("status", ["erp_processing", "erp_registered", "deliveries_pending"]);
    }
    if (message === "ERP_VALIDATION_UNAVAILABLE" || message === "ERP_CATALOG_UNAVAILABLE") {
      return jsonResponse({ error: "Nao foi possivel validar os dados no ERP neste momento.", code: message }, 503);
    }
    if (message === "LINK_UNAVAILABLE") return jsonResponse({ error: "Link indisponivel" }, 410);
    if (message === "SELLER_CODE_INVALID") return jsonResponse({ error: "O link nao possui vendedor valido para concluir a inclusao." }, 409);
    return jsonResponse({ error: "Nao foi possivel concluir a inclusao de dependentes" }, 500);
  }
});
