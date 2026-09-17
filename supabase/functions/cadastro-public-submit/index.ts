import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";
import {
  corsHeaders,
  createServiceClient,
  getRequestIp,
  hashSensitiveValue,
  jsonResponse,
  normalizeDigits,
  resolveAttempt,
  sha256,
} from "../_shared/public-flow.ts";

const ERP_REQUEST_TIMEOUT_MS = 20_000;
const ERP_VALIDATION_TIMEOUT_MS = 15_000;
const ERP_RECONCILE_TIMEOUT_MS = 8_000;
const STALE_ERP_PROCESSING_MS = 2 * 60_000;
const RECONCILE_DELAYS_MS = [0, 1200, 2500];
const ERP_ABORT_FRIENDLY_MESSAGE =
  "A conexao foi interrompida durante o envio ao ERP. Nao foi possivel confirmar automaticamente o resultado.";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const cpfFmt = (v: string) => normalizeDigits(v).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
const dateFmt = (v: string) => {
  const [y, m, d] = String(v || "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : v;
};
const moneyFmt = (v: number) => Number(v || 0).toFixed(2).replace(".", ",");

class ErpSubmitError extends Error {
  uncertain: boolean;
  details: any;
  httpStatus: number | null;

  constructor(
    message: string,
    options: { uncertain?: boolean; details?: any; httpStatus?: number | null } = {},
  ) {
    super(message);
    this.name = "ErpSubmitError";
    this.uncertain = Boolean(options.uncertain);
    this.details = options.details ?? null;
    this.httpStatus = options.httpStatus ?? null;
  }
}

const extractErpMessage = (payload: any) => {
  for (const value of [
    payload?.message,
    payload?.mensagem,
    payload?.error,
    payload?.dados?.mensagem,
    payload?.data?.mensagem,
  ]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "Erro ao cadastrar no ERP";
};

const erpBaseUrl = () => {
  let base = Deno.env.get("ERP_BASE_URL") || Deno.env.get("ERP_ENDPOINT") || "https://odontoart.s4e.com.br";
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return base.replace(/\/+$/, "");
};

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function sellerCode(supabase: any, link: any) {
  const direct = Number.parseInt(String(link.vendedorCodigo || ""), 10);
  if (direct > 0) return direct;

  for (const id of [link.vendedorId, link.createdBy].filter(Boolean)) {
    const { data } = await supabase.from("profiles").select("external_id").eq("id", id).maybeSingle();
    const code = Number.parseInt(String(data?.external_id || ""), 10);
    if (code > 0) return code;
  }
  return 0;
}

async function buildErpPayload(supabase: any, snapshot: any) {
  const c = snapshot.cadastro;
  const l = snapshot.link;
  const vendedor = await sellerCode(supabase, l);
  if (!vendedor) throw new Error("SELLER_CODE_MISSING");

  const contacts = (c.contatos || []).map((x: any) => ({
    tipo: x.tipo === "fixo" ? 1 : x.tipo === "email" ? 50 : x.tipo === "whatsapp" ? 10 : 8,
    dado: x.valor,
  }));

  const rf: Record<string, unknown> = {
    codigoContrato: String(l.empresaCodigo),
    nome: c.nome,
    dataNascimento: dateFmt(c.dataNascimento),
    cpf: cpfFmt(c.cpf),
    sexo: c.sexoCodigo,
    grupoFaturamento: 0,
    sexoDescricao: c.sexoCodigo === 1 ? "Masculino" : "Feminino",
    identidadeNumero: "123456789",
    identidadeOrgaoExpeditor: "SSPDS",
    endereco: {
      cep: c.endereco.cep,
      tipoLogradouro: String(c.endereco.idTipoLogradouro || 816),
      logradouro: c.endereco.logradouro,
      numero: c.endereco.numero,
      complemento: c.endereco.complemento || "N/D",
      bairro: String(c.endereco.idBairro || 1262),
      municipio: String(c.endereco.idMunicipio || 2),
      uf: String(c.endereco.idUf || 5),
      descricaoUf: c.endereco.ufSigla || c.endereco.uf,
    },
    contatoResponsavelFinanceiro: contacts,
    fl_AlteraSituacao: 1,
    dataApresentacao: new Date().toISOString(),
  };

  if (c.numeroMatricula) rf.Matricula = c.numeroMatricula;

  const titular = {
    tipo: 1,
    nome: c.nome,
    dataNascimento: dateFmt(c.dataNascimento),
    cpf: cpfFmt(c.cpf),
    sexo: c.sexoCodigo,
    sexoDescricao: c.sexoCodigo === 1 ? "Masculino" : "Feminino",
    plano: c.titularPlano,
    planoValor: moneyFmt(c.titularPlanoValor),
    nomeMae: c.nomeMae,
    carenciaAtendimento: 0,
    funcionarioCadastro: vendedor,
  };

  const deps = (c.dependentes || []).map((d: any) => ({
    tipo: d.tipo,
    nome: d.nome,
    dataNascimento: dateFmt(d.dataNascimento),
    cpf: d.cpf ? cpfFmt(d.cpf) : "",
    sexo: d.sexo,
    sexoDescricao: d.sexoDescricao,
    plano: d.plano,
    planoValor: moneyFmt(d.planoValor),
    nomeMae: d.nomeMae,
    carenciaAtendimento: 0,
    funcionarioCadastro: vendedor,
  }));

  return {
    dados: {
      parceiro: { codigo: vendedor, tipoCobranca: 1 },
      parcelaRetidaComissao: "0",
      responsavelFinanceiro: rf,
      dependente: [titular, ...deps],
    },
    empresa: String(l.empresaCodigo),
  };
}

async function erpCreate(payload: any) {
  const token = Deno.env.get("ERP_TOKEN");
  const url = Deno.env.get("ERP_URL") || "https://odontoart.s4e.com.br/api/vendedor/NovoUsuario2";
  if (!token) throw new Error("ERP_TOKEN not configured");

  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { token, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      ERP_REQUEST_TIMEOUT_MS,
    );
  } catch (error) {
    console.warn("[cadastro-public-submit] ERP transport", error);
    throw new ErpSubmitError(ERP_ABORT_FRIENDLY_MESSAGE, {
      uncertain: true,
      details: { cause: error instanceof Error ? error.message : String(error) },
    });
  }

  const data = await res.json().catch(() => ({}));
  const hasCode = data?.dados?.codigo || data?.data?.dados?.codigo;
  if (!res.ok || !hasCode) {
    throw new ErpSubmitError(extractErpMessage(data), {
      uncertain: false,
      details: data,
      httpStatus: res.status,
    });
  }
  return data;
}

function isActiveErpStatus(dep: any) {
  const statusCode = Number(dep?.codigoSituacao);
  const statusName = String(dep?.nomeSituacao || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Regra exclusiva do fluxo por link: bloqueia somente situacao ATIVO.
  return statusCode === 1 || statusName === "ATIVO";
}

async function checkErpEligibility(cpfValue: string) {
  const token = Deno.env.get("ERP_TOKEN");
  if (!token) throw new Error("ERP_TOKEN not configured");

  const cpf = normalizeDigits(cpfValue);
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${erpBaseUrl()}/v2/api/associados?token=${encodeURIComponent(token)}&cpfAssociado=${cpf}&incluirAns=true`,
      { headers: { Accept: "application/json" } },
      ERP_VALIDATION_TIMEOUT_MS,
    );
  } catch (error) {
    console.warn("[cadastro-public-submit] ERP eligibility transport", error);
    throw new Error("ERP_VALIDATION_UNAVAILABLE");
  }

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
}

async function reconcile(snapshot: any) {
  const token = Deno.env.get("ERP_TOKEN");
  if (!token) return null;

  const cpf = normalizeDigits(snapshot.cadastro.cpf);

  for (const delay of RECONCILE_DELAYS_MS) {
    if (delay > 0) await sleep(delay);

    try {
      const res = await fetchWithTimeout(
        `${erpBaseUrl()}/v2/api/associados?token=${encodeURIComponent(token)}&cpfAssociado=${cpf}&incluirAns=true`,
        { headers: { Accept: "application/json" } },
        ERP_RECONCILE_TIMEOUT_MS,
      );
      if (!res.ok) continue;

      const raw = await res.json();
      for (const a of Array.isArray(raw?.dados) ? raw.dados : []) {
        if (Number(a?.codigoDaEmpresa) !== Number(snapshot.link.empresaCodigo)) continue;
        const titular = (Array.isArray(a?.dependentes) ? a.dependentes : []).find(
          (d: any) =>
            normalizeDigits(d?.numeroCpfDependente) === cpf
            && Number(d?.codigoPlano) === Number(snapshot.cadastro.titularPlano)
            && isActiveErpStatus(d),
        );
        if (titular) {
          return {
            reconciled: true,
            dados: { codigo: a.codigo },
            titularCodigo: Number(titular?.codigoDependente || titular?.codigo || 0) || null,
            source: raw,
          };
        }
      }
    } catch (error) {
      console.warn("[cadastro-public-submit] reconcile", error);
    }
  }

  return null;
}

function extractTitularErpId(erpResult: any, cpf: string, empresaCodigo: number) {
  const direct = [
    erpResult?.data?.dados?.dependentes?.[0]?.codigo,
    erpResult?.dados?.dependentes?.[0]?.codigo,
    erpResult?.data?.dados?.dependente?.[0]?.codigo,
    erpResult?.dados?.dependente?.[0]?.codigo,
    erpResult?.titularCodigo,
  ]
    .map((value) => Number(value || 0))
    .find((value) => value > 0);

  if (direct) return direct;

  const normalizedCpf = normalizeDigits(cpf);
  const records = Array.isArray(erpResult?.source?.dados) ? erpResult.source.dados : [];
  const associado = records.find((item: any) => Number(item?.codigoDaEmpresa) === Number(empresaCodigo)) || records[0];
  const deps = Array.isArray(associado?.dependentes) ? associado.dependentes : [];
  const titular = deps.find(
    (dep: any) => normalizeDigits(dep?.numeroCpfDependente) === normalizedCpf && isActiveErpStatus(dep),
  ) || deps.find((dep: any) => normalizeDigits(dep?.numeroCpfDependente) === normalizedCpf) || deps[0];
  const fallback = Number(titular?.codigoDependente || titular?.codigo || 0);
  return fallback > 0 ? fallback : null;
}

async function syncCadastroEnviado(supabase: any, cadastroId: string, erpResult: any) {
  const basePayload = {
    status: "enviado",
    erp_response: erpResult,
  };

  let update = await supabase
    .from("cadastros")
    .update({
      ...basePayload,
      data_envio: new Date().toISOString(),
    })
    .eq("id", cadastroId)
    .select("id")
    .maybeSingle();

  if (update.error?.message?.includes("data_envio")) {
    console.warn("[cadastro-public-submit] coluna data_envio ausente; sincronizando sem a coluna");
    update = await supabase
      .from("cadastros")
      .update(basePayload)
      .eq("id", cadastroId)
      .select("id")
      .maybeSingle();
  }

  if (update.error || !update.data) {
    throw update.error || new Error("CADASTRO_SYNC_FAILED");
  }
}

async function resetProcessingSession(
  supabase: any,
  sessionId: string | null,
  stage: string,
  error: unknown,
) {
  if (!sessionId) return;

  const message = error instanceof Error ? error.message : String(error || "Erro inesperado");
  await supabase
    .from("public_contract_sessions")
    .update({
      status: "erp_failed",
      erp_response: {
        error: message.slice(0, 500),
        stage,
        failed_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("status", "erp_processing");
}

async function makePdf(text: string, acceptance: { acceptedAt: string }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const M = 48;
  const S = 9.5;
  const L = 13;
  const MAX = W - M * 2;

  const clean = (v: string) => v
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");

  const wrap = (v: string) => {
    const out: string[] = [];
    let line = "";
    for (const w of clean(v).split(/\s+/)) {
      const candidate = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, S) <= MAX) line = candidate;
      else {
        if (line) out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
    return out.length ? out : [""];
  };

  let page = pdf.addPage([W, H]);
  let y = H - M;
  const ensure = () => {
    if (y < M + L * 2) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };

  page.drawText("ODONTOART - CONTRATO DE ADESAO", { x: M, y, size: 13, font: bold });
  y -= 24;

  for (const p of clean(text).split("\n")) {
    ensure();
    if (!p.trim()) {
      y -= L;
      continue;
    }
    for (const line of wrap(p)) {
      ensure();
      page.drawText(line, { x: M, y, size: S, font });
      y -= L;
    }
    y -= 3;
  }

  y -= 8;
  for (const line of wrap(`Aceite eletrônico realizado em ${acceptance.acceptedAt}`)) {
    ensure();
    page.drawText(line, { x: M, y, size: S, font });
    y -= L;
  }

  return new Uint8Array(await pdf.save());
}

async function triggerDeliveryWorker(contractSessionId: string) {
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const base = Deno.env.get("SUPABASE_URL") || "";
  if (!service || !base) {
    return { ok: false, error: "DELIVERY_WORKER_CONFIG_MISSING" };
  }

  try {
    const response = await fetch(`${base}/functions/v1/process-contract-deliveries`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${service}`,
        apikey: service,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "cadastro-public-submit",
        contractSessionId,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn("[cadastro-public-submit] delivery worker HTTP", response.status, result);
      return { ok: false, status: response.status, error: result?.error || "DELIVERY_WORKER_FAILED" };
    }
    return result;
  } catch (error) {
    console.warn("[cadastro-public-submit] delivery trigger", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "DELIVERY_WORKER_FAILED",
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  const supabase = createServiceClient();
  let claimedSessionId: string | null = null;
  let stage = "request";

  try {
    const body = await req.json() as {
      attemptToken?: string;
      contractToken?: string;
      acceptedTerms?: boolean;
      acceptedData?: boolean;
    };

    if (!body.attemptToken || !body.contractToken || body.acceptedTerms !== true || body.acceptedData !== true) {
      return jsonResponse({ error: "O aceite dos termos e a confirmacao dos dados sao obrigatorios" }, 400);
    }

    stage = "resolve_attempt";
    const attempt = await resolveAttempt(supabase, body.attemptToken);
    if (!attempt || attempt.status !== "authenticated") return jsonResponse({ error: "Sessao expirada" }, 401);

    stage = "load_contract_session";
    const tokenHash = await sha256(body.contractToken.trim());
    const { data: initialSession, error: sessionError } = await supabase
      .from("public_contract_sessions")
      .select("*")
      .eq("attempt_id", attempt.id)
      .eq("contract_token_hash", tokenHash)
      .maybeSingle();

    if (sessionError || !initialSession) return jsonResponse({ error: "Contrato nao encontrado ou expirado" }, 404);

    let session = initialSession;
    if (["erp_registered", "deliveries_pending", "completed"].includes(session.status)) {
      return jsonResponse({ ok: true, cadastroId: session.cadastro_id, state: session.status, message: "Adesao ja processada" });
    }

    if (session.status === "erp_processing") {
      const updatedAt = new Date(session.updated_at || session.created_at || 0).getTime();
      const isStale = Number.isFinite(updatedAt) && Date.now() - updatedAt >= STALE_ERP_PROCESSING_MS;

      if (!isStale) {
        return jsonResponse({ ok: true, cadastroId: session.cadastro_id, state: "processing", message: "Sua adesao esta sendo processada" }, 202);
      }

      stage = "recover_stale_processing";
      const { data: recovered, error: recoverError } = await supabase
        .from("public_contract_sessions")
        .update({
          status: "erp_failed",
          erp_response: {
            error: "STALE_ERP_PROCESSING_RECOVERED",
            stage: "erp_processing",
            recovered_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id)
        .eq("status", "erp_processing")
        .select("*")
        .maybeSingle();

      if (recoverError) throw recoverError;
      if (!recovered) {
        return jsonResponse({ ok: true, cadastroId: session.cadastro_id, state: "processing", message: "Sua adesao esta sendo processada" }, 202);
      }

      session = recovered;
    }

    if (!["prepared", "erp_failed"].includes(session.status)) {
      return jsonResponse({ error: "Este contrato nao pode mais ser utilizado" }, 409);
    }

    const previousStatus = session.status;
    const now = new Date().toISOString();
    const ipHash = await hashSensitiveValue(getRequestIp(req));

    stage = "claim_session";
    const { data: claimed, error: claimError } = await supabase
      .from("public_contract_sessions")
      .update({
        status: "erp_processing",
        accepted_terms: true,
        accepted_data: true,
        accepted_at: session.accepted_at || now,
        accepted_ip_hash: session.accepted_ip_hash || ipHash,
        accepted_user_agent: session.accepted_user_agent || req.headers.get("user-agent") || "unknown",
        updated_at: now,
      })
      .eq("id", session.id)
      .in("status", ["prepared", "erp_failed"])
      .select("*")
      .maybeSingle();

    if (claimError) throw claimError;
    if (!claimed) return jsonResponse({ ok: true, state: "processing", message: "Sua adesao esta sendo processada" }, 202);

    claimedSessionId = claimed.id;
    const snapshot = claimed.snapshot;
    const c = snapshot.cadastro;
    const l = snapshot.link;

    // O fluxo interno reconcilia uma tentativa incerta antes de reenviar ao ERP.
    // No link fazemos isso apenas quando ja existe cadastro local, evitando reaproveitar historico antigo.
    let erpResult: any = null;
    if (previousStatus === "erp_failed" && claimed.cadastro_id) {
      stage = "reconcile_previous_attempt";
      erpResult = await reconcile(snapshot);
    }

    if (!erpResult) {
      stage = "erp_eligibility";
      let erpEligibility: { eligible: boolean; activeRecord: any };
      try {
        erpEligibility = await checkErpEligibility(c.cpf);
      } catch (eligibilityError) {
        await supabase.from("public_contract_sessions").update({
          status: previousStatus,
          updated_at: new Date().toISOString(),
        }).eq("id", claimed.id).eq("status", "erp_processing");
        claimedSessionId = null;

        const eligibilityMessage = eligibilityError instanceof Error ? eligibilityError.message : "ERP_VALIDATION_UNAVAILABLE";
        if (eligibilityMessage === "ERP_VALIDATION_UNAVAILABLE") {
          return jsonResponse({
            error: "Nao foi possivel validar a situacao atual do CPF no ERP. Tente novamente.",
            code: "ERP_VALIDATION_UNAVAILABLE",
          }, 503);
        }
        throw eligibilityError;
      }

      if (!erpEligibility.eligible) {
        await supabase.from("public_contract_sessions").update({
          status: "needs_attention",
          updated_at: new Date().toISOString(),
        }).eq("id", claimed.id);
        claimedSessionId = null;
        return jsonResponse({
          error: "Este CPF ja possui uma adesao ativa no ERP",
          code: "CPF_ACTIVE_IN_ERP",
        }, 409);
      }
    }

    stage = "build_erp_payload";
    const erpPayload = await buildErpPayload(supabase, snapshot);
    let cadastroId = claimed.cadastro_id as string | null;

    if (!cadastroId) {
      stage = "create_local_cadastro";
      const vendedor = await sellerCode(supabase, l);
      const stored = [
        {
          tipo: 1,
          nome: c.nome,
          dataNascimento: c.dataNascimento,
          cpf: c.cpf,
          sexo: c.sexoCodigo,
          sexoDescricao: c.sexoCodigo === 1 ? "Masculino" : "Feminino",
          plano: c.titularPlano,
          planoValor: moneyFmt(c.titularPlanoValor),
          nomeMae: c.nomeMae,
          carenciaAtendimento: 0,
          funcionarioCadastro: vendedor,
        },
        ...(c.dependentes || []).map((d: any) => ({
          tipo: d.tipo,
          nome: d.nome,
          dataNascimento: d.dataNascimento,
          cpf: d.cpf,
          sexo: d.sexo,
          sexoDescricao: d.sexoDescricao,
          plano: d.plano,
          planoValor: moneyFmt(d.planoValor),
          nomeMae: d.nomeMae,
          carenciaAtendimento: 0,
          funcionarioCadastro: vendedor,
        })),
      ];

      const { data: created, error: insertError } = await supabase.from("cadastros").insert({
        status: "incompleto",
        tipo_cadastro: "cadastro",
        created_by: l.createdBy,
        team_id: l.teamId,
        cpf: c.cpf,
        nome: c.nome,
        data_nascimento: c.dataNascimento,
        sexo: c.sexoCodigo === 1 ? "M" : "F",
        sexo_codigo: c.sexoCodigo,
        nome_mae: c.nomeMae,
        contatos: c.contatos,
        endereco: c.endereco,
        cliente_sera_usuario: true,
        empresa_id: l.empresaCodigo,
        empresa_codigo: l.empresaCodigo,
        empresa_nome: l.empresaNome,
        empresa_cnpj: l.empresaCnpj,
        empresa_raw: { codigo: l.empresaCodigo, nome: l.empresaNome },
        empresa_exige_matricula: l.empresaExigeMatricula,
        planos_raw: [
          { Plano: c.titularPlano, nomeExibicao: c.titularPlanoNome, ValorTitular: c.titularPlanoValor },
          ...(c.dependentes || []).map((d: any) => ({
            Plano: d.plano,
            nomeExibicao: d.planoNome,
            ValorDependente: d.planoValor,
          })),
        ],
        dependentes: stored,
        numero_matricula: c.numeroMatricula || null,
        vendedor_id: l.vendedorId,
        vendedor_codigo: String(vendedor),
        vendedor_nome: l.vendedorNome,
        origem_link_id: l.id,
        fluxo_publico: true,
        payload_erp: erpPayload,
      }).select("id").single();

      if (insertError || !created) throw insertError || new Error("CADASTRO_CREATE_FAILED");
      cadastroId = created.id;

      const { error: sessionCadastroError } = await supabase
        .from("public_contract_sessions")
        .update({ cadastro_id: cadastroId, updated_at: new Date().toISOString() })
        .eq("id", claimed.id);
      if (sessionCadastroError) throw sessionCadastroError;
    }

    if (!erpResult) {
      stage = "erp_submit";
      try {
        erpResult = await erpCreate(erpPayload);
      } catch (error) {
        const uncertain = error instanceof ErpSubmitError && error.uncertain;
        if (uncertain) {
          stage = "erp_reconcile_after_transport";
          erpResult = await reconcile(snapshot);
        }

        if (!erpResult) {
          const message = error instanceof Error ? error.message : "Erro ao cadastrar no ERP";
          await supabase.from("cadastros").update({
            status: "incompleto",
            erp_response: error instanceof ErpSubmitError && error.details
              ? { error: message, details: error.details }
              : { error: message },
          }).eq("id", cadastroId);

          await supabase.from("public_contract_sessions").update({
            status: "erp_failed",
            erp_response: {
              error: message,
              uncertain,
              stage: "erp_submit",
              failed_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          }).eq("id", claimed.id).eq("status", "erp_processing");
          claimedSessionId = null;

          return jsonResponse({ error: message, code: "ERP_SUBMIT_FAILED", cadastroId }, 502);
        }
      }
    }

    stage = "sync_local_cadastro";
    await syncCadastroEnviado(supabase, cadastroId, erpResult);

    stage = "mark_link_used";
    const { error: linkUpdateError } = await supabase.from("cadastro_links").update({
      used_at: new Date().toISOString(),
      used_cpf: c.cpf,
      used_cadastro_id: cadastroId,
    }).eq("id", l.id);
    if (linkUpdateError) throw linkUpdateError;

    stage = "mark_erp_registered";
    const { error: registeredError } = await supabase.from("public_contract_sessions").update({
      status: "erp_registered",
      erp_response: erpResult,
      updated_at: new Date().toISOString(),
    }).eq("id", claimed.id);
    if (registeredError) throw registeredError;
    claimedSessionId = null;

    const acceptedAt = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Fortaleza",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(claimed.accepted_at || now)).replace(",", "");

    stage = "generate_contract_pdf";
    const pdf = await makePdf(claimed.contract_text, { acceptedAt });
    const pdfHash = await sha256(pdf);
    const path = `${new Date().getUTCFullYear()}/${cadastroId}/contrato-${claimed.id}.pdf`;
    const { error: uploadError } = await supabase.storage.from("contracts").upload(path, pdf, {
      contentType: "application/pdf",
      upsert: true,
    });

    if (uploadError) {
      await supabase.from("public_contract_sessions").update({
        status: "needs_attention",
        updated_at: new Date().toISOString(),
      }).eq("id", claimed.id);
      return jsonResponse({
        ok: true,
        cadastroId,
        warning: "Cadastro concluido no ERP, mas o contrato precisa de reprocessamento.",
      });
    }

    stage = "prepare_deliveries";
    const { error: pendingError } = await supabase.from("public_contract_sessions").update({
      status: "deliveries_pending",
      pdf_storage_path: path,
      pdf_hash: pdfHash,
      updated_at: new Date().toISOString(),
    }).eq("id", claimed.id);
    if (pendingError) throw pendingError;

    const fileName = `Contrato-Odontoart-${cadastroId}.pdf`;
    const idFuncionario = await sellerCode(supabase, l);
    const idDependente = extractTitularErpId(erpResult, c.cpf, l.empresaCodigo);

    if (!idFuncionario) throw new Error("ERP_FUNCIONARIO_ID_NOT_FOUND");

    const { error: jobsError } = await supabase.from("contract_delivery_jobs").upsert([
      {
        contract_session_id: claimed.id,
        channel: "email",
        payload: {
          email: claimed.confirmed_email,
          nome: c.nome,
          storagePath: path,
          fileName,
          pdfHash,
        },
        status: "pending",
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
      },
      {
        contract_session_id: claimed.id,
        channel: "erp_document",
        payload: {
          cpf: c.cpf,
          empresaCodigo: l.empresaCodigo,
          idFuncionario,
          idDependente,
          storagePath: path,
          fileName,
          pdfHash,
        },
        status: "pending",
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
      },
    ], { onConflict: "contract_session_id,channel" });

    if (jobsError) throw jobsError;

    stage = "complete_attempt";
    const { error: attemptUpdateError } = await supabase.from("public_adesao_attempts").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", attempt.id);
    if (attemptUpdateError) throw attemptUpdateError;

    stage = "deliver_contract";
    const deliveryResult = await triggerDeliveryWorker(claimed.id);
    const results = Array.isArray(deliveryResult?.results) ? deliveryResult.results : [];
    const deliveryPending = !deliveryResult?.ok || results.some((item: any) => item?.status !== "sent");

    return jsonResponse({
      ok: true,
      cadastroId,
      state: "completed",
      contractHash: claimed.contract_hash,
      pdfHash,
      deliveryPending,
      message: deliveryPending
        ? "Adesao concluida. O contrato foi gerado e os envios estao em processamento."
        : "Adesao concluida com sucesso. O contrato foi enviado ao e-mail confirmado e ao ERP.",
    });
  } catch (error) {
    console.error("[cadastro-public-submit]", {
      stage,
      error: error instanceof Error ? error.message : String(error),
    });

    await resetProcessingSession(supabase, claimedSessionId, stage, error);

    const message = error instanceof Error ? error.message : "Erro inesperado";
    if (message === "SELLER_CODE_MISSING") {
      return jsonResponse({ error: "Link sem codigo de vendedor valido" }, 400);
    }
    return jsonResponse({
      error: "Nao foi possivel concluir a adesao",
      code: "PUBLIC_SUBMIT_FAILED",
      stage,
    }, 500);
  }
});