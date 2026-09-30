import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EnqueueRequest {
  cadastroId: string | null;
  idFuncionario: number;
  idDependente: number;
  arquivoPath: string;
  arquivoNome: string;
  tipo: "titular" | "dependente";
  bucket?: string;
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Autorizacao necessaria" }, 401);

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) return jsonResponse({ error: "Token invalido" }, 401);

    const body: EnqueueRequest = await req.json();
    const bucket = String(body.bucket || "cadastros-temp-files");
    const arquivoPath = String(body.arquivoPath || "").trim().replace(/^\/+/, "");
    const arquivoNome = String(body.arquivoNome || arquivoPath.split("/").pop() || "").trim();
    const idFuncionario = Number(body.idFuncionario || 0);
    const idDependente = Number(body.idDependente || 0);

    if (
      !Number.isInteger(idFuncionario) || idFuncionario <= 0 ||
      !Number.isInteger(idDependente) || idDependente <= 0 ||
      !arquivoPath || !arquivoNome ||
      !["titular", "dependente"].includes(String(body.tipo))
    ) {
      return jsonResponse({ error: "Parametros obrigatorios invalidos para enfileirar documento" }, 400);
    }

    const { data: storageObject } = await supabaseClient
      .schema("storage")
      .from("objects")
      .select("id,metadata")
      .eq("bucket_id", bucket)
      .eq("name", arquivoPath)
      .maybeSingle();

    if (!storageObject) {
      return jsonResponse({
        error: "Arquivo nao encontrado no Storage",
        code: "FILE_NOT_FOUND",
        arquivoPath,
      }, 404);
    }

    const metadata = (storageObject.metadata || {}) as Record<string, unknown>;
    const fileSize = Number(metadata.size || metadata.contentLength || 0) || null;

    let createdBy = user.id;
    if (body.cadastroId) {
      const { data: cadastro } = await supabaseClient
        .from("cadastros")
        .select("id,created_by")
        .eq("id", body.cadastroId)
        .maybeSingle();

      if (cadastro?.created_by) createdBy = cadastro.created_by;
    }

    const { data: existing } = await supabaseClient
      .from("erp_upload_queue")
      .select("id,status,attempts")
      .eq("bucket", bucket)
      .eq("arquivo_path", arquivoPath)
      .eq("id_funcionario", idFuncionario)
      .eq("id_dependente", idDependente)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.status === "success") {
      return jsonResponse({
        queued: false,
        already_processed: true,
        queue_id: existing.id,
        message: "Documento ja processado anteriormente.",
      });
    }

    if (existing) {
      const { data: reused, error: reuseError } = await supabaseClient
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
          worker_source: "enqueue",
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (reuseError) {
        console.error("[erp-enqueue-upload] Falha ao reutilizar item:", reuseError);
        return jsonResponse({ error: "Erro ao reativar documento na fila" }, 500);
      }

      return jsonResponse({
        queued: true,
        reused: true,
        queue_id: reused.id,
        message: "Documento ja estava na fila e foi reativado para processamento.",
      });
    }

    const queueItem = {
      cadastro_id: body.cadastroId || null,
      created_by: createdBy,
      id_funcionario: idFuncionario,
      id_dependente: idDependente,
      arquivo_path: arquivoPath,
      arquivo_nome: arquivoNome,
      bucket,
      tipo: body.tipo,
      status: "queued",
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      file_size_bytes: fileSize,
      worker_source: "enqueue",
    };

    const { data: queueData, error: queueError } = await supabaseClient
      .from("erp_upload_queue")
      .insert(queueItem)
      .select()
      .single();

    if (queueError) {
      console.error("[erp-enqueue-upload] Erro ao enfileirar upload:", queueError);
      return jsonResponse({
        error: "Erro ao enfileirar upload",
        details: queueError.message,
      }, 500);
    }

    return jsonResponse({
      queued: true,
      queue_id: queueData.id,
      message: "Arquivo enfileirado para envio ao ERP.",
    });
  } catch (error) {
    console.error("[erp-enqueue-upload]", error);
    return jsonResponse({
      error: "Erro interno ao enfileirar documento",
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
