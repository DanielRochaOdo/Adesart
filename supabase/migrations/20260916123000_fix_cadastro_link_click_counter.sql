-- Corrige a contabilizacao de cliques/acessos validos dos links publicos.
-- A Edge Function cadastro-link-resolve ja chama esta RPC, mas ela nao existia
-- nas migracoes anteriores. O incremento e atomico e restrito ao service_role.

CREATE OR REPLACE FUNCTION public.increment_cadastro_link_click(p_link_id uuid)
RETURNS TABLE (
  click_count integer,
  last_clicked_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.cadastro_links
  SET click_count = COALESCE(cadastro_links.click_count, 0) + 1,
      last_clicked_at = now()
  WHERE id = p_link_id
  RETURNING cadastro_links.click_count, cadastro_links.last_clicked_at;
$$;

REVOKE ALL ON FUNCTION public.increment_cadastro_link_click(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_cadastro_link_click(uuid)
  TO service_role;

COMMENT ON FUNCTION public.increment_cadastro_link_click(uuid)
  IS 'Incrementa atomicamente o contador de acessos validos de um link publico e registra o ultimo acesso.';
