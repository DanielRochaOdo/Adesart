import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, createServiceClient, jsonResponse, normalizeDigits, requireInternalUser } from "../_shared/public-flow.ts";

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
  const supabase = createServiceClient();
  const auth = await requireInternalUser(req, supabase);
  if (!auth) return jsonResponse({ error: "Autenticacao obrigatoria" }, 401);

  try {
    const { cep } = await req.json() as { cep?: string };
    const normalizedCep = normalizeDigits(cep);
    if (normalizedCep.length !== 8) return jsonResponse({ error: "CEP invalido" }, 400);

    const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
    const ERP_BASE_URL = Deno.env.get("ERP_BASE_URL") || "https://odontoart.s4e.com.br";
    if (!ERP_TOKEN) throw new Error("ERP_TOKEN not configured");
    const response = await fetch(`${ERP_BASE_URL}/api/redeatendimento/Endereco?token=${encodeURIComponent(ERP_TOKEN)}&cep=${normalizedCep}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
    });
    if (!response.ok) return jsonResponse({ error: "CEP nao encontrado no ERP" }, 404);
    const result = await response.json();
    if (!result?.dados) return jsonResponse({ error: "CEP nao encontrado no ERP" }, 404);
    const ufNormalized = String(result.dados.Uf || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return jsonResponse({ ok: true, dados: { ...result.dados, UfSigla: UF_MAP[ufNormalized] || String(result.dados.Uf || "").slice(0, 2).toUpperCase() } });
  } catch (error) {
    console.error("[erp-endereco-cep]", error);
    return jsonResponse({ error: "Erro ao consultar CEP" }, 500);
  }
});
