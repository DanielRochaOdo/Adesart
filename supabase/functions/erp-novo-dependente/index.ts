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

const positiveInt = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
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

type ExistingDependent = {
  requestIndex: number;
  nome: string;
  cpf: string;
  codigoDependente: number | null;
  reason: "already_linked_to_holder" | "active_in_erp";
};

const preflightPendingDependentInclusion = async (
  erpToken: string,
  holderCode: number,
  requestedDependents: any[],
) => {
  const holderRecords = await fetchAssociados(erpToken, { codigoAssociado: String(holderCode) });
  const holder = holderRecords.find((item: any) => Number(item?.codigo) === holderCode) || holderRecords[0] || null;
  if (!holder) {
    return { holderActive: false, duplicates: [] as ExistingDependent[] };
  }

  const holderDeps = Array.isArray(holder?.dependentes) ? holder.dependentes : [];
  const holderActive = holderDeps.some((dep: any) => isActive(dep));
  const duplicates: ExistingDependent[] = [];

  for (let requestIndex = 0; requestIndex < requestedDependents.length; requestIndex += 1) {
    const requestDep = requestedDependents[requestIndex];
    const localMatch = holderDeps.find((dep: any) => isActive(dep) && dependentIdentityMatch(dep, requestDep));
    if (localMatch) {
      duplicates.push({
        requestIndex,
        nome: String(requestDep?.nome || localMatch?.nomeDependente || localMatch?.nome || ""),
        cpf: digits(requestDep?.cpf),
        codigoDependente: positiveInt(localMatch?.codigoDependente, localMatch?.codigo, localMatch?.idDependente),
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
        requestIndex,
        nome: String(requestDep?.nome || activeElsewhere?.nomeDependente || activeElsewhere?.nome || ""),
        cpf: requestCpf,
        codigoDependente: positiveInt(
          activeElsewhere?.codigoDependente,
          activeElsewhere?.codigo,
          activeElsewhere?.idDependente,
        ),
        reason: "active_in_erp",
      });
    }
  }

  return { holderActive, duplicates };
};

const resolveDependentTarget = async (
  erpToken: string,
  holderCode: number,
  requestDep: any,
  known?: ExistingDependent | null,
) => {
  if (known?.codigoDependente) {
    return {
      idDependente: known.codigoDependente,
      cpf: known.cpf || digits(requestDep?.cpf),
      nome: known.nome || String(requestDep?.nome || ""),
    };
  }

  const delays = [0, 800, 1600, 3000];
  for (const delay of delays) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

    const records = await fetchAssociados(erpToken, { codigoAssociado: String(holderCode) });
    const holder = records.find((item: any) => Number(item?.codigo) === holderCode) || records[0] || null;
    const deps = Array.isArray(holder?.dependentes) ? holder.dependentes : [];
    const local = deps.find((dep: any) => dependentIdentityMatch(dep, requestDep));
    const localId = positiveInt(local?.codigoDependente, local?.codigo, local?.idDependente);
    if (localId) {
      return {
        idDependente: localId,
        cpf: digits(requestDep?.cpf),
        nome: String(requestDep?.nome || local?.nomeDependente || local?.nome || ""),
      };
    }
  }

  const cpf = digits(requestDep?.cpf);
  if (cpf) {
    const records = await fetchAssociados(erpToken, { cpfDependente: cpf });
    for (const associado of records) {
      const deps = Array.isArray(associado?.dependentes) ? associado.dependentes : [];
      const match = deps.find((dep: any) => dependentIdentityMatch(dep, requestDep));
      const matchId = positiveInt(match?.codigoDependente, match?.codigo, match?.idDependente);
      if (matchId) {
        return {
          idDependente: matchId,
          cpf,
          nome: String(requestDep?.nome || match?.nomeDependente || match?.nome || ""),
        };
      }
    }
  }

  return {
    idDependente: null,
    cpf,
    nome: String(requestDep?.nome || ""),
  };
};

const matchFileToRequestedIndex = (file: any, requested: any[]) => {
  const targetCpf = digits(file?.target_dependente_cpf);
  if (targetCpf) {
    const byCpf = requested.findIndex((dep: any) => digits(dep?.cpf) === targetCpf);
    if (byCpf >= 0) return byCpf;
  }

  const targetName = normalizeText(file?.target_dependente_nome);
  if (targetName) {
    const byName = requested.findIndex((dep: any) => normalizeText(dep?.nome) === targetName);
    if (byName >= 0) return byName;
  }

  return requested.length === 1 ? 0 : -1;
};

