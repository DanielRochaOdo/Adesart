import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  coverageFileForPlan,
  listCoverageDocuments,
  createServiceClient,
  getRequestIp,
  hashSensitiveValue,
  jsonResponse,
  resolveLinkByToken,
  sanitizePlan,
} from "../_shared/public-flow.ts";
import { anonymousVisitId } from "../_shared/link-visits.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  try {
    const { token, visitId } = await req.json() as { token?: string; visitId?: unknown };
    if (!token || typeof token !== "string") return jsonResponse({ error: "Token obrigatorio" }, 400);

    const supabase = createServiceClient();
    const resolved = await resolveLinkByToken(supabase, token);
    if (resolved.error === "LINK_NOT_FOUND") return jsonResponse({ error: "Link nao encontrado ou invalido" }, 404);
    if (resolved.error === "LINK_INACTIVE" || resolved.error === "LINK_EXPIRED") {
      const inactiveLink = resolved.link!;
      const { data: seller } = inactiveLink.vendedor_id
        ? await supabase.from("profiles").select("telefone").eq("id", inactiveLink.vendedor_id).maybeSingle()
        : { data: null };
      return jsonResponse({
        ok: false,
        error: resolved.error === "LINK_INACTIVE" ? "Link inativo" : "Link expirado",
        consultant: {
          nome: String(inactiveLink.vendedor_nome || ""),
          telefone: String(seller?.telefone || ""),
        },
      });
    }
    const link = resolved.link!;

    const rawPlans = (Array.isArray(link.planos_raw) ? link.planos_raw : [])
      .map(sanitizePlan)
      .filter((item: any) => item.Plano > 0);

    // O ERP retorna PrecoPlano principalmente com o codigo do plano e os valores.
    // Assim como os modulos internos, o fluxo publico usa cadastro_planos_map como
    // fonte do nome exibido ao usuario. O codigo permanece apenas como identificador.
    const planIds = Array.from(new Set(rawPlans.map((item: any) => Number(item.Plano)).filter((id: number) => id > 0)));
    let planNameById = new Map<number, string>();

    if (planIds.length > 0) {
      const { data: planRows, error: planError } = await supabase
        .from("cadastro_planos_map")
        .select("plano_id, nome_exibicao, ativo")
        .in("plano_id", planIds);

      if (planError) {
        console.warn("[cadastro-link-resolve] nao foi possivel carregar nomes dos planos", planError);
      } else {
        planNameById = new Map(
          (planRows || [])
            .filter((item: any) => item.ativo !== false && String(item.nome_exibicao || "").trim() !== "")
            .map((item: any) => [Number(item.plano_id), String(item.nome_exibicao).trim()]),
        );
      }
    }

    const plans = rawPlans.map((plan: any) => ({
      ...plan,
      nomeExibicao: planNameById.get(Number(plan.Plano)) || plan.nomeExibicao,
    }));

    const { data: relationshipRows } = await supabase
      .from("cadastro_parentesco_map")
      .select("parentesco_id, label")
      .eq("ativo", true)
      .order("parentesco_id", { ascending: true });

    let vendedorTelefone: string | null = null;
    if (link.vendedor_id) {
      const { data: vendedorProfile, error: vendedorError } = await supabase
        .from("profiles")
        .select("telefone")
        .eq("id", link.vendedor_id)
        .maybeSingle();

      if (vendedorError) {
        console.warn("[cadastro-link-resolve] nao foi possivel carregar telefone do vendedor", vendedorError);
      } else {
        vendedorTelefone = vendedorProfile?.telefone ?? null;
      }
    }

    // A visita é identificada por UUID de sessão enviado pelo cliente.
    // Reaberturas, voltar/avançar, reload e retries reutilizam o mesmo ID.
    // Uma RPC transacional cria apenas UM evento e incrementa apenas UMA vez.
    // Sem ID válido (versão antiga do cliente) o link continua funcionando,
    // mas a visita não é contabilizada para evitar inflar a métrica nova.
    const sessionVisitId = anonymousVisitId(visitId);
    if (sessionVisitId) {
      try {
        const ipHash = await hashSensitiveValue(getRequestIp(req));
        const { error: visitError } = await supabase.rpc("record_cadastro_link_visit", {
          p_link_id: link.id,
          p_visit_id: sessionVisitId,
          p_ip_hash: ipHash,
        });
        if (visitError) console.warn("[cadastro-link-resolve] falha ao registrar visita", visitError);
      } catch (visitError) {
        console.warn("[cadastro-link-resolve] falha inesperada ao registrar visita", visitError);
      }
    }

    // Retorna somente PDFs realmente publicados; o codigo ERP nao define a familia.
    let coverageFiles: string[] = [];
    try {
      coverageFiles = await listCoverageDocuments(supabase);
    } catch (coverageError) {
      // Nao publicar links inexistentes se o bucket estiver inacessivel.
      console.error("[cadastro-link-resolve] plan-coverages", coverageError);
    }
    if (!coverageFiles.length) console.warn("[cadastro-link-resolve] plan-coverages sem PDFs acessiveis");
    const missingPlanCodes = plans.filter((plan: any) => !coverageFileForPlan(Number(plan.Plano), coverageFiles))
      .map((plan: any) => ({ code: Number(plan.Plano) }));
    if (missingPlanCodes.length) console.warn("[cadastro-link-resolve] documentos nao vinculados", missingPlanCodes);
    const coberturaPlanos = Object.fromEntries(plans.flatMap((plan: any) => {
      const file = coverageFileForPlan(Number(plan.Plano), coverageFiles);
      return file ? [[String(plan.Plano), supabase.storage.from("plan-coverages").getPublicUrl(file).data.publicUrl]] : [];
    }));

    return jsonResponse({
      ok: true,
      link: {
        id: link.id,
        empresaCodigo: Number(link.empresa_codigo),
        empresaNome: String(link.empresa_nome || ""),
        empresaCnpj: link.empresa_cnpj || null,
        empresaExigeMatricula: Number(link.empresa_exige_matricula || 0),
        planos: plans,
        vendedorNome: String(link.vendedor_nome || ""),
        vendedorTelefone,
        coberturaPlanos,
        parentescos: (relationshipRows || [])
          .filter((item: any) => Number(item.parentesco_id) !== 1)
          .map((item: any) => ({ id: Number(item.parentesco_id), label: String(item.label || "") })),
      },
    });
  } catch (error) {
    console.error("[cadastro-link-resolve]", error);
    return jsonResponse({ error: "Nao foi possivel carregar o link" }, 500);
  }
});
