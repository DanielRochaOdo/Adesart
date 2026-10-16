-- Registra aceite contratual antes da autorizacao externa, sem entrega antecipada ao ERP.
BEGIN;
ALTER TABLE public.public_contract_sessions
  DROP CONSTRAINT IF EXISTS public_contract_sessions_status_check;
ALTER TABLE public.public_contract_sessions
  ADD CONSTRAINT public_contract_sessions_status_check CHECK (
    status IN ('prepared','pending_review','erp_processing','erp_failed',
      'erp_registered','deliveries_pending','completed','needs_attention','superseded')
  );
ALTER TABLE public.link_pendencias
  ADD COLUMN IF NOT EXISTS contract_session_id uuid
  REFERENCES public.public_contract_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS link_pendencias_contract_session_idx
  ON public.link_pendencias(contract_session_id)
  WHERE contract_session_id IS NOT NULL;
COMMIT;
