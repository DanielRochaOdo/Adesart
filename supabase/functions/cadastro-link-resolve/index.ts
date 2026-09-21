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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  try {
    const { token } = await req.json() as { token?: string };
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

    // Historico detalhado de abertura do link. Esta gravacao e independente do
    // contador para que uma falha de telemetria nunca bloqueie o fluxo publico.
    try {
      const ipHash = await hashSensitiveValue(getRequestIp(req));
      const { error: accessEventError } = await supabase
        .from("cadastro_link_access_events")
        .insert({ link_id: link.id, ip_hash: ipHash });

      if (accessEventError) {
        console.warn("[cadastro-link-resolve] falha ao registrar evento de acesso", accessEventError);
      }
    } catch (accessEventError) {
      console.warn("[cadastro-link-resolve] falha inesperada ao registrar evento de acesso", accessEventError);
    }

    try {
      const { error: clickError } = await supabase.rpc("increment_cadastro_link_click", { p_link_id: link.id });
      if (clickError) {
        console.warn("[cadastro-link-resolve] RPC de clique indisponivel; usando fallback", clickError);

        // Fallback defensivo: mantem o contador funcionando mesmo se a migracao
        // da RPC ainda nao tiver sido aplicada no ambiente.
        const { data: currentClick, error: readClickError } = await supabase
          .from("cadastro_links")
          .select("click_count")
          .eq("id", link.id)
          .maybeSingle();

        if (readClickError) {
          console.warn("[cadastro-link-resolve] falha ao ler contador de clique", readClickError);
        } else {
          const nextClickCount = Math.max(0, Number(currentClick?.click_count || 0)) + 1;
          const { error: fallbackError } = await supabase
            .from("cadastro_links")
            .update({
              click_count: nextClickCount,
              last_clicked_at: new Date().toISOString(),
            })
            .eq("id", link.id);

          if (fallbackError) console.warn("[cadastro-link-resolve] falha ao registrar clique", fallbackError);
        }
      }
    } catch (clickError) {
      console.warn("[cadastro-link-resolve] falha ao registrar clique", clickError);
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
    const missingPlanNames = plans.filter((plan: any) => !coverageFileForPlan(plan.nomeExibicao, coverageFiles))
      .map((plan: any) => ({ code: Number(plan.Plano), family: String(plan.nomeExibicao).slice(0, 70) }));
    if (missingPlanNames.length) console.warn("[cadastro-link-resolve] documentos nao vinculados", missingPlanNames);
    const coberturaPlanos = Object.fromEntries(plans.flatMap((plan: any) => {
      const file = coverageFileForPlan(plan.nomeExibicao, coverageFiles);
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
