import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, createServiceClient, jsonResponse, requireInternalUser } from "../_shared/public-flow.ts";

const extractMessage = (payload: any) => {
  for (const value of [
    payload?.message,
    payload?.mensagem,
    payload?.error,
    payload?.dados?.mensagem,
    payload?.data?.mensagem,
  ]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "Erro ao enviar cadastro para o ERP";
};

const textValue = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
};

const positiveInt = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
};

const normalizeDigits = (value: unknown) =>
  String(value ?? "").replace(/\D/g, "");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const dependenteFromPayloadByCpf = (payload: any, targetCpf: string) => {
  const normalizedTarget = normalizeDigits(targetCpf);
  if (!normalizedTarget) return null;

  const roots = [
    payload?.dados,
    payload?.data?.dados,
    payload?.data?.data?.dados,
    payload?.data,
  ].filter(Boolean);

  for (const dados of roots) {
    const dependentes = Array.isArray(dados?.dependentes)
      ? dados.dependentes
      : Array.isArray(dados?.dependente)
        ? dados.dependente
        : [];

    for (const dep of dependentes) {
      const depCpf = normalizeDigits(
        dep?.numeroCpfDependente ??
          dep?.cpfDependente ??
          dep?.cpf ??
          dep?.numeroCpf,
      );
      if (depCpf !== normalizedTarget) continue;

      const code = positiveInt(
        dep?.codigoDependente,
        dep?.codigo,
        dep?.idDependente,
        dep?.id,
      );
      if (code) {
        return {
          idDependente: code,
          cpf: normalizedTarget,
          nome: textValue(dep?.nomeDependente, dep?.nome),
        };
      }
    }
  }

  return null;
};

const resolvePrimaryDependente = async (
  erpResult: any,
  targetCpf: string,
  targetNome: string | null,
  empresaCodigo: number,
  erpToken: string,
  erpBaseUrl: string,
) => {
  const normalizedCpf = normalizeDigits(targetCpf);
  if (!normalizedCpf) return null;

  const direct = dependenteFromPayloadByCpf(erpResult, normalizedCpf);
  if (direct) {
    return {
      ...direct,
      nome: textValue(direct.nome, targetNome),
    };
  }

  const delays = [0, 800, 1_600, 3_000, 5_000];

  for (const delay of delays) {
    if (delay > 0) await sleep(delay);

    try {
      let pagina = 1;
      let totalPaginas = 1;

      do {
        const params = new URLSearchParams({
          token: erpToken,
          incluirAns: "true",
          cpfDependente: normalizedCpf,
          pagina: String(pagina),
        });
        const response = await fetch(
          `${erpBaseUrl}/v2/api/associados?${params.toString()}`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(15_000),
          },
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) break;

        const registros = Array.isArray(payload?.dados) ? payload.dados : [];
        for (const associado of registros) {
          if (
            empresaCodigo > 0 &&
            Number(associado?.codigoDaEmpresa || 0) !== Number(empresaCodigo)
          ) {
            continue;
          }

          const dependentes = Array.isArray(associado?.dependentes)
            ? associado.dependentes
            : [];
          for (const dep of dependentes) {
            if (
              normalizeDigits(
                dep?.numeroCpfDependente ?? dep?.cpfDependente ?? dep?.cpf,
              ) !== normalizedCpf
            ) {
              continue;
            }

            const idDependente = positiveInt(
              dep?.codigoDependente,
              dep?.codigo,
              dep?.idDependente,
            );
            if (idDependente) {
              return {
                idDependente,
                cpf: normalizedCpf,
                nome: textValue(dep?.nomeDependente, dep?.nome, targetNome),
              };
            }
          }
        }

        totalPaginas = Math.max(1, Number(payload?.totalPaginas || 1));
        pagina += 1;
      } while (pagina <= totalPaginas && pagina <= 20);
    } catch (error) {
      console.warn(
        "[erp-novo-usuario2] Falha ao resolver CPF principal no ERP:",
        error,
      );
    }
  }

  return null;
};

const empresaNomeFromRaw = (raw: any) => textValue(
  raw?.nomeFantasia,
  raw?.NomeFantazia,
  raw?.NomeFantasia,
  raw?.razaoSocial,
  raw?.RazaoSocial,
  raw?.nome,
);