const loadAndValidatePendingFiles = async (
  supabase: any,
  pendingId: string,
  requested: any[],
) => {
  const { data: files, error } = await supabase
    .from("link_pendencia_files")
    .select("id,bucket,arquivo_path,arquivo_nome,target_dependente_cpf,target_dependente_nome,erp_queue_id")
    .eq("link_pendencia_id", pendingId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = files || [];
  if (rows.length === 0) throw new Error("LINK_PENDING_ATTACHMENT_REQUIRED");

  const mapped = rows.map((file: any) => ({
    ...file,
    requestIndex: matchFileToRequestedIndex(file, requested),
  }));

  const uncovered = requested
    .map((_: any, index: number) => index)
    .filter((index: number) => !mapped.some((file: any) => file.requestIndex === index));
  if (uncovered.length > 0) {
    throw new Error(`LINK_PENDING_DEPENDENT_ATTACHMENT_REQUIRED:${uncovered.join(",")}`);
  }

  for (const file of mapped) {
    const bucket = String(file.bucket || "cadastros-temp-files");
    const path = String(file.arquivo_path || "").replace(/^\/+/, "");
    const { data: storageFile, error: storageError } = await supabase.storage
      .from(bucket)
      .download(path);
    if (storageError || !storageFile) {
      throw new Error(`LINK_PENDING_FILE_NOT_FOUND:${file.arquivo_nome || path}`);
    }
  }

  return mapped;
};

const enqueuePendingFile = async (
  supabase: any,
  params: {
    file: any;
    cadastro: any;
    auth: any;
    idFuncionario: number;
    target: { idDependente: number | null; cpf: string; nome: string };
  },
) => {
  const { file, cadastro, auth, idFuncionario, target } = params;
  const bucket = String(file.bucket || "cadastros-temp-files");
  const path = String(file.arquivo_path || "").replace(/^\/+/, "");
  const name = String(file.arquivo_nome || path.split("/").pop() || "documento.pdf");
  const targetCpf = digits(target.cpf);

  const { data: storageFile, error: storageError } = await supabase.storage
    .from(bucket)
    .download(path);
  if (storageError || !storageFile) {
    throw new Error(`LINK_PENDING_FILE_NOT_FOUND:${name}`);
  }

  let existingQuery = supabase
    .from("erp_upload_queue")
    .select("id,status")
    .eq("bucket", bucket)
    .eq("arquivo_path", path)
    .eq("id_funcionario", idFuncionario);

  existingQuery = targetCpf
    ? existingQuery.eq("target_dependente_cpf", targetCpf)
    : existingQuery.eq("id_dependente", target.idDependente || 0);

  const { data: existing, error: existingError } = await existingQuery
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing?.status === "success") {
    await supabase.from("link_pendencia_files").update({
      erp_queue_id: existing.id,
      sent_to_erp_at: new Date().toISOString(),
    }).eq("id", file.id);
    return { queued: false, already_processed: true, queue_id: existing.id };
  }

  const queuePayload = {
    cadastro_id: cadastro.id,
    created_by: cadastro.created_by || auth.user.id,
    id_funcionario: idFuncionario,
    id_dependente: target.idDependente || 0,
    arquivo_path: path,
    arquivo_nome: name,
    bucket,
    tipo: "dependente",
    status: "queued",
    attempts: 0,
    next_attempt_at: new Date().toISOString(),
    claimed_at: null,
    finished_at: null,
    last_error: target.idDependente
      ? null
      : targetCpf
        ? `Aguardando o CPF ${targetCpf} ficar disponivel no ERP.`
        : "Dependente ainda nao identificado no ERP.",
    last_error_code: target.idDependente ? null : "PRIMARY_DEPENDENT_NOT_FOUND",
    last_status_code: target.idDependente ? null : 422,
    file_size_bytes: storageFile.size || null,
    worker_source: "link-pendencias",
    cliente_nome: cadastro.nome || null,
    cliente_cpf: cadastro.responsavel_financeiro_cpf || null,
    empresa_nome: cadastro.empresa_nome || null,
    target_dependente_cpf: targetCpf || null,
    target_dependente_nome: target.nome || null,
  };

  let queueRow: any = null;
  if (existing?.id) {
    const { data, error } = await supabase
      .from("erp_upload_queue")
      .update(queuePayload)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw error;
    queueRow = data;
  } else {
    const { data, error } = await supabase
      .from("erp_upload_queue")
      .insert(queuePayload)
      .select("id")
      .single();
    if (error) throw error;
    queueRow = data;
  }

  await supabase.from("link_pendencia_files").update({
    erp_queue_id: queueRow.id,
  }).eq("id", file.id);

  return { queued: true, queue_id: queueRow.id, pending_resolution: !target.idDependente };
};

