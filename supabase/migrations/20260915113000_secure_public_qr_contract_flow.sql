-- Fluxo publico seguro por QR, aceite contratual e entregas de contrato

CREATE TABLE IF NOT EXISTS public_adesao_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES cadastro_links(id) ON DELETE CASCADE,
  cpf_hash text NOT NULL,
  attempt_token_hash text NOT NULL UNIQUE,
  ip_hash text,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','authenticated','locked','completed','expired')),
  profile_snapshot jsonb,
  lemmit_checked_at timestamptz,
  failed_birth_attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  authenticated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS public_adesao_attempts_link_cpf_idx
  ON public_adesao_attempts(link_id, cpf_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS public_adesao_attempts_ip_idx
  ON public_adesao_attempts(link_id, ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS public_adesao_attempts_exp_idx
  ON public_adesao_attempts(expires_at);

ALTER TABLE public_adesao_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE cadastro_links
  ADD COLUMN IF NOT EXISTS lemmit_daily_limit integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE TABLE IF NOT EXISTS contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code integer NOT NULL,
  title text NOT NULL,
  body_text text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  content_hash text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_code, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS contract_templates_one_active_per_plan_idx
  ON contract_templates(plan_code)
  WHERE is_active = true AND effective_until IS NULL;

ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage contract templates" ON contract_templates;
CREATE POLICY "Admins manage contract templates"
  ON contract_templates
  FOR ALL
  TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMINISTRADOR')
  WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMINISTRADOR');

CREATE TABLE IF NOT EXISTS public_contract_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public_adesao_attempts(id) ON DELETE CASCADE,
  contract_token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN (
    'prepared','erp_processing','erp_failed','erp_registered','deliveries_pending','completed','needs_attention','superseded'
  )),
  snapshot jsonb NOT NULL,
  contract_text text NOT NULL,
  contract_hash text NOT NULL,
  data_hash text NOT NULL,
  template_ids uuid[] NOT NULL DEFAULT '{}',
  template_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed_email text NOT NULL,
  accepted_terms boolean NOT NULL DEFAULT false,
  accepted_data boolean NOT NULL DEFAULT false,
  accepted_at timestamptz,
  accepted_ip_hash text,
  accepted_user_agent text,
  cadastro_id uuid REFERENCES cadastros(id) ON DELETE SET NULL,
  erp_response jsonb,
  pdf_storage_path text,
  pdf_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS public_contract_sessions_attempt_idx
  ON public_contract_sessions(attempt_id, created_at DESC);
CREATE INDEX IF NOT EXISTS public_contract_sessions_status_idx
  ON public_contract_sessions(status, created_at);

ALTER TABLE public_contract_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS contract_delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_session_id uuid NOT NULL REFERENCES public_contract_sessions(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','erp_document')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','retry','sent','failed')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  processing_token uuid,
  processing_started_at timestamptz,
  sent_at timestamptz,
  last_error text,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contract_session_id, channel)
);

CREATE INDEX IF NOT EXISTS contract_delivery_jobs_claim_idx
  ON contract_delivery_jobs(status, next_attempt_at, created_at);

ALTER TABLE contract_delivery_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view contract delivery jobs" ON contract_delivery_jobs;
CREATE POLICY "Admins view contract delivery jobs"
  ON contract_delivery_jobs FOR SELECT
  TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMINISTRADOR');

DROP POLICY IF EXISTS "Admins view public contract sessions" ON public_contract_sessions;
CREATE POLICY "Admins view public contract sessions"
  ON public_contract_sessions FOR SELECT
  TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMINISTRADOR');

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contracts', 'contracts', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins read contracts" ON storage.objects;
CREATE POLICY "Admins read contracts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'contracts'
    AND auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMINISTRADOR'
  );

CREATE OR REPLACE FUNCTION claim_contract_delivery_jobs(p_limit integer DEFAULT 10)
RETURNS SETOF contract_delivery_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token uuid := gen_random_uuid();
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM contract_delivery_jobs
    WHERE status IN ('pending','retry')
      AND next_attempt_at <= now()
      AND attempts < 5
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 10), 50))
  ), claimed AS (
    UPDATE contract_delivery_jobs j
    SET status = 'processing',
        processing_token = v_token,
        processing_started_at = now(),
        updated_at = now()
    FROM candidates c
    WHERE j.id = c.id
    RETURNING j.*
  )
  SELECT * FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION claim_contract_delivery_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_contract_delivery_jobs(integer) TO service_role;

CREATE OR REPLACE FUNCTION reset_stuck_contract_delivery_jobs(p_minutes integer DEFAULT 15)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE contract_delivery_jobs
  SET status = 'retry',
      next_attempt_at = now(),
      processing_token = null,
      processing_started_at = null,
      last_error = coalesce(last_error, 'Processamento interrompido; item recuperado automaticamente.'),
      updated_at = now()
  WHERE status = 'processing'
    AND processing_started_at < now() - make_interval(mins => greatest(1, p_minutes));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION reset_stuck_contract_delivery_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reset_stuck_contract_delivery_jobs(integer) TO service_role;

COMMENT ON TABLE public_adesao_attempts IS 'Tentativas publicas temporarias do fluxo QR. Nenhuma politica anon permite leitura direta.';
COMMENT ON TABLE contract_templates IS 'Textos contratuais versionados e vinculados ao codigo do plano.';
COMMENT ON TABLE public_contract_sessions IS 'Snapshot imutavel do que foi apresentado e aceito antes do envio ao ERP.';
COMMENT ON TABLE contract_delivery_jobs IS 'Fila duravel e idempotente para email SMTP e upload do mesmo PDF ao ERP.';
