-- Inclusao publica de dependentes para associado ja ativo no fluxo Link.
-- Mantem o fluxo publico isolado dos modulos internos de +Adesao/Incluir Dependente.

ALTER TABLE public_adesao_attempts
  ADD COLUMN IF NOT EXISTS flow_mode text NOT NULL DEFAULT 'new_member',
  ADD COLUMN IF NOT EXISTS erp_member_snapshot jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'public_adesao_attempts_flow_mode_check'
  ) THEN
    ALTER TABLE public_adesao_attempts
      ADD CONSTRAINT public_adesao_attempts_flow_mode_check
      CHECK (flow_mode IN ('new_member', 'existing_member', 'existing_dependent'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public_dependent_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL UNIQUE REFERENCES public_adesao_attempts(id) ON DELETE CASCADE,
  request_hash text NOT NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'failed', 'succeeded')),
  confirmed_phone text,
  confirmed_email text,
  dependents_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  erp_response jsonb,
  cadastro_id uuid REFERENCES cadastros(id) ON DELETE SET NULL,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS public_dependent_submissions_status_idx
  ON public_dependent_submissions(status, updated_at);

ALTER TABLE public_dependent_submissions ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public_adesao_attempts.flow_mode IS
  'Modo do fluxo publico: nova adesao, associado existente incluindo dependentes ou dependente existente sem permissao de inclusao.';
COMMENT ON COLUMN public_adesao_attempts.erp_member_snapshot IS
  'Snapshot servidor-side do vinculo ERP validado. Nunca deve ser aceito do cliente.';
COMMENT ON TABLE public_dependent_submissions IS
  'Controle idempotente do envio publico de dependentes para associado existente.';
