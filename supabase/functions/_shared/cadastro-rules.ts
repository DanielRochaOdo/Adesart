/**
 * Regras de cadastro (id=1), consultadas do Supabase a cada operação.
 * Não usar valores padrão codificados: a lista vazia é uma configuração válida.
 */
export interface CadastroRules {
  situacoes_que_barram: number[];
  planos_validos: number[];
  planos_ocultos: string[];
  codigos_empresa_invalidos: string[];
}

const code = (value: unknown) => {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? String(n) : "";
};

export const isBlockedByCadastroRules = (situacao: unknown, plano: unknown, rules: CadastroRules): boolean =>
  code(situacao) !== "" &&
  rules.situacoes_que_barram.some((s) => code(s) === code(situacao)) &&
  !rules.planos_validos.some((p) => code(p) === code(plano));

export const isHiddenCadastroPlan = (plano: unknown, rules: CadastroRules): boolean =>
  code(plano) !== "" && rules.planos_ocultos.some((p) => code(p) === code(plano));

export const isInvalidCadastroCompany = (situacao: unknown, rules: CadastroRules): boolean =>
  code(situacao) !== "" && rules.codigos_empresa_invalidos.some((s) => code(s) === code(situacao));

export async function loadCadastroRules(supabase: any): Promise<CadastroRules> {
  const { data, error } = await supabase.from("cadastro_config")
    .select("situacoes_que_barram,planos_validos,planos_ocultos,codigos_empresa_invalidos")
    .eq("id", 1).maybeSingle();
  if (error || !data || !Array.isArray(data.situacoes_que_barram) ||
    !Array.isArray(data.planos_validos) || !Array.isArray(data.planos_ocultos) ||
    !Array.isArray(data.codigos_empresa_invalidos)) {
    throw new Error("CADASTRO_CONFIG_UNAVAILABLE");
  }
  return {
    situacoes_que_barram: data.situacoes_que_barram.map(Number),
    planos_validos: data.planos_validos.map(Number),
    planos_ocultos: data.planos_ocultos.map(String),
    codigos_empresa_invalidos: data.codigos_empresa_invalidos.map(String),
  };
}

export function selectErpMemberCandidates(associado: any, cpfValue?: string): any[] {
  const cpf = String(cpfValue || "").replace(/\D/g, "");
  const dependentes: any[] = Array.isArray(associado?.dependentes) ? associado.dependentes : [];
  const titular = dependentes.find((dep) => Number(dep?.tipo) === 1);
  if (!cpf) return titular ? [titular] : dependentes.slice(0, 1);
  const exact = dependentes.filter((dep) =>
    String(dep?.numeroCpfDependente ?? dep?.cpfDependente ?? dep?.cpf ?? "").replace(/\D/g, "") === cpf);
  if (exact.length) return exact;
  if (String(associado?.cpf ?? "").replace(/\D/g, "") !== cpf) return [];
  return titular ? [titular] : dependentes.slice(0, 1);
}

export async function validateCurrentCompany(
  companyCode: number, rules: CadastroRules,
): Promise<{ blocked: boolean; situation: unknown }> {
  if (!Number.isInteger(companyCode) || companyCode <= 0) throw new Error("ERP_COMPANY_INVALID");
  const token = Deno.env.get("ERP_TOKEN");
  if (!token) throw new Error("ERP_TOKEN_NOT_CONFIGURED");
  let base = Deno.env.get("ERP_BASE_URL") || Deno.env.get("ERP_ENDPOINT") || "https://odontoart.s4e.com.br";
  if (!/^https?:\/\//i.test(base)) base = "https://" + base;
  const url = base.replace(/\/+$/, "") + "/api/empresa/BuscaEmpresas?token=" +
    encodeURIComponent(token) + "&empresaId=" + encodeURIComponent(String(companyCode));
  const response = await fetch(url, {
    headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("ERP_COMPANY_UNAVAILABLE");
  const payload = await response.json();
  const company = Array.isArray(payload?.dados) ? payload.dados[0] : null;
  if (!company) throw new Error("ERP_COMPANY_NOT_FOUND");
  const situation = company.CodigoSituacao ?? company.codigoSituacao;
  if (situation === null || situation === undefined) throw new Error("ERP_COMPANY_STATUS_UNAVAILABLE");
  return { blocked: isInvalidCadastroCompany(situation, rules), situation };
}
