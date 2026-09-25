/*
  Dashboard gerencial - consulta compacta para periodos extensos.

  Objetivos:
  - reduzir o volume trafegado para o frontend;
  - manter a mesma visibilidade por perfil usada pelo Dashboard;
  - respeitar RLS porque a funcao e SECURITY INVOKER;
  - enviar apenas os campos usados pelo Dashboard;
  - compactar dependentes para apenas tipo/plano, preservando contagens e ranking.

  Nenhum dado de cadastro e alterado.
*/

CREATE INDEX IF NOT EXISTS idx_cadastros_dashboard_created_at_id
  ON public.cadastros (created_at, id);

CREATE OR REPLACE FUNCTION public.get_dashboard_cadastros_fast_v1(
  p_inicio timestamptz,
  p_fim timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  WITH perfil_atual AS (
    SELECT
      p.id,
      p.role,
      p.team_id,
      p.external_id
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
    LIMIT 1
  ),
  base AS (
    SELECT c.*
    FROM public.cadastros AS c
    CROSS JOIN perfil_atual AS p
    WHERE c.created_at >= p_inicio
      AND c.created_at < p_fim
      AND (
        p.role NOT IN ('SUPERVISOR', 'VENDEDOR', 'ADESIONISTA')
        OR (
          p.role = 'SUPERVISOR'
          AND p.team_id IS NOT NULL
          AND c.team_id = p.team_id
        )
        OR (
          p.role = 'VENDEDOR'
          AND (c.created_by = p.id OR c.vendedor_id = p.id)
        )
        OR (
          p.role = 'ADESIONISTA'
          AND (
            c.adesionista_id = p.id
            OR (
              p.external_id IS NOT NULL
              AND c.adesionista_codigo = p.external_id
            )
          )
        )
      )
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'created_at', c.created_at,
        'status', c.status,
        'tipo_cadastro', c.tipo_cadastro,
        'created_by', c.created_by,
        'team_id', c.team_id,
        'vendedor_id', c.vendedor_id,
        'vendedor_codigo', c.vendedor_codigo,
        'vendedor_nome', c.vendedor_nome,
        'adesionista_id', c.adesionista_id,
        'adesionista_codigo', c.adesionista_codigo,
        'adesionista_nome', c.adesionista_nome,
        'empresa_codigo', c.empresa_codigo,
        'empresa_nome', c.empresa_nome,
        'plano_codigo', c.plano_codigo,
        'plano_nome', c.plano_nome,
        'dependentes',
          CASE
            WHEN c.dependentes IS NOT NULL
             AND jsonb_typeof(c.dependentes) = 'array'
            THEN COALESCE(
              (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'tipo', d.item -> 'tipo',
                    'plano', COALESCE(
                      d.item -> 'plano',
                      d.item -> 'plano_codigo',
                      d.item -> 'planoCodigo',
                      d.item -> 'codigoPlano',
                      d.item -> 'Plano'
                    )
                  )
                )
                FROM jsonb_array_elements(c.dependentes) AS d(item)
              ),
              '[]'::jsonb
            )
            ELSE '[]'::jsonb
          END,
        'fluxo_publico', c.fluxo_publico,
        'origem_link_id', c.origem_link_id
      )
      ORDER BY c.created_at, c.id
    ),
    '[]'::jsonb
  )
  FROM base AS c;
$function$;

REVOKE ALL ON FUNCTION public.get_dashboard_cadastros_fast_v1(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_cadastros_fast_v1(timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.get_dashboard_cadastros_fast_v1(timestamptz, timestamptz)
IS 'Retorna linhas compactas do Dashboard no intervalo solicitado, respeitando RLS e o escopo comercial do perfil autenticado.';
