import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, createServiceClient, jsonResponse, resolveLinkByToken, sanitizePlan } from "../_shared/public-flow.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metodo nao permitido" }, 405);

  try {
    const { token } = await req.json() as { token?: string };
    if (!token || typeof token !== "string") return jsonResponse({ error: "Token obrigatorio" }, 400);

    const supabase = createServiceClient();
    const resolved = await resolveLinkByToken(supabase, token);
    if (resolved.error === "LINK_NOT_FOUND") return jsonResponse({ error: "Link nao encontrado ou invalido" }, 404);
    if (resolved.error === "LINK_INACTIVE") return jsonResponse({ error: "Link inativo" }, 410);
    if (resolved.error === "LINK_EXPIRED") return jsonResponse({ error: "Link expirado" }, 410);
    const link = resolved.link!;

    const plans = (Array.isArray(link.planos_raw) ? link.planos_raw : [])
      .map(sanitizePlan)
      .filter((item: any) => item.Plano > 0);

    const { data: relationshipRows } = await supabase
      .from("cadastro_parentesco_map")
      .select("parentesco_id, label")
      .eq("ativo", true)
      .order("parentesco_id", { ascending: true });

    await supabase.rpc("increment_cadastro_link_click", { p_link_id: link.id }).catch(async () => {
      await supabase.from("cadastro_links").update({ last_clicked_at: new Date().toISOString() }).eq("id", link.id);
    });

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
