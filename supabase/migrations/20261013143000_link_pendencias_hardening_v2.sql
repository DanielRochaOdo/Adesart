-- Hardening da operacao Link Pendencias apos auditoria ponta a ponta.
-- Corrige identidade da jornada, reconstroi backfill seguro, restringe retratativa
-- de erro ERP e adiciona auditoria/imutabilidade para dados estruturais.

BEGIN;

-- Uma jornada aberta pertence ao mesmo LINK + CPF + empresa + tipo de operacao.
-- Regenerar o token preserva link_id; outro link da mesma empresa nao pode ser
-- fundido na mesma jornada.
DROP INDEX IF EXISTS public.link_pendencias_open_identity_uq;
CREATE UNIQUE INDEX link_pendencias_open_identity_uq
  ON public.link_pendencias(link_id, cpf_hash, empresa_codigo, operation_type)
  WHERE status IN ('aguardando_analise', 'pronto_erp', 'enviando', 'erro_envio');

-- Acesso normal: qualquer perfil ativo. Tratativa/reprocessamento de erro ERP:
-- mesma regra ja usada pelo centro de erros/Fila ERP.
CREATE OR REPLACE FUNCTION public.can_reprocess_link_pendencia_error_v1()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $link_pending_error_access$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND p.role IN ('ADMINISTRADOR', 'CADASTRO', 'GERENTE')
  );
$link_pending_error_access$;

REVOKE ALL ON FUNCTION public.can_reprocess_link_pendencia_error_v1()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_reprocess_link_pendencia_error_v1()
TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated update permitted link pendencias"
ON public.link_pendencias;

CREATE POLICY "Authenticated update permitted link pendencias"
ON public.link_pendencias
FOR UPDATE
TO authenticated
USING (
  public.can_access_link_pendencia_v1(created_by, vendedor_id, team_id)
  AND (
    status <> 'erro_envio'
    OR public.can_reprocess_link_pendencia_error_v1()
  )
)
WITH CHECK (
  public.can_access_link_pendencia_v1(created_by, vendedor_id, team_id)
);

-- Preserva o snapshot publico em link_pendencias.latest_snapshot e registra
-- todas as alteracoes internas campo a campo no cadastro promovido.
CREATE TABLE IF NOT EXISTS public.link_pendencia_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_pendencia_id uuid NOT NULL REFERENCES public.link_pendencias(id) ON DELETE CASCADE,
  cadastro_id uuid NOT NULL REFERENCES public.cadastros(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS link_pendencia_audit_pending_idx
  ON public.link_pendencia_audit(link_pendencia_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS link_pendencia_audit_cadastro_idx
  ON public.link_pendencia_audit(cadastro_id, changed_at DESC);

ALTER TABLE public.link_pendencia_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read link pending audit"
ON public.link_pendencia_audit;

CREATE POLICY "Authenticated read link pending audit"
ON public.link_pendencia_audit
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.link_pendencias p
    WHERE p.id = link_pendencia_audit.link_pendencia_id
      AND public.can_access_link_pendencia_v1(p.created_by, p.vendedor_id, p.team_id)
  )
);

GRANT SELECT ON public.link_pendencia_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_link_pendencia_cadastro_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $audit_link_pending$
DECLARE
  v_pending_id uuid;
  v_old jsonb;
  v_new jsonb;
  v_key text;
