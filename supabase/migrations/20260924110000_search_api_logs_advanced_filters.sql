-- Filtros administráveis de logs de API, aplicados no banco antes da paginação.
-- Não armazena novos dados pessoais nem altera logs existentes.
-- Limitação: logs com CPF exclusivamente em cpf_hash (hash com segredo da
-- Edge Function) não podem ser pesquisados retroativamente pelo CPF em claro.
CREATE OR REPLACE FUNCTION public.search_api_logs(
  p_data_inicio timestamptz DEFAULT NULL,
  p_data_fim_exclusiva timestamptz DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_cpf text DEFAULT NULL,
  p_usuario text DEFAULT NULL,
  p_codigo_empresa text DEFAULT NULL,
  p_endpoint text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g');
  v_usuario text := btrim(coalesce(p_usuario, ''));
  v_empresa text := btrim(coalesce(p_codigo_empresa, ''));
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'ADMINISTRADOR' AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'Acesso não autorizado aos logs' USING ERRCODE = '42501';
  END IF;

  IF btrim(coalesce(p_cpf, '')) <> '' AND length(v_cpf) <> 11 THEN
    RAISE EXCEPTION 'Informe um CPF com 11 dígitos';
  END IF;
  IF v_empresa <> '' AND v_empresa !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'O código da empresa deve conter somente números';
  END IF;
  IF p_status NOT IN ('all', 'success', 'error') OR p_status IS NULL THEN
    RAISE EXCEPTION 'Filtro de situação inválido';
  END IF;
  IF p_page IS NULL OR p_page < 1 OR p_page > 100000
     OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100 THEN
    RAISE EXCEPTION 'Parâmetros de paginação inválidos';
  END IF;
  IF p_data_inicio IS NOT NULL AND p_data_fim_exclusiva IS NOT NULL
     AND p_data_inicio >= p_data_fim_exclusiva THEN
    RAISE EXCEPTION 'Intervalo de datas inválido';
  END IF;

  WITH filtrados AS (
    SELECT l.id, l.user_email, l.endpoint, l.method, l.status_code,
           l.success, l.error_message, l.duration_ms, l.cost, l.created_at
    FROM public.api_logs l
    WHERE
      (p_data_inicio IS NULL OR l.created_at >= p_data_inicio)
      AND (p_data_fim_exclusiva IS NULL OR l.created_at < p_data_fim_exclusiva)
      AND (p_status = 'all'
           OR (p_status = 'success' AND l.success IS TRUE)
           OR (p_status = 'error' AND l.success IS FALSE))
      AND (v_endpoint = '' OR strpos(lower(l.endpoint), lower(v_endpoint)) > 0)
      AND (
        v_usuario = ''
        OR strpos(lower(coalesce(l.user_email, '')), lower(v_usuario)) > 0
        OR EXISTS (
          SELECT 1 FROM public.profiles u
          WHERE u.id = l.user_id
            AND (
              strpos(lower(u.name), lower(v_usuario)) > 0
              OR strpos(lower(u.email), lower(v_usuario)) > 0
            )
        )
      )
      AND (
        v_cpf = ''
        OR regexp_replace(
             coalesce(
               l.request_body ->> 'cpf',
               l.request_body ->> 'cpfAssociado',
               l.request_body ->> 'cpfTitular',
               ''
             ), '[^0-9]', '', 'g'
           ) = v_cpf
        OR EXISTS (
          SELECT 1 FROM public.cadastros c
          WHERE c.id::text = l.request_body ->> 'cadastro_id'
            AND regexp_replace(c.cpf, '[^0-9]', '', 'g') = v_cpf
        )
      )
      AND (
        v_empresa = ''
        OR l.request_body ->> 'empresa_codigo' = v_empresa
        OR l.request_body ->> 'empresaCodigo' = v_empresa
        OR l.request_body ->> 'empresaId' = v_empresa
        OR l.request_body ->> 'codigoContrato' = v_empresa
        OR EXISTS (
          SELECT 1 FROM public.cadastros c
          WHERE c.id::text = l.request_body ->> 'cadastro_id'
            AND (c.empresa_codigo::text = v_empresa OR c.empresa_id::text = v_empresa)
        )
      )
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtrados),
    'logs', coalesce((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC, p.id DESC)
      FROM (
        SELECT * FROM filtrados
        ORDER BY created_at DESC, id DESC
        LIMIT p_page_size OFFSET (p_page - 1) * p_page_size
      ) p
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.search_api_logs(
  timestamptz, timestamptz, text, text, text, text, text, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_api_logs(
  timestamptz, timestamptz, text, text, text, text, text, integer, integer
) TO authenticated;

COMMENT ON FUNCTION public.search_api_logs(
  timestamptz, timestamptz, text, text, text, text, text, integer, integer
) IS 'Busca paginada admin. CPF e empresa requerem identificadores presentes no log ou cadastro_id correlacionável.';
