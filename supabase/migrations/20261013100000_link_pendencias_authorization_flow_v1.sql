-- Fluxo de Link Pendencias e links que exigem autorizacao.
-- A solicitacao publica passa a ser rastreada por CPF/empresa/tipo de operacao,
-- preservando tentativas tecnicas sem inflar a fila operacional.

BEGIN;

ALTER TABLE public.cadastro_links
  ADD COLUMN IF NOT EXISTS requires_authorization boolean NOT NULL DEFAULT false;

ALTER TABLE public.public_adesao_attempts
  ADD COLUMN IF NOT EXISTS draft_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS last_stage text,
  ADD COLUMN IF NOT EXISTS completion_kind text;

CREATE TABLE IF NOT EXISTS public.link_pendencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.cadastro_links(id) ON DELETE CASCADE,
  primary_attempt_id uuid REFERENCES public.public_adesao_attempts(id) ON DELETE SET NULL,
  cpf_hash text NOT NULL,
  cpf text,
  nome text,
  empresa_codigo integer NOT NULL,
  empresa_nome text NOT NULL,
  operation_type text NOT NULL
    CHECK (operation_type IN ('new_member', 'existing_member')),
  requires_authorization boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'aguardando_analise'
    CHECK (status IN (
      'aguardando_analise',
      'pronto_erp',
      'enviando',
      'enviado',
      'erro_envio',
      'encerrado'
    )),
  flow_stage text,
  latest_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  erp_member_snapshot jsonb,
  source_attempt_ids uuid[] NOT NULL DEFAULT '{}',
  source_link_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  vendedor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  cadastro_id uuid REFERENCES public.cadastros(id) ON DELETE SET NULL,
  first_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  public_completed_at timestamptz,
  promoted_at timestamptz,
  promoted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_at timestamptz,
  sent_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_reason text,
  last_error text,
  erp_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS link_pendencias_status_activity_idx
  ON public.link_pendencias(status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS link_pendencias_link_idx
  ON public.link_pendencias(link_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS link_pendencias_cpf_empresa_idx
  ON public.link_pendencias(cpf_hash, empresa_codigo, operation_type, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS link_pendencias_vendedor_idx
  ON public.link_pendencias(vendedor_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS link_pendencias_team_idx
  ON public.link_pendencias(team_id, last_activity_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS link_pendencias_open_identity_uq
  ON public.link_pendencias(cpf_hash, empresa_codigo, operation_type)
  WHERE status IN ('aguardando_analise', 'pronto_erp', 'enviando', 'erro_envio');

ALTER TABLE public.public_adesao_attempts
  ADD COLUMN IF NOT EXISTS link_pendencia_id uuid REFERENCES public.link_pendencias(id) ON DELETE SET NULL;

ALTER TABLE public.cadastros
  ADD COLUMN IF NOT EXISTS link_pendencia_id uuid REFERENCES public.link_pendencias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cadastros_link_pendencia_idx
  ON public.cadastros(link_pendencia_id)
  WHERE link_pendencia_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.link_pendencia_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_pendencia_id uuid NOT NULL REFERENCES public.link_pendencias(id) ON DELETE CASCADE,
  cadastro_id uuid REFERENCES public.cadastros(id) ON DELETE SET NULL,
  bucket text NOT NULL DEFAULT 'cadastros-temp-files',
  arquivo_path text NOT NULL,
  arquivo_nome text NOT NULL,
  mime_type text,
  file_size_bytes bigint,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_to_erp_at timestamptz,
  erp_queue_id uuid REFERENCES public.erp_upload_queue(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(link_pendencia_id, bucket, arquivo_path)
);

CREATE INDEX IF NOT EXISTS link_pendencia_files_pending_idx
  ON public.link_pendencia_files(link_pendencia_id, created_at);

DROP TRIGGER IF EXISTS update_link_pendencias_updated_at ON public.link_pendencias;
CREATE TRIGGER update_link_pendencias_updated_at
  BEFORE UPDATE ON public.link_pendencias
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.link_pendencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_pendencia_files ENABLE ROW LEVEL SECURITY;

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
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND (
        p.role IN ('ADMINISTRADOR', 'GERENTE', 'CADASTRO', 'ADESIONISTA')
        OR (p.role = 'SUPERVISOR' AND p.team_id IS NOT DISTINCT FROM p_team_id)
        OR (
          p.role = 'VENDEDOR'
          AND (p.id = p_created_by OR p.id = p_vendedor_id)
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_link_pendencia_v1(uuid, uuid, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_link_pendencia_v1(uuid, uuid, uuid)
TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated view permitted link pendencias" ON public.link_pendencias;
CREATE POLICY "Authenticated view permitted link pendencias"
ON public.link_pendencias
FOR SELECT
TO authenticated
USING (
  public.can_access_link_pendencia_v1(created_by, vendedor_id, team_id)
);

DROP POLICY IF EXISTS "Authenticated update permitted link pendencias" ON public.link_pendencias;
CREATE POLICY "Authenticated update permitted link pendencias"
ON public.link_pendencias
FOR UPDATE
TO authenticated
USING (
  public.can_access_link_pendencia_v1(created_by, vendedor_id, team_id)
)
WITH CHECK (
  public.can_access_link_pendencia_v1(created_by, vendedor_id, team_id)
);

DROP POLICY IF EXISTS "Authenticated read permitted link pending files" ON public.link_pendencia_files;
CREATE POLICY "Authenticated read permitted link pending files"
ON public.link_pendencia_files
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.link_pendencias p
    WHERE p.id = link_pendencia_files.link_pendencia_id
      AND public.can_access_link_pendencia_v1(p.created_by, p.vendedor_id, p.team_id)
  )
);

DROP POLICY IF EXISTS "Authenticated insert permitted link pending files" ON public.link_pendencia_files;
CREATE POLICY "Authenticated insert permitted link pending files"
ON public.link_pendencia_files
FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.link_pendencias p
    WHERE p.id = link_pendencia_files.link_pendencia_id
      AND p.requires_authorization = true
      AND p.status IN ('aguardando_analise', 'pronto_erp', 'erro_envio')
      AND public.can_access_link_pendencia_v1(p.created_by, p.vendedor_id, p.team_id)
  )
);

DROP POLICY IF EXISTS "Authenticated update permitted link pending files" ON public.link_pendencia_files;
CREATE POLICY "Authenticated update permitted link pending files"
ON public.link_pendencia_files
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.link_pendencias p
    WHERE p.id = link_pendencia_files.link_pendencia_id
      AND public.can_access_link_pendencia_v1(p.created_by, p.vendedor_id, p.team_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.link_pendencias p
    WHERE p.id = link_pendencia_files.link_pendencia_id
      AND public.can_access_link_pendencia_v1(p.created_by, p.vendedor_id, p.team_id)
  )
);

-- Backfill: somente tentativas com identidade/dados aproveitaveis entram.
-- Uma jornada concluida no fluxo antigo aparece como enviada; abandonos ficam
-- aguardando analise e podem ser resolvidos por uma tentativa posterior.
WITH meaningful AS (
  SELECT
    a.*,
    l.empresa_codigo,
    l.empresa_nome,
    l.requires_authorization,
    l.created_by,
    l.vendedor_id,
    l.team_id,
    CASE
      WHEN a.flow_mode = 'existing_member' THEN 'existing_member'
      ELSE 'new_member'
    END AS operation_type
  FROM public.public_adesao_attempts a
  JOIN public.cadastro_links l ON l.id = a.link_id
  WHERE a.flow_mode IN ('new_member', 'existing_member')
    AND a.profile_snapshot IS NOT NULL
    AND (
      a.authenticated_at IS NOT NULL
      OR a.lemmit_checked_at IS NOT NULL
      OR a.erp_member_snapshot IS NOT NULL
      OR a.status = 'completed'
    )
),
groups AS (
  SELECT
    cpf_hash,
    empresa_codigo,
    operation_type,
    min(created_at) AS first_attempt_at,
    max(updated_at) AS last_activity_at,
    bool_or(status = 'completed' OR completed_at IS NOT NULL) AS has_completed,
    array_agg(id ORDER BY created_at) AS attempt_ids,
    array_agg(DISTINCT link_id) AS link_ids
  FROM meaningful
  GROUP BY cpf_hash, empresa_codigo, operation_type
),
latest AS (
  SELECT DISTINCT ON (m.cpf_hash, m.empresa_codigo, m.operation_type)
    m.*
  FROM meaningful m
  ORDER BY m.cpf_hash, m.empresa_codigo, m.operation_type, m.updated_at DESC, m.created_at DESC
)
INSERT INTO public.link_pendencias (
  link_id,
  primary_attempt_id,
  cpf_hash,
  cpf,
  nome,
  empresa_codigo,
  empresa_nome,
  operation_type,
  requires_authorization,
  status,
  flow_stage,
  latest_snapshot,
  erp_member_snapshot,
  source_attempt_ids,
  source_link_ids,
  created_by,
  vendedor_id,
  team_id,
  first_attempt_at,
  last_activity_at,
  public_completed_at,
  resolved_at,
  resolution_reason
)
SELECT
  l.link_id,
  g.attempt_ids[1],
  g.cpf_hash,
  regexp_replace(coalesce(l.profile_snapshot ->> 'cpf', ''), '[^0-9]', '', 'g'),
  nullif(btrim(coalesce(l.profile_snapshot ->> 'nome', '')), ''),
  g.empresa_codigo,
  l.empresa_nome,
  g.operation_type,
  l.requires_authorization,
  CASE WHEN g.has_completed THEN 'enviado' ELSE 'aguardando_analise' END,
  coalesce(l.last_stage, CASE WHEN g.has_completed THEN 'completed' ELSE 'identified' END),
  coalesce(l.draft_snapshot, l.profile_snapshot, '{}'::jsonb),
  l.erp_member_snapshot,
  g.attempt_ids,
  g.link_ids,
  l.created_by,
  l.vendedor_id,
  l.team_id,
  g.first_attempt_at,
  g.last_activity_at,
  CASE WHEN g.has_completed THEN g.last_activity_at ELSE NULL END,
  CASE WHEN g.has_completed THEN g.last_activity_at ELSE NULL END,
  CASE WHEN g.has_completed THEN 'completed_before_link_pendencias' ELSE NULL END
FROM groups g
JOIN latest l
  ON l.cpf_hash = g.cpf_hash
 AND l.empresa_codigo = g.empresa_codigo
 AND l.operation_type = g.operation_type
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN public.cadastro_links.requires_authorization IS
  'Quando true, o fluxo publico termina em Link Pendencias e somente a operacao interna autorizada pode enviar ao ERP.';
COMMENT ON TABLE public.link_pendencias IS
  'Jornada consolidada do fluxo Link por CPF, empresa e tipo de operacao. Tentativas tecnicas permanecem auditaveis em public_adesao_attempts.';
COMMENT ON TABLE public.link_pendencia_files IS
  'Arquivos acumulativos da analise interna. Novos anexos nao substituem nem removem versoes anteriores.';
COMMENT ON COLUMN public.public_adesao_attempts.completion_kind IS
  'Resultado da tentativa: pending_review, adhesion_completed ou dependent_completed.';

COMMIT;
