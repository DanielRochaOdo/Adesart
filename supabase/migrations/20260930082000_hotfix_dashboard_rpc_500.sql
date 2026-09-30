/*
  Hotfix do Dashboard canônico.

  Objetivo:
  - restaurar disponibilidade da RPC get_dashboard_cadastros_fast_v1;
  - manter a mesma fonte para Web e Android;
  - resolver empresa apenas pelas fontes do próprio cadastro/link,
    sem varrer o histórico inteiro durante a abertura do Dashboard.

  A recuperação histórica de nomes de empresa deve ser executada fora desta RPC.
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
    LEFT JOIN public.cadastro_vendedor_legacy_resolution AS legacy_visibilidade
      ON legacy_visibilidade.cadastro_id = c.id
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
          AND (
            c.created_by = p.id
            OR c.vendedor_id = p.id
            OR legacy_visibilidade.vendedor_id = p.id
          )
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
        END,
        legacy.vendedor_codigo
      ) AS vendedor_codigo_resolvido,
      COALESCE(
        b.vendedor_id,
        l.vendedor_id,
        CASE WHEN p_criador.role = 'VENDEDOR' THEN p_criador.id ELSE NULL END,
        legacy.vendedor_id
      ) AS vendedor_id_direto,
      COALESCE(
        NULLIF(BTRIM(b.vendedor_nome), ''),
        NULLIF(BTRIM(p_por_id.name), ''),
        NULLIF(BTRIM(l.vendedor_nome), ''),
        CASE
          WHEN p_criador.role = 'VENDEDOR'
          THEN NULLIF(BTRIM(p_criador.name), '')
          ELSE NULL
        END,
        NULLIF(BTRIM(legacy.vendedor_nome), '')
      ) AS vendedor_nome_direto,
      COALESCE(
        b.empresa_codigo,
        b.empresa_id,
        l.empresa_codigo
      ) AS empresa_codigo_resolvido,
      COALESCE(
        NULLIF(BTRIM(b.empresa_nome), ''),
        NULLIF(BTRIM(l.empresa_nome), ''),
        CASE
          WHEN b.empresa_raw IS NOT NULL
           AND jsonb_typeof(b.empresa_raw) = 'object'
          THEN COALESCE(
            NULLIF(BTRIM(b.empresa_raw ->> 'nomeFantasia'), ''),
            NULLIF(BTRIM(b.empresa_raw ->> 'NomeFantazia'), ''),
            NULLIF(BTRIM(b.empresa_raw ->> 'NomeFantasia'), ''),
            NULLIF(BTRIM(b.empresa_raw ->> 'razaoSocial'), ''),
            NULLIF(BTRIM(b.empresa_raw ->> 'RazaoSocial'), ''),
            NULLIF(BTRIM(b.empresa_raw ->> 'nome'), '')
          )
          ELSE NULL
        END
      ) AS empresa_nome_direto
    FROM base AS b
    LEFT JOIN public.profiles AS p_por_id
      ON p_por_id.id = b.vendedor_id
    LEFT JOIN public.cadastro_links AS l
      ON l.id = b.origem_link_id
    LEFT JOIN public.profiles AS p_criador
      ON p_criador.id = b.created_by
    LEFT JOIN public.cadastro_vendedor_legacy_resolution AS legacy
      ON legacy.cadastro_id = b.id
  ),
  resolvidos AS (
    SELECT
      e.*,
      COALESCE(e.vendedor_id_direto, vu.id) AS vendedor_id_resolvido,
      COALESCE(e.vendedor_nome_direto, vu.name) AS vendedor_nome_resolvido,
      COALESCE(
        e.empresa_nome_direto,
        CASE
          WHEN e.empresa_codigo_resolvido IS NOT NULL
          THEN 'Empresa código ' || e.empresa_codigo_resolvido::text
          ELSE NULL
        END
      ) AS empresa_nome_resolvido
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
        'empresa_codigo', c.empresa_codigo_resolvido,
        'empresa_nome', c.empresa_nome_resolvido,
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
IS 'Dashboard canônico Web/Android. Resolve vendedor e empresa por fontes do próprio registro/link, sem varredura histórica na abertura da tela.';
