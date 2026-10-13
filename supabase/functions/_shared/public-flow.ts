import { createClient } from "npm:@supabase/supabase-js@2.57.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Idempotency-Key, X-Cadastro-Id",
};

export const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export const normalizeDigits = (value?: string | null) => (value || "").replace(/\D/g, "");

export const normalizeDate = (value?: string | null) => {
  const input = (value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(input)) {
    const [day, month, year] = input.split("/");
    return `${year}-${month}-${day}`;
  }
  const match = input.match(/^(\d{4}-\d{2}-\d{2})T/);
  return match?.[1] || "";
};

export const sha256 = async (value: string | Uint8Array) => {
  const source = typeof value === "string" ? new TextEncoder().encode(value) : value;
  // Copia para um Uint8Array com ArrayBuffer proprio. Deno 2.9 tipa Uint8Array
  // recebido como ArrayBufferLike, enquanto WebCrypto exige BufferSource/ArrayBuffer.
  const data = new Uint8Array(source.byteLength);
  data.set(source);
  const digest = await crypto.subtle.digest("SHA-256", data.buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

export const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const objectValue = value as Record<string, unknown>;
  return `{${Object.keys(objectValue).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`).join(",")}}`;
};

export const createServiceClient = () => {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) throw new Error("Supabase service configuration missing");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
};

export const getRequestIp = (req: Request) => {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
};

export const hashSensitiveValue = async (value: string) => {
  const pepper = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "public-flow";
  return sha256(`${pepper}:${value}`);
};

export const resolveLinkByToken = async (supabase: any, token: string) => {
  const tokenHash = await sha256(token.trim());
  const { data, error } = await supabase
    .from("cadastro_links")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { error: "LINK_NOT_FOUND" as const, link: null };
  if (!data.is_active) return { error: "LINK_INACTIVE" as const, link: data };
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    return { error: "LINK_EXPIRED" as const, link: data };
  }
  return { error: null, link: data };
};

export const resolveAttempt = async (supabase: any, attemptToken: string) => {
  const attemptTokenHash = await sha256(attemptToken.trim());
  const { data, error } = await supabase
    .from("public_adesao_attempts")
    .select("*")
    .eq("attempt_token_hash", attemptTokenHash)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null;
  return data;
};

export const upsertLinkPendingJourney = async (params: {
  supabase: any;
  attempt: any;
  link: any;
  snapshot?: any;
  stage?: string | null;
  status?: "aguardando_analise" | "pronto_erp" | "enviando" | "enviado" | "erro_envio" | "encerrado";
  publicCompletedAt?: string | null;
  cadastroId?: string | null;
  sentBy?: string | null;
  resolutionReason?: string | null;
  lastError?: string | null;
  erpResponse?: any;
}) => {
  const {
    supabase,
    attempt,
    link,
    snapshot,
    stage,
    status = "aguardando_analise",
    publicCompletedAt = null,
    cadastroId = null,
    sentBy = null,
    resolutionReason = null,
    lastError = null,
    erpResponse = null,
  } = params;

  const flowMode = String(attempt?.flow_mode || "new_member");
  if (!["new_member", "existing_member"].includes(flowMode)) return null;

  const operationType = flowMode === "existing_member" ? "existing_member" : "new_member";
  const effectiveSnapshot = snapshot ?? attempt?.draft_snapshot ?? attempt?.profile_snapshot ?? {};
  const cadastroSnapshot = effectiveSnapshot?.cadastro ?? effectiveSnapshot;
  const cpf = normalizeDigits(
    cadastroSnapshot?.cpf ??
      effectiveSnapshot?.cpf ??
      attempt?.profile_snapshot?.cpf ??
      attempt?.erp_member_snapshot?.cpf ??
      "",
  );
  const cpfHash = String(attempt?.cpf_hash || "").trim();
  const memberCompanyCode = Number(attempt?.erp_member_snapshot?.codigoEmpresa || 0);
  const empresaCodigo = flowMode === "existing_member" && Number.isInteger(memberCompanyCode) && memberCompanyCode > 0
    ? memberCompanyCode
    : Number(link?.empresa_codigo || 0);
  if (!cpfHash || !Number.isInteger(empresaCodigo) || empresaCodigo <= 0) return null;

  const now = new Date().toISOString();
  const openStatuses = ["aguardando_analise", "pronto_erp", "enviando", "erro_envio"];
  const { data: existing, error: existingError } = await supabase
    .from("link_pendencias")
    .select("*")
    .eq("link_id", linkId)
    .eq("cpf_hash", cpfHash)
    .eq("empresa_codigo", empresaCodigo)
    .eq("operation_type", operationType)
    .in("status", openStatuses)
    .order("first_attempt_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  const attemptId = String(attempt?.id || "").trim();
  const linkId = String(link?.id || attempt?.link_id || "").trim();
  const sourceAttemptIds = Array.from(new Set([
    ...(Array.isArray(existing?.source_attempt_ids) ? existing.source_attempt_ids : []),
    ...(attemptId ? [attemptId] : []),
  ]));
  const sourceLinkIds = Array.from(new Set([
    ...(Array.isArray(existing?.source_link_ids) ? existing.source_link_ids : []),
    ...(linkId ? [linkId] : []),
  ]));

  const resolvedAt = ["enviado", "encerrado"].includes(status) ? now : null;
  const payload = {
    link_id: linkId,
    primary_attempt_id: existing?.primary_attempt_id || attemptId || null,
    cpf_hash: cpfHash,
    cpf: cpf || existing?.cpf || null,
    nome: String(
      cadastroSnapshot?.nome ??
        effectiveSnapshot?.nome ??
        attempt?.profile_snapshot?.nome ??
        existing?.nome ??
        "",
    ).trim() || null,
    empresa_codigo: empresaCodigo,
    empresa_nome: String(
      flowMode === "existing_member"
        ? attempt?.erp_member_snapshot?.empresaNome || link?.empresa_nome || existing?.empresa_nome || ""
        : link?.empresa_nome || existing?.empresa_nome || "",
    ).trim() || `Empresa ${empresaCodigo}`,
    operation_type: operationType,
    requires_authorization: Boolean(link?.requires_authorization),
    status,
    flow_stage: stage || attempt?.last_stage || existing?.flow_stage || null,
    latest_snapshot: effectiveSnapshot && typeof effectiveSnapshot === "object"
      ? effectiveSnapshot
      : existing?.latest_snapshot || {},
    erp_member_snapshot: attempt?.erp_member_snapshot ?? existing?.erp_member_snapshot ?? null,
    source_attempt_ids: sourceAttemptIds,
    source_link_ids: sourceLinkIds,
    created_by: link?.created_by || existing?.created_by || null,
    vendedor_id: link?.vendedor_id || existing?.vendedor_id || null,
    team_id: link?.team_id || existing?.team_id || null,
    cadastro_id: cadastroId || existing?.cadastro_id || null,
    first_attempt_at: existing?.first_attempt_at || attempt?.created_at || now,
    last_activity_at: now,
    public_completed_at: publicCompletedAt || existing?.public_completed_at || null,
    sent_at: status === "enviado" ? now : existing?.sent_at || null,
    sent_by: status === "enviado" ? sentBy || existing?.sent_by || null : existing?.sent_by || null,
    resolved_at: resolvedAt,
    resolution_reason: resolutionReason ?? existing?.resolution_reason ?? null,
    last_error: lastError,
    erp_response: erpResponse ?? existing?.erp_response ?? null,
    updated_at: now,
  };

  let row: any = null;
  if (existing?.id) {
    const { data, error } = await supabase
      .from("link_pendencias")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    row = data;
  } else {
    const { data, error } = await supabase
      .from("link_pendencias")
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      // Corrida entre duas tentativas do mesmo CPF: reler a jornada aberta e atualizar.
      if (String(error?.code || "") === "23505") {
        const { data: concurrent, error: concurrentError } = await supabase
          .from("link_pendencias")
          .select("*")
          .eq("link_id", linkId)
          .eq("cpf_hash", cpfHash)
          .eq("empresa_codigo", empresaCodigo)
          .eq("operation_type", operationType)
          .in("status", openStatuses)
          .order("first_attempt_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (concurrentError || !concurrent) throw concurrentError || error;
        const mergedConcurrentAttempts = Array.from(new Set([
          ...(Array.isArray(concurrent.source_attempt_ids) ? concurrent.source_attempt_ids : []),
          ...(attemptId ? [attemptId] : []),
        ]));
        const mergedConcurrentLinks = Array.from(new Set([
          ...(Array.isArray(concurrent.source_link_ids) ? concurrent.source_link_ids : []),
          ...(linkId ? [linkId] : []),
        ]));
        const { data: updated, error: updateError } = await supabase
          .from("link_pendencias")
          .update({
            ...payload,
            primary_attempt_id: concurrent.primary_attempt_id || attemptId || null,
            source_attempt_ids: mergedConcurrentAttempts,
            source_link_ids: mergedConcurrentLinks,
            first_attempt_at: concurrent.first_attempt_at || attempt?.created_at || now,
          })
          .eq("id", concurrent.id)
          .select("*")
          .single();
        if (updateError) throw updateError;
        row = updated;
      } else {
        throw error;
      }
    } else {
      row = data;
    }
  }

  if (row?.id && attemptId) {
    const { error: attemptUpdateError } = await supabase
      .from("public_adesao_attempts")
      .update({
        link_pendencia_id: row.id,
        last_stage: stage || attempt?.last_stage || null,
        draft_snapshot: effectiveSnapshot && typeof effectiveSnapshot === "object"
          ? effectiveSnapshot
          : attempt?.draft_snapshot ?? null,
        updated_at: now,
      })
      .eq("id", attemptId);
    if (attemptUpdateError) throw attemptUpdateError;
  }

  return row;
};

export const requireInternalUser = async (req: Request, supabase: any) => {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, is_active, email, external_id, team_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.is_active === false) return null;
  return { user, profile };
};

export const verifyTurnstileIfConfigured = async (req: Request, token?: string | null) => {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return true;
  if (!token) return false;

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  const ip = getRequestIp(req);
  if (ip !== "unknown") form.append("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  if (!response.ok) return false;
  const result = await response.json();
  return Boolean(result?.success);
};

// Codigos de plano autorizados para as tres familias de cobertura.
// A tabela e aplicada tanto ao PDF exibido quanto ao contrato e seus anexos.
export type CoverageFamily = "multimaster" | "multiplus" | "multiprev";

const COVERAGE_FAMILY_BY_PLAN_CODE: Readonly<Record<number, CoverageFamily>> = {
  18: "multiprev",
  19: "multiplus",
  2: "multimaster",
  17: "multimaster",
  20: "multimaster",
};

// Somente o codigo do plano identifica a cobertura. Nomes comerciais nao participam
// da decisao. O codigo 5 (CORTESIA PJ) nao recebe cobertura nem anexo.
export const coverageFamilyForPlan = (planCode: number | string | null | undefined): CoverageFamily | null => {
  if (planCode == null || String(planCode).trim() === "") return null;
  const code = Number(planCode);
  return Number.isInteger(code) ? (COVERAGE_FAMILY_BY_PLAN_CODE[code] ?? null) : null;
};

// Procura os arquivos efetivamente presentes no Storage, inclusive em subpastas.
// Usa o mapeamento configurado por codigo para a familia; so exibe PDFs que existem no Storage.
export const listCoverageDocuments = async (supabase: any): Promise<string[]> => {
  const bucket = supabase.storage.from("plan-coverages");
  const paths: string[] = [];
  const visited = new Set<string>();
  const pending: Array<{ folder: string; depth: number }> = [{ folder: "", depth: 0 }];
  while (pending.length) {
    if (visited.size >= 50) throw new Error("PLAN_COVERAGE_FOLDERS_LIMIT");
    const { folder, depth } = pending.shift()!;
    if (visited.has(folder)) continue;
    visited.add(folder);
    const { data, error } = await bucket.list(folder, { limit: 1000, offset: 0 });
    if (error) throw new Error("PLAN_COVERAGE_STORAGE_UNAVAILABLE");
    if ((data || []).length === 1000) throw new Error("PLAN_COVERAGE_FILES_LIMIT");
    for (const entry of data || []) {
      const name = String(entry?.name || "");
      if (!name || name === "." || name === ".." || /[\/\\]/.test(name)) continue;
      const path = folder ? `${folder}/${name}` : name;
      if (/\.pdf$/i.test(name)) {
        // Arquivo listado nao significa URL inventada: apenas arquivos reais do bucket.
        paths.push(path);
      } else if (depth < 2 && (entry.id == null || entry.metadata == null)) {
        pending.push({ folder: path, depth: depth + 1 });
      }
    }
  }
  return paths;
};

// Somente o codigo ERP determina a familia. O nome do PDF publicado e verificado
// para localizar o documento daquela familia; o nome comercial do plano e ignorado.
export const coverageFileForPlan = (
  planCode: number | string | null | undefined,
  filenames: string[],
): string | null => {
  const family = coverageFamilyForPlan(planCode);
  if (!family) return null;
  const files = filenames.filter((path) => !path.split("/").some((part) => part === "." || part === "..")
    && /\.pdf$/i.test(path));
  const normalized = (text: string) => text.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const matched = files.filter((path) => normalized(path.split("/").pop() || "").includes(family));
  const fixedNames: Record<CoverageFamily, string> = {
    multiprev: "18.pdf", multiplus: "19.pdf", multimaster: "20.pdf",
  };
  // O arquivo oficial numerico tem prioridade sobre nomes comerciais ambiguos.
  const fixedFile = files.find((path) => path === fixedNames[family]);
  if (fixedFile) return fixedFile;
  const canonical = matched.find((path) =>
    normalized((path.split("/").pop() || "").replace(/\.pdf$/i, "")) === family);
  if (canonical) return canonical;
  if (matched.length === 1) return matched[0];
  // Nao escolher PDF arbitrariamente caso existam varias versoes sem arquivo canonico.
  return null;
};

// A exibicao e o aceite do documento sao opcionais: se algum plano desta
// adesao nao tiver documento confirmado, o contrato segue sem cobertura.
export const resolveOptionalCoverage = (planCodes: number[], availableFiles: string[]) => {
  // Se o titular for codigo 5, nao ha quadro, aceite ou anexo de cobertura.
  if (planCodes[0] === 5) return { available: false, files: [] };
  // Dependentes do codigo 5 nunca geram cobertura; nao suprimem o PDF do titular.
  const matched = [...new Set(planCodes)].filter((code) => code !== 5).map((code) => ({
    code,
    family: coverageFamilyForPlan(code),
    fileName: coverageFileForPlan(code, availableFiles),
  }));
  const available = matched.length > 0 &&
    matched.every((entry) => Boolean(entry.family && entry.fileName));
  return { available, files: available ? matched : [] };
};

// Em alguns ambientes, a listagem do Storage nao retorna todos os objetos.
// Antes de omitir a cobertura de um codigo conhecido, consultar diretamente os
// PDFs canonicos 18/19/20.pdf. Nunca inventar URL sem verificar que o PDF existe.
export const resolvePublishedOptionalCoverage = async (
  supabase: any,
  planCodes: number[],
) => {
  let availableFiles: string[] = [];
  try {
    availableFiles = await listCoverageDocuments(supabase);
  } catch (error) {
    console.warn("[plan-coverages] falha ao listar PDFs; tentando caminhos canonicos", error);
  }
  let result = resolveOptionalCoverage(planCodes, availableFiles);
  if (result.available) return result;

  const fixedNames: Record<CoverageFamily, string> = {
    multiprev: "18.pdf", multiplus: "19.pdf", multimaster: "20.pdf",
  };
  const families = [...new Set(planCodes.map((code) => coverageFamilyForPlan(code)).filter(
    (family): family is CoverageFamily => family !== null,
  ))];
  const bucket = supabase.storage.from("plan-coverages");
  for (const family of families) {
    const fileName = fixedNames[family];
    if (availableFiles.includes(fileName)) continue;
    try {
      const { data, error } = await bucket.download(fileName);
      if (!error && data && data.size >= 5) {
        const signature = new Uint8Array(await data.slice(0, 5).arrayBuffer());
        if (String.fromCharCode(...signature) === "%PDF-") {
          availableFiles.push(fileName);
        } else {
          console.warn("[plan-coverages] arquivo canonico nao e PDF", { fileName });
        }
      } else {
        console.info("[plan-coverages] PDF canonico nao confirmado", { fileName, reason: error?.message || "arquivo ausente ou vazio" });
      }
    } catch (error) {
      console.warn("[plan-coverages] falha ao verificar PDF canonico", { fileName, error });
    }
  }
  result = resolveOptionalCoverage(planCodes, availableFiles);
  console.info("[plan-coverages] resolucao de cobertura", {
    planCodes, available: result.available,
    confirmedFiles: result.files.map((entry) => entry.fileName),
  });
  return result;
};

export const sanitizePlan = (plan: any) => ({
  Plano: Number(plan?.Plano ?? plan?.plano ?? plan?.Id ?? 0),
  nomeExibicao: String(plan?.nomeExibicao ?? plan?.NomeANS ?? plan?.PlanoNome ?? plan?.Nome ?? `Plano ${plan?.Plano ?? plan?.plano ?? ""}`),
  ValorTitular: Number(plan?.ValorTitular ?? plan?.valorTitular ?? 0),
  ValorDependente: Number(plan?.ValorDependente ?? plan?.valorDependente ?? 0),
  ValorAgregado: Number(plan?.ValorAgregado ?? plan?.valorAgregado ?? 0),
});
