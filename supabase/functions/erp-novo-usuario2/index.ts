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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  const supabase = createServiceClient();
  const auth = await requireInternalUser(req, supabase);
  if (!auth) return jsonResponse({ error: "Autenticacao obrigatoria" }, 401);

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
    if (cadastroId) {
      const { data } = await supabase
        .from("cadastros")
        .select(
          "id,status,nome,cpf,created_by,empresa_id,empresa_codigo,empresa_nome,empresa_raw,origem_link_id,vendedor_id,vendedor_codigo,vendedor_nome,adesionista_id,adesionista_codigo,adesionista_nome,plano_codigo,plano_nome,arquivo_path,arquivo_nome,erp_response",
        )
        .eq("id", cadastroId)
        .maybeSingle();
      existing = data || null;

      if (existing?.status === "enviado" && existing?.erp_response) {
        return jsonResponse({
          ...(existing.erp_response as Record<string, unknown>),
          idempotent: true,
          reused: true,
        });
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

      if (existingLog?.response_body && existing?.status === "enviado") {
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

    if (cadastroId) {
      if (ok) {
        const empresaCodigo = existing?.empresa_codigo || existing?.empresa_id || empresaCodigoPayload;
        const empresaNome = await resolveEmpresaNome(
          supabase,
          existing,
          empresaCodigo,
          ERP_TOKEN,
          ERP_BASE_URL,
        );

        let vendedorCodigo = textValue(
          existing?.vendedor_codigo,
          requestBody?.dados?.parceiro?.codigo,
        );
        if (vendedorCodigo === "0") vendedorCodigo = null;

        let vendedorProfile = await resolveProfile(supabase, "VENDEDOR", vendedorCodigo);
        if (!vendedorProfile && existing?.created_by) {
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

        let adesionistaCodigo = textValue(
          existing?.adesionista_codigo,
          requestBody?.dados?.parceiro?.adesionista,
        );
        if (adesionistaCodigo === "0") adesionistaCodigo = null;
        const adesionistaProfile = await resolveProfile(
          supabase,
          "ADESIONISTA",
          adesionistaCodigo,
        );

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
      }, 200);
    }

    return jsonResponse(responseBody, Math.max(response.status, 400));
  } catch (error) {
    console.error("[erp-novo-usuario2]", error);
    return jsonResponse({
      error: "Erro interno do servidor",
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
