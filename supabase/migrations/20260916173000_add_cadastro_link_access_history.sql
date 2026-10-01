-- Historico detalhado de acessos dos links publicos.
-- Mantem somente identificadores tecnicos (hash do IP) para permitir distinguir
-- acessos anonimos de tentativas que seguiram para identificacao.

CREATE TABLE IF NOT EXISTS public.cadastro_link_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.cadastro_links(id) ON DELETE CASCADE,
  ip_hash text,
  accessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cadastro_link_access_events_link_accessed_idx
  ON public.cadastro_link_access_events(link_id, accessed_at DESC);

CREATE INDEX IF NOT EXISTS cadastro_link_access_events_link_ip_accessed_idx
  ON public.cadastro_link_access_events(link_id, ip_hash, accessed_at DESC);

ALTER TABLE public.cadastro_link_access_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cadastro_link_access_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.cadastro_link_access_events TO service_role;

COMMENT ON TABLE public.cadastro_link_access_events IS
  'Eventos de abertura valida dos links publicos. A leitura detalhada e feita apenas pelo backend autenticado do historico.';
COMMENT ON COLUMN public.cadastro_link_access_events.ip_hash IS
  'Hash tecnico do IP usado somente para correlacionar, quando possivel, o clique anonimo a uma tentativa de adesao.';