const queueAllPendingDependentFiles = async (
  supabase: any,
  auth: any,
  cadastro: any,
  pendingFiles: any[],
  requested: any[],
  duplicates: ExistingDependent[],
  erpToken: string,
  holderCode: number,
  idFuncionario: number,
) => {
  const targets = await Promise.all(
    requested.map((dep: any, index: number) =>
      resolveDependentTarget(
        erpToken,
        holderCode,
        dep,
        duplicates.find((item) => item.requestIndex === index) || null,
      )
    ),
  );

  const results: any[] = [];
  for (const file of pendingFiles) {
    const index = Number(file.requestIndex);
    const target = targets[index];
    if (!target) {
      throw new Error(`LINK_PENDING_FILE_TARGET_NOT_FOUND:${file.arquivo_nome || file.id}`);
    }
    results.push(await enqueuePendingFile(supabase, {
      file,
      cadastro,
      auth,
      idFuncionario,
      target,
    }));
  }

  return { targets, results };
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  const supabase = createServiceClient();
  const auth = await requireInternalUser(req, supabase);
  if (!auth) return jsonResponse({ error: "Autenticacao obrigatoria" }, 401);

  let pendingIdForError: string | null = null;
  let erpCommitted = false;

  try {
    const body = await req.json();
    if (!body?.dados?.responsavelFinanceiro || !body?.dados?.parceiro?.codigo) {
      return jsonResponse({ error: "Payload invalido" }, 400);
    }

    const cadastroId = (req.headers.get("X-Cadastro-Id") || req.headers.get("x-cadastro-id") || "").trim();
    let pendingCadastro: any = null;
    let pendingStatus: string | null = null;

    if (cadastroId) {
      const { data, error: cadastroError } = await supabase
        .from("cadastros")
        .select("id,status,tipo_cadastro,link_pendencia_id,responsavel_financeiro_codigo,responsavel_financeiro_cpf,created_by,nome,empresa_nome,vendedor_codigo,adesionista_codigo,erp_response")
        .eq("id", cadastroId)
        .maybeSingle();
      if (cadastroError) throw cadastroError;
      pendingCadastro = data || null;
      pendingIdForError = pendingCadastro?.link_pendencia_id || null;

      if (pendingIdForError) {
        const { data: pendingRow, error: pendingError } = await supabase
          .from("link_pendencias")
          .select("status")
          .eq("id", pendingIdForError)
          .maybeSingle();
        if (pendingError) throw pendingError;
        pendingStatus = String(pendingRow?.status || "") || null;
      }
    }

    const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
    const ERP_URL = Deno.env.get("ERP_URL_NOVO_DEPENDENTE") || "https://odontoart.s4e.com.br/api/vendedor/NovoDependente";
    if (!ERP_TOKEN) throw new Error("ERP_TOKEN not configured");

    const startedAt = Date.now();

    if (pendingIdForError) {
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
      const idFuncionario = Number(pendingCadastro?.vendedor_codigo || 0);
      const requestedDependentsRaw = Array.isArray(body?.dados?.dependente) ? body.dados.dependente : [];
      const requestedDependents = requestedDependentsRaw.map((dep: any) => ({
        ...dep,
        funcionarioCadastro: idFuncionario,
      }));

      if (
        !Number.isInteger(holderCode) || holderCode <= 0 ||
        !Number.isInteger(idFuncionario) || idFuncionario <= 0 ||
        requestedDependents.length === 0
      ) {
        return jsonResponse({
          error: "Dados insuficientes para validar a inclusao no S4E.",
          code: "PENDING_PREFLIGHT_INVALID",
        }, 409);
      }

      let pendingFiles: any[];
      try {
        pendingFiles = await loadAndValidatePendingFiles(
          supabase,
          pendingIdForError,
          requestedDependents,
        );
      } catch (fileError) {
        const message = fileError instanceof Error ? fileError.message : String(fileError);
        const now = new Date().toISOString();
        const friendly = message.startsWith("LINK_PENDING_DEPENDENT_ATTACHMENT_REQUIRED:")
          ? "Cada dependente deve possuir ao menos um anexo antes do envio."
          : message.startsWith("LINK_PENDING_FILE_NOT_FOUND:")
            ? "Um dos anexos obrigatorios nao esta mais disponivel no Storage."
            : "Anexo obrigatorio ausente.";
        await supabase.from("link_pendencias").update({
          status: "aguardando_analise",
          last_error: friendly,
          last_activity_at: now,
          updated_at: now,
        }).eq("id", pendingIdForError);
        return jsonResponse({ error: friendly, code: message.split(":")[0] }, 409);
      }

      let preflight: { holderActive: boolean; duplicates: ExistingDependent[] };
      try {
        preflight = await preflightPendingDependentInclusion(
          ERP_TOKEN,
          holderCode,
          requestedDependents,
        );
      } catch (_preflightError) {
        const now = new Date().toISOString();
        await supabase.from("link_pendencias").update({
          status: "aguardando_analise",
          last_error: "Nao foi possivel confirmar a situacao atual do associado e dos dependentes no S4E.",
          last_activity_at: now,
          updated_at: now,
        }).eq("id", pendingIdForError);
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
        }).eq("id", pendingIdForError);
        return jsonResponse({
          error: "O titular nao possui vinculo ativo no S4E para receber novos dependentes.",
          code: "MEMBER_NOT_ACTIVE",
        }, 409);
      }

      const duplicateIndexes = new Set(preflight.duplicates.map((item) => item.requestIndex));
      const newDependents = requestedDependents.filter((_: any, index: number) => !duplicateIndexes.has(index));

      // Se o ERP ja confirmou a inclusao numa tentativa anterior, a retomada
      // serve somente para reparar/enfileirar os anexos. Nunca reenvia dependentes.
      if (
        pendingCadastro?.status === "enviado" &&
        pendingCadastro?.erp_response &&
        pendingStatus === "erro_envio"
      ) {
        try {
          const queued = await queueAllPendingDependentFiles(
            supabase,
            auth,
            pendingCadastro,
            pendingFiles,
            requestedDependents,
            preflight.duplicates,
            ERP_TOKEN,
            holderCode,
            idFuncionario,
          );
          const now = new Date().toISOString();
          await supabase.from("link_pendencias").update({
            status: "enviado",
            cadastro_id: cadastroId,
            sent_at: now,
            sent_by: auth.profile.id,
            resolved_at: now,
            resolution_reason: "erp_already_sent_attachments_requeued",
            last_error: null,
            last_activity_at: now,
            updated_at: now,
          }).eq("id", pendingIdForError);

          return jsonResponse({
            ...(pendingCadastro.erp_response as Record<string, unknown>),
            idempotent: true,
            repairedAttachments: true,
            attachmentQueues: queued.results,
          });
        } catch (queueError) {
          const message = queueError instanceof Error ? queueError.message : String(queueError);
          const now = new Date().toISOString();
          await supabase.from("link_pendencias").update({
            status: "erro_envio",
            last_error: "ERP ja concluido; um ou mais anexos ainda nao puderam ser enfileirados.",
            last_activity_at: now,
            updated_at: now,
          }).eq("id", pendingIdForError);
          return jsonResponse({
            error: "A inclusao ja existe no ERP, mas os anexos ainda precisam de reprocessamento.",
            code: message.split(":")[0] || "LINK_PENDING_ATTACHMENT_QUEUE_FAILED",
          }, 502);
        }
      }

      // Todos ja existem: nao envia NovoDependente novamente. Mantem os anexos
      // no ERP via fila e encerra a operacao com motivo explicito.
      if (newDependents.length === 0) {
        const syntheticResponse = {
          success: true,
          data: {
            dados: {
              dependentes: preflight.duplicates.map((item) => ({
                codigo: item.codigoDependente,
                cpf: item.cpf,
                nome: item.nome,
              })),
            },
          },
          skippedDependents: preflight.duplicates,
          alreadyActive: true,
        };

        try {
          const queued = await queueAllPendingDependentFiles(
            supabase,
            auth,
            pendingCadastro,
            pendingFiles,
            requestedDependents,
            preflight.duplicates,
            ERP_TOKEN,
            holderCode,
            idFuncionario,
          );
          const now = new Date().toISOString();
          await supabase.from("cadastros").update({
            status: "enviado",
            tipo_cadastro: "inclusao_dependente",
            payload_erp: body,
            erp_response: syntheticResponse,
          }).eq("id", cadastroId);
          await supabase.from("link_pendencias").update({
            status: "encerrado",
            cadastro_id: cadastroId,
            resolved_at: now,
            resolution_reason: "dependents_already_active_in_erp",
            last_error: null,
            erp_response: syntheticResponse,
            last_activity_at: now,
            updated_at: now,
          }).eq("id", pendingIdForError);

          return jsonResponse({
            ...syntheticResponse,
            state: "already_active",
            attachmentQueues: queued.results,
          });
        } catch (queueError) {
          const message = queueError instanceof Error ? queueError.message : String(queueError);
          const now = new Date().toISOString();
          await supabase.from("link_pendencias").update({
            status: "erro_envio",
            last_error: "Dependente ja existe no ERP, mas um ou mais anexos nao puderam ser enfileirados.",
            erp_response: syntheticResponse,
            last_activity_at: now,
            updated_at: now,
          }).eq("id", pendingIdForError);
          return jsonResponse({
            error: "O dependente ja existe no ERP, mas os anexos ainda precisam de reprocessamento.",
            code: message.split(":")[0] || "LINK_PENDING_ATTACHMENT_QUEUE_FAILED",
          }, 502);
        }
      }

      const requestForErp = {
        ...body,
        dados: {
          ...body.dados,
          parceiro: {
            ...(body.dados?.parceiro || {}),
            codigo: idFuncionario,
            ...(Number(pendingCadastro?.adesionista_codigo || 0) > 0
              ? { adesionista: Number(pendingCadastro.adesionista_codigo) }
              : {}),
          },
          responsavelFinanceiro: {
            ...(body.dados?.responsavelFinanceiro || {}),
            codigo: holderCode,
          },
          dependente: newDependents,
        },
      };

      const nowSending = new Date().toISOString();
      await supabase.from("link_pendencias").update({
        status: "enviando",
        last_error: null,
        last_activity_at: nowSending,
        updated_at: nowSending,
      }).eq("id", pendingIdForError);

      const response = await fetch(ERP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: ERP_TOKEN, dados: requestForErp.dados }),
        signal: AbortSignal.timeout(45_000),
      });
      const result = await response.json().catch(() => ({}));
      const ok = response.ok && Boolean(result?.dados);
      const technicalMessage = String(
        result?.message || result?.mensagem || "Erro ao incluir dependente no ERP",
      );
      const userMessage = isTechnicalErpFailure(technicalMessage)
        ? ERP_DEPENDENTE_FALHA_INTERNA
        : technicalMessage;
      const responseBody: any = ok
        ? {
            success: true,
            data: result,
            skippedDependents: preflight.duplicates,
          }
        : { error: userMessage };

      if (!ok) {
        const now = new Date().toISOString();
        await supabase.from("link_pendencias").update({
          status: "erro_envio",
          last_error: userMessage,
          erp_response: responseBody,
          last_activity_at: now,
          updated_at: now,
        }).eq("id", pendingIdForError);
        await supabase.from("cadastros").update({
          status: "incompleto",
          payload_erp: requestForErp,
          erp_response: responseBody,
        }).eq("id", cadastroId);

        await supabase.from("api_logs").insert({
          user_id: auth.user.id,
          user_email: auth.user.email,
          endpoint: "erp-novo-dependente",
          method: "POST",
          request_body: { sanitized: true, cadastro_id: cadastroId, link_pending: true },
          response_body: { error: userMessage, technical_error: technicalMessage },
          status_code: Math.max(response.status, 400),
          success: false,
          error_message: technicalMessage,
          duration_ms: Date.now() - startedAt,
        }).catch(() => undefined);

        return jsonResponse(responseBody, Math.max(response.status, 400));
      }

      erpCommitted = true;

      // ERP confirmado. A partir daqui qualquer falha e de entrega de anexo,
      // portanto o cadastro local permanece enviado e a pendencia vai para erro.
      await supabase.from("cadastros").update({
        status: "enviado",
        tipo_cadastro: "inclusao_dependente",
        payload_erp: requestForErp,
        erp_response: responseBody,
      }).eq("id", cadastroId);

      try {
        const afterSendPreflight = await preflightPendingDependentInclusion(
          ERP_TOKEN,
          holderCode,
          requestedDependents,
        );
        const queued = await queueAllPendingDependentFiles(
          supabase,
          auth,
          pendingCadastro,
          pendingFiles,
          requestedDependents,
          afterSendPreflight.duplicates,
          ERP_TOKEN,
          holderCode,
          idFuncionario,
        );

        const now = new Date().toISOString();
        await supabase.from("link_pendencias").update({
          status: "enviado",
          cadastro_id: cadastroId,
          sent_at: now,
          sent_by: auth.profile.id,
          resolved_at: now,
          resolution_reason: preflight.duplicates.length > 0
            ? "sent_to_erp_with_existing_dependents_skipped"
            : "sent_to_erp",
          last_error: null,
          erp_response: responseBody,
          last_activity_at: now,
          updated_at: now,
        }).eq("id", pendingIdForError);

        await supabase.from("api_logs").insert({
          user_id: auth.user.id,
          user_email: auth.user.email,
          endpoint: "erp-novo-dependente",
          method: "POST",
          request_body: {
            sanitized: true,
            cadastro_id: cadastroId,
            link_pending: true,
            dependentes_enviados: newDependents.length,
            dependentes_ignorados: preflight.duplicates.length,
          },
          response_body: { success: true, attachment_queues: queued.results },
          status_code: 200,
          success: true,
          error_message: null,
          duration_ms: Date.now() - startedAt,
        }).catch(() => undefined);

        return jsonResponse({
          ...responseBody,
          attachmentQueues: queued.results,
        });
      } catch (queueError) {
        const message = queueError instanceof Error ? queueError.message : String(queueError);
        const now = new Date().toISOString();
        await supabase.from("link_pendencias").update({
          status: "erro_envio",
          last_error: "Dependente(s) enviado(s) ao ERP, mas um ou mais anexos ainda precisam de reprocessamento.",
          erp_response: responseBody,
          last_activity_at: now,
          updated_at: now,
        }).eq("id", pendingIdForError);

        return jsonResponse({
          error: "A inclusao foi concluida no ERP, mas um ou mais anexos ainda precisam de reprocessamento.",
          code: message.split(":")[0] || "LINK_PENDING_ATTACHMENT_QUEUE_FAILED",
          erpCommitted: true,
          data: result,
        }, 502);
      }
    }

    // Fluxo existente sem Link Pendencias: mantem o comportamento anterior.
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
      request_body: { sanitized: true, cadastro_id: cadastroId || null, link_pending: false },
      response_body: ok
        ? { success: true }
        : { error: userMessage, technical_error: technicalMessage },
      status_code: ok ? 200 : response.status,
      success: ok,
      error_message: ok ? null : technicalMessage,
      duration_ms: Date.now() - startedAt,
    }).catch(() => undefined);

    return jsonResponse(responseBody, ok ? 200 : Math.max(response.status, 400));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[erp-novo-dependente]", error);

    if (pendingIdForError) {
      const now = new Date().toISOString();
      await supabase.from("link_pendencias").update({
        status: erpCommitted ? "erro_envio" : "aguardando_analise",
        last_error: erpCommitted
          ? "ERP concluido; falha posterior na preparacao dos anexos."
          : message.slice(0, 500),
        last_activity_at: now,
        updated_at: now,
      }).eq("id", pendingIdForError);
    }

    return jsonResponse({
      error: erpCommitted
        ? "A inclusao foi concluida no ERP, mas os anexos ainda precisam de reprocessamento."
        : "Erro interno do servidor",
      code: erpCommitted ? "LINK_PENDING_ATTACHMENT_QUEUE_FAILED" : "INTERNAL_ERROR",
    }, 500);
  }
});