BEGIN
  v_pending_id := COALESCE(NEW.link_pendencia_id, OLD.link_pendencia_id);
  IF v_pending_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  FOR v_key IN
    SELECT jsonb_object_keys(v_new)
  LOOP
    IF v_key IN ('updated_at') THEN
      CONTINUE;
    END IF;

    IF (v_old -> v_key) IS DISTINCT FROM (v_new -> v_key) THEN
      INSERT INTO public.link_pendencia_audit (
        link_pendencia_id,
        cadastro_id,
        field_name,
        old_value,
        new_value,
        actor_id
      )
      VALUES (
        v_pending_id,
        NEW.id,
        v_key,
        v_old -> v_key,
        v_new -> v_key,
        auth.uid()
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$audit_link_pending$;

DROP TRIGGER IF EXISTS audit_link_pendencia_cadastro
ON public.cadastros;

CREATE TRIGGER audit_link_pendencia_cadastro
AFTER UPDATE ON public.cadastros
FOR EACH ROW
WHEN (
  OLD.link_pendencia_id IS NOT NULL
  OR NEW.link_pendencia_id IS NOT NULL
)
EXECUTE FUNCTION public.audit_link_pendencia_cadastro_v1();

-- Campos que definem identidade/origem da solicitacao nao podem ser trocados
-- durante a analise interna. Dados cadastrais nao estruturais continuam editaveis
-- e sao auditados pelo trigger acima.
CREATE OR REPLACE FUNCTION public.protect_link_pendencia_identity_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $protect_link_pending$
BEGIN
  IF OLD.link_pendencia_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.link_pendencia_id IS DISTINCT FROM OLD.link_pendencia_id
     OR NEW.tipo_cadastro IS DISTINCT FROM OLD.tipo_cadastro
     OR NEW.cpf IS DISTINCT FROM OLD.cpf
     OR NEW.responsavel_financeiro_codigo IS DISTINCT FROM OLD.responsavel_financeiro_codigo
     OR NEW.responsavel_financeiro_cpf IS DISTINCT FROM OLD.responsavel_financeiro_cpf
     OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
     OR NEW.empresa_codigo IS DISTINCT FROM OLD.empresa_codigo
     OR NEW.empresa_nome IS DISTINCT FROM OLD.empresa_nome
     OR NEW.empresa_cnpj IS DISTINCT FROM OLD.empresa_cnpj
     OR NEW.empresa_exige_matricula IS DISTINCT FROM OLD.empresa_exige_matricula
     OR NEW.empresa_raw IS DISTINCT FROM OLD.empresa_raw
     OR NEW.planos_raw IS DISTINCT FROM OLD.planos_raw
     OR NEW.origem_link_id IS DISTINCT FROM OLD.origem_link_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.team_id IS DISTINCT FROM OLD.team_id
     OR NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id
     OR NEW.vendedor_codigo IS DISTINCT FROM OLD.vendedor_codigo
     OR NEW.vendedor_nome IS DISTINCT FROM OLD.vendedor_nome
     OR NEW.adesionista_id IS DISTINCT FROM OLD.adesionista_id
     OR NEW.adesionista_codigo IS DISTINCT FROM OLD.adesionista_codigo
     OR NEW.adesionista_nome IS DISTINCT FROM OLD.adesionista_nome
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Campos de identidade/origem da solicitacao por link nao podem ser alterados.';
  END IF;

  RETURN NEW;
END;
$protect_link_pending$;

DROP TRIGGER IF EXISTS protect_link_pendencia_identity
ON public.cadastros;

CREATE TRIGGER protect_link_pendencia_identity
BEFORE UPDATE ON public.cadastros
FOR EACH ROW
WHEN (OLD.link_pendencia_id IS NOT NULL)
EXECUTE FUNCTION public.protect_link_pendencia_identity_v1();

-- Reconstroi apenas jornadas que ainda nao foram promovidas nem receberam
-- anexos. Isso corrige o backfill v1 sem tocar em uma tratativa interna ja iniciada.
WITH rebuildable AS (
  SELECT p.id
  FROM public.link_pendencias p
  WHERE p.cadastro_id IS NULL
    AND p.promoted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.link_pendencia_files f
      WHERE f.link_pendencia_id = p.id
    )
)
UPDATE public.public_adesao_attempts a
SET link_pendencia_id = NULL
WHERE a.link_pendencia_id IN (SELECT id FROM rebuildable);

WITH rebuildable AS (
  SELECT p.id
  FROM public.link_pendencias p
  WHERE p.cadastro_id IS NULL
    AND p.promoted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.link_pendencia_files f
      WHERE f.link_pendencia_id = p.id
    )
)
DELETE FROM public.link_pendencias p
WHERE p.id IN (SELECT id FROM rebuildable);

