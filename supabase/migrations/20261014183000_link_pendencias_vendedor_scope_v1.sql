-- Restringe Link Pendencias ao vendedor responsavel sem alterar outros perfis.
-- A funcao ja e referenciada pelas policies de link_pendencias e arquivos relacionados.
BEGIN;

CREATE OR REPLACE FUNCTION public.can_access_link_pendencia_v1(
  p_created_by uuid,
  p_vendedor_id uuid,
  p_team_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $link_pending_access$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND (
        p.role <> 'VENDEDOR'
        OR p_vendedor_id = p.id
      )
  );
$link_pending_access$;

REVOKE ALL ON FUNCTION public.can_access_link_pendencia_v1(uuid, uuid, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_link_pendencia_v1(uuid, uuid, uuid)
TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS link_pendencias_vendedor_status_activity_idx
ON public.link_pendencias(vendedor_id, status, last_activity_at DESC);

COMMIT;
