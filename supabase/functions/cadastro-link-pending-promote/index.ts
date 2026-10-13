import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  normalizeDigits,
  requireInternalUser,
  sanitizePlan,
} from "../_shared/public-flow.ts";

const canOperate = (profile: any, pending: any) => {
  const role = String(profile?.role || "").toUpperCase();
  if (["ADMINISTRADOR", "GERENTE", "GESTOR", "CADASTRO", "ADESIONISTA"].includes(role)) return true;
  if (role === "SUPERVISOR") {
    return String(profile?.team_id || "") === String(pending?.team_id || "");
  }
  if (role === "VENDEDOR") {
    return [pending?.created_by, pending?.vendedor_id]
      .filter(Boolean)
      .some((id) => String(id) === String(profile?.id || ""));
  }
  return false;
};

const planName = (plans: any[], code: number) =>
  String(plans.find((item: any) => Number(item?.Plano) === Number(code))?.nomeExibicao || `Plano ${code}`);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  try {
    const supabase = createServiceClient();
    const auth = await requireInternalUser(req, supabase);
    if (!auth) return jsonResponse({ error: "Autenticacao obrigatoria" }, 401);

    const body = await req.json().catch(() => ({})) as { pendingId?: string };
    const pendingId = String(body.pendingId || "").trim();
    if (!pendingId) return jsonResponse({ error: "Pendencia obrigatoria" }, 400);

    const { data: pending, error: pendingError } = await supabase
      .from("link_pendencias")
      .select("*")
      .eq("id", pendingId)
      .maybeSingle();
    if (pendingError) throw pendingError;
    if (!pending) return jsonResponse({ error: "Pendencia nao encontrada" }, 404);
    if (!canOperate(auth.profile, pending)) return jsonResponse({ error: "Sem permissao para esta pendencia" }, 403);
    if (pending.requires_authorization !== true) {
      return jsonResponse({
        error: "Este registro pertence a um link sem autorizacao interna. O proprio cliente deve concluir a solicitacao.",
        code: "READ_ONLY_PENDING",
      }, 409);
    }
    if (pending.status === "enviado") {
      return jsonResponse({ error: "Esta solicitacao ja foi enviada ao ERP.", code: "PENDING_ALREADY_SENT" }, 409);
    }

    if (pending.cadastro_id) {
      const { data: existing, error: existingError } = await supabase
        .from("cadastros")
        .select("*")
        .eq("id", pending.cadastro_id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return jsonResponse({ ok: true, reused: true, cadastro: existing });
    }

    const { data: link, error: linkError } = await supabase
      .from("cadastro_links")
      .select("*")
      .eq("id", pending.link_id)
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link) return jsonResponse({ error: "Link de origem nao encontrado" }, 404);

    const snapshot = pending.latest_snapshot || {};
    const cadastro = snapshot?.cadastro || snapshot || {};
    const publicPlans = Array.isArray(snapshot?.plans) && snapshot.plans.length > 0
      ? snapshot.plans.map(sanitizePlan)
      : (Array.isArray(link.planos_raw) ? link.planos_raw : []).map(sanitizePlan);

    let insertPayload: Record<string, unknown>;

    if (pending.operation_type === "existing_member") {
      const holderCode = Number(pending.erp_member_snapshot?.codigoAssociado || 0);
      if (!Number.isInteger(holderCode) || holderCode <= 0) {
        return jsonResponse({
          error: "O vinculo do associado precisa ser validado novamente antes da tratativa.",
          code: "MEMBER_SNAPSHOT_MISSING",
        }, 409);
      }

      const deps = Array.isArray(cadastro?.dependentes) ? cadastro.dependentes : [];
      if (deps.length === 0) {
        return jsonResponse({ error: "A solicitacao ainda nao possui dependentes para inclusao." }, 409);
      }

      const phone = normalizeDigits(cadastro?.telefone);
      const email = String(cadastro?.email || "").trim().toLowerCase();
      const empresaRaw = Number(link.empresa_codigo) === Number(pending.empresa_codigo)
        ? { ...(link.empresa_raw || {}) }
        : {};

      insertPayload = {
        status: "incompleto",
        tipo_cadastro: "inclusao_dependente",
        created_by: link.created_by,
        team_id: link.team_id || null,
        cpf: null,
        nome: String(cadastro?.nome || pending.nome || ""),
        responsavel_financeiro_codigo: holderCode,
        responsavel_financeiro_nome: String(cadastro?.nome || pending.nome || ""),
        responsavel_financeiro_cpf: normalizeDigits(cadastro?.cpf || pending.cpf),
        contatos_responsavel_financeiro: [
          ...(phone ? [{ tipo: "whatsapp", valor: phone, principal: true }] : []),
          ...(email ? [{ tipo: "email", valor: email, principal: true }] : []),
        ],
        empresa_id: Number(pending.empresa_codigo),
        empresa_codigo: Number(pending.empresa_codigo),
        empresa_nome: String(pending.empresa_nome || ""),
        empresa_cnpj: Number(link.empresa_codigo) === Number(pending.empresa_codigo) ? link.empresa_cnpj || null : null,
        empresa_raw: {
          ...empresaRaw,
          codigo: Number(pending.empresa_codigo),
          nomeFantasia: String(pending.empresa_nome || ""),
          razaoSocial: String(pending.empresa_nome || ""),
          precoPlano: publicPlans,
        },
        planos_raw: publicPlans,
        vendedor_id: link.vendedor_id || null,
        vendedor_codigo: String(link.vendedor_codigo || ""),
        vendedor_nome: String(link.vendedor_nome || ""),
        adesionista_id: link.adesionista_id || null,
        adesionista_codigo: link.adesionista_codigo || null,
        adesionista_nome: link.adesionista_nome || null,
        dependentes: deps.map((dep: any) => ({
          tipo: Number(dep?.tipo || 0),
          parentesco: Number(dep?.tipo || 0),
          nome: String(dep?.nome || "").trim(),
          cpf: normalizeDigits(dep?.cpf),
          data_nascimento: String(dep?.dataNascimento || ""),
          sexo: Number(dep?.sexo) === 1 ? "Masculino" : "Feminino",
          sexo_codigo: Number(dep?.sexo),
          plano_codigo: Number(dep?.plano || 0),
          plano_nome: planName(publicPlans, Number(dep?.plano || 0)),
          plano_valor: String(
            publicPlans.find((item: any) => Number(item?.Plano) === Number(dep?.plano || 0))?.ValorDependente || 0,
          ),
          nome_mae: String(dep?.nomeMae || "").trim(),
          arquivo_path: null,
        })),
        fluxo_publico: true,
        origem_link_id: link.id,
        link_pendencia_id: pending.id,
      };
    } else {
      const cpf = normalizeDigits(cadastro?.cpf || pending.cpf);
      if (cpf.length !== 11) return jsonResponse({ error: "CPF do titular invalido na pendencia." }, 409);

      const titularPlanCode = Number(cadastro?.titularPlano || 0);
      const titularPlan = publicPlans.find((item: any) => Number(item?.Plano) === titularPlanCode);
      const deps = Array.isArray(cadastro?.dependentes) ? cadastro.dependentes : [];
      const contacts = Array.isArray(cadastro?.contatos)
        ? cadastro.contatos
        : [
            ...(cadastro?.telefone ? [{ tipo: "whatsapp", valor: normalizeDigits(cadastro.telefone), principal: true }] : []),
            ...(cadastro?.email ? [{ tipo: "email", valor: String(cadastro.email).trim().toLowerCase(), principal: true }] : []),
          ];

      const storedDependents = [
        {
          tipo: 1,
          nome: String(cadastro?.nome || pending.nome || "").trim(),
          dataNascimento: String(cadastro?.dataNascimento || ""),
          cpf,
          sexo: Number(cadastro?.sexoCodigo),
          sexoDescricao: Number(cadastro?.sexoCodigo) === 1 ? "Masculino" : "Feminino",
          plano: titularPlanCode,
          planoValor: Number(titularPlan?.ValorTitular || 0).toFixed(2),
          nomeMae: String(cadastro?.nomeMae || "").trim(),
          carenciaAtendimento: 0,
          funcionarioCadastro: Number(link.vendedor_codigo || 0),
        },
        ...deps.map((dep: any) => {
          const depPlan = publicPlans.find((item: any) => Number(item?.Plano) === Number(dep?.plano || 0));
          return {
            tipo: Number(dep?.tipo || 0),
            nome: String(dep?.nome || "").trim(),
            dataNascimento: String(dep?.dataNascimento || ""),
            cpf: normalizeDigits(dep?.cpf),
            sexo: Number(dep?.sexo),
            sexoDescricao: Number(dep?.sexo) === 1 ? "Masculino" : "Feminino",
            plano: Number(dep?.plano || 0),
            planoValor: Number(depPlan?.ValorDependente || 0).toFixed(2),
            nomeMae: String(dep?.nomeMae || "").trim(),
            carenciaAtendimento: 0,
            funcionarioCadastro: Number(link.vendedor_codigo || 0),
          };
        }),
      ];

      insertPayload = {
        status: "incompleto",
        tipo_cadastro: "cadastro",
        created_by: link.created_by,
        team_id: link.team_id || null,
        cpf,
        nome: String(cadastro?.nome || pending.nome || "").trim(),
        data_nascimento: String(cadastro?.dataNascimento || "") || null,
        sexo: Number(cadastro?.sexoCodigo) === 1 ? "M" : "F",
        sexo_codigo: Number(cadastro?.sexoCodigo),
        nome_mae: String(cadastro?.nomeMae || "").trim(),
        contatos: contacts,
        endereco: cadastro?.endereco || {},
        cliente_sera_usuario: true,
        empresa_id: Number(pending.empresa_codigo),
        empresa_codigo: Number(pending.empresa_codigo),
        empresa_nome: String(pending.empresa_nome || ""),
        empresa_cnpj: link.empresa_cnpj || null,
        empresa_raw: link.empresa_raw || {},
        empresa_exige_matricula: Number(link.empresa_exige_matricula || 0),
        planos_raw: publicPlans,
        dependentes: storedDependents,
        numero_matricula: String(cadastro?.numeroMatricula || "") || null,
        plano_codigo: titularPlanCode || null,
        plano_nome: titularPlanCode ? planName(publicPlans, titularPlanCode) : null,
        vendedor_id: link.vendedor_id || null,
        vendedor_codigo: String(link.vendedor_codigo || ""),
        vendedor_nome: String(link.vendedor_nome || ""),
        adesionista_id: link.adesionista_id || null,
        adesionista_codigo: link.adesionista_codigo || null,
        adesionista_nome: link.adesionista_nome || null,
        origem_link_id: link.id,
        fluxo_publico: true,
        link_pendencia_id: pending.id,
      };
    }

    const { data: created, error: createError } = await supabase
      .from("cadastros")
      .insert(insertPayload)
      .select("*")
      .single();
    if (createError || !created) throw createError || new Error("CADASTRO_CREATE_FAILED");

    const now = new Date().toISOString();
    const { error: pendingUpdateError } = await supabase
      .from("link_pendencias")
      .update({
        cadastro_id: created.id,
        promoted_at: now,
        promoted_by: auth.profile.id,
        last_activity_at: now,
        updated_at: now,
      })
      .eq("id", pending.id);
    if (pendingUpdateError) throw pendingUpdateError;

    return jsonResponse({ ok: true, cadastro: created });
  } catch (error) {
    console.error("[cadastro-link-pending-promote]", error);
    return jsonResponse({
      error: "Nao foi possivel abrir a pendencia para tratativa",
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
