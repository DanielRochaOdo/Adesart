-- Permissoes operacionais da funcao CADASTRO.
-- A funcao Cadastro pode consultar e operar a Fila de Upload ERP,
-- sem receber acesso aos demais modulos de Configuracoes.

BEGIN;

DROP POLICY IF EXISTS "Cadastro pode visualizar fila de upload ERP"
  ON public.erp_upload_queue;

CREATE POLICY "Cadastro pode visualizar fila de upload ERP"
ON public.erp_upload_queue
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND p.role = 'CADASTRO'
  )
);

DROP POLICY IF EXISTS "Cadastro consulta eventos da fila ERP"
  ON public.erp_upload_queue_events;

CREATE POLICY "Cadastro consulta eventos da fila ERP"
ON public.erp_upload_queue_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND p.role = 'CADASTRO'
  )
);

CREATE OR REPLACE FUNCTION public.reset_stuck_queue_items_v3(
  stuck_threshold_minutes integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_reset_count integer;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF coalesce(auth.role(), '') <> 'service_role'
     AND coalesce(v_role, '') NOT IN ('ADMINISTRADOR', 'CADASTRO') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  WITH reset_items AS (
    UPDATE public.erp_upload_queue q
    SET
      status = 'queued',
      next_attempt_at = now(),
      claimed_at = NULL,
      processing_token = NULL,
      processing_started_at = NULL,
      last_error = concat_ws(
        ' | ',
        nullif(q.last_error, ''),
        'Liberado apos lease expirado'
      )
    WHERE q.status = 'processing'
      AND coalesce(q.processing_started_at, q.claimed_at, q.last_attempt_at, q.updated_at, q.created_at)
          < now() - make_interval(mins => greatest(1, coalesce(stuck_threshold_minutes, 10)))
    RETURNING q.id
  )
  SELECT count(*)::integer
  INTO v_reset_count
  FROM reset_items;

  RETURN jsonb_build_object('reset_count', coalesce(v_reset_count, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_stuck_queue_items_v2(
  stuck_threshold_minutes integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $sql$
  SELECT public.reset_stuck_queue_items_v3(stuck_threshold_minutes);
$sql$;

CREATE OR REPLACE FUNCTION public.requeue_erp_upload_v1(
  p_id uuid DEFAULT NULL,
  p_scope text DEFAULT 'item'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_count integer := 0;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF coalesce(v_role, '') NOT IN ('ADMINISTRADOR', 'CADASTRO') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_scope = 'item' THEN
    IF p_id IS NULL THEN
      RAISE EXCEPTION 'p_id obrigatorio para reprocessamento individual';
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
      last_error = NULL,
      last_error_code = NULL,
      last_status_code = NULL,
      manual_reprocess_count = manual_reprocess_count + 1,
      worker_source = 'manual'
    WHERE id = p_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_scope = 'failed' THEN
    UPDATE public.erp_upload_queue q
    SET
      status = 'queued',
      attempts = 0,
      next_attempt_at = now(),
      claimed_at = NULL,
      processing_token = NULL,
      processing_started_at = NULL,
      finished_at = NULL,
      last_error = NULL,
      last_error_code = NULL,
      last_status_code = NULL,
      manual_reprocess_count = manual_reprocess_count + 1,
      worker_source = 'manual'
    WHERE q.status = 'failed'
      AND EXISTS (
        SELECT 1
        FROM storage.objects o
        WHERE o.bucket_id = q.bucket
          AND o.name = q.arquivo_path
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'Escopo invalido';
  END IF;

  RETURN jsonb_build_object('requeued', v_count, 'scope', p_scope);
END;
$$;

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
     AND coalesce(v_role, '') NOT IN ('ADMINISTRADOR', 'CADASTRO') THEN
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
     AND coalesce(v_role, '') NOT IN ('ADMINISTRADOR', 'CADASTRO') THEN
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
      count(*) FILTER (WHERE error_category = 'PRIMARY_DEPENDENT_NOT_FOUND')::integer AS primary_dependent_not_found,
      count(*) FILTER (WHERE error_category = 'ERP_FUNCIONARIO_ID_NOT_FOUND')::integer AS erp_funcionario_id_not_found,
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
      'primary_dependent_not_found', t.primary_dependent_not_found,
      'erp_funcionario_id_not_found', t.erp_funcionario_id_not_found,
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
            'FILE_NOT_FOUND', 'LEGACY_UNCLASSIFIED', 'EMPTY_FILE'
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

  IF coalesce(v_role, '') NOT IN ('ADMINISTRADOR', 'CADASTRO') THEN
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

  IF coalesce(v_role, '') NOT IN ('ADMINISTRADOR', 'CADASTRO') THEN
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

-- Mantem as ACLs explicitas para clientes autenticados.
GRANT EXECUTE ON FUNCTION public.reset_stuck_queue_items_v2(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.requeue_erp_upload_v1(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_upload_queue_health_v1() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_erp_upload_errors_v1(
  text, text, text, text, timestamptz, timestamptz, integer, integer
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_erp_upload_failures_v1(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repair_erp_upload_queue_v1(
  uuid, text, text, text, bigint, integer, text, text
) TO authenticated;

COMMIT;
