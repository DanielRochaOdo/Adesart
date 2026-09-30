/*
  Correcoes definitivas do worker de upload ERP apos auditoria de producao.

  Corrige:
  - next_attempt_at NOT NULL impedindo a quinta falha;
  - lease sem token, permitindo worker antigo sobrescrever processamento novo;
  - processing antigo preso;
  - backlog com arquivo existente sem nova tentativa;
  - itens sem arquivo sendo reprocessados indefinidamente;
  - timeout curto do pg_net;
  - operacoes manuais sem limpar o lease.
*/

ALTER TABLE public.erp_upload_queue
  ALTER COLUMN next_attempt_at DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS processing_token uuid,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_erp_upload_queue_processing_token
  ON public.erp_upload_queue(processing_token)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_erp_upload_queue_processing_started_at
  ON public.erp_upload_queue(processing_started_at)
  WHERE status = 'processing';

-- Arquivo ausente nao e recuperavel por retry. Nao deixar queued/retry/processing eternamente.
UPDATE public.erp_upload_queue q
SET
  status = 'failed',
  attempts = GREATEST(q.attempts, 5),
  next_attempt_at = NULL,
  finished_at = now(),
  claimed_at = NULL,
  processing_token = NULL,
  processing_started_at = NULL,
  last_error_code = 'FILE_NOT_FOUND',
  last_status_code = 404,
  last_error = CASE
    WHEN NULLIF(BTRIM(q.last_error), '') IS NULL
      THEN 'Arquivo nao encontrado no Storage durante reconciliacao da fila'
    ELSE q.last_error || ' | Arquivo nao encontrado no Storage durante reconciliacao da fila'
  END,
  worker_source = 'migration-reconcile'
WHERE q.status IN ('queued', 'retry_wait', 'processing')
  AND NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = q.bucket
      AND o.name = q.arquivo_path
  );

-- Entrega primeiro: processing antigo que ainda possui arquivo volta para a fila.
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
    'Recuperado para reenvio apos processamento travado'
  ),
  worker_source = 'migration-reconcile'
WHERE q.status = 'processing'
  AND coalesce(q.processing_started_at, q.claimed_at, q.last_attempt_at, q.updated_at, q.created_at)
      < now() - interval '10 minutes'
  AND EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = q.bucket
      AND o.name = q.arquivo_path
  );

-- Entrega primeiro: falha historica com arquivo preservado recebe nova tentativa.
UPDATE public.erp_upload_queue q
SET
  status = 'queued',
  attempts = 0,
  next_attempt_at = now(),
  claimed_at = NULL,
  finished_at = NULL,
  processing_token = NULL,
  processing_started_at = NULL,
  last_error = concat_ws(
    ' | ',
    nullif(q.last_error, ''),
    'Reaberto automaticamente apos correcao do worker'
  ),
  worker_source = 'migration-reconcile'
WHERE q.status = 'failed'
  AND EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = q.bucket
      AND o.name = q.arquivo_path
  );

CREATE OR REPLACE FUNCTION public.claim_erp_upload_queue_v4(
  p_limit integer DEFAULT 20
)
RETURNS SETOF public.erp_upload_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recupera lease vencido. Duplicidade e aceitavel; documento nao entregue nao e.
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
      'Lease expirado; item devolvido para a fila'
    )
  WHERE q.status = 'processing'
    AND coalesce(q.processing_started_at, q.claimed_at, q.last_attempt_at, q.updated_at, q.created_at)
        < now() - interval '10 minutes';

  RETURN QUERY
  WITH candidates AS (
    SELECT q.id
    FROM public.erp_upload_queue q
    WHERE q.status IN ('queued', 'retry_wait')
      AND q.attempts < 5
      AND coalesce(q.next_attempt_at, now()) <= now()
    ORDER BY q.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 20), 50))
  ),
  claimed AS (
    UPDATE public.erp_upload_queue q
    SET
      status = 'processing',
      processing_token = gen_random_uuid(),
      processing_started_at = now(),
      claimed_at = now(),
      last_attempt_at = now(),
      worker_source = coalesce(q.worker_source, 'worker')
    FROM candidates c
    WHERE q.id = c.id
    RETURNING q.*
  )
  SELECT * FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_erp_upload_queue_v4(integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_erp_upload_queue_v4(integer) TO service_role;

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
     AND coalesce(v_role, '') <> 'ADMINISTRADOR' THEN
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

REVOKE ALL ON FUNCTION public.reset_stuck_queue_items_v3(integer)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_stuck_queue_items_v3(integer)
TO authenticated, service_role;

-- Compatibilidade com Web/Android ja publicados.
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

REVOKE ALL ON FUNCTION public.reset_stuck_queue_items_v2(integer)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_stuck_queue_items_v2(integer)
TO authenticated, service_role;

-- Health existente passa a usar o lease forte e expor arquivos ausentes.
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
    'failed', count(*) FILTER (WHERE q.status = 'failed'),
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
    'oldest_pending_at', min(q.created_at) FILTER (
      WHERE q.status IN ('queued', 'processing', 'retry_wait')
    ),
    'last_success_at', max(q.finished_at) FILTER (WHERE q.status = 'success'),
    'last_failure_at', max(q.last_attempt_at) FILTER (WHERE q.status = 'failed')
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

-- Mantem o nome usado por Web/Android, agora limpando tambem o lease forte.
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

  IF coalesce(v_role, '') <> 'ADMINISTRADOR' THEN
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

REVOKE ALL ON FUNCTION public.requeue_erp_upload_v1(uuid, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.requeue_erp_upload_v1(uuid, text)
TO authenticated;

CREATE OR REPLACE FUNCTION public.process_erp_upload_queue_v4()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token text;
  v_request_id bigint;
BEGIN
  SELECT token
  INTO v_token
  FROM public.erp_upload_queue_worker_secret
  WHERE singleton = true;

  IF v_token IS NULL OR length(v_token) < 32 THEN
    INSERT INTO public.erp_upload_queue_cron_log(status, details)
    VALUES ('error', 'Worker token interno ausente');
    RETURN;
  END IF;

  SELECT net.http_post(
    url := 'https://plonbokgcxwsdqfyjkwl.supabase.co/functions/v1/erp-process-upload-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Queue-Worker-Token', v_token
    ),
    body := jsonb_build_object(
      'source', 'cron',
      'limit', 20
    ),
    timeout_milliseconds := 600000
  )
  INTO v_request_id;

  INSERT INTO public.erp_upload_queue_cron_log(status, details)
  VALUES ('dispatched', 'v4 request_id=' || coalesce(v_request_id::text, 'null'));
EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO public.erp_upload_queue_cron_log(status, details)
    VALUES ('error', 'v4 ' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.process_erp_upload_queue_v4()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_erp_upload_queue_v4()
TO service_role;

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  FOR v_jobid IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'process-erp-upload-queue',
      'process-erp-upload-queue-v3',
      'process-erp-upload-queue-v4',
      'reset-stuck-queue-items'
    )
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;

  PERFORM cron.schedule(
    'process-erp-upload-queue-v4',
    '* * * * *',
    'SELECT public.process_erp_upload_queue_v4();'
  );
END;
$$;

COMMENT ON FUNCTION public.claim_erp_upload_queue_v4(integer)
IS 'Claim atomico da fila ERP com token de processamento e lease de 10 minutos.';

COMMENT ON FUNCTION public.reset_stuck_queue_items_v3(integer)
IS 'Libera processing com lease vencido sem depender de contexto de usuario quando chamado via service role.';
