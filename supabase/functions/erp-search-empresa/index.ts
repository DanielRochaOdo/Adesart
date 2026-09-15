import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  normalizeDigits,
  requireInternalUser,
} from "../_shared/public-flow.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  const supabase = createServiceClient();
  const auth = await requireInternalUser(req, supabase);
  if (!auth) return jsonResponse({ error: "Autenticacao obrigatoria" }, 401);

  try {
    const body = await req.json() as { cnpj?: string; nome?: string; empresaId?: string };
    if (!body.cnpj && !body.nome && !body.empresaId) {
      return jsonResponse({ error: "Informe CNPJ, nome ou ID da empresa" }, 400);
    }

    const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
    let ERP_BASE_URL = Deno.env.get("ERP_BASE_URL") || "https://odontoart.s4e.com.br";
    if (!ERP_TOKEN) throw new Error("ERP_TOKEN not configured");
    if (!/^https?:\/\//i.test(ERP_BASE_URL)) ERP_BASE_URL = `https://${ERP_BASE_URL}`;

    const params = new URLSearchParams({ token: ERP_TOKEN });
    if (body.cnpj) {
      const cnpj = normalizeDigits(body.cnpj);
      if (cnpj.length !== 14) return jsonResponse({ error: "CNPJ invalido" }, 400);
      params.set("cnpj", cnpj);
    } else if (body.nome) params.set("nome", body.nome.trim());
    else params.set("empresaId", String(body.empresaId));

    const startedAt = Date.now();
    const response = await fetch(`${ERP_BASE_URL}/api/empresa/BuscaEmpresas?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return jsonResponse({ error: "Erro ao consultar empresas no ERP" }, 502);

    const records = Array.isArray(result?.dados) ? result.dados : [];
    const empresas = records.map((empresa: any) => ({
      id: Number(empresa?.Id),
      codigo: Number(empresa?.Id),
      razaoSocial: String(empresa?.RazaoSocial || ""),
      nomeFantasia: String(empresa?.NomeFantazia || empresa?.NomeFantasia || ""),
      cnpj: String(empresa?.Cnpj || ""),
      codigoSituacao: empresa?.CodigoSituacao ?? null,
      enderecoEmpresa: {
        cep: empresa?.Cep || "", uf: empresa?.Uf || "", municipio: empresa?.Municipio || "",
        bairro: empresa?.Bairro || "", idTipoLogradouro: empresa?.IdTipoLogradouro || null,
        logradouro: empresa?.Logradouro || "", numero: empresa?.Numero || "", complemento: empresa?.Complemento || "",
        centroCusto: empresa?.CentroCusto || "",
      },
      exigeMatricula: Number(empresa?.ExigeMatricula || 0),
      observacoes: String(empresa?.ObservacaoComercial || ""),
      observacao: String(empresa?.ObservacaoComercial || ""),
      precoPlano: Array.isArray(empresa?.PrecoPlano) ? empresa.PrecoPlano : [],
      raw: empresa,
    }));

    await supabase.from("api_logs").insert({
      user_id: auth.user.id,
      user_email: auth.user.email,
      endpoint: "erp-search-empresa",
      method: "POST",
      request_body: { search_type: body.cnpj ? "cnpj" : body.nome ? "nome" : "id" },
      response_body: { count: empresas.length },
      status_code: 200,
      success: true,
      duration_ms: Date.now() - startedAt,
    }).catch(() => undefined);

    if (empresas.length === 0) return jsonResponse({ error: "Nenhuma empresa encontrada" }, 404);
    return jsonResponse({ ok: true, empresas });
  } catch (error) {
    console.error("[erp-search-empresa]", error);
    return jsonResponse({ error: "Erro ao buscar empresa" }, 500);
  }
});
