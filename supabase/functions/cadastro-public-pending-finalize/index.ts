import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  normalizeDigits,
  resolveAttempt,
  upsertLinkPendingJourney,
} from "../_shared/public-flow.ts";

const validEmail = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
const validPhone = (value: unknown) => normalizeDigits(String(value || "")).length >= 10;

const validateSnapshot = (attempt: any, snapshot: any) => {
  const cadastro = snapshot?.cadastro ?? snapshot ?? {};
  const errors: string[] = [];

  if (attempt.flow_mode === "existing_member") {
    const dependents = Array.isArray(cadastro?.dependentes) ? cadastro.dependentes : [];
    if (dependents.length === 0) errors.push("Adicione ao menos um dependente.");
    dependents.forEach((dep: any, index: number) => {
      const label = `Dependente ${index + 1}`;
      if (normalizeDigits(dep?.cpf).length !== 11) errors.push(`${label}: CPF invalido.`);
      if (!String(dep?.nome || "").trim()) errors.push(`${label}: nome obrigatorio.`);
      if (!String(dep?.dataNascimento || "").trim()) errors.push(`${label}: data de nascimento obrigatoria.`);
      if (!Number(dep?.tipo)) errors.push(`${label}: grau de parentesco obrigatorio.`);
      if (!Number(dep?.plano)) errors.push(`${label}: plano obrigatorio.`);
    });
    if (!validPhone(cadastro?.telefone)) errors.push("Telefone / WhatsApp invalido.");
    if (!validEmail(cadastro?.email)) errors.push("E-mail invalido.");
  } else {
    if (normalizeDigits(cadastro?.cpf).length !== 11) errors.push("CPF invalido.");
    if (!String(cadastro?.nome || "").trim()) errors.push("Nome obrigatorio.");
    if (!String(cadastro?.dataNascimento || "").trim()) errors.push("Data de nascimento obrigatoria.");
    if (![0, 1].includes(Number(cadastro?.sexoCodigo))) errors.push("Sexo obrigatorio.");
    if (!String(cadastro?.nomeMae || "").trim()) errors.push("Nome da mae obrigatorio.");
    if (!validPhone(cadastro?.telefone ?? cadastro?.contatos?.find?.((item: any) => ["whatsapp", "celular"].includes(item?.tipo))?.valor)) {
      errors.push("Telefone / WhatsApp invalido.");
    }
    const email = cadastro?.email ?? cadastro?.contatos?.find?.((item: any) => item?.tipo === "email")?.valor;
    if (!validEmail(email)) errors.push("E-mail invalido.");
    if (!Number(cadastro?.titularPlano)) errors.push("Plano do titular obrigatorio.");
    if (!cadastro?.endereco || !String(cadastro.endereco?.cep || "").trim()) errors.push("Endereco obrigatorio.");
  }

  return errors;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  try {
    const body = await req.json().catch(() => ({})) as {
      attemptToken?: string;
      snapshot?: Record<string, unknown>;
    };

    const attemptToken = String(body.attemptToken || "").trim();
    if (!attemptToken || !body.snapshot || typeof body.snapshot !== "object") {
      return jsonResponse({ error: "Dados da solicitacao invalidos" }, 400);
    }

    const supabase = createServiceClient();
    const attempt = await resolveAttempt(supabase, attemptToken);
    if (!attempt || attempt.status !== "authenticated") {
      return jsonResponse({ error: "Sessao expirada" }, 401);
    }

    const { data: link, error: linkError } = await supabase
      .from("cadastro_links")
      .select("*")
      .eq("id", attempt.link_id)
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link) return jsonResponse({ error: "Link nao encontrado" }, 404);
    if (link.requires_authorization !== true) {
      return jsonResponse({
        error: "Este link segue o fluxo normal de contrato e envio ao ERP.",
        code: "AUTHORIZATION_NOT_REQUIRED",
      }, 409);
    }

    const snapshot = body.snapshot;
    if (JSON.stringify(snapshot).length > 250_000) {
      return jsonResponse({ error: "Dados da solicitacao excedem o limite permitido" }, 413);
    }

    const errors = validateSnapshot(attempt, snapshot);
    if (errors.length > 0) {
      return jsonResponse({
        error: "Existem dados obrigatorios pendentes.",
        code: "PENDING_REQUIRED_FIELDS",
        fields: errors,
      }, 400);
    }

    const now = new Date().toISOString();
    const row = await upsertLinkPendingJourney({
      supabase,
      attempt,
      link,
      snapshot,
      stage: "public_finalized",
      status: "aguardando_analise",
      publicCompletedAt: now,
    });

    const { error: attemptError } = await supabase
      .from("public_adesao_attempts")
      .update({
        status: "completed",
        completion_kind: "pending_review",
        completed_at: now,
        draft_snapshot: snapshot,
        last_stage: "public_finalized",
        link_pendencia_id: row?.id || attempt.link_pendencia_id || null,
        updated_at: now,
      })
      .eq("id", attempt.id);
    if (attemptError) throw attemptError;

    return jsonResponse({
      ok: true,
      state: "pending_review",
      pendingId: row?.id || null,
      message: "Solicitacao recebida com sucesso",
    });
  } catch (error) {
    console.error("[cadastro-public-pending-finalize]", error);
    return jsonResponse({
      error: "Nao foi possivel finalizar a solicitacao",
      code: "PUBLIC_PENDING_FINALIZE_FAILED",
    }, 500);
  }
});
