import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  requireInternalUser,
} from "../_shared/public-flow.ts";

type HistoryStatus =
  | "Informou CPF e chegou à consulta dos dados"
  | "Validou CPF/data e abandonou depois"
  | "Chegou ao contrato e não concluiu"
  | "Concluiu a adesão"
  | "Apenas abriu o link";

type AccessEvent = {
  id: string;
  ip_hash: string | null;
  accessed_at: string;
};

type AttemptRow = {
  id: string;
  ip_hash: string | null;
  status: string;
  profile_snapshot: any;
  lemmit_checked_at: string | null;
  authenticated_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type SessionRow = {
  id: string;
  attempt_id: string;
  status: string;
  snapshot: any;
  cadastro_id: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

const FULL_ACCESS_ROLES = new Set([
  "ADMINISTRADOR",
  "GERENTE",
  "GESTOR",
  "CADASTRO",
  "ADESIONISTA",
]);

const COMPLETED_SESSION_STATUSES = new Set([
  "erp_registered",
  "deliveries_pending",
  "completed",
  "needs_attention",
]);

const normalizePhone = (value: unknown) => String(value || "").replace(/\D/g, "");

const pickPhone = (...contactGroups: any[]) => {
  for (const group of contactGroups) {
    const contacts = Array.isArray(group) ? group : [];
    const primary = contacts.find((item: any) =>
      ["whatsapp", "celular", "fixo"].includes(String(item?.tipo || "")) && item?.principal === true
    );
    const fallback = contacts.find((item: any) =>
      ["whatsapp", "celular", "fixo"].includes(String(item?.tipo || ""))
    );
    const value = normalizePhone(primary?.valor || fallback?.valor);
    if (value) return value;
  }
  return null;
};

const latestSessionsByAttempt = (sessions: SessionRow[]) => {
  const map = new Map<string, SessionRow>();
  for (const session of sessions) {
    if (!map.has(session.attempt_id)) map.set(session.attempt_id, session);
  }
  return map;
};

const classifyAttempt = (attempt: AttemptRow, session?: SessionRow): HistoryStatus => {
  if (
    attempt.status === "completed" ||
    Boolean(attempt.completed_at) ||
    (session && COMPLETED_SESSION_STATUSES.has(String(session.status || "")))
  ) {
    return "Concluiu a adesão";
  }

  if (session) return "Chegou ao contrato e não concluiu";
  if (attempt.authenticated_at || attempt.status === "authenticated") {
    return "Validou CPF/data e abandonou depois";
  }

  return "Informou CPF e chegou à consulta dos dados";
};

const findMatchingAccessEvent = (
  attempt: AttemptRow,
  events: AccessEvent[],
  availableEventIds: Set<string>,
) => {
  if (!attempt.ip_hash) return null;
  const attemptAt = new Date(attempt.created_at).getTime();
  if (!Number.isFinite(attemptAt)) return null;

  let selected: AccessEvent | null = null;
  let selectedAt = -Infinity;

  for (const event of events) {
    if (!availableEventIds.has(event.id) || !event.ip_hash || event.ip_hash !== attempt.ip_hash) continue;
    const eventAt = new Date(event.accessed_at).getTime();
    if (!Number.isFinite(eventAt) || eventAt > attemptAt) continue;
    if (attemptAt - eventAt > 60 * 60 * 1000) continue;
    if (eventAt > selectedAt) {
      selected = event;
      selectedAt = eventAt;
    }
  }

  if (selected) availableEventIds.delete(selected.id);
  return selected;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  try {
    const supabase = createServiceClient();
    const internalUser = await requireInternalUser(req, supabase);
    if (!internalUser) return jsonResponse({ error: "Nao autorizado" }, 401);

    const body = await req.json().catch(() => ({})) as { linkId?: string };
    const linkId = String(body.linkId || "").trim();
    if (!linkId) return jsonResponse({ error: "Link obrigatorio" }, 400);

    const { data: link, error: linkError } = await supabase
      .from("cadastro_links")
      .select("id, created_by, empresa_codigo, empresa_nome, vendedor_nome, vendedor_codigo, click_count, last_clicked_at, created_at")
      .eq("id", linkId)
      .maybeSingle();

    if (linkError) throw linkError;
    if (!link) return jsonResponse({ error: "Link nao encontrado" }, 404);

    const role = String(internalUser.profile?.role || "").toUpperCase();
    const canViewAll = FULL_ACCESS_ROLES.has(role);
    if (!canViewAll && String(link.created_by || "") !== String(internalUser.profile?.id || "")) {
      return jsonResponse({ error: "Sem permissao para visualizar este historico" }, 403);
    }

    const { data: attemptsData, error: attemptsError } = await supabase
      .from("public_adesao_attempts")
      .select("id, ip_hash, status, profile_snapshot, lemmit_checked_at, authenticated_at, completed_at, created_at, updated_at")
      .eq("link_id", linkId)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (attemptsError) throw attemptsError;
    const attempts = (attemptsData || []) as AttemptRow[];

    const attemptIds = attempts.map((item) => item.id);
    let sessions: SessionRow[] = [];
    if (attemptIds.length > 0) {
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("public_contract_sessions")
        .select("id, attempt_id, status, snapshot, cadastro_id, accepted_at, created_at, updated_at")
        .in("attempt_id", attemptIds)
        .order("created_at", { ascending: false });
      if (sessionsError) throw sessionsError;
      sessions = (sessionsData || []) as SessionRow[];
    }

    let accessEvents: AccessEvent[] = [];
    const { data: accessData, error: accessError } = await supabase
      .from("cadastro_link_access_events")
      .select("id, ip_hash, accessed_at")
      .eq("link_id", linkId)
      .order("accessed_at", { ascending: false })
      .limit(1500);

    if (accessError) {
      // Compatibilidade com ambientes em que a migracao ainda nao foi aplicada.
      console.warn("[cadastro-link-history] historico de cliques ainda indisponivel", accessError.message);
    } else {
      accessEvents = (accessData || []) as AccessEvent[];
    }

    const sessionByAttempt = latestSessionsByAttempt(sessions);
    const availableEventIds = new Set(accessEvents.map((event) => event.id));

    const identifiedRows = attempts.map((attempt) => {
      const session = sessionByAttempt.get(attempt.id);
      const accessEvent = findMatchingAccessEvent(attempt, accessEvents, availableEventIds);
      const cadastro = session?.snapshot?.cadastro || {};
      const profile = attempt.profile_snapshot || {};
      const dependentes = Array.isArray(cadastro?.dependentes)
        ? cadastro.dependentes
            .map((item: any) => String(item?.nome || "").trim())
            .filter(Boolean)
        : [];

      return {
        id: `attempt:${attempt.id}`,
        timestamp: accessEvent?.accessed_at || attempt.created_at,
        nomeRf: String(cadastro?.nome || profile?.nome || "").trim() || null,
        dependentes,
        telefone: pickPhone(cadastro?.contatos, profile?.contatos),
        status: classifyAttempt(attempt, session),
        vendedor: String(link.vendedor_nome || ""),
        vendedorCodigo: String(link.vendedor_codigo || ""),
        empresaNome: String(link.empresa_nome || ""),
        empresaCodigo: Number(link.empresa_codigo || 0),
      };
    });

    const anonymousRows = accessEvents
      .filter((event) => availableEventIds.has(event.id))
      .map((event) => ({
        id: `access:${event.id}`,
        timestamp: event.accessed_at,
        nomeRf: null,
        dependentes: [],
        telefone: null,
        status: "Apenas abriu o link" as HistoryStatus,
        vendedor: String(link.vendedor_nome || ""),
        vendedorCodigo: String(link.vendedor_codigo || ""),
        empresaNome: String(link.empresa_nome || ""),
        empresaCodigo: Number(link.empresa_codigo || 0),
      }));

    const rows = [...identifiedRows, ...anonymousRows]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return jsonResponse({
      ok: true,
      link: {
        id: link.id,
        empresaNome: String(link.empresa_nome || ""),
        empresaCodigo: Number(link.empresa_codigo || 0),
        vendedor: String(link.vendedor_nome || ""),
        vendedorCodigo: String(link.vendedor_codigo || ""),
      },
      summary: {
        clickCount: Number(link.click_count || 0),
        identifiedAttempts: attempts.length,
        anonymousDetailed: anonymousRows.length,
        detailedAccessEvents: accessEvents.length,
        lastClickedAt: link.last_clicked_at || null,
      },
      rows,
    });
  } catch (error) {
    console.error("[cadastro-link-history]", error);
    return jsonResponse({ error: "Nao foi possivel carregar o historico deste link" }, 500);
  }
});
