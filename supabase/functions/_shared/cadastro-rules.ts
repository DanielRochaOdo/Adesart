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


/** Situação atual do vínculo no ERP. Não confundir com plano válido para recadastro. */
export function isActiveErpMember(member: any): boolean {
  const status = String(member?.nomeSituacao ?? "")
    .trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return Number(member?.codigoSituacao) === 1 || status === "ATIVO";
}

const digits = (value: unknown): string => String(value ?? "").replace(/\D/g, "");

/** Um dependente ativo não confere ao CPF o direito de incluir novos dependentes como titular. */
export function isActiveTitularForInclusion(associado: any, cpfValue: string): boolean {
  const cpf = digits(cpfValue);
  if (!cpf || digits(associado?.cpf) !== cpf) return false;
  return selectErpMemberCandidates(associado, cpf).some((member) => {
    const type = member?.tipo ?? member?.Tipo;
    return (type == null || String(type).trim() === "" || Number(type) === 1) &&
      isActiveErpMember(member);
  });
}

export type LinkCpfFlow =
  | "existing_member"
  | "blocked"
  | "active_dependent"
  | "company_mismatch"
  | "new_member";
export type LinkCpfMatch = { associado: any; dep: any; isResponsible: boolean };

/** Nova adesão: qualquer vínculo ATIVO do CPF impede contratar novamente,
 * independentemente do plano. Se nenhum vínculo estiver ativo, aplica-se
 * a configuração dinâmica de bloqueio de recadastro. */
export function evaluateNewAdhesionEligibility(
  records: any[],
  cpfValue: string,
  rules: CadastroRules,
): { blocked: boolean; reason: "ACTIVE_IN_ERP" | "BLOCKED_BY_CADASTRO_CONFIG" | null; matched: LinkCpfMatch | null } {
  const cpf = digits(cpfValue);
  let configuredBlock: LinkCpfMatch | null = null;
  for (const associado of Array.isArray(records) ? records : []) {
    for (const dep of selectErpMemberCandidates(associado, cpf)) {
      const isResponsible = digits(associado?.cpf) === cpf &&
        Number(dep?.tipo ?? dep?.Tipo ?? 1) === 1;
      const candidate = { associado, dep, isResponsible };
      if (isActiveErpMember(dep)) {
        return { blocked: true, reason: "ACTIVE_IN_ERP", matched: candidate };
      }
      if (!configuredBlock && isBlockedByCadastroRules(dep?.codigoSituacao, dep?.codigoPlano, rules)) {
        configuredBlock = candidate;
      }
    }
  }
  return configuredBlock
    ? { blocked: true, reason: "BLOCKED_BY_CADASTRO_CONFIG", matched: configuredBlock }
    : { blocked: false, reason: null, matched: null };
}

/**
 * A inclusão de dependentes é determinada PRIMEIRO pela existência de titular
 * ativo, independente do plano do vínculo já existente.
 * Somente na ausência de titular ativo aplicam-se os impedimentos de recadastro.
 */
export function resolveLinkCpfFlow(
  records: any[],
  cpfValue: string,
  rules: CadastroRules,
  preferredCompanyCode?: number,
): { kind: LinkCpfFlow; matched: LinkCpfMatch | null } {
  const cpf = digits(cpfValue);
  const activeHolders: LinkCpfMatch[] = [];
  const blocked: LinkCpfMatch[] = [];
  const activeDependents: LinkCpfMatch[] = [];

  for (const associado of Array.isArray(records) ? records : []) {
    for (const dep of selectErpMemberCandidates(associado, cpf)) {
      const active = isActiveErpMember(dep);
      const blockedForRecadastro = isBlockedByCadastroRules(dep?.codigoSituacao, dep?.codigoPlano, rules);
      if (!active && !blockedForRecadastro) continue;

      const type = dep?.tipo ?? dep?.Tipo;
      const isResponsible = digits(associado?.cpf) === cpf &&
        (type == null || String(type).trim() === "" || Number(type) === 1);
      const candidate = { associado, dep, isResponsible };
      if (active && isResponsible) {
        activeHolders.push(candidate);
      } else if (blockedForRecadastro) {
        blocked.push(candidate);
      } else {
        activeDependents.push(candidate);
      }
    }
  }

  // A inclusão pelo Link pertence exclusivamente à empresa do próprio Link.
  // Titular ativo de outra empresa não pode incluir dependentes neste contrato.
  const selectedHolder = activeHolders.find((candidate) =>
    Number(candidate.associado?.codigoDaEmpresa) === Number(preferredCompanyCode));
  if (selectedHolder) return { kind: "existing_member", matched: selectedHolder };
  if (activeHolders.length) return { kind: "company_mismatch", matched: activeHolders[0] };
  if (blocked.length) return { kind: "blocked", matched: blocked[0] };
  if (activeDependents.length) return { kind: "active_dependent", matched: activeDependents[0] };
  return { kind: "new_member", matched: null };
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