-- Jornada historica:
--  * retries permanecem juntos enquanto a operacao nao foi efetivamente resolvida;
--  * pending_review NAO fecha a jornada;
--  * uma conclusao real fecha a jornada, permitindo uma nova operacao legitima depois.
WITH meaningful AS (
  SELECT
    a.*,
    l.requires_authorization,
    l.created_by,
    l.vendedor_id,
    l.team_id,
    CASE
      WHEN a.flow_mode = 'existing_member'
       AND coalesce(a.erp_member_snapshot ->> 'codigoEmpresa', '') ~ '^[0-9]+$'
       AND (a.erp_member_snapshot ->> 'codigoEmpresa')::integer > 0
        THEN (a.erp_member_snapshot ->> 'codigoEmpresa')::integer
      ELSE l.empresa_codigo
    END AS empresa_codigo,
    CASE
      WHEN a.flow_mode = 'existing_member'
        THEN coalesce(
          nullif(btrim(a.erp_member_snapshot ->> 'empresaNome'), ''),
          l.empresa_nome
        )
      ELSE l.empresa_nome
    END AS empresa_nome,
    CASE
      WHEN a.flow_mode = 'existing_member' THEN 'existing_member'
      ELSE 'new_member'
    END AS operation_type,
    (
      a.status = 'completed'
      AND coalesce(a.completion_kind, '') <> 'pending_review'
    ) AS resolves_journey
  FROM public.public_adesao_attempts a
  JOIN public.cadastro_links l ON l.id = a.link_id
  WHERE a.link_pendencia_id IS NULL
    AND a.flow_mode IN ('new_member', 'existing_member')
    AND a.profile_snapshot IS NOT NULL
    AND (
      a.authenticated_at IS NOT NULL
      OR a.lemmit_checked_at IS NOT NULL
      OR a.erp_member_snapshot IS NOT NULL
      OR a.status = 'completed'
    )
),
numbered AS (
  SELECT
    m.*,
    coalesce(
      sum(CASE WHEN m.resolves_journey THEN 1 ELSE 0 END) OVER (
        PARTITION BY m.link_id, m.cpf_hash, m.empresa_codigo, m.operation_type
        ORDER BY m.created_at, m.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    )::integer AS journey_no
  FROM meaningful m
),
groups AS (
  SELECT
    link_id,
    cpf_hash,
    empresa_codigo,
    operation_type,
    journey_no,
    min(created_at) AS first_attempt_at,
    max(updated_at) AS last_activity_at,
    bool_or(resolves_journey) AS has_sent,
    bool_or(completion_kind = 'pending_review') AS has_public_finalized,
    max(completed_at) FILTER (WHERE completion_kind = 'pending_review') AS public_completed_at,
    array_agg(id ORDER BY created_at, id) AS attempt_ids
  FROM numbered
  GROUP BY link_id, cpf_hash, empresa_codigo, operation_type, journey_no
),
latest AS (
  SELECT DISTINCT ON (
    n.link_id,
    n.cpf_hash,
    n.empresa_codigo,
    n.operation_type,
    n.journey_no
  )
    n.*
  FROM numbered n
  ORDER BY
    n.link_id,
    n.cpf_hash,
    n.empresa_codigo,
    n.operation_type,
    n.journey_no,
    n.updated_at DESC,
    n.created_at DESC,
    n.id DESC
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
  g.link_id,
  g.attempt_ids[1],
  g.cpf_hash,
  regexp_replace(
    coalesce(
      l.draft_snapshot -> 'cadastro' ->> 'cpf',
      l.draft_snapshot ->> 'cpf',
      l.profile_snapshot ->> 'cpf',
      ''
    ),
    '[^0-9]',
    '',
    'g'
  ),
  nullif(
    btrim(
      coalesce(
        l.draft_snapshot -> 'cadastro' ->> 'nome',
        l.draft_snapshot ->> 'nome',
        l.profile_snapshot ->> 'nome',
        ''
      )
    ),
    ''
  ),
  g.empresa_codigo,
  l.empresa_nome,
  g.operation_type,
  l.requires_authorization,
  CASE WHEN g.has_sent THEN 'enviado' ELSE 'aguardando_analise' END,
  coalesce(
    l.last_stage,
    CASE
      WHEN g.has_sent THEN 'completed'
      WHEN g.has_public_finalized THEN 'public_finalized'
      ELSE 'identified'
    END
  ),
  coalesce(l.draft_snapshot, l.profile_snapshot, '{}'::jsonb),
  l.erp_member_snapshot,
  g.attempt_ids,
  ARRAY[g.link_id]::uuid[],
  l.created_by,
  l.vendedor_id,
  l.team_id,
  g.first_attempt_at,
  g.last_activity_at,
  g.public_completed_at,
  CASE WHEN g.has_sent THEN g.last_activity_at ELSE NULL END,
  CASE WHEN g.has_sent THEN 'completed_before_link_pendencias' ELSE NULL END
FROM groups g
JOIN latest l
  ON l.link_id = g.link_id
 AND l.cpf_hash = g.cpf_hash
 AND l.empresa_codigo = g.empresa_codigo
 AND l.operation_type = g.operation_type
 AND l.journey_no = g.journey_no
WHERE NOT EXISTS (
  SELECT 1
  FROM public.link_pendencias p
  WHERE p.link_id = g.link_id
    AND p.cpf_hash = g.cpf_hash
    AND p.empresa_codigo = g.empresa_codigo
    AND p.operation_type = g.operation_type
    AND p.source_attempt_ids && g.attempt_ids
);

UPDATE public.public_adesao_attempts a
SET
  link_pendencia_id = p.id,
  updated_at = greatest(a.updated_at, p.last_activity_at)
FROM public.link_pendencias p
WHERE a.link_pendencia_id IS NULL
  AND a.id = ANY(p.source_attempt_ids);

COMMENT ON TABLE public.link_pendencia_audit IS
  'Auditoria campo a campo das alteracoes internas em cadastros promovidos a partir de Link Pendencias.';

COMMIT;
