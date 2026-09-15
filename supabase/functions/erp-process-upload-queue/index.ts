import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, createServiceClient, jsonResponse } from "../_shared/public-flow.ts";

const authorizeServiceRole = (req: Request) => {
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const received = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return Boolean(expected && received && expected === received);
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = ""; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  return btoa(binary);
};

const uploadItem = async (supabase: any, item: any) => {
  const { data, error } = await supabase.storage.from(item.bucket).download(item.arquivo_path);
  if (error || !data) throw new Error(`Arquivo nao encontrado: ${error?.message || item.arquivo_path}`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
  const ERP_ENDPOINT = Deno.env.get("ERP_ENDPOINT") || Deno.env.get("ERP_BASE_URL") || "https://odontoart.s4e.com.br";
  if (!ERP_TOKEN) throw new Error("ERP_TOKEN not configured");
  const response = await fetch(`${ERP_ENDPOINT}/api/dependente/UploadDocDependente?token=${encodeURIComponent(ERP_TOKEN)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idFuncionario: item.id_funcionario, idDependente: item.id_dependente, arquivo: toBase64(bytes), arquivoNome: item.arquivo_nome }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(result?.message || result?.mensagem || "Erro ao enviar documento ao ERP"));
  await supabase.storage.from(item.bucket).remove([item.arquivo_path]).catch(() => undefined);
  return result;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);
  if (!authorizeServiceRole(req)) return jsonResponse({ error: "Nao autorizado" }, 401);
  const supabase = createServiceClient();

  try {
    await supabase.rpc("reset_stuck_queue_items", { stuck_threshold_minutes: 15 });
    const { data: items, error } = await supabase.rpc("claim_erp_upload_queue_v2", { p_limit: 10 });
    if (error) throw error;
    const results: Array<Record<string, unknown>> = [];

    for (let index = 0; index < (items || []).length; index++) {
      const item = items[index];
      const attempts = Number(item.attempts || 0) + 1;
      try {
        const result = await uploadItem(supabase, item);
        await supabase.from("erp_upload_queue").update({
          status: "success", attempts, last_attempt_at: new Date().toISOString(), erp_response: result, last_status_code: 200, last_error: null,
        }).eq("id", item.id);
        results.push({ id: item.id, status: "success" });
      } catch (itemError) {
        const finalFailure = attempts >= 5;
        const message = itemError instanceof Error ? itemError.message : String(itemError);
        await supabase.from("erp_upload_queue").update({
          status: finalFailure ? "failed" : "retry_wait", attempts, last_attempt_at: new Date().toISOString(),
          next_attempt_at: finalFailure ? null : new Date(Date.now() + 10 * 60 * 1000).toISOString(), last_error: message.slice(0, 1000),
        }).eq("id", item.id);
        results.push({ id: item.id, status: finalFailure ? "failed" : "retry_wait" });
      }
      if (index < (items || []).length - 1) await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    return jsonResponse({ ok: true, processed: results.length, results });
  } catch (error) {
    console.error("[erp-process-upload-queue]", error);
    return jsonResponse({ error: "Erro ao processar fila ERP" }, 500);
  }
});
