import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, createServiceClient, jsonResponse } from "../_shared/public-flow.ts";

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
    const { data } = await supabase
      .from("erp_upload_queue_worker_secret")
      .select("token")
      .eq("singleton", true)
      .maybeSingle();

    if (data?.token && data.token === internalToken) {
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

  if (profile?.role !== "ADMINISTRADOR") {
    return { ok: false, source: "user", userId: user.id };
  }

  return { ok: true, source: "manual", userId: user.id };
};

const uploadItem = async (supabase: any, item: any) => {
  const { data, error } = await supabase.storage.from(item.bucket).download(item.arquivo_path);
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

  const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
  let ERP_ENDPOINT = Deno.env.get("ERP_ENDPOINT") || Deno.env.get("ERP_BASE_URL") || "https://odontoart.s4e.com.br";
  if (!ERP_TOKEN) throw new UploadQueueError("ERP_TOKEN not configured", "ERP_CONFIG", 500);
  if (!/^https?:\/\//i.test(ERP_ENDPOINT)) ERP_ENDPOINT = `https://${ERP_ENDPOINT}`;
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
    result = { raw: responseText.slice(0, 1000) };
  }

  if (!response.ok) {
    throw new UploadQueueError(
      String(result?.message || result?.mensagem || `ERP respondeu HTTP ${response.status}`),
      "ERP_HTTP",
      response.status,
    );
  }

  return { result, fileSize: bytes.length };
};

const retryDelayMs = (attempt: number) => {
  const minutes = [1, 5, 15, 30];
  const index = Math.min(Math.max(attempt - 1, 0), minutes.length - 1);
  return minutes[index] * 60_000;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  const supabase = createServiceClient();
  const authorization = await authorize(req, supabase);
  if (!authorization.ok) return jsonResponse({ error: "Nao autorizado" }, 401);

  let requestBody: Record<string, unknown> = {};
  try {
    requestBody = await req.json();
  } catch {
    requestBody = {};
  }

  const requestedLimit = Number(requestBody.limit || 20);
  const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 20, 50));
  const source = String(requestBody.source || authorization.source || "worker");

  try {
    const { error: resetError } = await supabase.rpc("reset_stuck_queue_items_v2", {
      stuck_threshold_minutes: 10,
    });
    if (resetError) {
      console.warn("[erp-process-upload-queue] Falha ao recuperar itens travados:", resetError.message);
    }

    const { data: items, error } = await supabase.rpc("claim_erp_upload_queue_v3", {
      p_limit: limit,
    });
    if (error) throw error;

    const claimed = Array.isArray(items) ? items : [];
    const results: Array<Record<string, unknown>> = [];

    const processOne = async (item: any) => {
      const attempts = Number(item.attempts || 0) + 1;

      try {
        const uploaded = await uploadItem(supabase, item);

        const { error: updateError } = await supabase
          .from("erp_upload_queue")
          .update({
            status: "success",
            attempts,
            last_attempt_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
            claimed_at: null,
            erp_response: uploaded.result,
            last_status_code: 200,
            last_error: null,
            last_error_code: null,
            file_size_bytes: uploaded.fileSize,
            worker_source: source,
          })
          .eq("id", item.id);

        if (updateError) throw updateError;

        const { error: removeError } = await supabase.storage
          .from(item.bucket)
          .remove([item.arquivo_path]);

        results.push({
          id: item.id,
          status: "success",
          cleanup_warning: removeError?.message || null,
        });
      } catch (itemError) {
        const finalFailure = attempts >= 5;
        const message = itemError instanceof Error ? itemError.message : String(itemError);
        const statusCode = itemError instanceof UploadQueueError ? itemError.statusCode : null;
        const errorCode = itemError instanceof UploadQueueError ? itemError.code : "WORKER_ERROR";

        await supabase
          .from("erp_upload_queue")
          .update({
            status: finalFailure ? "failed" : "retry_wait",
            attempts,
            last_attempt_at: new Date().toISOString(),
            next_attempt_at: finalFailure
              ? null
              : new Date(Date.now() + retryDelayMs(attempts)).toISOString(),
            finished_at: finalFailure ? new Date().toISOString() : null,
            claimed_at: null,
            last_error: message.slice(0, 1000),
            last_error_code: errorCode,
            last_status_code: statusCode,
            worker_source: source,
          })
          .eq("id", item.id);

        results.push({
          id: item.id,
          status: finalFailure ? "failed" : "retry_wait",
          error_code: errorCode,
          status_code: statusCode,
        });
      }
    };

    const concurrency = 3;
    for (let index = 0; index < claimed.length; index += concurrency) {
      await Promise.all(claimed.slice(index, index + concurrency).map(processOne));
    }

    const successCount = results.filter((item) => item.status === "success").length;
    const retryCount = results.filter((item) => item.status === "retry_wait").length;
    const failedCount = results.filter((item) => item.status === "failed").length;

    return jsonResponse({
      ok: true,
      message: claimed.length === 0
        ? "Nenhum documento elegivel para processamento."
        : `${claimed.length} documento(s) processado(s): ${successCount} sucesso, ${retryCount} nova tentativa, ${failedCount} falha definitiva.`,
      processed: claimed.length,
      success: successCount,
      retry_wait: retryCount,
      failed: failedCount,
      source,
      results,
    });
  } catch (error) {
    console.error("[erp-process-upload-queue]", error);
    return jsonResponse({
      error: "Erro ao processar fila ERP",
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
