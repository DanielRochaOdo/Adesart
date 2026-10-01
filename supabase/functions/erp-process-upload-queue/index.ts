import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, createServiceClient, jsonResponse } from "../_shared/public-flow.ts";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const normalizeDigits = (value: unknown) =>
  String(value ?? "").replace(/\D/g, "");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class UploadQueueError extends Error {
  statusCode: number | null;
  code: string;

  constructor(message: string, code: string, statusCode: number | null = null) {
    super(message);
    this.name = "UploadQueueError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
};

const authorize = async (req: Request, supabase: any) => {
  const expectedServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();

  if (expectedServiceRole && bearer && bearer === expectedServiceRole) {
    return { ok: true, source: "service_role", userId: null };
  }

  const internalToken = (req.headers.get("X-Queue-Worker-Token") || "").trim();
  if (internalToken) {
    const { data, error } = await supabase
      .from("erp_upload_queue_worker_secret")
      .select("token")
      .eq("singleton", true)
      .maybeSingle();

    if (!error && data?.token && data.token === internalToken) {
      return { ok: true, source: "cron", userId: null };
    }
  }

  if (!bearer) return { ok: false, source: "unknown", userId: null };

  const { data: userData } = await supabase.auth.getUser(bearer);
  const user = userData?.user;
  if (!user) return { ok: false, source: "unknown", userId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!["ADMINISTRADOR", "CADASTRO", "GERENTE"].includes(String(profile?.role || ""))) {
    return { ok: false, source: "user", userId: user.id };
  }

  return { ok: true, source: "manual", userId: user.id };
};

const extractErpAcceptance = (result: any) => {
  const rawCode =
    result?.codigo ??
    result?.dados?.codigo ??
    result?.data?.codigo ??
    result?.data?.dados?.codigo;

  const erpCode = rawCode === null || rawCode === undefined || rawCode === ""
    ? null
    : Number(rawCode);

  const erpMessage = String(
    result?.message ??
    result?.mensagem ??
    result?.dados?.mensagem ??
    result?.data?.mensagem ??
    "",
  ).trim();

  const hasErrors = Array.isArray(result?.erros)
    ? result.erros.length > 0
    : Boolean(result?.erros);

  return {
    erpCode,
    erpMessage,
    accepted:
      erpCode === 1 &&
      result?.success !== false &&
      !hasErrors,
  };
};

const resolveCanonicalDependentId = async (supabase: any, item: any) => {
  let targetCpf = normalizeDigits(item?.target_dependente_cpf);
  let empresaCodigo = 0;

  if (item?.cadastro_id) {
    const { data: cadastro, error: cadastroError } = await supabase
      .from("cadastros")
      .select("cpf,empresa_codigo,empresa_id")
      .eq("id", item.cadastro_id)
      .maybeSingle();

    if (cadastroError) {
      console.warn(
        "[erp-process-upload-queue] Falha ao carregar cadastro para resolver CPF principal:",
        cadastroError.message,
      );
    } else if (cadastro) {
      targetCpf = targetCpf || normalizeDigits(cadastro.cpf);
      empresaCodigo = Number(cadastro.empresa_codigo || cadastro.empresa_id || 0);
    }
  }

  // Itens legados sem CPF-alvo continuam usando o ID ja persistido.
  if (!targetCpf) {
    const legacyId = Number(item?.id_dependente || 0);
    if (Number.isInteger(legacyId) && legacyId > 0) return legacyId;

    throw new UploadQueueError(
      "CPF principal do cadastro nao identificado para resolver o destino do anexo.",
      "PRIMARY_DEPENDENT_NOT_FOUND",
      422,
    );
  }

  const canonicalDependenteId = await resolveCanonicalDependentId(supabase, item);
  item.id_dependente = canonicalDependenteId;

  const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
  let ERP_ENDPOINT =
    Deno.env.get("ERP_ENDPOINT") ||
    Deno.env.get("ERP_BASE_URL") ||
    "https://odontoart.s4e.com.br";

  if (!ERP_TOKEN) {
    throw new UploadQueueError("ERP_TOKEN not configured", "ERP_CONFIG", 500);
  }

  if (!/^https?:\/\//i.test(ERP_ENDPOINT)) {
    ERP_ENDPOINT = `https://${ERP_ENDPOINT}`;
  }
  ERP_ENDPOINT = ERP_ENDPOINT.replace(/\/+$/, "");

  const delays = [0, 750, 2_000];

  for (const delay of delays) {
    if (delay > 0) await sleep(delay);

    try {
      let pagina = 1;
      let totalPaginas = 1;

      do {
        const params = new URLSearchParams({
          token: ERP_TOKEN,
          incluirAns: "true",
          cpfDependente: targetCpf,
          pagina: String(pagina),
        });

        const response = await fetch(
          `${ERP_ENDPOINT}/v2/api/associados?${params.toString()}`,
          {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(15_000),
          },
        );

        if (!response.ok) break;

        const payload = await response.json().catch(() => ({}));
        const registros = Array.isArray(payload?.dados) ? payload.dados : [];

        for (const associado of registros) {
          if (
            empresaCodigo > 0 &&
            Number(associado?.codigoDaEmpresa || 0) !== empresaCodigo
          ) {
            continue;
          }

          const dependentes = Array.isArray(associado?.dependentes)
            ? associado.dependentes
            : [];

          for (const dep of dependentes) {
            const depCpf = normalizeDigits(
              dep?.numeroCpfDependente ?? dep?.cpfDependente ?? dep?.cpf,
            );
            if (depCpf !== targetCpf) continue;

            const resolvedId = Number(
              dep?.codigoDependente ?? dep?.codigo ?? dep?.idDependente ?? 0,
            );
            if (Number.isInteger(resolvedId) && resolvedId > 0) {
              if (Number(item?.id_dependente || 0) !== resolvedId) {
                await supabase
                  .from("erp_upload_queue")
                  .update({
                    id_dependente: resolvedId,
                    target_dependente_cpf: targetCpf,
                    last_error: null,
                    last_error_code: null,
                    last_status_code: null,
                  })
                  .eq("id", item.id);
              }
              item.id_dependente = resolvedId;
              item.target_dependente_cpf = targetCpf;
              return resolvedId;
            }
          }
        }

        totalPaginas = Math.max(1, Number(payload?.totalPaginas || 1));
        pagina += 1;
      } while (pagina <= totalPaginas && pagina <= 20);
    } catch (error) {
      console.warn(
        "[erp-process-upload-queue] Falha ao consultar CPF principal no ERP:",
        error,
      );
    }
  }

  throw new UploadQueueError(
    `CPF principal ${targetCpf} nao localizado no ERP para a empresa do cadastro.`,
    "PRIMARY_DEPENDENT_NOT_FOUND",
    422,
  );
};

const uploadItem = async (supabase: any, item: any) => {
  const { data, error } = await supabase.storage
    .from(item.bucket)
    .download(item.arquivo_path);

  if (error || !data) {
    throw new UploadQueueError(
      `Arquivo nao encontrado no Storage: ${error?.message || item.arquivo_path}`,
      "FILE_NOT_FOUND",
      404,
    );
  }

  const bytes = new Uint8Array(await data.arrayBuffer());

  if (bytes.length === 0) {
    throw new UploadQueueError("Arquivo vazio no Storage", "EMPTY_FILE", 422);
  }

  if (bytes.length > MAX_FILE_BYTES) {
    throw new UploadQueueError(
      `Arquivo excede o limite de 5 MB aceito pelo ERP (${bytes.length} bytes)`,
      "FILE_TOO_LARGE",
      413,
    );
  }

  const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
  let ERP_ENDPOINT =
    Deno.env.get("ERP_ENDPOINT") ||
    Deno.env.get("ERP_BASE_URL") ||
    "https://odontoart.s4e.com.br";

  if (!ERP_TOKEN) {
    throw new UploadQueueError("ERP_TOKEN not configured", "ERP_CONFIG", 500);
  }

  if (!/^https?:\/\//i.test(ERP_ENDPOINT)) {
    ERP_ENDPOINT = `https://${ERP_ENDPOINT}`;
  }
  ERP_ENDPOINT = ERP_ENDPOINT.replace(/\/+$/, "");

  let response: Response;
  try {
    response = await fetch(
      `${ERP_ENDPOINT}/api/dependente/UploadDocDependente?token=${encodeURIComponent(ERP_TOKEN)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idFuncionario: item.id_funcionario,
          idDependente: item.id_dependente,
          arquivo: toBase64(bytes),
          arquivoNome: item.arquivo_nome,
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UploadQueueError(
      `Falha de conexao com o ERP: ${message}`,
      "ERP_NETWORK",
      null,
    );
  }

  const responseText = await response.text();
  let result: any = {};
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new UploadQueueError(
      `ERP retornou conteudo invalido: ${responseText.slice(0, 300)}`,
      "ERP_INVALID_RESPONSE",
      response.status,
    );
  }

  if (!response.ok) {
    throw new UploadQueueError(
      String(
        result?.message ||
        result?.mensagem ||
        `ERP respondeu HTTP ${response.status}`,
      ),
      "ERP_HTTP",
      response.status,
    );
  }

  const acceptance = extractErpAcceptance(result);
  if (!acceptance.accepted) {
    throw new UploadQueueError(
      acceptance.erpMessage ||
        (acceptance.erpCode !== null
          ? `ERP rejeitou o arquivo com codigo ${acceptance.erpCode}`
          : "ERP nao confirmou o aceite do arquivo"),
      "ERP_REJECTED",
      response.status,
    );
  }

  return {
    result,
    fileSize: bytes.length,
    erpCode: acceptance.erpCode,
    erpMessage: acceptance.erpMessage,
  };
};

const retryDelayMs = (attempt: number) => {
  const minutes = [1, 5, 15, 30];
  const index = Math.min(Math.max(attempt - 1, 0), minutes.length - 1);
  return minutes[index] * 60_000;
};

const isRetryableError = (error: unknown) => {
  if (!(error instanceof UploadQueueError)) return true;

  if (error.code === "ERP_NETWORK") return true;

  if (error.code === "ERP_HTTP") {
    const status = Number(error.statusCode || 0);
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }

  if (
    [
      "FILE_NOT_FOUND",
      "EMPTY_FILE",
      "FILE_TOO_LARGE",
      "ERP_CONFIG",
      "ERP_INVALID_RESPONSE",
      "ERP_REJECTED",
    ].includes(error.code)
  ) {
    return false;
  }

  return true;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Metodo nao permitido" }, 405);
  }

  const supabase = createServiceClient();
  const authorization = await authorize(req, supabase);
  if (!authorization.ok) {
    return jsonResponse({ error: "Nao autorizado" }, 401);
  }

  let requestBody: Record<string, unknown> = {};
  try {
    requestBody = await req.json();
  } catch {
    requestBody = {};
  }

  const requestedLimit = Number(requestBody.limit || 20);
  const limit = Math.max(
    1,
    Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 20, 50),
  );
  const source = String(
    requestBody.source || authorization.source || "worker",
  );

  let workerLockToken: string | null = null;

  try {
    const { data: lockToken, error: lockError } = await supabase.rpc(
      "acquire_erp_upload_worker_lock_v1",
      { p_source: source, p_lease_seconds: 600 },
    );

    if (lockError) {
      throw new Error(`Falha ao adquirir lock global do worker: ${lockError.message}`);
    }

    workerLockToken = typeof lockToken === "string" && lockToken.trim()
      ? lockToken.trim()
      : null;

    if (!workerLockToken) {
      return jsonResponse({
        ok: true,
        skipped: true,
        code: "WORKER_ALREADY_RUNNING",
        message: "A fila ja esta sendo processada por outro worker.",
        processed: 0,
        success: 0,
        retry_wait: 0,
        failed: 0,
        source,
      }, 202);
    }

    const { error: resetError } = await supabase.rpc(
      "reset_stuck_queue_items_v3",
      { stuck_threshold_minutes: 10 },
    );

    if (resetError) {
      console.warn(
        "[erp-process-upload-queue] Falha ao recuperar itens travados:",
        resetError.message,
      );
    }

    const { data: items, error } = await supabase.rpc(
      "claim_erp_upload_queue_v4",
      { p_limit: limit },
    );
    if (error) throw error;

    const claimed = Array.isArray(items) ? items : [];
    const results: Array<Record<string, unknown>> = [];

    const processOne = async (item: any) => {
      const attempts = Number(item.attempts || 0) + 1;
      const processingToken = String(item.processing_token || "").trim();

      if (!processingToken) {
        results.push({
          id: item.id,
          status: "worker_error",
          error_code: "MISSING_PROCESSING_TOKEN",
        });
        return;
      }

      try {
        const uploaded = await uploadItem(supabase, item);
        const now = new Date().toISOString();

        const { data: completed, error: updateError } = await supabase
          .from("erp_upload_queue")
          .update({
            status: "success",
            attempts,
            last_attempt_at: now,
            next_attempt_at: null,
            finished_at: now,
            claimed_at: null,
            processing_token: null,
            processing_started_at: null,
            erp_response: uploaded.result,
            last_status_code: 200,
            last_error: null,
            last_error_code: null,
            file_size_bytes: uploaded.fileSize,
            worker_source: source,
            error_resolution:
              Number(item.replacement_count || 0) > 0 ||
                Number(item.manual_reprocess_count || 0) > 0
                ? "REPROCESSED_SUCCESS"
                : null,
            resolved_at:
              Number(item.replacement_count || 0) > 0 ||
                Number(item.manual_reprocess_count || 0) > 0
                ? now
                : null,
          })
          .eq("id", item.id)
          .eq("processing_token", processingToken)
          .select("id")
          .maybeSingle();

        if (updateError) {
          throw new UploadQueueError(
            `Falha ao registrar sucesso na fila: ${updateError.message}`,
            "QUEUE_STATE_UPDATE",
            500,
          );
        }

        if (!completed?.id) {
          results.push({
            id: item.id,
            status: "claim_lost",
            error_code: "CLAIM_LOST",
          });
          return;
        }

        const { error: removeError } = await supabase.storage
          .from(item.bucket)
          .remove([item.arquivo_path]);

        results.push({
          id: item.id,
          status: "success",
          erp_code: uploaded.erpCode,
          erp_message: uploaded.erpMessage,
          cleanup_warning: removeError?.message || null,
        });
      } catch (itemError) {
        const retryable = isRetryableError(itemError);
        const finalFailure = !retryable || attempts >= 5;
        const message =
          itemError instanceof Error ? itemError.message : String(itemError);
        const statusCode =
          itemError instanceof UploadQueueError
            ? itemError.statusCode
            : null;
        const errorCode =
          itemError instanceof UploadQueueError
            ? itemError.code
            : "WORKER_ERROR";

        const now = new Date().toISOString();
        const nextAttemptAt = finalFailure
          ? null
          : new Date(Date.now() + retryDelayMs(attempts)).toISOString();

        const { data: failedRow, error: failureUpdateError } = await supabase
          .from("erp_upload_queue")
          .update({
            status: finalFailure ? "failed" : "retry_wait",
            attempts,
            last_attempt_at: now,
            next_attempt_at: nextAttemptAt,
            finished_at: finalFailure ? now : null,
            claimed_at: null,
            processing_token: null,
            processing_started_at: null,
            last_error: message.slice(0, 1000),
            last_error_code: errorCode,
            last_status_code: statusCode,
            worker_source: source,
            error_resolution:
              finalFailure &&
                (
                  Number(item.replacement_count || 0) > 0 ||
                  Number(item.manual_reprocess_count || 0) > 0
                )
                ? "REPROCESS_FAILED"
                : null,
            resolved_at: null,
          })
          .eq("id", item.id)
          .eq("processing_token", processingToken)
          .select("id")
          .maybeSingle();

        if (failureUpdateError) {
          console.error(
            "[erp-process-upload-queue] Falha ao persistir erro do item",
            item.id,
            failureUpdateError,
          );
          results.push({
            id: item.id,
            status: "queue_update_failed",
            error_code: errorCode,
            details: failureUpdateError.message,
          });
          return;
        }

        if (!failedRow?.id) {
          results.push({
            id: item.id,
            status: "claim_lost",
            error_code: "CLAIM_LOST",
          });
          return;
        }

        results.push({
          id: item.id,
          status: finalFailure ? "failed" : "retry_wait",
          retryable,
          attempts,
          error_code: errorCode,
          status_code: statusCode,
        });
      }
    };

    const concurrency = 3;
    for (let index = 0; index < claimed.length; index += concurrency) {
      await Promise.all(
        claimed.slice(index, index + concurrency).map(processOne),
      );
    }

    const successCount = results.filter(
      (item) => item.status === "success",
    ).length;
    const retryCount = results.filter(
      (item) => item.status === "retry_wait",
    ).length;
    const failedCount = results.filter(
      (item) => item.status === "failed",
    ).length;
    const claimLostCount = results.filter(
      (item) => item.status === "claim_lost",
    ).length;
    const workerErrorCount = results.filter(
      (item) =>
        item.status === "worker_error" ||
        item.status === "queue_update_failed",
    ).length;

    return jsonResponse({
      ok: workerErrorCount === 0,
      message:
        claimed.length === 0
          ? "Nenhum documento elegivel para processamento."
          : `${claimed.length} documento(s) processado(s): ${successCount} sucesso, ${retryCount} nova tentativa, ${failedCount} falha definitiva, ${claimLostCount} claim expirado.`,
      processed: claimed.length,
      success: successCount,
      retry_wait: retryCount,
      failed: failedCount,
      claim_lost: claimLostCount,
      worker_errors: workerErrorCount,
      source,
      results,
    });
  } catch (error) {
    console.error("[erp-process-upload-queue]", error);
    return jsonResponse(
      {
        error: "Erro ao processar fila ERP",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  } finally {
    if (workerLockToken) {
      const { error: releaseError } = await supabase.rpc(
        "release_erp_upload_worker_lock_v1",
        { p_token: workerLockToken },
      );
      if (releaseError) {
        console.warn(
          "[erp-process-upload-queue] Falha ao liberar lock global:",
          releaseError.message,
        );
      }
    }
  }
});
