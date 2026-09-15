-- Claim atomico para a fila legada de documentos ERP.
CREATE OR REPLACE FUNCTION claim_erp_upload_queue_v2(p_limit integer DEFAULT 10)
RETURNS SETOF erp_upload_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM erp_upload_queue
    WHERE status IN ('queued', 'retry_wait')
      AND attempts < 5
      AND coalesce(next_attempt_at, now()) <= now()
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 10), 50))
  ), claimed AS (
    UPDATE erp_upload_queue q
    SET status = 'processing',
        last_attempt_at = now()
    FROM candidates c
    WHERE q.id = c.id
    RETURNING q.*
  )
  SELECT * FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION claim_erp_upload_queue_v2(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_erp_upload_queue_v2(integer) TO service_role;
