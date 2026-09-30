-- ERP Upload Error Center v1
-- Centraliza classificacao, reconciliacao, reparo e observabilidade das falhas de anexo.
-- Marco operacional: worker v4 estabilizado em 30/09/2026 16:08 America/Fortaleza.

BEGIN;

ALTER TABLE public.erp_upload_queue
  ADD COLUMN IF NOT EXISTS is_legacy_failure boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS error_resolution text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by_queue_id uuid,
  ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS replacement_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_dependente_cpf text,
  ADD COLUMN IF NOT EXISTS target_dependente_nome text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'erp_upload_queue_resolved_by_queue_id_fkey'
      AND conrelid = 'public.erp_upload_queue'::regclass
  ) THEN
    ALTER TABLE public.erp_upload_queue
      ADD CONSTRAINT erp_upload_queue_resolved_by_queue_id_fkey
      FOREIGN KEY (resolved_by_queue_id)
      REFERENCES public.erp_upload_queue(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

-- Congela o passivo anterior ao worker v4 como historico.
UPDATE public.erp_upload_queue
SET is_legacy_failure = true
WHERE status = 'failed'
  AND created_at < '2026-09-30 19:08:00+00'::timestamptz
  AND is_legacy_failure = false;

CREATE INDEX IF NOT EXISTS idx_erp_upload_queue_active_failures
  ON public.erp_upload_queue(created_at DESC)
  WHERE status = 'failed'
    AND resolved_at IS NULL
    AND is_legacy_failure = false;

CREATE INDEX IF NOT EXISTS idx_erp_upload_queue_historical_failures
  ON public.erp_upload_queue(created_at DESC)
  WHERE status = 'failed'
    AND resolved_at IS NULL
    AND is_legacy_failure = true;

CREATE INDEX IF NOT EXISTS idx_erp_upload_queue_resolution
  ON public.erp_upload_queue(resolved_at DESC)
  WHERE resolved_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.erp_upload_queue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.erp_upload_queue(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  previous_status text,
  new_status text,
  source text,
  error_code text,
  status_code integer,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_upload_queue_events_queue
  ON public.erp_upload_queue_events(queue_id, created_at DESC);

ALTER TABLE public.erp_upload_queue_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Administradores consultam eventos da fila ERP"
  ON public.erp_upload_queue_events;

CREATE POLICY "Administradores consultam eventos da fila ERP"
ON public.erp_upload_queue_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'ADMINISTRADOR'
  )
);

REVOKE ALL ON public.erp_upload_queue_events FROM PUBLIC, anon;
GRANT SELECT ON public.erp_upload_queue_events TO authenticated;
GRANT ALL ON public.erp_upload_queue_events TO service_role;

