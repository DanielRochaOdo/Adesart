-- Adiciona vendedor e adesionista em todas as visoes da Central de Erros
-- da Fila de Upload ERP, incluindo atuais, historicos, resolvidos e filtros por card.
BEGIN;

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
     AND coalesce(v_role, '') NOT IN ('ADMINISTRADOR', 'CADASTRO', 'GERENTE') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF v_scope NOT IN ('current', 'historical', 'resolved', 'all') THEN
    RAISE EXCEPTION 'Escopo invalido';
  END IF;

  WITH base AS (
    SELECT
      q.*,
      c.vendedor_nome,
      c.adesionista_nome,
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
    LEFT JOIN public.cadastros c
      ON c.id = q.cadastro_id
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
          'vendedor_nome', i.vendedor_nome,
          'adesionista_nome', i.adesionista_nome,
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

COMMIT;
