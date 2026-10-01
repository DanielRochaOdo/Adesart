import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, createServiceClient, jsonResponse, requireInternalUser } from "../_shared/public-flow.ts";

const normalizeDigits = (value: unknown) =>
  String(value ?? "").replace(/\D/g, "");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  return btoa(binary);
};


const resolveCanonicalDependentId = async (
  supabase: any,
  cpf: string,
  empresaCodigo: number,
) => {
  const normalizedCpf = normalizeDigits(cpf);
  if (!normalizedCpf || empresaCodigo <= 0) return null;

  const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
  let ERP_ENDPOINT =
    Deno.env.get("ERP_ENDPOINT") ||
    Deno.env.get("ERP_BASE_URL") ||
    "https://odontoart.s4e.com.br";
  if (!ERP_TOKEN) throw new Error("ERP_TOKEN not configured");
  if (!/^https?:\/\//i.test(ERP_ENDPOINT)) ERP_ENDPOINT = `https://${ERP_ENDPOINT}`;
  ERP_ENDPOINT = ERP_ENDPOINT.replace(/\/+$/, "");

  for (const delay of [0, 800, 1_600, 3_000]) {
    if (delay > 0) await sleep(delay);

    let pagina = 1;
    let totalPaginas = 1;
    do {
      const params = new URLSearchParams({
        token: ERP_TOKEN,
        incluirAns: "true",
        cpfDependente: normalizedCpf,
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
        if (Number(associado?.codigoDaEmpresa || 0) !== empresaCodigo) continue;
        const dependentes = Array.isArray(associado?.dependentes)
          ? associado.dependentes
          : [];
        for (const dep of dependentes) {
          if (
            normalizeDigits(dep?.numeroCpfDependente ?? dep?.cpfDependente ?? dep?.cpf) !==
            normalizedCpf
          ) {
            continue;
          }
          const id = Number(dep?.codigoDependente ?? dep?.codigo ?? dep?.idDependente ?? 0);
          if (Number.isInteger(id) && id > 0) return id;
        }
      }

      totalPaginas = Math.max(1, Number(payload?.totalPaginas || 1));
      pagina += 1;
    } while (pagina <= totalPaginas && pagina <= 20);
  }

  return null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  const supabase = createServiceClient();
  const auth = await requireInternalUser(req, supabase);
  if (!auth) return jsonResponse({ error: "Autenticacao obrigatoria" }, 401);

  try {
    const body = await req.json();
    if (!body?.idFuncionario) {
      return jsonResponse({ error: "idFuncionario e obrigatorio" }, 400);
    }

    let idDependente = Number(body.idDependente || 0);
    let targetCpf = normalizeDigits(body.targetCpf);
    let empresaCodigo = Number(body.empresaCodigo || 0);

    if (body.cadastroId) {
      const { data: cadastro, error: cadastroError } = await supabase
        .from("cadastros")
        .select("cpf,empresa_codigo,empresa_id")
        .eq("id", String(body.cadastroId))
        .maybeSingle();

      if (cadastroError) {
        return jsonResponse({ error: cadastroError.message }, 400);
      }

      targetCpf = targetCpf || normalizeDigits(cadastro?.cpf);
      empresaCodigo = empresaCodigo ||
        Number(cadastro?.empresa_codigo || cadastro?.empresa_id || 0);
    }

    if (targetCpf && empresaCodigo <= 0) {
      return jsonResponse({
        error: "Empresa do cadastro nao identificada para resolver o CPF principal",
        code: "PRIMARY_DEPENDENT_NOT_FOUND",
      }, 422);
    }

    if (targetCpf && empresaCodigo > 0) {
      const resolved = await resolveCanonicalDependentId(
        supabase,
        targetCpf,
        empresaCodigo,
      );
      if (!resolved) {
        return jsonResponse({
          error: `CPF principal ${targetCpf} nao localizado no ERP para a empresa do cadastro`,
          code: "PRIMARY_DEPENDENT_NOT_FOUND",
        }, 422);
      }
      idDependente = resolved;
    }

    if (!Number.isInteger(idDependente) || idDependente <= 0) {
      return jsonResponse({
        error: "Nao foi possivel resolver o CPF principal para o destino do anexo",
        code: "PRIMARY_DEPENDENT_NOT_FOUND",
      }, 422);
    }

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
      body: JSON.stringify({ idFuncionario: body.idFuncionario, idDependente, arquivo, arquivoNome }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return jsonResponse({ error: String(result?.message || result?.mensagem || "Erro ao enviar documento ao ERP") }, 502);
    return jsonResponse({ success: true, data: result });
  } catch (error) {
    console.error("[erp-upload-documento]", error);
    return jsonResponse({ error: "Erro ao enviar documento ao ERP" }, 500);
  }
});
