import {
  isActiveErpMember,
  isActiveTitularForInclusion,
  resolveLinkCpfFlow,
  isHiddenCadastroPlan,
  evaluateNewAdhesionEligibility,
  type CadastroRules,
} from "./cadastro-rules.ts";

const rules: CadastroRules = {
  situacoes_que_barram: [1, 4, 6],
  planos_validos: [4, 11, 3, 26],
  planos_ocultos: ["106", "139"],
  codigos_empresa_invalidos: ["2", "4", "5", "6", "18"],
};
const CPF = "11122233344";
const assert = (condition: boolean, description: string) => {
  if (!condition) throw new Error(description);
};
const makeAssociation = (plan: number, situation: number, company = 239, type = 1) => ({
  cpf: CPF,
  codigo: company * 100 + plan,
  codigoDaEmpresa: company,
  dependentes: [
    { tipo: type, numeroCpfDependente: CPF, codigoPlano: plan,
      codigoSituacao: situation, nomeSituacao: situation === 1 ? "ATIVO" : "INATIVO" },
  ],
});

Deno.test("Link: titular ativo com qualquer plano vai para inclusão de dependentes", () => {
  for (const plano of [3, 6, 26, 106, 139]) {
    const member = makeAssociation(plano, 1);
    const decision = resolveLinkCpfFlow([member], CPF, rules, 239);
    assert(decision.kind === "existing_member", `titular ativo plano ${plano}`);
    assert(isActiveTitularForInclusion(member, CPF), `titular ativo plano ${plano} foi negado`);
  }
});

Deno.test("Link: nunca transformar dependente ativo em titular", () => {
  const dependent = makeAssociation(6, 1, 239, 2);
  const decision = resolveLinkCpfFlow([dependent], CPF, rules, 239);
  assert(decision.kind !== "existing_member", "dependente ativo não é titular");
  assert(!isActiveTitularForInclusion(dependent, CPF), "dependente não pode incluir como titular");
});

Deno.test("Link: vínculos múltiplos priorizam titular ativo da empresa do Link", () => {
  const allowed = makeAssociation(6, 1, 239);
  const unrelated = makeAssociation(139, 4, 471);
  const decision = resolveLinkCpfFlow([unrelated, allowed], CPF, rules, 239);
  assert(decision.kind === "existing_member", "bloqueio de recadastro não impede inclusão válida");
  assert(decision.matched?.associado.codigoDaEmpresa === 239, "empresa vinculada ao Link deve ser priorizada");

  const otherActive = makeAssociation(26, 1, 556);
  const ranked = resolveLinkCpfFlow([otherActive, allowed], CPF, rules, 239);
  assert(ranked.matched?.associado.codigoDaEmpresa === 239, "preferência de vínculo ativo");
});

Deno.test("Link: sem titular ativo, bloquear recadastro quando situação e plano impedirem", () => {
  const inactive = makeAssociation(6, 4, 239);
  const decision = resolveLinkCpfFlow([inactive], CPF, rules, 239);
  assert(decision.kind === "blocked", "vínculo sem titular ativo impedido para recadastro");
  assert(!isActiveTitularForInclusion(inactive, CPF), "não deve incluir dependente de titular inativo");
  assert(resolveLinkCpfFlow([], CPF, rules).kind === "new_member", "novo CPF prossegue como nova adesão");
});

Deno.test("Nova Adesão: titular ou dependente ATIVO bloqueia em qualquer plano", () => {
  for (const plano of [3, 4, 6, 11, 26, 139]) {
    for (const tipo of [1, 2]) {
      const member = makeAssociation(plano, 1, 239, tipo);
      const eligibility = evaluateNewAdhesionEligibility([member], CPF, rules);
      assert(eligibility.blocked && eligibility.reason === "ACTIVE_IN_ERP",
        `CPF ativo tipo ${tipo} plano ${plano} deve bloquear nova adesão`);
    }
  }
});

Deno.test("Nova Adesão: ex-dependente inativo segue se não houver bloqueio de recadastro", () => {
  const inactiveAllowed = makeAssociation(3, 4, 239, 2);
  const result = evaluateNewAdhesionEligibility([inactiveAllowed], CPF, rules);
  assert(!result.blocked, "ex-dependente inativo, plano permitido, pode iniciar nova adesão");

  const inactiveBlocked = makeAssociation(139, 4, 239, 2);
  assert(evaluateNewAdhesionEligibility([inactiveBlocked], CPF, rules).blocked,
    "ex-dependente inativo com situação/plano impeditivo não pode recadastrar");

  const activeOtherCompany = makeAssociation(26, 1, 1816, 2);
  assert(evaluateNewAdhesionEligibility([inactiveAllowed, activeOtherCompany], CPF, rules).blocked,
    "qualquer outro vínculo ativo bloqueia nova adesão");
});

Deno.test("Link: titular ativo só inclui dependentes na própria empresa", () => {
  const holder239 = makeAssociation(139, 1, 239);
  const mismatch = resolveLinkCpfFlow([holder239], CPF, rules, 1816);
  assert(mismatch.kind === "company_mismatch", "titular 239 não pode incluir pelo link 1816");
  const match = resolveLinkCpfFlow([holder239], CPF, rules, 239);
  assert(match.kind === "existing_member", "titular 239 pode incluir pelo link 239");

  const holder1816 = makeAssociation(3, 1, 1816);
  const combined = resolveLinkCpfFlow([holder239, holder1816], CPF, rules, 1816);
  assert(combined.kind === "existing_member" &&
    combined.matched?.associado?.codigoDaEmpresa === 1816,
    "múltiplos vínculos: usa somente o vínculo da empresa do Link");
});

Deno.test("Planos ocultos afetam novos dependentes e nunca o plano histórico do titular", () => {
  assert(isHiddenCadastroPlan(139, rules), "plano oculto para nova seleção");
  assert(!isHiddenCadastroPlan(6, rules), "plano não oculto");
  const nextRules = { ...rules, planos_ocultos: ["777"] };
  assert(!isHiddenCadastroPlan(139, nextRules), "remoção dinâmica");
  assert(isHiddenCadastroPlan(777, nextRules), "adição dinâmica");
  assert(isActiveErpMember({ codigoSituacao: 1, codigoPlano: 139 }), "plano atual não altera a situação ativa");
});