const resolveEmpresaNome = async (
  supabase: any,
  existing: any,
  empresaCodigo: number,
  erpToken: string,
  erpBaseUrl: string,
) => {
  const direct = textValue(existing?.empresa_nome, empresaNomeFromRaw(existing?.empresa_raw));
  if (direct) return direct;

  if (existing?.origem_link_id) {
    const { data: link } = await supabase
      .from("cadastro_links")
      .select("empresa_nome")
      .eq("id", existing.origem_link_id)
      .maybeSingle();
    const fromLink = textValue(link?.empresa_nome);
    if (fromLink) return fromLink;
  }

  const { data: historical } = await supabase
    .from("cadastros")
    .select("empresa_nome")
    .eq("empresa_codigo", empresaCodigo)
    .not("empresa_nome", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const fromHistory = textValue(historical?.empresa_nome);
  if (fromHistory) return fromHistory;

  try {
    const params = new URLSearchParams({
      token: erpToken,
      empresaId: String(empresaCodigo),
    });
    const response = await fetch(
      `${erpBaseUrl}/api/empresa/BuscaEmpresas?${params.toString()}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      },
    );
    const payload = await response.json().catch(() => ({}));
    const empresa = Array.isArray(payload?.dados) ? payload.dados[0] : null;
    const fromErp = textValue(
      empresa?.NomeFantazia,
      empresa?.NomeFantasia,
      empresa?.RazaoSocial,
    );
    if (response.ok && fromErp) return fromErp;
  } catch (error) {
    console.warn("[erp-novo-usuario2] Falha ao enriquecer nome da empresa:", error);
  }

  return `Empresa código ${empresaCodigo}`;
};

const resolveProfile = async (
  supabase: any,
  role: string,
  externalId: string | null,
) => {
  if (!externalId || externalId === "0") return null;

  const { data } = await supabase
    .from("profiles")
    .select("id,name,external_id,role")
    .eq("role", role)
    .eq("external_id", externalId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data || null;
};

const enqueueAttachment = async (
  supabase: any,
  params: {
    cadastroId: string;
    createdBy: string;
    idFuncionario: number | null;
    idDependente: number | null;
    arquivoPath: string | null;
    arquivoNome: string | null;
    clienteNome: string | null;
    clienteCpf: string | null;
    empresaNome: string | null;
    targetDependenteCpf: string | null;
    targetDependenteNome: string | null;
  },
) => {
  const {
    cadastroId,
    createdBy,
    idFuncionario,
    idDependente,
    arquivoPath,
    arquivoNome,
    clienteNome,
    clienteCpf,
    empresaNome,
    targetDependenteCpf,
    targetDependenteNome,
  } = params;

  if (!arquivoPath) {
    return { queued: false, reason: "NO_ATTACHMENT" };
  }

  const bucket = "cadastros-temp-files";
  const normalizedPath = arquivoPath.replace(/^\/+/, "");

  const { data: storageFile, error: storageError } = await supabase.storage
    .from(bucket)
    .download(normalizedPath);

  if (storageError || !storageFile) {
    const { data: failureRow, error: failureError } = await supabase
      .from("erp_upload_queue")
      .insert({
        cadastro_id: cadastroId,
        created_by: createdBy,
        id_funcionario: idFuncionario || 0,
        id_dependente: idDependente || 0,
        arquivo_path: normalizedPath,
        arquivo_nome: arquivoNome || normalizedPath.split("/").pop() || "documento.pdf",
        bucket,
        tipo: "titular",
        status: "failed",
        attempts: 0,
        next_attempt_at: null,
        finished_at: new Date().toISOString(),
        last_error: `Arquivo nao encontrado no Storage durante finalizacao: ${storageError?.message || normalizedPath}`,
        last_error_code: "FILE_NOT_FOUND",
        last_status_code: 404,
        worker_source: "cadastro-finalize",
        cliente_nome: clienteNome,
        cliente_cpf: clienteCpf,
        empresa_nome: empresaNome,
        target_dependente_cpf: targetDependenteCpf,
        target_dependente_nome: targetDependenteNome,
      })
      .select("id")
      .single();

    if (failureError) {
      return {
        queued: false,
        reason: "FILE_NOT_FOUND",
        arquivoPath: normalizedPath,
        details: failureError.message,
      };
    }

    return {
      queued: false,
      reason: "FILE_NOT_FOUND",
      arquivoPath: normalizedPath,
      queue_id: failureRow.id,
    };
  }

  const fileSize = storageFile.size || null;

  if (!idFuncionario) {
    const failureCode = "ERP_FUNCIONARIO_ID_NOT_FOUND";
    const { data: failureRow, error: failureError } = await supabase
      .from("erp_upload_queue")
      .insert({
        cadastro_id: cadastroId,
        created_by: createdBy,
        id_funcionario: 0,
        id_dependente: idDependente || 0,
        arquivo_path: normalizedPath,
        arquivo_nome: arquivoNome || normalizedPath.split("/").pop() || "documento.pdf",
        bucket,
        tipo: "titular",
        status: "failed",
        attempts: 0,
        next_attempt_at: null,
        finished_at: new Date().toISOString(),
        last_error: "Codigo do funcionario responsavel nao encontrado.",
        last_error_code: failureCode,
        last_status_code: 422,
        file_size_bytes: fileSize,
        worker_source: "cadastro-finalize",
        cliente_nome: clienteNome,
        cliente_cpf: clienteCpf,
        empresa_nome: empresaNome,
        target_dependente_cpf: targetDependenteCpf,
        target_dependente_nome: targetDependenteNome,
      })
      .select("id")
      .single();

    if (failureError) {
      return { queued: false, reason: failureCode, details: failureError.message };
    }

    return {
      queued: false,
      reason: failureCode,
      queue_id: failureRow.id,
      idFuncionario,
      idDependente,
    };
  }

  if (!idDependente) {
    // O ERP pode levar alguns segundos para expor o novo dependente na consulta.
    // Mantemos o item processavel usando o CPF principal como chave canonica.
    const { data: pendingRow, error: pendingError } = await supabase
      .from("erp_upload_queue")
      .insert({
        cadastro_id: cadastroId,
        created_by: createdBy,
        id_funcionario: idFuncionario,
        id_dependente: 0,
        arquivo_path: normalizedPath,
        arquivo_nome: arquivoNome || normalizedPath.split("/").pop() || "documento.pdf",
        bucket,
        tipo: "titular",
        status: "queued",
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
        finished_at: null,
        last_error: targetDependenteCpf
          ? `Aguardando o CPF principal ${targetDependenteCpf} ficar disponivel no ERP.`
          : "CPF principal nao identificado para resolver o destino do anexo.",
        last_error_code: "PRIMARY_DEPENDENT_NOT_FOUND",
        last_status_code: 422,
        file_size_bytes: fileSize,
        worker_source: "cadastro-finalize",
        cliente_nome: clienteNome,
        cliente_cpf: clienteCpf,
        empresa_nome: empresaNome,
        target_dependente_cpf: targetDependenteCpf,
        target_dependente_nome: targetDependenteNome,
      })
      .select("id")
      .single();

    if (pendingError) {
      return {
        queued: false,
        reason: "PRIMARY_DEPENDENT_NOT_FOUND",
        details: pendingError.message,
      };
    }

    return {
      queued: true,
      pending_resolution: true,
      reason: "PRIMARY_DEPENDENT_NOT_FOUND",
      queue_id: pendingRow.id,
      idFuncionario,
      idDependente: null,
      targetDependenteCpf,
    };
  }

  const { data: existingQueue } = await supabase
    .from("erp_upload_queue")
    .select("id,status")
    .eq("bucket", bucket)
    .eq("arquivo_path", normalizedPath)
    .eq("id_funcionario", idFuncionario)
    .eq("id_dependente", idDependente)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingQueue?.status === "success") {
    return {
      queued: false,
      already_processed: true,
      queue_id: existingQueue.id,
    };
  }

  if (existingQueue) {
    const { data: reused, error } = await supabase
      .from("erp_upload_queue")
      .update({
        status: "queued",
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
        claimed_at: null,
        finished_at: null,
        last_error: null,
        last_error_code: null,
        last_status_code: null,
        file_size_bytes: fileSize,
        worker_source: "cadastro-finalize",
        cliente_nome: clienteNome,
        cliente_cpf: clienteCpf,
        empresa_nome: empresaNome,
        target_dependente_cpf: targetDependenteCpf,
        target_dependente_nome: targetDependenteNome,
      })
      .eq("id", existingQueue.id)
      .select("id")
      .single();

    if (error) {
      return { queued: false, reason: "QUEUE_REUSE_FAILED", details: error.message };
    }

    return { queued: true, reused: true, queue_id: reused.id };
  }

  const { data: created, error } = await supabase
    .from("erp_upload_queue")
    .insert({
      cadastro_id: cadastroId,
      created_by: createdBy,
      id_funcionario: idFuncionario,
      id_dependente: idDependente,
      arquivo_path: normalizedPath,
      arquivo_nome: arquivoNome || normalizedPath.split("/").pop() || "documento.pdf",
      bucket,
      tipo: "titular",
      status: "queued",
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      file_size_bytes: fileSize,
      worker_source: "cadastro-finalize",
      cliente_nome: clienteNome,
      cliente_cpf: clienteCpf,
      empresa_nome: empresaNome,
      target_dependente_cpf: targetDependenteCpf,
      target_dependente_nome: targetDependenteNome,
    })
    .select("id")
    .single();

  if (error) {
    return { queued: false, reason: "QUEUE_INSERT_FAILED", details: error.message };
  }

  return { queued: true, queue_id: created.id };
};

const isActiveErpDependent = (dep: any) => {
  const code = Number(dep?.codigoSituacao);
  const name = String(dep?.nomeSituacao || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return code === 1 || name === "ATIVO";
};

const assertNewMemberNotAlreadyActive = async (
  cpfValue: string | null,
  empresaCodigo: number,
  erpToken: string,
  erpBaseUrl: string,
) => {
  const cpf = normalizeDigits(cpfValue);
  if (cpf.length !== 11) throw new Error("LINK_PENDING_CPF_INVALID");

  const params = new URLSearchParams({
    token: erpToken,
    cpfAssociado: cpf,
    incluirAns: "true",
  });
  const response = await fetch(
    `${erpBaseUrl}/v2/api/associados?${params.toString()}`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) },
  );
  if (!response.ok) throw new Error("ERP_PREFLIGHT_UNAVAILABLE");

  const payload = await response.json().catch(() => ({}));
  const records = Array.isArray(payload?.dados) ? payload.dados : [];

  for (const associado of records) {
    if (
      empresaCodigo > 0 &&
      Number(associado?.codigoDaEmpresa || 0) !== Number(empresaCodigo)
    ) {
      continue;
    }

    const deps = Array.isArray(associado?.dependentes) ? associado.dependentes : [];
    const exact = deps.filter(
      (dep: any) => normalizeDigits(dep?.numeroCpfDependente ?? dep?.cpf) === cpf,
    );
    const candidates = exact.length > 0
      ? exact
      : normalizeDigits(associado?.cpf) === cpf
        ? deps.slice(0, 1)
        : [];

    if (candidates.some(isActiveErpDependent)) {
      return {
        active: true,
        codigoAssociado: associado?.codigo ?? null,
        codigoEmpresa: associado?.codigoDaEmpresa ?? null,
      };
    }
  }

  return { active: false };
};

const queueAllPendingFiles = async (
  supabase: any,
  auth: any,
  existing: any,
  requestBody: any,
  cadastroId: string,
  erpPayload: any,
  erpToken: string,
  erpBaseUrl: string,
) => {
  const pendingId = String(existing?.link_pendencia_id || "").trim();
  if (!pendingId) return [] as Record<string, unknown>[];

  const { data: pendingFiles, error: pendingFilesError } = await supabase
    .from("link_pendencia_files")
    .select("id,bucket,arquivo_path,arquivo_nome")
    .eq("link_pendencia_id", pendingId)
    .order("created_at", { ascending: true });
  if (pendingFilesError) throw pendingFilesError;
  if (!pendingFiles || pendingFiles.length === 0) {
    throw new Error("LINK_PENDING_ATTACHMENT_REQUIRED");
  }

  const dependentesPayload = Array.isArray(requestBody?.dados?.dependente)
    ? requestBody.dados.dependente
    : [];
  const principalPayload = dependentesPayload?.[0] || {};
  const principalCpf = normalizeDigits(
    existing?.cpf ??
      principalPayload?.cpf ??
      principalPayload?.numeroCpfDependente ??
      requestBody?.dados?.responsavelFinanceiro?.cpf,
  );
  const principalNome = textValue(
    principalPayload?.nome,
    existing?.nome,
    requestBody?.dados?.responsavelFinanceiro?.nome,
  );
  const empresaCodigo = Number(
    existing?.empresa_codigo ??
      existing?.empresa_id ??
      requestBody?.empresa ??
      requestBody?.dados?.responsavelFinanceiro?.codigoContrato ??
      0,
  );

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("external_id")
    .eq("id", auth.user.id)
    .maybeSingle();

  const idFuncionario = positiveInt(
    principalPayload?.funcionarioCadastro,
    existing?.vendedor_codigo,
    currentProfile?.external_id,
  );

  const resolvedPrincipal = await resolvePrimaryDependente(
    erpPayload,
    principalCpf,
    principalNome,
    empresaCodigo,
    erpToken,
    erpBaseUrl,
  );
  const idDependente = resolvedPrincipal?.idDependente || null;
  const queues: Record<string, unknown>[] = [];

  for (const file of pendingFiles) {
    const queued = await enqueueAttachment(supabase, {
      cadastroId,
      createdBy: existing?.created_by || auth.user.id,
      idFuncionario,
      idDependente,
      arquivoPath: String(file.arquivo_path || ""),
      arquivoNome: String(file.arquivo_nome || ""),
      clienteNome: textValue(existing?.nome, principalNome),
      clienteCpf: textValue(existing?.cpf, principalCpf),
      empresaNome: textValue(existing?.empresa_nome),
      targetDependenteCpf: resolvedPrincipal?.cpf || principalCpf || null,
      targetDependenteNome: textValue(resolvedPrincipal?.nome, principalNome),
    });

    queues.push(queued);

    if (queued?.queue_id) {
      await supabase.from("link_pendencia_files").update({
        erp_queue_id: queued.queue_id,
      }).eq("id", file.id);
    }

    if (queued?.queued !== true && queued?.already_processed !== true) {
      throw new Error(
        `LINK_PENDING_ATTACHMENT_QUEUE_FAILED:${String(queued?.reason || "UNKNOWN")}`,
      );
    }
  }

  return queues;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  const supabase = createServiceClient();
  const auth = await requireInternalUser(req, supabase);
  if (!auth) return jsonResponse({ error: "Autenticacao obrigatoria" }, 401);

  let pendingIdForError: string | null = null;

  try {
    const requestBody = await req.json();
    const responsavel = requestBody?.dados?.responsavelFinanceiro;
    if (!responsavel) return jsonResponse({ error: "Payload invalido" }, 400);

    const cadastroId = (req.headers.get("X-Cadastro-Id") || req.headers.get("x-cadastro-id") || "").trim();
    const idempotencyKey = (req.headers.get("X-Idempotency-Key") || req.headers.get("x-idempotency-key") || "").trim();

    const nomePayload = textValue(responsavel?.nome);
    const empresaCodigoPayload = positiveInt(
      requestBody?.empresa,
      responsavel?.codigoContrato,
    );

    if (!nomePayload) {
      return jsonResponse({ error: "Nome do titular obrigatorio para concluir a adesao" }, 400);
    }
    if (!empresaCodigoPayload) {
      return jsonResponse({ error: "Empresa obrigatoria para concluir a adesao" }, 400);
    }

    let existing: any = null;
    let pendingStatus: string | null = null;
    if (cadastroId) {
      const { data } = await supabase
        .from("cadastros")
        .select(
          "id,status,tipo_cadastro,nome,cpf,created_by,empresa_id,empresa_codigo,empresa_nome,empresa_raw,origem_link_id,link_pendencia_id,vendedor_id,vendedor_codigo,vendedor_nome,adesionista_id,adesionista_codigo,adesionista_nome,plano_codigo,plano_nome,arquivo_path,arquivo_nome,erp_response",
        )
        .eq("id", cadastroId)
        .maybeSingle();
      existing = data || null;
      pendingIdForError = existing?.link_pendencia_id || null;

      if (existing?.link_pendencia_id) {
        const { data: pendingRow } = await supabase
          .from("link_pendencias")
          .select("status")
          .eq("id", existing.link_pendencia_id)
          .maybeSingle();
        pendingStatus = String(pendingRow?.status || "") || null;
      }

      if (
        existing?.status === "enviado" &&
        existing?.erp_response &&
        (!existing?.link_pendencia_id || pendingStatus !== "erro_envio")
      ) {
        return jsonResponse({
          ...(existing.erp_response as Record<string, unknown>),
          idempotent: true,
          reused: true,
        });
      }

      if (existing?.link_pendencia_id) {
        const vendedorCodigoOrigem = positiveInt(existing?.vendedor_codigo);
        const empresaCodigoOrigem = positiveInt(existing?.empresa_codigo, existing?.empresa_id);
        if (!vendedorCodigoOrigem || !empresaCodigoOrigem) {
          return jsonResponse({
            error: "A origem comercial da solicitacao esta incompleta. Revise o link antes do envio.",
            code: "LINK_PENDING_ORIGIN_INVALID",
          }, 409);
        }

        requestBody.empresa = String(empresaCodigoOrigem);
        requestBody.dados = requestBody.dados || {};
        requestBody.dados.parceiro = {
          ...(requestBody.dados.parceiro || {}),
          codigo: vendedorCodigoOrigem,
          ...(positiveInt(existing?.adesionista_codigo)
            ? { adesionista: positiveInt(existing?.adesionista_codigo) }
            : {}),
        };
        requestBody.dados.responsavelFinanceiro = {
          ...(requestBody.dados.responsavelFinanceiro || {}),
          codigoContrato: String(empresaCodigoOrigem),
        };
        if (Array.isArray(requestBody.dados.dependente)) {
          requestBody.dados.dependente = requestBody.dados.dependente.map((dep: any) => ({
            ...dep,
            funcionarioCadastro: vendedorCodigoOrigem,
          }));
        }
      }
    }

    if (idempotencyKey) {
      const { data: existingLog } = await supabase
        .from("api_logs")
        .select("response_body")
        .eq("endpoint", "erp-novo-usuario2")
        .eq("success", true)
        .contains("request_body", { idempotency_key: idempotencyKey })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (
        existingLog?.response_body &&
        existing?.status === "enviado" &&
        (!existing?.link_pendencia_id || pendingStatus !== "erro_envio")
      ) {
        return jsonResponse({
          ...(existing.erp_response || existingLog.response_body as Record<string, unknown>),
          idempotent: true,
          reused: true,
        });
      }
    }

    const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
    let ERP_BASE_URL = Deno.env.get("ERP_ENDPOINT") || Deno.env.get("ERP_BASE_URL") || "https://odontoart.s4e.com.br";
    if (!ERP_TOKEN) throw new Error("ERP_TOKEN not configured");
    if (!/^https?:\/\//i.test(ERP_BASE_URL)) ERP_BASE_URL = `https://${ERP_BASE_URL}`;
    ERP_BASE_URL = ERP_BASE_URL.replace(/\/+$/, "");
    const ERP_URL = Deno.env.get("ERP_URL") || `${ERP_BASE_URL}/api/vendedor/NovoUsuario2`;

    if (
      existing?.link_pendencia_id &&
      existing?.status === "enviado" &&
      existing?.erp_response &&
      pendingStatus === "erro_envio"
    ) {
      try {
        const queues = await queueAllPendingFiles(
          supabase,
          auth,
          existing,
          requestBody,
          cadastroId,
          existing.erp_response?.data ?? existing.erp_response,
          ERP_TOKEN,
          ERP_BASE_URL,
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
        }).eq("id", existing.link_pendencia_id);

        return jsonResponse({
          ...(existing.erp_response as Record<string, unknown>),
          idempotent: true,
          repairedAttachments: true,
          attachmentQueues: queues,
        });
      } catch (repairError) {
        const message = repairError instanceof Error ? repairError.message : String(repairError);
        const now = new Date().toISOString();
        await supabase.from("link_pendencias").update({
          status: message === "LINK_PENDING_ATTACHMENT_REQUIRED" ? "aguardando_analise" : "erro_envio",
          last_error: message === "LINK_PENDING_ATTACHMENT_REQUIRED"
            ? "Anexo obrigatorio ausente."
            : "ERP ja concluido; falha ao preparar anexos para a fila.",
          last_activity_at: now,
          updated_at: now,
        }).eq("id", existing.link_pendencia_id);

        if (message === "LINK_PENDING_ATTACHMENT_REQUIRED") {
          return jsonResponse({
            error: "Anexe ao menos um arquivo antes de concluir esta pendencia.",
            code: message,
          }, 409);
        }
        return jsonResponse({
          error: "A adesao ja existe no ERP, mas os anexos ainda nao puderam ser enfileirados.",
          code: "LINK_PENDING_ATTACHMENT_QUEUE_FAILED",
        }, 502);
      }
    }

    if (existing?.link_pendencia_id) {
      if (existing?.tipo_cadastro !== "cadastro") {
        return jsonResponse({
          error: "Tipo de operacao invalido para o envio de nova adesao.",
          code: "INVALID_PENDING_OPERATION",
        }, 409);
      }

      let preflight: { active: boolean; codigoAssociado?: unknown; codigoEmpresa?: unknown };
      try {
        preflight = await assertNewMemberNotAlreadyActive(
          textValue(existing?.cpf, responsavel?.cpf),
          Number(existing?.empresa_codigo || existing?.empresa_id || empresaCodigoPayload || 0),
          ERP_TOKEN,
          ERP_BASE_URL,
        );
      } catch (preflightError) {
        const message = preflightError instanceof Error ? preflightError.message : "ERP_PREFLIGHT_UNAVAILABLE";
        await supabase.from("link_pendencias").update({
          status: "aguardando_analise",
          last_error: message === "ERP_PREFLIGHT_UNAVAILABLE"
            ? "Nao foi possivel confirmar a situacao atual do CPF no S4E."
            : "CPF da solicitacao invalido para validacao no S4E.",
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", existing.link_pendencia_id);

        return jsonResponse({
          error: message === "ERP_PREFLIGHT_UNAVAILABLE"
            ? "Nao foi possivel validar a situacao atual do CPF no S4E. Tente novamente."
            : "CPF da solicitacao invalido.",
          code: message,
        }, message === "ERP_PREFLIGHT_UNAVAILABLE" ? 503 : 409);
      }

      if (preflight.active) {
        const now = new Date().toISOString();
        await supabase.from("link_pendencias").update({
          status: "encerrado",
          resolved_at: now,
          resolution_reason: "holder_already_active_in_erp",
          last_error: "Titular ja possui adesao ativa no S4E.",
          erp_response: {
            preflight: true,
            codigoAssociado: preflight.codigoAssociado ?? null,
            codigoEmpresa: preflight.codigoEmpresa ?? null,
          },
          last_activity_at: now,
          updated_at: now,
        }).eq("id", existing.link_pendencia_id);

        return jsonResponse({
          error: "Este CPF ja possui uma adesao ativa no S4E. Nenhum novo cadastro foi enviado.",
          code: "CPF_ACTIVE_IN_ERP",
        }, 409);
      }
    }

    if (existing?.link_pendencia_id) {
      const { count: attachmentCount, error: attachmentCountError } = await supabase
        .from("link_pendencia_files")
        .select("id", { count: "exact", head: true })
        .eq("link_pendencia_id", existing.link_pendencia_id);
      if (attachmentCountError) throw attachmentCountError;
      if (!attachmentCount) {
        const now = new Date().toISOString();
        await supabase.from("link_pendencias").update({
          status: "aguardando_analise",
          last_error: "Anexo obrigatorio ausente.",
          last_activity_at: now,
          updated_at: now,
        }).eq("id", existing.link_pendencia_id);
        return jsonResponse({
          error: "Anexe ao menos um arquivo antes de enviar esta pendencia ao ERP.",
          code: "LINK_PENDING_ATTACHMENT_REQUIRED",
        }, 409);
      }

      const now = new Date().toISOString();
      await supabase.from("link_pendencias").update({
        status: "enviando",
        last_error: null,
        last_activity_at: now,
        updated_at: now,
      }).eq("id", existing.link_pendencia_id);
    }

    const startedAt = Date.now();
    const response = await fetch(ERP_URL, {
      method: "POST",
      headers: { token: ERP_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(45_000),
    });

    const result = await response.json().catch(() => ({}));
    const hasCode = positiveInt(result?.dados?.codigo, result?.data?.dados?.codigo);
    const ok = response.ok && Boolean(hasCode);
    const responseBody: any = ok
      ? { success: true, data: result }
      : { error: extractMessage(result), details: result };

    let canonicalSync: Record<string, unknown> | null = null;
    let attachmentQueue: Record<string, unknown> | null = null;
    let attachmentQueues: Record<string, unknown>[] = [];

    if (cadastroId) {
      if (ok) {
        const preserveLinkOrigin = Boolean(existing?.link_pendencia_id);
        const empresaCodigo = existing?.empresa_codigo || existing?.empresa_id || empresaCodigoPayload;
        const empresaNome = preserveLinkOrigin
          ? textValue(existing?.empresa_nome)
          : await resolveEmpresaNome(
              supabase,
              existing,
              empresaCodigo,
              ERP_TOKEN,
              ERP_BASE_URL,
            );

        let vendedorCodigo = preserveLinkOrigin
          ? textValue(existing?.vendedor_codigo)
          : textValue(existing?.vendedor_codigo, requestBody?.dados?.parceiro?.codigo);
        if (vendedorCodigo === "0") vendedorCodigo = null;

        let vendedorProfile = preserveLinkOrigin
          ? null
          : await resolveProfile(supabase, "VENDEDOR", vendedorCodigo);
        if (!preserveLinkOrigin && !vendedorProfile && existing?.created_by) {
          const { data: creator } = await supabase
            .from("profiles")
            .select("id,name,external_id,role")
            .eq("id", existing.created_by)
            .maybeSingle();
          if (creator?.role === "VENDEDOR") {
            vendedorProfile = creator;
            vendedorCodigo = textValue(vendedorCodigo, creator.external_id);
          }
        }

        let adesionistaCodigo = preserveLinkOrigin
          ? textValue(existing?.adesionista_codigo)
          : textValue(existing?.adesionista_codigo, requestBody?.dados?.parceiro?.adesionista);
        if (adesionistaCodigo === "0") adesionistaCodigo = null;
        const adesionistaProfile = preserveLinkOrigin
          ? null
          : await resolveProfile(supabase, "ADESIONISTA", adesionistaCodigo);

        const dependentesPayload = Array.isArray(requestBody?.dados?.dependente)
          ? requestBody.dados.dependente
          : [];

        const planoCodigo = positiveInt(
          existing?.plano_codigo,
          dependentesPayload?.[0]?.plano,
        );

        const canonicalPayload: Record<string, unknown> = {
          status: "enviado",
          nome: textValue(existing?.nome, nomePayload),
          empresa_id: existing?.empresa_id || empresaCodigo,
          empresa_codigo: empresaCodigo,
          empresa_nome: empresaNome,
          vendedor_id: existing?.vendedor_id || vendedorProfile?.id || null,
          vendedor_codigo: vendedorCodigo,
          vendedor_nome: textValue(existing?.vendedor_nome, vendedorProfile?.name),
          adesionista_id: existing?.adesionista_id || adesionistaProfile?.id || null,
          adesionista_codigo: adesionistaCodigo,
          adesionista_nome: textValue(existing?.adesionista_nome, adesionistaProfile?.name),
          plano_codigo: planoCodigo,
          payload_erp: requestBody,
          erp_response: responseBody,
          dependentes: dependentesPayload,
          motivo_bloqueio: null,
        };

        const { data: synced, error: syncError } = await supabase
          .from("cadastros")
          .update(canonicalPayload)
          .eq("id", cadastroId)
          .select(
            "id,status,nome,empresa_codigo,empresa_nome,vendedor_id,vendedor_codigo,vendedor_nome,adesionista_id,adesionista_codigo,adesionista_nome,plano_codigo,arquivo_path,arquivo_nome,created_by",
          )
          .single();

        if (syncError) {
          console.error("[erp-novo-usuario2] ERP confirmou, mas sync canonico falhou:", syncError);
          canonicalSync = {
            ok: false,
            error: syncError.message,
          };
        } else {
          canonicalSync = {
            ok: true,
            cadastro_id: synced.id,
            nome: synced.nome,
            empresa_codigo: synced.empresa_codigo,
            empresa_nome: synced.empresa_nome,
            vendedor_codigo: synced.vendedor_codigo,
            vendedor_nome: synced.vendedor_nome,
          };

          const firstPayloadDep = dependentesPayload?.[0] || {};
          const idFuncionario = positiveInt(
            firstPayloadDep?.funcionarioCadastro,
            (await supabase
              .from("profiles")
              .select("external_id")
              .eq("id", auth.user.id)
              .maybeSingle()).data?.external_id,
          );
          const principalPayload = dependentesPayload?.[0] || {};
          // O destino do anexo e sempre o primeiro CPF do fluxo, persistido em cadastros.cpf.
          // Nunca escolhemos o primeiro registro devolvido pelo ERP.
          const principalCpf = normalizeDigits(
            existing?.cpf ??
              principalPayload?.cpf ??
              principalPayload?.numeroCpfDependente ??
              responsavel?.cpf,
          );
          const principalNome = textValue(
            principalPayload?.nome,
            synced?.nome,
            nomePayload,
          );
          const resolvedPrincipal = await resolvePrimaryDependente(
            result,
            principalCpf,
            principalNome,
            empresaCodigo,
            ERP_TOKEN,
            ERP_BASE_URL,
          );
          const idDependente = resolvedPrincipal?.idDependente || null;
          const arquivoPath = textValue(
            synced?.arquivo_path,
            requestBody?.dados?.documento?.caminho,
          );
          const arquivoNome = textValue(
            synced?.arquivo_nome,
            requestBody?.dados?.documento?.nome,
            arquivoPath?.split("/").pop(),
          );

          if (existing?.link_pendencia_id) {
            attachmentQueues = await queueAllPendingFiles(
              supabase,
              auth,
              existing,
              requestBody,
              cadastroId,
              result,
              ERP_TOKEN,
              ERP_BASE_URL,
            );
            attachmentQueue = attachmentQueues[attachmentQueues.length - 1] || null;
          } else {
            attachmentQueue = await enqueueAttachment(supabase, {
              cadastroId,
              createdBy: synced?.created_by || existing?.created_by || auth.user.id,
              idFuncionario,
              idDependente,
              arquivoPath,
              arquivoNome,
              clienteNome: textValue(synced?.nome, nomePayload),
              clienteCpf: textValue(existing?.cpf, responsavel?.cpf),
              empresaNome: textValue(synced?.empresa_nome, empresaNome),
              targetDependenteCpf: resolvedPrincipal?.cpf || principalCpf || null,
              targetDependenteNome: textValue(resolvedPrincipal?.nome, principalNome),
            });
            attachmentQueues = attachmentQueue ? [attachmentQueue] : [];
          }
        }
      } else {
        const { error: failureSyncError } = await supabase
          .from("cadastros")
          .update({
            status: existing?.status === "enviado" ? "enviado" : "incompleto",
            payload_erp: requestBody,
            erp_response: responseBody,
          })
          .eq("id", cadastroId);

        if (failureSyncError) {
          console.warn("[erp-novo-usuario2] Falha ao registrar retorno negativo:", failureSyncError);
        }
      }
    }

    if (existing?.link_pendencia_id) {
      const now = new Date().toISOString();
      if (ok) {
        await supabase.from("link_pendencias").update({
          status: "enviado",
          cadastro_id: cadastroId || null,
          sent_at: now,
          sent_by: auth.profile.id,
          resolved_at: now,
          resolution_reason: "sent_to_erp",
          last_error: null,
          erp_response: responseBody,
          last_activity_at: now,
          updated_at: now,
        }).eq("id", existing.link_pendencia_id);
      } else {
        await supabase.from("link_pendencias").update({
          status: "erro_envio",
          last_error: String(responseBody?.error || "Erro ao enviar ao S4E"),
          erp_response: responseBody,
          last_activity_at: now,
          updated_at: now,
        }).eq("id", existing.link_pendencia_id);
      }
    }

    const { error: logError } = await supabase.from("api_logs").insert({
      user_id: auth.user.id,
      user_email: auth.user.email,
      endpoint: "erp-novo-usuario2",
      method: "POST",
      request_body: {
        cadastro_id: cadastroId || null,
        idempotency_key: idempotencyKey || null,
        empresa_codigo: empresaCodigoPayload,
      },
      response_body: ok
        ? {
            success: true,
            erp_code: hasCode,
            canonical_sync: canonicalSync,
            attachment_queue: attachmentQueue,
            attachment_queues: attachmentQueues,
          }
        : { error: responseBody.error },
      status_code: ok ? 200 : response.status,
      success: ok,
      error_message: ok ? null : responseBody.error,
      duration_ms: Date.now() - startedAt,
    });
    if (logError) {
      console.warn("[erp-novo-usuario2] Falha ao registrar api_logs:", logError.message);
    }

    if (ok) {
      return jsonResponse({
        ...responseBody,
        canonicalSync,
        attachmentQueue,
        attachmentQueues,
      }, 200);
    }

    return jsonResponse(responseBody, Math.max(response.status, 400));
  } catch (error) {
    console.error("[erp-novo-usuario2]", error);
    const message = error instanceof Error ? error.message : String(error);

    if (
      pendingIdForError &&
      message !== "LINK_PENDING_ATTACHMENT_REQUIRED" &&
      !message.startsWith("LINK_PENDING_ATTACHMENT_QUEUE_FAILED:")
    ) {
      const now = new Date().toISOString();
      await supabase.from("link_pendencias").update({
        status: "erro_envio",
        last_error: message.slice(0, 500),
        last_activity_at: now,
        updated_at: now,
      }).eq("id", pendingIdForError);
    }

    if (pendingIdForError && message === "LINK_PENDING_ATTACHMENT_REQUIRED") {
      const now = new Date().toISOString();
      await supabase.from("link_pendencias").update({
        status: "aguardando_analise",
        last_error: "Anexo obrigatorio ausente.",
        last_activity_at: now,
        updated_at: now,
      }).eq("id", pendingIdForError);
    }
    if (pendingIdForError && message.startsWith("LINK_PENDING_ATTACHMENT_QUEUE_FAILED:")) {
      const now = new Date().toISOString();
      await supabase.from("link_pendencias").update({
        status: "erro_envio",
        last_error: "ERP concluido; um ou mais anexos nao puderam ser enfileirados.",
        last_activity_at: now,
        updated_at: now,
      }).eq("id", pendingIdForError);
    }
    if (message === "LINK_PENDING_ATTACHMENT_REQUIRED") {
      return jsonResponse({
        error: "Anexe ao menos um arquivo antes de enviar esta pendencia ao ERP.",
        code: message,
      }, 409);
    }
    if (message.startsWith("LINK_PENDING_ATTACHMENT_QUEUE_FAILED:")) {
      return jsonResponse({
        error: "A adesao foi concluida no ERP, mas um ou mais anexos ainda precisam de reprocessamento.",
        code: "LINK_PENDING_ATTACHMENT_QUEUE_FAILED",
      }, 502);
    }
    return jsonResponse({
      error: "Erro interno do servidor",
      details: message,
    }, 500);
  }
});
