-- Disparo recorrente do worker de contratos. O submit tambem dispara o worker imediatamente;
-- este cron existe para retries e recuperacao de falhas posteriores.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION process_contract_delivery_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_supabase_url text;
  v_service_role_key text;
  v_request_id bigint;
BEGIN
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_role_key := current_setting('app.settings.service_role_key', true);

  IF coalesce(v_supabase_url, '') = '' OR coalesce(v_service_role_key, '') = '' THEN
    RAISE WARNING 'Contract delivery cron skipped: app.settings.supabase_url/service_role_key not configured.';
    RETURN;
  END IF;

  SELECT INTO v_request_id net.http_post(
    url := rtrim(v_supabase_url, '/') || '/functions/v1/process-contract-deliveries',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := '{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds := 120000
  );

  RAISE NOTICE 'Contract delivery worker triggered. Request ID: %', v_request_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error triggering contract delivery worker: %', SQLERRM;
END;
$$;

SELECT cron.unschedule('process-contract-delivery-queue')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-contract-delivery-queue');

SELECT cron.schedule(
  'process-contract-delivery-queue',
  '*/2 * * * *',
  $$SELECT process_contract_delivery_queue();$$
);
