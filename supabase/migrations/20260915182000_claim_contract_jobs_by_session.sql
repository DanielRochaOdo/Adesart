-- Permite ao submit processar imediatamente apenas as entregas da sessao
-- de contrato que acabou de ser concluida, sem depender da ordem da fila global.

CREATE OR REPLACE FUNCTION claim_contract_delivery_jobs_for_session(
  p_contract_session_id uuid,
  p_limit integer DEFAULT 10
)
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
    WHERE contract_session_id = p_contract_session_id
      AND status IN ('pending', 'retry')
      AND next_attempt_at <= now()
      AND attempts < 5
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 10), 20))
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

REVOKE ALL ON FUNCTION claim_contract_delivery_jobs_for_session(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_contract_delivery_jobs_for_session(uuid, integer)
  TO service_role;