CREATE OR REPLACE FUNCTION public.erp_upload_error_category_v1(
  p_error_code text,
  p_status_code integer,
  p_error text,
  p_file_size_bytes bigint
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $sql$
  SELECT CASE
    WHEN p_error_code = 'FILE_TOO_LARGE'
      OR coalesce(p_file_size_bytes, 0) > 5 * 1024 * 1024
      THEN 'FILE_TOO_LARGE'
    WHEN p_error_code = 'FILE_NOT_FOUND'
      OR (
        p_status_code = 404
        AND (
          p_error_code IS NULL
          OR p_error_code = ''
          OR lower(coalesce(p_error, '')) LIKE '%arquivo nao encontrado%'
          OR lower(coalesce(p_error, '')) LIKE '%erro ao baixar arquivo%'
        )
      )
      THEN 'FILE_NOT_FOUND'
    WHEN p_error_code = 'EMPTY_FILE'
      THEN 'EMPTY_FILE'
    WHEN p_error_code = 'ERP_REJECTED'
      AND (
        lower(coalesce(p_error, '')) LIKE '%being used by another process%'
        OR lower(coalesce(p_error, '')) LIKE '%used by another process%'
        OR lower(coalesce(p_error, '')) LIKE '%sendo usado por outro processo%'
        OR lower(coalesce(p_error, '')) LIKE '%em uso por outro processo%'
      )
      THEN 'ERP_FILE_LOCKED'
    WHEN p_error_code = 'ERP_REJECTED'
      THEN 'ERP_REJECTED'
    WHEN p_status_code = 429
      THEN 'ERP_RATE_LIMIT'
    WHEN p_error_code = 'ERP_NETWORK'
      OR p_status_code IN (408, 425)
      THEN 'ERP_NETWORK'
    WHEN p_error_code = 'ERP_HTTP'
      AND coalesce(p_status_code, 0) >= 500
      THEN 'ERP_SERVER_ERROR'
    WHEN p_error_code = 'ERP_INVALID_RESPONSE'
      THEN 'ERP_INVALID_RESPONSE'
    WHEN p_error_code = 'ERP_CONFIG'
      THEN 'ERP_CONFIG'
    WHEN p_error_code IN ('QUEUE_STATE_UPDATE', 'CLAIM_LOST', 'WORKER_ERROR', 'MISSING_PROCESSING_TOKEN')
      THEN 'QUEUE_INTERNAL'
    ELSE 'LEGACY_UNCLASSIFIED'
  END;
$sql$;

CREATE OR REPLACE FUNCTION public.log_erp_upload_queue_event_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $plpgsql$
DECLARE
  v_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'CREATED';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event := 'STATUS_CHANGED';
  ELSIF NEW.arquivo_path IS DISTINCT FROM OLD.arquivo_path
     OR NEW.replacement_count IS DISTINCT FROM OLD.replacement_count THEN
    v_event := 'FILE_REPLACED';
  ELSIF NEW.id_dependente IS DISTINCT FROM OLD.id_dependente
     OR NEW.target_dependente_cpf IS DISTINCT FROM OLD.target_dependente_cpf THEN
    v_event := 'TARGET_DEPENDENT_CHANGED';
  ELSIF NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
     OR NEW.error_resolution IS DISTINCT FROM OLD.error_resolution THEN
    v_event := 'RESOLUTION_CHANGED';
  ELSIF NEW.last_error_code IS DISTINCT FROM OLD.last_error_code
     OR NEW.last_error IS DISTINCT FROM OLD.last_error THEN
    v_event := 'ERROR_CHANGED';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.erp_upload_queue_events (
    queue_id,
    event_type,
    previous_status,
    new_status,
    source,
    error_code,
    status_code,
    details,
    created_by
  )
  VALUES (
    NEW.id,
    v_event,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
    NEW.status,
    NEW.worker_source,
    NEW.last_error_code,
    NEW.last_status_code,
    jsonb_strip_nulls(jsonb_build_object(
      'arquivo_nome', NEW.arquivo_nome,
      'arquivo_path', NEW.arquivo_path,
      'file_size_bytes', NEW.file_size_bytes,
      'id_dependente', NEW.id_dependente,
      'target_dependente_cpf', NEW.target_dependente_cpf,
      'target_dependente_nome', NEW.target_dependente_nome,
      'resolution', NEW.error_resolution,
      'resolved_by_queue_id', NEW.resolved_by_queue_id,
      'replacement_count', NEW.replacement_count
    )),
    auth.uid()
  );

  RETURN NEW;
END;
$plpgsql$;

DROP TRIGGER IF EXISTS trg_erp_upload_queue_event_v1
  ON public.erp_upload_queue;

CREATE TRIGGER trg_erp_upload_queue_event_v1
AFTER INSERT OR UPDATE OF
  status,
  arquivo_path,
  replacement_count,
  id_dependente,
  target_dependente_cpf,
  target_dependente_nome,
  resolved_at,
  error_resolution,
  resolved_by_queue_id,
  last_error_code,
  last_error
ON public.erp_upload_queue
FOR EACH ROW
EXECUTE FUNCTION public.log_erp_upload_queue_event_v1();

CREATE OR REPLACE FUNCTION public.get_erp_upload_queue_health_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $plpgsql$
DECLARE
  v_role text;
  v_result jsonb;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF coalesce(auth.role(), '') <> 'service_role'
     AND coalesce(v_role, '') <> 'ADMINISTRADOR' THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT jsonb_build_object(
    'total', count(*),
    'queued', count(*) FILTER (WHERE q.status = 'queued'),
    'processing', count(*) FILTER (WHERE q.status = 'processing'),
    'retry_wait', count(*) FILTER (WHERE q.status = 'retry_wait'),
    'success', count(*) FILTER (WHERE q.status = 'success'),
    'failed', count(*) FILTER (WHERE q.status = 'failed' AND q.resolved_at IS NULL),
    'active_failures', count(*) FILTER (
      WHERE q.status = 'failed'
        AND q.resolved_at IS NULL
        AND q.is_legacy_failure = false
    ),
    'historical_failures', count(*) FILTER (
      WHERE q.status = 'failed'
        AND q.resolved_at IS NULL
        AND q.is_legacy_failure = true
    ),
    'resolved_failures', count(*) FILTER (WHERE q.resolved_at IS NOT NULL),
    'claimable', count(*) FILTER (
      WHERE q.status IN ('queued', 'retry_wait')
        AND q.attempts < 5
        AND coalesce(q.next_attempt_at, now()) <= now()
    ),
    'stuck', count(*) FILTER (
      WHERE q.status = 'processing'
        AND coalesce(q.processing_started_at, q.claimed_at, q.last_attempt_at, q.updated_at, q.created_at)
          < now() - interval '10 minutes'
    ),
    'missing_file_pending', count(*) FILTER (
      WHERE q.status IN ('queued', 'processing', 'retry_wait')
        AND NOT EXISTS (
          SELECT 1
          FROM storage.objects o
          WHERE o.bucket_id = q.bucket
            AND o.name = q.arquivo_path
        )
    ),
    'active_missing_file_failures', count(*) FILTER (
      WHERE q.status = 'failed'
        AND q.resolved_at IS NULL
        AND q.is_legacy_failure = false
        AND public.erp_upload_error_category_v1(
          q.last_error_code, q.last_status_code, q.last_error, q.file_size_bytes
        ) = 'FILE_NOT_FOUND'
    ),
    'oldest_pending_at', min(q.created_at) FILTER (
      WHERE q.status IN ('queued', 'processing', 'retry_wait')
    ),
    'last_success_at', max(q.finished_at) FILTER (WHERE q.status = 'success'),
    'last_failure_at', max(q.finished_at) FILTER (
      WHERE q.status = 'failed' AND q.resolved_at IS NULL
    )
  )
  INTO v_result
  FROM public.erp_upload_queue q;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$plpgsql$;

REVOKE ALL ON FUNCTION public.get_erp_upload_queue_health_v1()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_erp_upload_queue_health_v1()
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_erp_upload_errors_v1(
  p_scope text DEFAULT 'current',
  p_category text DEFAULT NULL,
  p_cpf text DEFAULT NULL,
  p_empresa text DEFAULT NULL,
  p_data_inicio timestamptz DEFAULT NULL,
  p_data_fim_exclusiva timestamptz DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $plpgsql$
DECLARE
  v_role text;
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_scope text := lower(coalesce(nullif(btrim(p_scope), ''), 'current'));
  v_result jsonb;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF coalesce(auth.role(), '') <> 'service_role'
     AND coalesce(v_role, '') <> 'ADMINISTRADOR' THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF v_scope NOT IN ('current', 'historical', 'resolved', 'all') THEN
    RAISE EXCEPTION 'Escopo invalido';
  END IF;

  WITH base AS (
    SELECT
      q.*,
      public.erp_upload_error_category_v1(
        q.last_error_code,
        q.last_status_code,
        q.last_error,
        q.file_size_bytes
      ) AS error_category,
      EXISTS (
        SELECT 1
        FROM storage.objects o
        WHERE o.bucket_id = q.bucket
          AND o.name = q.arquivo_path
      ) AS file_exists
    FROM public.erp_upload_queue q
    WHERE (
      CASE v_scope
        WHEN 'current' THEN
          q.status = 'failed'
          AND q.resolved_at IS NULL
          AND q.is_legacy_failure = false
        WHEN 'historical' THEN
          q.status = 'failed'
          AND q.resolved_at IS NULL
          AND q.is_legacy_failure = true
        WHEN 'resolved' THEN
          q.resolved_at IS NOT NULL
        ELSE
          q.status = 'failed' OR q.resolved_at IS NOT NULL
      END
    )
      AND (
        p_category IS NULL
        OR btrim(p_category) = ''
        OR public.erp_upload_error_category_v1(
          q.last_error_code,
          q.last_status_code,
          q.last_error,
          q.file_size_bytes
        ) = p_category
      )
      AND (
        p_cpf IS NULL
        OR btrim(p_cpf) = ''
        OR regexp_replace(coalesce(q.cliente_cpf, ''), '\D', '', 'g')
           LIKE '%' || regexp_replace(p_cpf, '\D', '', 'g') || '%'
      )
      AND (
        p_empresa IS NULL
        OR btrim(p_empresa) = ''
        OR q.empresa_nome ILIKE '%' || btrim(p_empresa) || '%'
      )
      AND (p_data_inicio IS NULL OR q.created_at >= p_data_inicio)
      AND (p_data_fim_exclusiva IS NULL OR q.created_at < p_data_fim_exclusiva)
  ),
  totals AS (
    SELECT
      count(*)::integer AS total,
      count(*) FILTER (WHERE error_category = 'FILE_NOT_FOUND')::integer AS file_not_found,
      count(*) FILTER (WHERE error_category = 'FILE_TOO_LARGE')::integer AS file_too_large,
      count(*) FILTER (WHERE error_category = 'EMPTY_FILE')::integer AS empty_file,
      count(*) FILTER (WHERE error_category = 'ERP_FILE_LOCKED')::integer AS erp_file_locked,
      count(*) FILTER (WHERE error_category = 'ERP_REJECTED')::integer AS erp_rejected,
      count(*) FILTER (WHERE error_category = 'ERP_NETWORK')::integer AS erp_network,
      count(*) FILTER (WHERE error_category = 'ERP_RATE_LIMIT')::integer AS erp_rate_limit,
      count(*) FILTER (WHERE error_category = 'ERP_SERVER_ERROR')::integer AS erp_server_error,
      count(*) FILTER (WHERE error_category = 'ERP_INVALID_RESPONSE')::integer AS erp_invalid_response,
      count(*) FILTER (WHERE error_category = 'QUEUE_INTERNAL')::integer AS queue_internal,
      count(*) FILTER (WHERE error_category = 'LEGACY_UNCLASSIFIED')::integer AS legacy_unclassified
    FROM base
  ),
  page_items AS (
    SELECT *
    FROM base
    ORDER BY created_at DESC, id DESC
    LIMIT v_page_size
    OFFSET (v_page - 1) * v_page_size
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'total', t.total,
      'file_not_found', t.file_not_found,
      'file_too_large', t.file_too_large,
      'empty_file', t.empty_file,
      'erp_file_locked', t.erp_file_locked,
      'erp_rejected', t.erp_rejected,
      'erp_network', t.erp_network,
      'erp_rate_limit', t.erp_rate_limit,
      'erp_server_error', t.erp_server_error,
      'erp_invalid_response', t.erp_invalid_response,
      'queue_internal', t.queue_internal,
      'legacy_unclassified', t.legacy_unclassified
    ),
    'pagination', jsonb_build_object(
      'page', v_page,
      'page_size', v_page_size,
      'total', t.total,
      'total_pages', greatest(1, ceil(t.total::numeric / v_page_size)::integer)
    ),
    'items', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'cadastro_id', i.cadastro_id,
          'created_at', i.created_at,
          'finished_at', i.finished_at,
          'last_attempt_at', i.last_attempt_at,
          'status', i.status,
          'attempts', i.attempts,
          'cliente_nome', i.cliente_nome,
          'cliente_cpf', i.cliente_cpf,
          'empresa_nome', i.empresa_nome,
          'arquivo_nome', i.arquivo_nome,
          'arquivo_path', i.arquivo_path,
          'bucket', i.bucket,
          'file_size_bytes', i.file_size_bytes,
          'last_error_code', i.last_error_code,
          'last_status_code', i.last_status_code,
          'last_error', i.last_error,
          'worker_source', i.worker_source,
          'id_funcionario', i.id_funcionario,
          'id_dependente', i.id_dependente,
          'target_dependente_cpf', i.target_dependente_cpf,
          'target_dependente_nome', i.target_dependente_nome,
          'error_category', i.error_category,
          'file_exists', i.file_exists,
          'is_legacy_failure', i.is_legacy_failure,
          'error_resolution', i.error_resolution,
          'resolved_at', i.resolved_at,
          'resolved_by_queue_id', i.resolved_by_queue_id,
          'replacement_count', i.replacement_count,
          'last_reconciled_at', i.last_reconciled_at,
          'can_upload_replacement', i.error_category IN (
            'FILE_NOT_FOUND', 'LEGACY_UNCLASSIFIED', 'ERP_REJECTED', 'ERP_FILE_LOCKED', 'EMPTY_FILE'
          ),
          'can_compress', i.error_category = 'FILE_TOO_LARGE' AND i.file_exists,
          'can_reconcile', i.status = 'failed' AND i.resolved_at IS NULL,
          'can_reprocess', i.file_exists AND i.error_category IN (
            'ERP_NETWORK', 'ERP_RATE_LIMIT', 'ERP_SERVER_ERROR', 'ERP_FILE_LOCKED'
          )
        )
        ORDER BY i.created_at DESC, i.id DESC
      )
      FROM page_items i
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM totals t;

  RETURN coalesce(
    v_result,
    jsonb_build_object(
      'summary', jsonb_build_object('total', 0),
      'pagination', jsonb_build_object('page', v_page, 'page_size', v_page_size, 'total', 0, 'total_pages', 1),
      'items', '[]'::jsonb
    )
  );
