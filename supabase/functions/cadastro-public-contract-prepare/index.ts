import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  resolvePublishedOptionalCoverage,
  createServiceClient,
  hashSensitiveValue,
  jsonResponse,
  normalizeDate,
  normalizeDigits,
  randomToken,
  resolveAttempt,
  sanitizePlan,
  sha256,
  stableStringify,
} from "../_shared/public-flow.ts";
import { applyContractDuration, contractDurationText, vigenciaExtenso } from "../_shared/contract-duration.ts";

type Contact = { tipo: "celular" | "fixo" | "email" | "whatsapp"; valor: string; principal?: boolean };
type Address = {
  cep: string; tipoLogradouro?: string; logradouro: string; numero: string; complemento?: string;
  bairro: string; cidade: string; uf: string; idTipoLogradouro?: number; idBairro?: number;
  idMunicipio?: number; idUf?: number; ufSigla?: string;
};
type Dep = { tipo: number; nome: string; dataNascimento: string; cpf: string; sexo: number; nomeMae: string; plano: number };
type CadastroInput = {
  cpf?: string; nome: string; dataNascimento: string; sexoCodigo: number; nomeMae: string; numeroMatricula?: string;
  contatos: Contact[]; endereco: Address; titularPlano: number; dependentes: Dep[];
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const moneyValue = (value: number) => Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatCpf = (cpf: string) => normalizeDigits(cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
const formatDateOnly = (value: Date) => new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Fortaleza",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
}).format(value);
const joinBeneficiaries = (names: string[]) => {
  const cleanNames = names.map((name) => String(name || "").trim()).filter(Boolean);
  if (cleanNames.length <= 1) return cleanNames[0] || "";
  if (cleanNames.length === 2) return `${cleanNames[0]} e ${cleanNames[1]}`;
  return `${cleanNames.slice(0, -1).join(", ")} e ${cleanNames[cleanNames.length - 1]}`;
};
const isValidCpf = (value?: string | null) => {
  const cpf = normalizeDigits(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (baseLength: number) => {
    let sum = 0;
    for (let i = 0; i < baseLength; i += 1) sum += Number(cpf[i]) * (baseLength + 1 - i);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
};

const validateCadastro = (cadastro: CadastroInput, cpf: string, link: any) => {
  if (cpf.length !== 11) return "Sessao de identificacao invalida";
  if (!cadastro?.nome?.trim()) return "Nome obrigatorio";
  if (!normalizeDate(cadastro?.dataNascimento)) return "Data de nascimento obrigatoria";
  if (![0, 1].includes(Number(cadastro?.sexoCodigo))) return "Sexo obrigatorio";
  if (!cadastro?.nomeMae?.trim()) return "Nome da mae obrigatorio";
  if (Number(link?.empresa_exige_matricula) === 1 && !cadastro?.numeroMatricula?.trim()) return "Matricula obrigatoria";
  if (!Array.isArray(cadastro?.contatos)) return "Contatos obrigatorios";
  if (!cadastro.contatos.some((item) => ["celular", "whatsapp", "fixo"].includes(item.tipo) && normalizeDigits(item.valor).length >= 10)) return "Informe ao menos um telefone valido";
  if (!cadastro?.endereco?.cep || normalizeDigits(cadastro.endereco.cep).length !== 8) return "CEP obrigatorio";
  if (!cadastro.endereco.logradouro?.trim() || !cadastro.endereco.numero?.trim() || !cadastro.endereco.bairro?.trim() || !cadastro.endereco.cidade?.trim() || !cadastro.endereco.uf?.trim()) return "Endereco incompleto";
  if (!Number(cadastro?.titularPlano)) return "Plano do titular obrigatorio";
  if (!Array.isArray(cadastro?.dependentes)) return "Dependentes invalidos";
  const seenCpfs = new Set<string>([cpf]);
  for (const dep of cadastro.dependentes) {
    if (!dep.nome?.trim() || !normalizeDate(dep.dataNascimento) || !dep.nomeMae?.trim() || !Number(dep.tipo) || !Number(dep.plano) || ![0, 1].includes(Number(dep.sexo))) return "Preencha todos os dados obrigatorios dos dependentes";
    if (Number(dep.tipo) === 1) return "O titular nao deve ser incluido novamente na lista de dependentes";
    const depCpf = normalizeDigits(dep.cpf);
    if (!isValidCpf(depCpf)) return "CPF valido e obrigatorio para todos os dependentes";
    if (seenCpfs.has(depCpf)) return "Existem CPFs duplicados no cadastro";
    seenCpfs.add(depCpf);
  }
  return null;
};

const fetchCurrentPlans = async (companyCode: number) => {
  const ERP_TOKEN = Deno.env.get("ERP_TOKEN");
  const ERP_BASE_URL = Deno.env.get("ERP_BASE_URL") || "https://odontoart.s4e.com.br";
  if (!ERP_TOKEN) throw new Error("ERP_TOKEN not configured");
  const response = await fetch(`${ERP_BASE_URL}/api/empresa/BuscaEmpresas?token=${encodeURIComponent(ERP_TOKEN)}&empresaId=${encodeURIComponent(String(companyCode))}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("ERP_CATALOG_UNAVAILABLE");
  const result = await response.json();
  const empresa = Array.isArray(result?.dados) ? result.dados[0] : null;
  if (!empresa) throw new Error("ERP_COMPANY_NOT_FOUND");
  const plans = Array.isArray(empresa?.PrecoPlano) ? empresa.PrecoPlano : Array.isArray(empresa?.precoPlano) ? empresa.precoPlano : [];
  const vigenciaMeses = Number(empresa.Vigencia);
  if (!Number.isInteger(vigenciaMeses) || vigenciaMeses <= 0) throw new Error("ERP_INVALID_VIGENCIA");
  return { plans: plans.map(sanitizePlan).filter((item: any) => item.Plano > 0), vigenciaMeses };
};

const renderTemplate = (body: string, values: Record<string, string>) => {
  let rendered = body;
  for (const [key, value] of Object.entries(values)) rendered = rendered.split(`{{${key}}}`).join(value);
  return rendered;
};



const prepareExistingMemberContract = async (
  supabase: any,
  attempt: any,
  link: any,
  cadastro: CadastroInput,
  confirmedEmail: string,
) => {
  const cpf = normalizeDigits(attempt.profile_snapshot?.cpf);
  const member = attempt.erp_member_snapshot;
  const companyCode = Number(member?.codigoEmpresa || 0);
  const memberCode = Number(member?.codigoAssociado || 0);

  if (!member || !isValidCpf(cpf) || !Number.isInteger(companyCode) || companyCode <= 0 || !Number.isInteger(memberCode) || memberCode <= 0) {
    return jsonResponse({ error: "Vinculo do associado invalido. Inicie novamente.", code: "INVALID_MEMBER_SNAPSHOT" }, 409);
  }
  if (cadastro?.cpf && await hashSensitiveValue(normalizeDigits(cadastro.cpf)) !== attempt.cpf_hash) {
    return jsonResponse({ error: "CPF divergente da sessao autenticada" }, 400);
  }
  if (!Array.isArray(cadastro?.contatos)) {
    return jsonResponse({ error: "Confirme um telefone valido antes de continuar." }, 400);
  }

  const phone = cadastro.contatos
    .filter((item) => ["celular", "whatsapp", "fixo"].includes(item.tipo))
    .map((item) => normalizeDigits(item.valor))
    .find((value) => value.length >= 10) || "";
  if (phone.length < 10) {
    return jsonResponse({ error: "Confirme um telefone valido antes de continuar." }, 400);
  }

  if (!Array.isArray(cadastro?.dependentes) || cadastro.dependentes.length === 0) {
    return jsonResponse({ error: "Adicione ao menos um dependente antes de revisar os termos." }, 400);
  }

  const normalizedDependents = cadastro.dependentes.map((dep) => ({
    tipo: Number(dep?.tipo || 0),
    nome: String(dep?.nome || "").trim(),
    dataNascimento: normalizeDate(dep?.dataNascimento),
    cpf: normalizeDigits(dep?.cpf),
    sexo: Number(dep?.sexo),
    nomeMae: String(dep?.nomeMae || "").trim(),
    plano: Number(dep?.plano || 0),
  }));

  const seenCpfs = new Set<string>([cpf]);
  for (let index = 0; index < normalizedDependents.length; index += 1) {
    const dep = normalizedDependents[index];
    const label = `Dependente ${index + 1}`;
    if (!isValidCpf(dep.cpf)) return jsonResponse({ error: `${label}: informe um CPF valido.` }, 400);
    if (seenCpfs.has(dep.cpf)) return jsonResponse({ error: `${label}: este CPF ja foi informado na solicitacao.` }, 400);
    seenCpfs.add(dep.cpf);
    if (dep.tipo <= 1) return jsonResponse({ error: `${label}: selecione o grau de parentesco.` }, 400);
    if (!dep.nome) return jsonResponse({ error: `${label}: informe o nome completo.` }, 400);
    if (!dep.dataNascimento) return jsonResponse({ error: `${label}: informe uma data de nascimento valida.` }, 400);
    if (![0, 1].includes(dep.sexo)) return jsonResponse({ error: `${label}: selecione o sexo.` }, 400);
    if (!dep.nomeMae) return jsonResponse({ error: `${label}: informe o nome da mae.` }, 400);
    if (dep.plano <= 0) return jsonResponse({ error: `${label}: selecione o plano.` }, 400);
  }

  const { plans: currentPlans, vigenciaMeses } = await fetchCurrentPlans(companyCode);
  const currentMap = new Map<number, any>(
    currentPlans.map((item: any): [number, any] => [Number(item.Plano), item]),
  );
  const selectedCodes = normalizedDependents.map((dep) => dep.plano);
  if (selectedCodes.some((code) => !currentMap.has(code))) {
    return jsonResponse({
      error: "Um dos planos selecionados nao esta mais disponivel para a empresa do associado.",
      code: "PLAN_CHANGED",
    }, 409);
  }

  const uniquePlans = [...new Set(selectedCodes)];
  const { data: namedPlanRows, error: namedPlanError } = await supabase
    .from("cadastro_planos_map")
    .select("plano_id, nome_exibicao, ativo")
    .in("plano_id", uniquePlans);
  if (namedPlanError) throw namedPlanError;
  const displayNames = new Map<number, string>((namedPlanRows || [])
    .filter((row: any) => row.ativo !== false && String(row.nome_exibicao || "").trim())
    .map((row: any) => [Number(row.plano_id), String(row.nome_exibicao).trim()]));
  for (const [code, plan] of currentMap) {
    plan.nomeExibicao = displayNames.get(code) || plan.nomeExibicao;
  }

  const dependents = normalizedDependents.map((dep) => {
    const plan: any = currentMap.get(dep.plano);
    return {
      ...dep,
      sexoDescricao: dep.sexo === 1 ? "Masculino" : "Feminino",
      planoNome: plan.nomeExibicao,
      planoValor: Number(plan.ValorDependente || 0),
    };
  });

  const normalizedContacts: Contact[] = [
    { tipo: "whatsapp", valor: phone, principal: true },
    { tipo: "email", valor: confirmedEmail, principal: true },
  ];

  const holderName = String(member?.nomeAssociado || attempt.profile_snapshot?.nome || "").trim();
  const holderBirthDate = normalizeDate(attempt.profile_snapshot?.dataNascimento || member?.dataNascimento);
  const companyName = String(member?.empresaNome || link.empresa_nome || "").trim();

  const { available: coverageAvailable, files: coverageFiles } =
    await resolvePublishedOptionalCoverage(supabase, uniquePlans);

  const templateCodes = [...new Set([0, ...uniquePlans])];
  const { data: templateRows, error: templateError } = await supabase
    .from("contract_templates")
    .select("id, plan_code, title, body_text, version, effective_from, effective_until, is_active")
    .in("plan_code", templateCodes)
    .eq("is_active", true);
  if (templateError) throw templateError;

  const activeTemplates = (templateRows || []).filter((item: any) =>
    (!item.effective_from || new Date(item.effective_from).getTime() <= Date.now()) &&
    (!item.effective_until || new Date(item.effective_until).getTime() >= Date.now())
  );
  const templateMap = new Map(activeTemplates.map((item: any) => [Number(item.plan_code), item]));
  const missingPlans = uniquePlans.filter((code) => !templateMap.has(code));
  const defaultTemplate: any = templateMap.get(0);
  if (missingPlans.length > 0 && !defaultTemplate) {
    return jsonResponse({
      error: "O contrato deste plano ainda nao esta configurado.",
      code: "CONTRACT_NOT_CONFIGURED",
      missingPlans,
    }, 409);
  }

  const dependentsSummary = dependents
    .map((dep, index) => `${index + 1}. ${dep.nome} - ${dep.planoNome} - ${money(dep.planoValor)}`)
    .join("\n");
  const plansSummary = dependents
    .map((dep) => `Dependente: ${dep.nome} - ${dep.planoNome} - ${money(dep.planoValor)}`)
    .join("\n");
  const beneficiaries = joinBeneficiaries(dependents.map((dep) => dep.nome));
  const totalMonthlyValue = dependents.reduce((sum, dep) => sum + Number(dep.planoValor || 0), 0);

  const replacements = {
    NOME_RF: holderName,
    CPF_RF: formatCpf(cpf),
    DATA_NASCIMENTO_RF: holderBirthDate,
    EMPRESA: companyName,
    EMPRESA_CODIGO: String(companyCode),
    EMAIL: confirmedEmail,
    PLANOS: plansSummary,
    DEPENDENTES: dependentsSummary,
    DATA_ACEITE: formatDateOnly(new Date()),
    VALOR_DO_PLANO: moneyValue(totalMonthlyValue),
    BENEFICIARIOS: beneficiaries,
    PERIODO_CONTRATO: contractDurationText(vigenciaMeses),
    PARAMETRO_VIGENCIA: String(vigenciaMeses),
    VIGENCIA_MESES: String(vigenciaMeses),
    VIGENCIA_EXTENSO: vigenciaExtenso(vigenciaMeses),
  };

  const templatesToRender: any[] = defaultTemplate && missingPlans.length > 0
    ? [defaultTemplate]
    : uniquePlans.map((code) => templateMap.get(code)).filter(Boolean);
  const renderedContractText = templatesToRender
    .map((template) => renderTemplate(String(template.body_text || ""), replacements).trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  let contractText: string;
  try {
    contractText = applyContractDuration(renderedContractText, vigenciaMeses);
  } catch (durationError) {
    console.error("[cadastro-public-contract-prepare] vigencia ausente nos termos de inclusao", durationError);
    return jsonResponse({
      error: "Nao foi possivel apresentar a vigencia contratual. Fale com seu consultor.",
      code: "CONTRACT_DURATION_UNAVAILABLE",
    }, 409);
  }
  if (!contractText) {
    return jsonResponse({
      error: "O contrato deste plano ainda nao esta configurado.",
      code: "CONTRACT_NOT_CONFIGURED",
      missingPlans: uniquePlans,
    }, 409);
  }

  const snapshot = {
    version: 1,
    flowMode: "existing_member",
    preparedAt: new Date().toISOString(),
    link: {
      id: link.id,
      empresaCodigo: companyCode,
      empresaNome: companyName,
      empresaCnpj: null,
      empresaExigeMatricula: 0,
      vendedorId: link.vendedor_id || null,
      vendedorCodigo: String(link.vendedor_codigo || ""),
      vendedorNome: String(link.vendedor_nome || ""),
      createdBy: link.created_by,
      teamId: link.team_id || null,
      adesionistaId: link.adesionista_id || null,
      adesionistaCodigo: link.adesionista_id ? String(link.adesionista_codigo || "") : "",
      adesionistaNome: link.adesionista_id ? String(link.adesionista_nome || "") : "",
    },
    member: {
      codigoAssociado: memberCode,
      codigoDependente: Number(member?.codigoDependente || 0) || null,
      codigoPlano: Number(member?.codigoPlano || 0) || null,
    },
    cadastro: {
      cpf,
      nome: holderName,
      dataNascimento: holderBirthDate,
      sexoCodigo: Number(cadastro?.sexoCodigo ?? -1),
      nomeMae: String(cadastro?.nomeMae || ""),
      numeroMatricula: "",
      contatos: normalizedContacts,
      endereco: {},
      titularPlano: 0,
      titularPlanoNome: "",
      titularPlanoValor: 0,
      dependentes: dependents,
      valorMensalTotal: totalMonthlyValue,
      beneficiarios: dependents.map((dep) => dep.nome),
      duracaoContratoMeses: vigenciaMeses,
      coberturaPlanoCodigos: uniquePlans,
      coberturaDisponivel: coverageAvailable,
      coberturaPlanoArquivos: coverageFiles.map(({ code, family, fileName }) => ({
        planoCodigo: code,
        familia: family,
        arquivo: fileName,
      })),
    },
    confirmedEmail,
  };

  const contractHash = await sha256(contractText);
  const dataHash = await sha256(stableStringify(snapshot));
  const contractToken = randomToken();
  const templateIds = templatesToRender.map((template) => template.id);
  const templateVersions = Object.fromEntries(
    templatesToRender.map((template) => [String(template.plan_code), Number(template.version)]),
  );

  await supabase.from("public_contract_sessions")
    .update({ status: "superseded", updated_at: new Date().toISOString() })
    .eq("attempt_id", attempt.id)
    .eq("status", "prepared");

  const { data: session, error: sessionError } = await supabase
    .from("public_contract_sessions")
    .insert({
      attempt_id: attempt.id,
      contract_token_hash: await sha256(contractToken),
      snapshot,
      contract_text: contractText,
      contract_hash: contractHash,
      data_hash: dataHash,
      template_ids: templateIds,
      template_versions: templateVersions,
      confirmed_email: confirmedEmail,
    })
    .select("id")
    .single();
  if (sessionError || !session) throw sessionError || new Error("CONTRACT_SESSION_CREATE_FAILED");

  const coverageEntry = coverageFiles.find((entry) => uniquePlans.includes(Number(entry.code))) || coverageFiles[0] || null;
  const coverageUrl = coverageAvailable && coverageEntry?.fileName
    ? supabase.storage.from("plan-coverages").getPublicUrl(coverageEntry.fileName).data.publicUrl
    : null;

  return jsonResponse({
    ok: true,
    contractToken,
    contractHash,
    contractText,
    coverageAvailable,
    coverageUrl,
    summary: {
      empresa: companyName,
      titular: holderName,
      dependentes: dependents.map((dep) => ({ nome: dep.nome, plano: dep.planoNome, valor: dep.planoValor })),
      confirmedEmail,
      duracaoContratoMeses: vigenciaMeses,
      flowMode: "existing_member",
    },
  });
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  try {
    const body = await req.json() as { attemptToken?: string; confirmedEmail?: string; cadastro?: CadastroInput };
    const attemptToken = String(body.attemptToken || "").trim();
    const confirmedEmail = String(body.confirmedEmail || "").trim().toLowerCase();
    if (!attemptToken) return jsonResponse({ error: "Sessao de adesao obrigatoria" }, 401);
    if (!emailRegex.test(confirmedEmail)) return jsonResponse({ error: "E-mail invalido" }, 400);

    const supabase = createServiceClient();
    const attempt = await resolveAttempt(supabase, attemptToken);
    if (!attempt || attempt.status !== "authenticated" || !attempt.profile_snapshot) return jsonResponse({ error: "Sessao expirada. Inicie novamente.", code: "SESSION_EXPIRED" }, 401);
    const flowMode = String(attempt.flow_mode || "new_member");
    if (!["new_member", "existing_member"].includes(flowMode)) {
      return jsonResponse({ error: "Esta sessao nao permite preparar termos contratuais.", code: "INVALID_FLOW_MODE" }, 409);
    }

    const { data: link, error: linkError } = await supabase.from("cadastro_links").select("*").eq("id", attempt.link_id).maybeSingle();
    if (linkError || !link || !link.is_active) return jsonResponse({ error: "Link indisponivel" }, 410);

    if (flowMode === "existing_member") {
      return await prepareExistingMemberContract(
        supabase,
        attempt,
        link,
        body.cadastro as CadastroInput,
        confirmedEmail,
      );
    }

    const cpf = normalizeDigits(attempt.profile_snapshot?.cpf);
    if (body.cadastro?.cpf && await hashSensitiveValue(normalizeDigits(body.cadastro.cpf)) !== attempt.cpf_hash) {
      return jsonResponse({ error: "CPF divergente da sessao autenticada" }, 400);
    }
    const cadastro = body.cadastro as CadastroInput;
    const validationError = validateCadastro(cadastro, cpf, link);
    if (validationError) return jsonResponse({ error: validationError }, 400);
    if (normalizeDate(cadastro.dataNascimento) !== normalizeDate(attempt.profile_snapshot.dataNascimento)) return jsonResponse({ error: "A data de nascimento do responsavel nao pode ser alterada neste fluxo" }, 400);

    const linkPlans = (Array.isArray(link.planos_raw) ? link.planos_raw : []).map(sanitizePlan);
    const allowedCodes = new Set(linkPlans.map((item: any) => Number(item.Plano)));
    const selectedCodes = [Number(cadastro.titularPlano), ...cadastro.dependentes.map((item) => Number(item.plano))];

    if (selectedCodes.some((code) => !allowedCodes.has(code))) return jsonResponse({ error: "Plano nao permitido para este link", code: "PLAN_NOT_ALLOWED" }, 400);

    const { plans: currentPlans, vigenciaMeses } = await fetchCurrentPlans(Number(link.empresa_codigo));
    const currentMap = new Map<number, any>(currentPlans.map((item: any): [number, any] => [Number(item.Plano), item]));
    if (selectedCodes.some((code) => !currentMap.has(code))) return jsonResponse({ error: "Um dos planos selecionados nao esta mais disponivel para esta empresa", code: "PLAN_CHANGED" }, 409);

    // O ERP informa os codigos e valores; os nomes comerciais sao mantidos na tabela de planos.
    const { data: namedPlanRows, error: namedPlanError } = await supabase
      .from("cadastro_planos_map")
      .select("plano_id, nome_exibicao, ativo")
      .in("plano_id", [...new Set(selectedCodes)]);
    if (namedPlanError) throw namedPlanError;
    const displayNames = new Map<number, string>((namedPlanRows || [])
      .filter((row: any) => row.ativo !== false && String(row.nome_exibicao || "").trim())
      .map((row: any) => [Number(row.plano_id), String(row.nome_exibicao).trim()]));
    for (const [code, plan] of currentMap) {
      plan.nomeExibicao = displayNames.get(code) || plan.nomeExibicao;
    }

    const titularPlan: any = currentMap.get(Number(cadastro.titularPlano));
    const normalizedDependents = cadastro.dependentes.map((dep) => {
      const plan: any = currentMap.get(Number(dep.plano));
      return {
        tipo: Number(dep.tipo), nome: dep.nome.trim(), dataNascimento: normalizeDate(dep.dataNascimento), cpf: normalizeDigits(dep.cpf),
        sexo: Number(dep.sexo), sexoDescricao: Number(dep.sexo) === 1 ? "Masculino" : "Feminino", plano: Number(dep.plano),
        planoNome: plan.nomeExibicao, planoValor: Number(plan.ValorDependente || 0), nomeMae: dep.nomeMae.trim(),
      };
    });

    const sourceContacts = cadastro.contatos.map((item) => ({
      tipo: item.tipo,
      valor: item.tipo === "email" ? String(item.valor || "").trim().toLowerCase() : normalizeDigits(item.valor),
      principal: Boolean(item.principal),
    })).filter((item) => item.valor && item.tipo !== "email");
    const normalizedContacts = [...sourceContacts, { tipo: "email" as const, valor: confirmedEmail, principal: true }];

    const normalizedCadastro = {
      cpf,
      nome: cadastro.nome.trim(), dataNascimento: normalizeDate(cadastro.dataNascimento), sexoCodigo: Number(cadastro.sexoCodigo), nomeMae: cadastro.nomeMae.trim(),
      numeroMatricula: cadastro.numeroMatricula?.trim() || "", contatos: normalizedContacts,
      endereco: {
        ...cadastro.endereco, cep: normalizeDigits(cadastro.endereco.cep), logradouro: cadastro.endereco.logradouro.trim(), numero: cadastro.endereco.numero.trim(),
        complemento: cadastro.endereco.complemento?.trim() || "", bairro: cadastro.endereco.bairro.trim(), cidade: cadastro.endereco.cidade.trim(), uf: cadastro.endereco.uf.trim(),
      },
      titularPlano: Number(cadastro.titularPlano), titularPlanoNome: titularPlan.nomeExibicao, titularPlanoValor: Number(titularPlan.ValorTitular || 0), dependentes: normalizedDependents,
    };

    const uniquePlans = [...new Set(selectedCodes)];
    // Verifica PDFs canonicos por acesso direto quando a listagem do Storage
    // estiver incompleta. A ausencia real de PDF nunca bloqueia o contrato.
    const { available: coverageAvailable, files: coverageFiles } =
      await resolvePublishedOptionalCoverage(supabase, uniquePlans);
    if (!coverageAvailable) {
      console.info("[cadastro-public-contract-prepare] adesao sem documento opcional associado", {
        planCodes: uniquePlans,
      });
    }
    const templateCodes = [...new Set([0, ...uniquePlans])];
    const { data: templateRows, error: templateError } = await supabase.from("contract_templates")
      .select("id, plan_code, title, body_text, version, effective_from, effective_until, is_active").in("plan_code", templateCodes).eq("is_active", true);
    if (templateError) throw templateError;
    const activeTemplates = (templateRows || []).filter((item: any) => (!item.effective_from || new Date(item.effective_from).getTime() <= Date.now()) && (!item.effective_until || new Date(item.effective_until).getTime() >= Date.now()));
    const templateMap = new Map(activeTemplates.map((item: any) => [Number(item.plan_code), item]));
    const missingPlans = uniquePlans.filter((code) => !templateMap.has(code));
    const defaultTemplate: any = templateMap.get(0);
    if (missingPlans.length > 0 && !defaultTemplate) return jsonResponse({ error: "O contrato deste plano ainda nao esta configurado.", code: "CONTRACT_NOT_CONFIGURED", missingPlans }, 409);

    const dependentsSummary = normalizedDependents.length === 0 ? "Sem dependentes nesta adesao" : normalizedDependents.map((dep, index) => `${index + 1}. ${dep.nome} - ${dep.planoNome} - ${money(dep.planoValor)}`).join("\n");
    const plansSummary = [`Titular: ${normalizedCadastro.titularPlanoNome} - ${money(normalizedCadastro.titularPlanoValor)}`, ...normalizedDependents.map((dep) => `Dependente: ${dep.nome} - ${dep.planoNome} - ${money(dep.planoValor)}`)].join("\n");
    const beneficiaries = joinBeneficiaries([normalizedCadastro.nome, ...normalizedDependents.map((dep) => dep.nome)]);
    const totalMonthlyValue = Number(normalizedCadastro.titularPlanoValor || 0) + normalizedDependents.reduce((sum, dep) => sum + Number(dep.planoValor || 0), 0);
    const contractDurationMonths = vigenciaMeses;
    const replacements = {
      NOME_RF: normalizedCadastro.nome,
      CPF_RF: formatCpf(normalizedCadastro.cpf),
      DATA_NASCIMENTO_RF: normalizedCadastro.dataNascimento,
      EMPRESA: String(link.empresa_nome || ""),
      EMPRESA_CODIGO: String(link.empresa_codigo || ""),
      EMAIL: confirmedEmail,
      PLANOS: plansSummary,
      DEPENDENTES: dependentsSummary,
      DATA_ACEITE: formatDateOnly(new Date()),
      VALOR_DO_PLANO: moneyValue(totalMonthlyValue),
      BENEFICIARIOS: beneficiaries,
      PERIODO_CONTRATO: contractDurationText(contractDurationMonths),
      PARAMETRO_VIGENCIA: String(contractDurationMonths),
      VIGENCIA_MESES: String(contractDurationMonths),
      VIGENCIA_EXTENSO: vigenciaExtenso(contractDurationMonths),
    };

    const templatesToRender: any[] = defaultTemplate && missingPlans.length > 0
      ? [defaultTemplate]
      : uniquePlans.map((code) => templateMap.get(code)).filter(Boolean);
    const renderedContractText = templatesToRender
      .map((template) => renderTemplate(String(template.body_text || ""), replacements).trim())
      .filter(Boolean)
      .join("\n\n")
      .trim();
    let contractText: string;
    try {
      contractText = applyContractDuration(renderedContractText, contractDurationMonths);
    } catch (durationError) {
      console.error("[cadastro-public-contract-prepare] vigencia ausente no contrato", durationError);
      return jsonResponse({
        error: "Nao foi possivel apresentar a vigencia contratual. Fale com seu consultor.",
        code: "CONTRACT_DURATION_UNAVAILABLE",
      }, 409);
    }
    if (!contractText) return jsonResponse({ error: "O contrato deste plano ainda nao esta configurado.", code: "CONTRACT_NOT_CONFIGURED", missingPlans: uniquePlans }, 409);

    const snapshot = {
      version: 1, preparedAt: new Date().toISOString(),
      link: {
        id: link.id, empresaCodigo: Number(link.empresa_codigo), empresaNome: String(link.empresa_nome || ""), empresaCnpj: link.empresa_cnpj || null,
        empresaExigeMatricula: Number(link.empresa_exige_matricula || 0), vendedorId: link.vendedor_id || null, vendedorCodigo: String(link.vendedor_codigo || ""),
        vendedorNome: String(link.vendedor_nome || ""), createdBy: link.created_by, teamId: link.team_id || null,
        adesionistaId: link.adesionista_id || null,
        adesionistaCodigo: link.adesionista_id ? String(link.adesionista_codigo || "") : "",
        adesionistaNome: link.adesionista_id ? String(link.adesionista_nome || "") : "",
      },
      cadastro: {
        ...normalizedCadastro,
        valorMensalTotal: totalMonthlyValue,
        beneficiarios: [normalizedCadastro.nome, ...normalizedDependents.map((dep) => dep.nome)],
        duracaoContratoMeses: contractDurationMonths,
        coberturaPlanoCodigos: uniquePlans,
        coberturaDisponivel: coverageAvailable,
        coberturaPlanoArquivos: coverageFiles.map(({ code, family, fileName }) => ({ planoCodigo: code, familia: family, arquivo: fileName })),
      },
      confirmedEmail,
    };
    const contractHash = await sha256(contractText);
    const dataHash = await sha256(stableStringify(snapshot));
    const contractToken = randomToken();
    const templateIds = templatesToRender.map((template) => template.id);
    const templateVersions = Object.fromEntries(templatesToRender.map((template) => [String(template.plan_code), Number(template.version)]));

    await supabase.from("public_contract_sessions").update({ status: "superseded", updated_at: new Date().toISOString() }).eq("attempt_id", attempt.id).eq("status", "prepared");
    const { data: session, error: sessionError } = await supabase.from("public_contract_sessions").insert({
      attempt_id: attempt.id, contract_token_hash: await sha256(contractToken), snapshot, contract_text: contractText, contract_hash: contractHash,
      data_hash: dataHash, template_ids: templateIds, template_versions: templateVersions, confirmed_email: confirmedEmail,
    }).select("id").single();
    if (sessionError || !session) throw sessionError || new Error("CONTRACT_SESSION_CREATE_FAILED");

    try {
      const { error: logError } = await supabase.from("api_logs").insert({
        endpoint: "cadastro-public-contract-prepare", method: "POST",
        request_body: { attempt_id: attempt.id, cpf_hash: await hashSensitiveValue(cpf), plan_codes: uniquePlans },
        response_body: { contract_session_id: session.id, contract_hash: contractHash, contract_duration_months: contractDurationMonths }, status_code: 200, success: true, duration_ms: 0,
      });
      if (logError) console.warn("[cadastro-public-contract-prepare] log", logError.message);
    } catch (logError) {
      console.warn("[cadastro-public-contract-prepare] log inesperado", logError);
    }

    return jsonResponse({
      ok: true, contractToken, contractHash, contractText,
      coverageAvailable,
      coverageUrl: coverageAvailable
        ? supabase.storage.from("plan-coverages").getPublicUrl(
          coverageFiles.find((entry) => entry.code === Number(cadastro.titularPlano))!.fileName!,
        ).data.publicUrl
        : null,
      summary: { empresa: link.empresa_nome, titular: normalizedCadastro.nome, titularPlano: normalizedCadastro.titularPlanoNome, titularValor: normalizedCadastro.titularPlanoValor, dependentes: normalizedDependents.map((dep) => ({ nome: dep.nome, plano: dep.planoNome, valor: dep.planoValor })), confirmedEmail, duracaoContratoMeses: contractDurationMonths },
    });
  } catch (error) {
    console.error("[cadastro-public-contract-prepare]", error);
    const message = error instanceof Error ? error.message : "Erro inesperado";
    if (["ERP_CATALOG_UNAVAILABLE", "ERP_COMPANY_NOT_FOUND"].includes(message)) return jsonResponse({ error: "Nao foi possivel confirmar os planos e valores no ERP. Tente novamente.", code: "ERP_CATALOG_UNAVAILABLE" }, 503);
    return jsonResponse({ error: "Nao foi possivel preparar o contrato" }, 500);
  }
});