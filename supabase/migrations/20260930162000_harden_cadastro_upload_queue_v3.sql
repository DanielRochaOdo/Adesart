/*
  Correção estrutural do fluxo de conclusão de adesão e fila de documentos ERP.

  Objetivos:
  - tornar o processamento da fila observável e recuperável;
  - eliminar dependência do service_role em app.settings para o cron;
  - permitir administração segura da fila;
  - impedir que itens fiquem eternamente em queued/processing sem diagnóstico;
  - manter Web e Android consumindo a mesma infraestrutura canônica.
*/

ALTER TABLE public.erp_upload_queue
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_reprocess_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS worker_source text,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS cliente_nome text,
  ADD COLUMN IF NOT EXISTS cliente_cpf text,
  ADD COLUMN IF NOT EXISTS empresa_nome text;

CREATE INDEX IF NOT EXISTS idx_erp_upload_queue_processing_claimed_at
  ON public.erp_upload_queue(status, claimed_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_erp_upload_queue_cadastro_status
  ON public.erp_upload_queue(cadastro_id, status);

UPDATE public.erp_upload_queue q
SET
  cliente_nome = COALESCE(NULLIF(BTRIM(q.cliente_nome), ''), NULLIF(BTRIM(c.nome), '')),
  cliente_cpf = COALESCE(NULLIF(BTRIM(q.cliente_cpf), ''), NULLIF(BTRIM(c.cpf), '')),
  empresa_nome = COALESCE(NULLIF(BTRIM(q.empresa_nome), ''), NULLIF(BTRIM(c.empresa_nome), ''))
FROM public.cadastros c
WHERE q.cadastro_id = c.id
  AND (
    NULLIF(BTRIM(q.cliente_nome), '') IS NULL
    OR NULLIF(BTRIM(q.cliente_cpf), '') IS NULL
    OR NULLIF(BTRIM(q.empresa_nome), '') IS NULL
  );

CREATE TABLE IF NOT EXISTS public.erp_upload_queue_worker_secret (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.erp_upload_queue_worker_secret ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.erp_upload_queue_worker_secret FROM PUBLIC, anon, authenticated;

INSERT INTO public.erp_upload_queue_worker_secret(singleton, token)
VALUES (
  true,
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_erp_upload_queue_v3(
  p_limit integer DEFAULT 20
)
RETURNS SETOF public.erp_upload_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH stale AS (
    UPDATE public.erp_upload_queue
    SET
      status = 'queued',
      next_attempt_at = now(),
      claimed_at = NULL,
      last_error = concat_ws(
        ' | ',
        nullif(last_error, ''),
        'Recuperado automaticamente apos lease expirado'
      )
    WHERE status = 'processing'
      AND coalesce(claimed_at, last_attempt_at, updated_at, created_at)
          < now() - interval '10 minutes'
    RETURNING id
  ),
  candidates AS (
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

REVOKE ALL ON FUNCTION public.claim_erp_upload_queue_v3(integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_erp_upload_queue_v3(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.reset_stuck_queue_items_v2(
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

  IF coalesce(auth.role(), '') <> 'service_role' AND coalesce(v_role, '') <> 'ADMINISTRADOR' THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  WITH reset_items AS (
    UPDATE public.erp_upload_queue
    SET
      status = 'queued',
      next_attempt_at = now(),
      claimed_at = NULL,
      last_error = concat_ws(
        ' | ',
        nullif(last_error, ''),
        'Liberado apos ficar travado em processamento'
      )
    WHERE status = 'processing'
      AND coalesce(claimed_at, last_attempt_at, updated_at, created_at)
          < now() - make_interval(mins => greatest(1, coalesce(stuck_threshold_minutes, 10)))
    RETURNING id
  )
  SELECT count(*)::integer INTO v_reset_count FROM reset_items;

  RETURN jsonb_build_object('reset_count', coalesce(v_reset_count, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.reset_stuck_queue_items_v2(integer)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_stuck_queue_items_v2(integer)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_erp_upload_queue_health_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_result jsonb;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF coalesce(auth.role(), '') <> 'service_role' AND coalesce(v_role, '') <> 'ADMINISTRADOR' THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT jsonb_build_object(
    'total', count(*),
    'queued', count(*) FILTER (WHERE status = 'queued'),
    'processing', count(*) FILTER (WHERE status = 'processing'),
    'retry_wait', count(*) FILTER (WHERE status = 'retry_wait'),
    'success', count(*) FILTER (WHERE status = 'success'),
    'failed', count(*) FILTER (WHERE status = 'failed'),
    'claimable', count(*) FILTER (
      WHERE status IN ('queued', 'retry_wait')
        AND attempts < 5
        AND coalesce(next_attempt_at, now()) <= now()
    ),
    'stuck', count(*) FILTER (
      WHERE status = 'processing'
        AND coalesce(claimed_at, last_attempt_at, updated_at, created_at)
            < now() - interval '10 minutes'
    ),
    'oldest_pending_at', min(created_at) FILTER (
      WHERE status IN ('queued', 'processing', 'retry_wait')
    ),
    'last_success_at', max(finished_at) FILTER (WHERE status = 'success'),
    'last_failure_at', max(last_attempt_at) FILTER (WHERE status = 'failed')
  )
  INTO v_result
  FROM public.erp_upload_queue;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_erp_upload_queue_health_v1()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_erp_upload_queue_health_v1()
TO authenticated, service_role;

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
      finished_at = NULL,
      last_error = NULL,
      last_error_code = NULL,
      last_status_code = NULL,
      manual_reprocess_count = manual_reprocess_count + 1,
      worker_source = 'manual'
    WHERE id = p_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_scope = 'failed' THEN
    UPDATE public.erp_upload_queue
    SET
      status = 'queued',
      attempts = 0,
      next_attempt_at = now(),
      claimed_at = NULL,
      finished_at = NULL,
      last_error = NULL,
      last_error_code = NULL,
      last_status_code = NULL,
      manual_reprocess_count = manual_reprocess_count + 1,
      worker_source = 'manual'
    WHERE status = 'failed';

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

CREATE OR REPLACE FUNCTION public.process_erp_upload_queue_v3()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token text;
  v_request_id bigint;
BEGIN
  SELECT token INTO v_token
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
    body := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 15000
  )
  INTO v_request_id;

  INSERT INTO public.erp_upload_queue_cron_log(status, details)
  VALUES ('dispatched', 'request_id=' || coalesce(v_request_id::text, 'null'));
EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO public.erp_upload_queue_cron_log(status, details)
    VALUES ('error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.process_erp_upload_queue_v3()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_erp_upload_queue_v3()
TO service_role;

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  FOR v_jobid IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN ('process-erp-upload-queue', 'process-erp-upload-queue-v3')
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;

  PERFORM cron.schedule(
    'process-erp-upload-queue-v3',
    '* * * * *',
    'SELECT public.process_erp_upload_queue_v3();'
  );
END;
$$;

COMMENT ON FUNCTION public.get_erp_upload_queue_health_v1()
IS 'Saude operacional canônica da fila ERP para Web e Android.';

COMMENT ON FUNCTION public.requeue_erp_upload_v1(uuid, text)
IS 'Reprocessamento administrativo controlado de item ou de todas as falhas da fila ERP.';
