-- Métrica nova: uma visita por link e sessão do navegador/aplicativo.
-- Os cliques históricos não são convertidos, pois não é possível deduplicá-los
-- retrospectivamente sem identificador de sessão. Mantemos click_count como legado.
ALTER TABLE public.cadastro_links
  ADD COLUMN IF NOT EXISTS unique_visit_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unique_visits_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_unique_visit_at timestamptz;

ALTER TABLE public.cadastro_link_access_events
  ADD COLUMN IF NOT EXISTS visit_id uuid;

-- UNIQUE não parcial: registros históricos com visit_id NULL são preservados.
-- Também funciona como árbitro do ON CONFLICT, inclusive em chamadas concorrentes.
CREATE UNIQUE INDEX IF NOT EXISTS cadastro_link_access_events_link_visit_uidx
  ON public.cadastro_link_access_events (link_id, visit_id);

-- A inserção do evento e o incremento acontecem na MESMA transação.
-- Voltar ao início, atualizar a página, chamadas simultâneas ou retries
-- com a mesma visita nunca adicionam novos eventos ou incrementos.
CREATE OR REPLACE FUNCTION public.record_cadastro_link_visit(
  p_link_id uuid,
  p_visit_id uuid,
  p_ip_hash text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF p_link_id IS NULL OR p_visit_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.cadastro_link_access_events (link_id, visit_id, ip_hash)
  VALUES (p_link_id, p_visit_id, p_ip_hash)
  ON CONFLICT (link_id, visit_id) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.cadastro_links
  SET unique_visit_count = unique_visit_count + 1,
      last_unique_visit_at = now()
  WHERE id = p_link_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_cadastro_link_visit(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_cadastro_link_visit(uuid, uuid, text)
  TO service_role;

COMMENT ON COLUMN public.cadastro_links.unique_visit_count IS
  'Visitas por sessão com ID válido; cada (link, sessão) é contado uma única vez desde unique_visits_started_at.';
COMMENT ON COLUMN public.cadastro_links.click_count IS
  'Legado: contagem histórica de aberturas sem deduplicação; NÃO usar como número de visitas únicas.';
COMMENT ON COLUMN public.cadastro_link_access_events.visit_id IS
  'UUID aleatório da visita, sem CPF, IP ou identidade pessoal. Apenas um evento por link/visita.';
COMMENT ON FUNCTION public.record_cadastro_link_visit(uuid, uuid, text) IS
  'Registra atomicamente uma visita única por link e UUID de sessão; somente service_role.';
