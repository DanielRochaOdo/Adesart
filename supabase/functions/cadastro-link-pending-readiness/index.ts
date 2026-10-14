import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  normalizeDigits,
  requireInternalUser,
} from "../_shared/public-flow.ts";

const ERP_ERROR_ROLES = new Set(["ADMINISTRADOR", "CADASTRO", "GERENTE"]);

const normalizeText = (value: unknown) => String(value ?? "").trim();
const validEmail = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(value));
const validPhone = (value: unknown) => normalizeDigits(value).length >= 10;
const validDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(normalizeText(value).slice(0, 10));

const isActive = (dep: any) => {
  const code = Number(dep?.codigoSituacao);
  const name = String(dep?.nomeSituacao || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

const holderIsActive = (holder: any) =>
  Array.isArray(holder?.dependentes) && holder.dependentes.some((dep: any) => isActive(dep));

const validateNewMember = (cadastro: any) => {
  const missing: string[] = [];
  if (normalizeDigits(cadastro?.cpf).length !== 11) missing.push("CPF");
  if (!normalizeText(cadastro?.nome)) missing.push("Nome");
  if (!validDate(cadastro?.data_nascimento)) missing.push("Data de nascimento");
  if (![0, 1].includes(Number(cadastro?.sexo_codigo))) missing.push("Sexo");
  if (!normalizeText(cadastro?.nome_mae)) missing.push("Nome da mãe");

  const contacts = Array.isArray(cadastro?.contatos) ? cadastro.contatos : [];
  const phone = contacts.find((item: any) => ["whatsapp", "celular", "fixo"].includes(String(item?.tipo)));
  const email = contacts.find((item: any) => String(item?.tipo) === "email");
  if (!phone || !validPhone(phone?.valor)) missing.push("Telefone / WhatsApp");
  if (!email || !validEmail(email?.valor)) missing.push("E-mail");

  const address = cadastro?.endereco || {};
  if (normalizeDigits(address?.cep).length !== 8) missing.push("CEP");
  if (!normalizeText(address?.logradouro)) missing.push("Logradouro");
  if (!normalizeText(address?.numero)) missing.push("Número");
  if (!normalizeText(address?.bairro)) missing.push("Bairro");
  if (!normalizeText(address?.cidade)) missing.push("Cidade");
  if (!normalizeText(address?.uf) && !normalizeText(address?.ufSigla)) missing.push("UF");

  if (!Number(cadastro?.empresa_codigo || cadastro?.empresa_id)) missing.push("Empresa");
  if (!Number(cadastro?.vendedor_codigo)) missing.push("Vendedor");

  const dependentes = Array.isArray(cadastro?.dependentes) ? cadastro.dependentes : [];
  if (dependentes.length === 0) missing.push("Plano do titular");
  dependentes.forEach((dep: any, index: number) => {
    if (!Number(dep?.plano ?? dep?.plano_codigo)) missing.push(`Plano do beneficiário ${index + 1}`);
  });

  if (Number(cadastro?.empresa_exige_matricula || 0) === 1 && !normalizeText(cadastro?.numero_matricula)) {
    missing.push("Matrícula");
  }

  return missing;
};

const dependentKey = (dep: any) => {
  const cpf = normalizeDigits(dep?.cpf);
  if (cpf) return `cpf:${cpf}`;
  return `nome:${normalizeText(dep?.nome).toUpperCase()}`;
};

const validateDependentOperation = (cadastro: any, files: any[]) => {
  const missing: string[] = [];
  const holderCode = Number(cadastro?.responsavel_financeiro_codigo || 0);
  if (!Number.isInteger(holderCode) || holderCode <= 0) missing.push("Vínculo do titular");
  if (!Number(cadastro?.vendedor_codigo)) missing.push("Vendedor");

  const contacts = Array.isArray(cadastro?.contatos_responsavel_financeiro)
    ? cadastro.contatos_responsavel_financeiro
    : [];
  const phone = contacts.find((item: any) => ["whatsapp", "celular", "fixo"].includes(String(item?.tipo)));
  const email = contacts.find((item: any) => String(item?.tipo) === "email");
  if (!phone || !validPhone(phone?.valor)) missing.push("Telefone / WhatsApp");
  if (!email || !validEmail(email?.valor)) missing.push("E-mail");

  const deps = Array.isArray(cadastro?.dependentes) ? cadastro.dependentes : [];
  if (deps.length === 0) missing.push("Dependente");

  deps.forEach((dep: any, index: number) => {
    if (!normalizeText(dep?.nome)) missing.push(`Nome do dependente ${index + 1}`);
    const cpf = normalizeDigits(dep?.cpf);
    if (cpf && cpf.length !== 11) missing.push(`CPF do dependente ${index + 1}`);
    if (!validDate(dep?.data_nascimento ?? dep?.dataNascimento)) missing.push(`Data do dependente ${index + 1}`);
    if (!Number(dep?.tipo ?? dep?.parentesco)) missing.push(`Parentesco do dependente ${index + 1}`);
    if (!Number(dep?.plano_codigo ?? dep?.plano)) missing.push(`Plano do dependente ${index + 1}`);
    if (!normalizeText(dep?.nome_mae ?? dep?.nomeMae)) missing.push(`Nome da mãe do dependente ${index + 1}`);

    const key = dependentKey(dep);
    const hasFile = files.some((file: any) => {
      const fileCpf = normalizeDigits(file?.target_dependente_cpf);
      if (key.startsWith("cpf:") && fileCpf) return key === `cpf:${fileCpf}`;
      return normalizeText(file?.target_dependente_nome).toUpperCase() === normalizeText(dep?.nome).toUpperCase();
    });
    if (!hasFile) missing.push(`Anexo do dependente ${index + 1}`);
  });

  return missing;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  const supabase = createServiceClient();
  const auth = await requireInternalUser(req, supabase);
  if (!auth) return jsonResponse({ error: "Autenticacao obrigatoria" }, 401);

  try {
    const body = await req.json().catch(() => ({})) as { pendingId?: string; cadastroId?: string };
    const pendingId = normalizeText(body.pendingId);
    const cadastroId = normalizeText(body.cadastroId);
    if (!pendingId || !cadastroId) return jsonResponse({ error: "Pendencia e cadastro obrigatorios" }, 400);

    const { data: pending, error: pendingError } = await supabase
      .from("link_pendencias")
      .select("*")
      .eq("id", pendingId)
      .maybeSingle();
    if (pendingError) throw pendingError;
    if (!pending) return jsonResponse({ error: "Pendencia nao encontrada" }, 404);
    if (String(auth.profile?.role || "").toUpperCase() === "VENDEDOR" && String(pending.vendedor_id || "") !== String(auth.profile.id)) {
      return jsonResponse({ error: "Sem permissao para esta pendencia" }, 403);
    }

    if (pending.requires_authorization !== true) {
      return jsonResponse({
        error: "Este registro pertence a um link sem autorizacao interna.",
        code: "READ_ONLY_PENDING",
      }, 409);
    }

    if (["enviando", "enviado", "encerrado"].includes(String(pending.status))) {
      return jsonResponse({ ok: true, ready: false, status: pending.status });
    }

    if (
      String(pending.status) === "erro_envio" &&
      !ERP_ERROR_ROLES.has(String(auth.profile?.role || "").toUpperCase())
    ) {
      return jsonResponse({ error: "Sem permissao para tratar erro de ERP.", code: "ERP_ERROR_FORBIDDEN" }, 403);
    }

    const { data: cadastro, error: cadastroError } = await supabase
      .from("cadastros")
      .select("*")
      .eq("id", cadastroId)
      .eq("link_pendencia_id", pendingId)
      .maybeSingle();
    if (cadastroError) throw cadastroError;
    if (!cadastro) return jsonResponse({ error: "Cadastro da pendencia nao encontrado" }, 404);

    const { data: files, error: filesError } = await supabase
      .from("link_pendencia_files")
      .select("id,bucket,arquivo_path,arquivo_nome,target_dependente_cpf,target_dependente_nome")
      .eq("link_pendencia_id", pendingId);
    if (filesError) throw filesError;

    let missing = pending.operation_type === "existing_member"
      ? validateDependentOperation(cadastro, files || [])
      : validateNewMember(cadastro);

    if (pending.operation_type !== "existing_member" && (files || []).length === 0) {
      missing = [...missing, "Anexo obrigatório"];
    }

    if (missing.length > 0) {
      const message = `Ainda há pendências: ${[...new Set(missing)].join(", ")}.`;
      const now = new Date().toISOString();
      await supabase.from("link_pendencias").update({
        status: "aguardando_analise",
        last_error: message,
        last_activity_at: now,
        updated_at: now,
      }).eq("id", pendingId);
      return jsonResponse({ ok: true, ready: false, status: "aguardando_analise", missing: [...new Set(missing)] });
    }

    const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
    if (!ERP_TOKEN) throw new Error("ERP_TOKEN not configured");

    if (pending.operation_type === "new_member") {
      const cpf = normalizeDigits(cadastro.cpf);
      const records = await fetchAssociados(ERP_TOKEN, { cpfAssociado: cpf });
      const empresaCodigo = Number(cadastro.empresa_codigo || cadastro.empresa_id || 0);
      let active = false;
      for (const associado of records) {
        if (empresaCodigo > 0 && Number(associado?.codigoDaEmpresa || 0) !== empresaCodigo) continue;
        const deps = Array.isArray(associado?.dependentes) ? associado.dependentes : [];
        const exact = deps.filter((dep: any) => normalizeDigits(dep?.numeroCpfDependente ?? dep?.cpf) === cpf);
        const candidates = exact.length > 0 ? exact : deps.slice(0, 1);
        if (candidates.some((dep: any) => isActive(dep))) {
          active = true;
          break;
        }
      }

      if (active) {
        const now = new Date().toISOString();
        await supabase.from("link_pendencias").update({
          status: "encerrado",
          resolved_at: now,
          resolution_reason: "holder_already_active_in_erp",
          last_error: "Titular ja possui adesao ativa no S4E.",
          last_activity_at: now,
          updated_at: now,
        }).eq("id", pendingId);
        return jsonResponse({
          ok: true,
          ready: false,
          status: "encerrado",
          resolutionReason: "holder_already_active_in_erp",
          message: "Titular ja possui adesao ativa no S4E.",
        });
      }
    } else {
      const holderCode = Number(cadastro.responsavel_financeiro_codigo || 0);
      const records = await fetchAssociados(ERP_TOKEN, { codigoAssociado: String(holderCode) });
      const holder = records.find((item: any) => Number(item?.codigo) === holderCode) || records[0] || null;
      if (!holder || !holderIsActive(holder)) {
        const message = "O titular nao possui vinculo ativo no S4E para receber novos dependentes.";
        const now = new Date().toISOString();
        await supabase.from("link_pendencias").update({
          status: "aguardando_analise",
          last_error: message,
          last_activity_at: now,
          updated_at: now,
        }).eq("id", pendingId);
        return jsonResponse({ ok: true, ready: false, status: "aguardando_analise", message });
      }
    }

    const now = new Date().toISOString();
    const { error: readyError } = await supabase.from("link_pendencias").update({
      status: "pronto_erp",
      last_error: null,
      last_activity_at: now,
      updated_at: now,
    }).eq("id", pendingId);
    if (readyError) throw readyError;

    return jsonResponse({ ok: true, ready: true, status: "pronto_erp" });
  } catch (error) {
    console.error("[cadastro-link-pending-readiness]", error);
    const message = error instanceof Error ? error.message : String(error);
    if (message === "ERP_PREFLIGHT_UNAVAILABLE") {
      return jsonResponse({
        error: "Nao foi possivel validar a situacao atual no S4E. Tente novamente.",
        code: message,
      }, 503);
    }
    return jsonResponse({
      error: "Nao foi possivel validar se a pendencia esta pronta para o ERP.",
      details: message,
    }, 500);
  }
});
