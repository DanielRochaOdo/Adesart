import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  normalizeDigits,
  resolveAttempt,
} from "../_shared/public-flow.ts";

const UF_MAP: Record<string, string> = {
  ACRE: "AC", ALAGOAS: "AL", AMAPA: "AP", AMAZONAS: "AM", BAHIA: "BA", CEARA: "CE",
  "DISTRITO FEDERAL": "DF", "ESPIRITO SANTO": "ES", GOIAS: "GO", MARANHAO: "MA",
  "MATO GROSSO": "MT", "MATO GROSSO DO SUL": "MS", "MINAS GERAIS": "MG", PARA: "PA",
  PARAIBA: "PB", PARANA: "PR", PERNAMBUCO: "PE", PIAUI: "PI", "RIO DE JANEIRO": "RJ",
  "RIO GRANDE DO NORTE": "RN", "RIO GRANDE DO SUL": "RS", RONDONIA: "RO", RORAIMA: "RR",
  "SANTA CATARINA": "SC", "SAO PAULO": "SP", SERGIPE: "SE", TOCANTINS: "TO",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  try {
    const { attemptToken, cep } = await req.json() as { attemptToken?: string; cep?: string };
    if (!attemptToken) return jsonResponse({ error: "Sessao de adesao obrigatoria" }, 401);

    const supabase = createServiceClient();
    const attempt = await resolveAttempt(supabase, attemptToken);
    if (!attempt || attempt.status !== "authenticated") return jsonResponse({ error: "Sessao expirada" }, 401);

    const normalizedCep = normalizeDigits(cep);
    if (normalizedCep.length !== 8) return jsonResponse({ error: "CEP invalido" }, 400);

    const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
    const ERP_BASE_URL = Deno.env.get("ERP_BASE_URL") || "https://odontoart.s4e.com.br";
    if (!ERP_TOKEN) throw new Error("ERP_TOKEN not configured");

    const url = `${ERP_BASE_URL}/api/redeatendimento/Endereco?token=${encodeURIComponent(ERP_TOKEN)}&cep=${normalizedCep}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
    });

    if (!response.ok) return jsonResponse({ error: "CEP nao encontrado no ERP" }, 404);
    const result = await response.json();
    if (!result?.dados) return jsonResponse({ error: "CEP nao encontrado no ERP" }, 404);

    const ufNormalized = String(result.dados.Uf || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const ufSigla = UF_MAP[ufNormalized] || String(result.dados.Uf || "").slice(0, 2).toUpperCase();

    return jsonResponse({
      ok: true,
      dados: {
        IdTipoLogradouro: result.dados.IdTipoLogradouro,
        TipoLogradouro: result.dados.TipoLogradouro,
        Logradouro: result.dados.Logradouro,
        IdBairro: result.dados.IdBairro,
        Bairro: result.dados.Bairro,
        IdMunicipio: result.dados.IdMunicipio,
        Municipio: result.dados.Municipio,
        IdUf: result.dados.IdUf,
        Uf: result.dados.Uf,
        UfSigla: ufSigla,
      },
    });
  } catch (error) {
    console.error("[cadastro-public-cep]", error);
    return jsonResponse({ error: "Nao foi possivel consultar o CEP" }, 500);
  }
});