END;
$plpgsql$;

REVOKE ALL ON FUNCTION public.search_erp_upload_errors_v1(
  text, text, text, text, timestamptz, timestamptz, integer, integer
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.search_erp_upload_errors_v1(
  text, text, text, text, timestamptz, timestamptz, integer, integer
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reconcile_erp_upload_failures_v1(
  p_id uuid DEFAULT NULL,
  p_scope text DEFAULT 'current'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $plpgsql$
DECLARE
  v_role text;
  v_row record;
  v_success_id uuid;
  v_checked integer := 0;
  v_reconciled integer := 0;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF coalesce(v_role, '') <> 'ADMINISTRADOR' THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  FOR v_row IN
    SELECT q.*
    FROM public.erp_upload_queue q
    WHERE q.status = 'failed'
      AND q.resolved_at IS NULL
      AND (p_id IS NULL OR q.id = p_id)
      AND (
        lower(coalesce(p_scope, 'current')) = 'all'
        OR (
          lower(coalesce(p_scope, 'current')) = 'current'
          AND q.is_legacy_failure = false
        )
        OR (
          lower(coalesce(p_scope, 'current')) = 'historical'
          AND q.is_legacy_failure = true
        )
      )
    ORDER BY q.created_at DESC
  LOOP
    v_checked := v_checked + 1;
    v_success_id := NULL;

    SELECT s.id
    INTO v_success_id
    FROM public.erp_upload_queue s
    WHERE s.id <> v_row.id
      AND s.status = 'success'
      AND s.finished_at >= coalesce(v_row.last_attempt_at, v_row.created_at)
      AND (
        (
          v_row.cadastro_id IS NOT NULL
          AND s.cadastro_id = v_row.cadastro_id
          AND s.id_dependente = v_row.id_dependente
        )
        OR (
          v_row.cadastro_id IS NULL
          AND s.id_funcionario = v_row.id_funcionario
          AND s.id_dependente = v_row.id_dependente
        )
        OR (
          s.bucket = v_row.bucket
          AND s.arquivo_path = v_row.arquivo_path
        )
      )
    ORDER BY s.finished_at DESC
    LIMIT 1;

    IF v_success_id IS NOT NULL THEN
      UPDATE public.erp_upload_queue
      SET
        error_resolution = 'SUCCESS_OTHER_ATTEMPT',
        resolved_at = now(),
        resolved_by_queue_id = v_success_id,
        last_reconciled_at = now()
      WHERE id = v_row.id;
      v_reconciled := v_reconciled + 1;
    ELSE
      UPDATE public.erp_upload_queue
      SET last_reconciled_at = now()
      WHERE id = v_row.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'checked', v_checked,
    'reconciled', v_reconciled
  );
END;
$plpgsql$;

REVOKE ALL ON FUNCTION public.reconcile_erp_upload_failures_v1(uuid, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_erp_upload_failures_v1(uuid, text)
TO authenticated;

CREATE OR REPLACE FUNCTION public.repair_erp_upload_queue_v1(
  p_id uuid,
  p_bucket text,
  p_arquivo_path text,
  p_arquivo_nome text,
  p_file_size_bytes bigint,
  p_target_dependente_id integer DEFAULT NULL,
  p_target_dependente_cpf text DEFAULT NULL,
  p_target_dependente_nome text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $plpgsql$
DECLARE
  v_role text;
  v_current public.erp_upload_queue%ROWTYPE;
  v_actual_size bigint;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF coalesce(v_role, '') <> 'ADMINISTRADOR' THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT *
  INTO v_current
  FROM public.erp_upload_queue
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item da fila nao encontrado';
  END IF;

  IF v_current.status = 'success' THEN
    RAISE EXCEPTION 'Documento ja concluido com sucesso';
  END IF;

  SELECT
    CASE
      WHEN o.metadata ->> 'size' ~ '^[0-9]+$'
        THEN (o.metadata ->> 'size')::bigint
      ELSE NULL
    END
  INTO v_actual_size
  FROM storage.objects o
  WHERE o.bucket_id = p_bucket
    AND o.name = p_arquivo_path
  LIMIT 1;

  IF v_actual_size IS NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM storage.objects o
      WHERE o.bucket_id = p_bucket
        AND o.name = p_arquivo_path
    ) THEN
      RAISE EXCEPTION 'Arquivo de substituicao nao encontrado no Storage';
    END IF;
    v_actual_size := p_file_size_bytes;
  END IF;

  IF coalesce(v_actual_size, p_file_size_bytes, 0) <= 0 THEN
    RAISE EXCEPTION 'Tamanho do arquivo de substituicao invalido';
  END IF;

  IF coalesce(v_actual_size, p_file_size_bytes, 0) > 5 * 1024 * 1024 THEN
    RAISE EXCEPTION 'Arquivo de substituicao excede o limite de 5 MB do ERP';
  END IF;

  UPDATE public.erp_upload_queue
  SET
    status = 'queued',
    attempts = 0,
    next_attempt_at = now(),
    claimed_at = NULL,
    processing_token = NULL,
    processing_started_at = NULL,
    finished_at = NULL,
    last_attempt_at = NULL,
    last_error = NULL,
    last_error_code = NULL,
    last_status_code = NULL,
    erp_response = NULL,
    bucket = p_bucket,
    arquivo_path = p_arquivo_path,
    arquivo_nome = coalesce(nullif(btrim(p_arquivo_nome), ''), p_arquivo_path),
    file_size_bytes = coalesce(v_actual_size, p_file_size_bytes),
    worker_source = 'manual-repair',
    manual_reprocess_count = manual_reprocess_count + 1,
    replacement_count = replacement_count + 1,
    is_legacy_failure = false,
    error_resolution = NULL,
    resolved_at = NULL,
    resolved_by_queue_id = NULL,
    last_reconciled_at = now(),
    id_dependente = coalesce(p_target_dependente_id, id_dependente),
    target_dependente_cpf = coalesce(nullif(regexp_replace(coalesce(p_target_dependente_cpf, ''), '\D', '', 'g'), ''), target_dependente_cpf),
    target_dependente_nome = coalesce(nullif(btrim(p_target_dependente_nome), ''), target_dependente_nome)
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_id,
    'status', 'queued',
    'file_size_bytes', coalesce(v_actual_size, p_file_size_bytes)
  );
END;
$plpgsql$;

REVOKE ALL ON FUNCTION public.repair_erp_upload_queue_v1(
  uuid, text, text, text, bigint, integer, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repair_erp_upload_queue_v1(
  uuid, text, text, text, bigint, integer, text, text
) TO authenticated;

-- Lock global: evita concorrencia cron x cron e cron x processamento manual.
CREATE TABLE IF NOT EXISTS public.erp_upload_worker_lock (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  lease_token uuid,
  lease_until timestamptz,
  acquired_at timestamptz,
  source text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.erp_upload_worker_lock(singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

REVOKE ALL ON public.erp_upload_worker_lock FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.erp_upload_worker_lock TO service_role;

CREATE OR REPLACE FUNCTION public.acquire_erp_upload_worker_lock_v1(
  p_source text DEFAULT 'worker',
  p_lease_seconds integer DEFAULT 600
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $plpgsql$
DECLARE
  v_token uuid := gen_random_uuid();
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE public.erp_upload_worker_lock
  SET
    lease_token = v_token,
    lease_until = now() + make_interval(secs => least(greatest(coalesce(p_lease_seconds, 600), 60), 900)),
    acquired_at = now(),
    source = nullif(btrim(p_source), ''),
    updated_at = now()
  WHERE singleton = true
    AND (
      lease_token IS NULL
      OR lease_until IS NULL
      OR lease_until <= now()
    );

  IF FOUND THEN
    RETURN v_token;
  END IF;

  RETURN NULL;
END;
$plpgsql$;

CREATE OR REPLACE FUNCTION public.release_erp_upload_worker_lock_v1(
  p_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $plpgsql$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE public.erp_upload_worker_lock
  SET
    lease_token = NULL,
    lease_until = NULL,
    acquired_at = NULL,
    source = NULL,
    updated_at = now()
  WHERE singleton = true
    AND lease_token = p_token;

  RETURN FOUND;
END;
$plpgsql$;

REVOKE ALL ON FUNCTION public.acquire_erp_upload_worker_lock_v1(text, integer)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_erp_upload_worker_lock_v1(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_erp_upload_worker_lock_v1(text, integer)
TO service_role;
GRANT EXECUTE ON FUNCTION public.release_erp_upload_worker_lock_v1(uuid)
TO service_role;

COMMIT;
