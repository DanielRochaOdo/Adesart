/*
  Hotfix da RPC do Dashboard apos a resolucao de vendedor.

  Motivo:
  A versao anterior fazia uma contagem correlacionada em profiles para cada
  cadastro retornado. Em periodos extensos isso aumenta muito o custo da
  consulta e pode levar a timeout/HTTP 500 no PostgREST.

  Correcao:
  - filtra cadastros antes dos joins de enriquecimento;
  - calcula o mapa de vendedores unicos apenas uma vez;
  - mantem a mesma ordem de fontes confiaveis;
  - continua SECURITY INVOKER e respeitando RLS;
  - nao altera nenhum cadastro historico.
*/

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
  ),
  vendedores_unicos AS (
    SELECT
      NULLIF(BTRIM(p.external_id), '') AS external_id,
      MIN(p.id::text)::uuid AS id,
      MIN(NULLIF(BTRIM(p.name), '')) AS name
    FROM public.profiles AS p
    WHERE p.role = 'VENDEDOR'
      AND NULLIF(BTRIM(p.external_id), '') IS NOT NULL
    GROUP BY NULLIF(BTRIM(p.external_id), '')
    HAVING COUNT(*) = 1
  ),
  enriquecidos AS (
    SELECT
      b.*,
      COALESCE(
        NULLIF(NULLIF(BTRIM(b.vendedor_codigo), ''), '0'),
        NULLIF(NULLIF(BTRIM(p_por_id.external_id), ''), '0'),
        NULLIF(NULLIF(BTRIM(l.vendedor_codigo), ''), '0'),
        CASE
          WHEN b.payload_erp IS NOT NULL
           AND jsonb_typeof(b.payload_erp) = 'object'
          THEN NULLIF(
            NULLIF(BTRIM(b.payload_erp #>> '{dados,parceiro,codigo}'), ''),
            '0'
          )
          ELSE NULL
        END,
        CASE
          WHEN p_criador.role = 'VENDEDOR'
          THEN NULLIF(NULLIF(BTRIM(p_criador.external_id), ''), '0')
          ELSE NULL
        END
      ) AS vendedor_codigo_resolvido,
      COALESCE(
        b.vendedor_id,
        l.vendedor_id,
        CASE WHEN p_criador.role = 'VENDEDOR' THEN p_criador.id ELSE NULL END
      ) AS vendedor_id_direto,
      COALESCE(
        NULLIF(BTRIM(b.vendedor_nome), ''),
        NULLIF(BTRIM(p_por_id.name), ''),
        NULLIF(BTRIM(l.vendedor_nome), ''),
        CASE
          WHEN p_criador.role = 'VENDEDOR'
          THEN NULLIF(BTRIM(p_criador.name), '')
          ELSE NULL
        END
      ) AS vendedor_nome_direto
    FROM base AS b
    LEFT JOIN public.profiles AS p_por_id
      ON p_por_id.id = b.vendedor_id
    LEFT JOIN public.cadastro_links AS l
      ON l.id = b.origem_link_id
    LEFT JOIN public.profiles AS p_criador
      ON p_criador.id = b.created_by
  ),
  resolvidos AS (
    SELECT
      e.*,
      COALESCE(e.vendedor_id_direto, vu.id) AS vendedor_id_resolvido,
      COALESCE(e.vendedor_nome_direto, vu.name) AS vendedor_nome_resolvido
    FROM enriquecidos AS e
    LEFT JOIN vendedores_unicos AS vu
      ON vu.external_id = e.vendedor_codigo_resolvido
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
        'vendedor_id', c.vendedor_id_resolvido,
        'vendedor_codigo', c.vendedor_codigo_resolvido,
        'vendedor_nome', c.vendedor_nome_resolvido,
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
  FROM resolvidos AS c;
$function$;

REVOKE ALL ON FUNCTION public.get_dashboard_cadastros_fast_v1(timestamptz, timestamptz)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_dashboard_cadastros_fast_v1(timestamptz, timestamptz)
TO authenticated;

COMMENT ON FUNCTION public.get_dashboard_cadastros_fast_v1(timestamptz, timestamptz)
IS 'Dashboard compacto com resolucao de vendedor otimizada: cadastro local, profile por id, link, parceiro ERP e criador VENDEDOR.';
