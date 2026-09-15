import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, createServiceClient, jsonResponse, requireInternalUser } from "../_shared/public-flow.ts";

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  return btoa(binary);
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  const supabase = createServiceClient();
  const auth = await requireInternalUser(req, supabase);
  if (!auth) return jsonResponse({ error: "Autenticacao obrigatoria" }, 401);

  try {
    const body = await req.json();
    if (!body?.idFuncionario || !body?.idDependente) return jsonResponse({ error: "idFuncionario e idDependente sao obrigatorios" }, 400);

    let arquivo = String(body.arquivo || "");
    let arquivoNome = String(body.arquivoNome || "");
    if (body.arquivoPath) {
      const bucket = String(body.bucket || "cadastros-temp-files");
      const { data, error } = await supabase.storage.from(bucket).download(String(body.arquivoPath));
      if (error || !data) return jsonResponse({ error: "Arquivo nao encontrado" }, 404);
      arquivo = toBase64(new Uint8Array(await data.arrayBuffer()));
      arquivoNome = arquivoNome || String(body.arquivoPath).split("/").pop() || "documento.pdf";
    }
    if (!arquivo || !arquivoNome) return jsonResponse({ error: "Informe arquivo/arquivoNome ou arquivoPath" }, 400);

    const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
    const ERP_ENDPOINT = Deno.env.get("ERP_ENDPOINT") || Deno.env.get("ERP_BASE_URL") || "https://odontoart.s4e.com.br";
    if (!ERP_TOKEN) throw new Error("ERP_TOKEN not configured");

    const response = await fetch(`${ERP_ENDPOINT}/api/dependente/UploadDocDependente?token=${encodeURIComponent(ERP_TOKEN)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idFuncionario: body.idFuncionario, idDependente: body.idDependente, arquivo, arquivoNome }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return jsonResponse({ error: String(result?.message || result?.mensagem || "Erro ao enviar documento ao ERP") }, 502);
    return jsonResponse({ success: true, data: result });
  } catch (error) {
    console.error("[erp-upload-documento]", error);
    return jsonResponse({ error: "Erro ao enviar documento ao ERP" }, 500);
  }
});
