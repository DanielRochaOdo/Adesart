/*
  Unifica a resolucao de empresa do Dashboard para Web e Android.

  Problema:
  - registros historicos podem ter empresa_codigo/empresa_id/payload ERP,
    mas empresa_nome vazio;
  - o Dashboard agrupava esses registros como "Nao informada";
  - Web e Android devem consumir a mesma resolucao canônica.

  Fontes, em ordem:
  1) empresa_nome persistido no cadastro;
  2) cadastro_links para fluxos publicos;
  3) empresa_raw persistido no cadastro;
  4) nome conhecido em outro cadastro visivel com o mesmo codigo;
  5) nome conhecido em cadastro_links visivel com o mesmo codigo;
  6) fallback "Empresa codigo X" quando o codigo existe mas nenhum nome e conhecido.

  A funcao continua SECURITY INVOKER e respeita RLS.
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
        l.empresa_codigo,
        CASE
          WHEN jsonb_typeof(b.empresa_raw) = 'object'
           AND COALESCE(b.empresa_raw ->> 'codigo', '') ~ '^[0-9]+$'
          THEN (b.empresa_raw ->> 'codigo')::integer
          ELSE NULL
        END,
        CASE
          WHEN jsonb_typeof(b.empresa_raw) = 'object'
           AND COALESCE(b.empresa_raw ->> 'id', '') ~ '^[0-9]+$'
          THEN (b.empresa_raw ->> 'id')::integer
          ELSE NULL
        END,
        CASE
          WHEN jsonb_typeof(b.empresa_raw) = 'object'
           AND COALESCE(b.empresa_raw ->> 'Id', '') ~ '^[0-9]+$'
          THEN (b.empresa_raw ->> 'Id')::integer
          ELSE NULL
        END,
        CASE
          WHEN jsonb_typeof(b.payload_erp) = 'object'
           AND COALESCE(b.payload_erp ->> 'empresa', '') ~ '^[0-9]+$'
          THEN (b.payload_erp ->> 'empresa')::integer
          ELSE NULL
        END
      ) AS empresa_codigo_resolvido,
      COALESCE(
        NULLIF(BTRIM(b.empresa_nome), ''),
        NULLIF(BTRIM(l.empresa_nome), ''),
        CASE WHEN jsonb_typeof(b.empresa_raw) = 'object' THEN NULLIF(BTRIM(b.empresa_raw ->> 'nomeFantasia'), '') END,
        CASE WHEN jsonb_typeof(b.empresa_raw) = 'object' THEN NULLIF(BTRIM(b.empresa_raw ->> 'NomeFantazia'), '') END,
        CASE WHEN jsonb_typeof(b.empresa_raw) = 'object' THEN NULLIF(BTRIM(b.empresa_raw ->> 'NomeFantasia'), '') END,
        CASE WHEN jsonb_typeof(b.empresa_raw) = 'object' THEN NULLIF(BTRIM(b.empresa_raw ->> 'razaoSocial'), '') END,
        CASE WHEN jsonb_typeof(b.empresa_raw) = 'object' THEN NULLIF(BTRIM(b.empresa_raw ->> 'RazaoSocial'), '') END,
        CASE WHEN jsonb_typeof(b.empresa_raw) = 'object' THEN NULLIF(BTRIM(b.empresa_raw ->> 'nome'), '') END
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
  codigos_empresa_necessarios AS (
    SELECT DISTINCT e.empresa_codigo_resolvido AS codigo
    FROM enriquecidos AS e
    WHERE e.empresa_codigo_resolvido IS NOT NULL
  ),
  fontes_empresa AS (
    SELECT
      c.empresa_codigo AS codigo,
      COALESCE(
        NULLIF(BTRIM(c.empresa_nome), ''),
        CASE WHEN jsonb_typeof(c.empresa_raw) = 'object' THEN NULLIF(BTRIM(c.empresa_raw ->> 'nomeFantasia'), '') END,
        CASE WHEN jsonb_typeof(c.empresa_raw) = 'object' THEN NULLIF(BTRIM(c.empresa_raw ->> 'NomeFantazia'), '') END,
        CASE WHEN jsonb_typeof(c.empresa_raw) = 'object' THEN NULLIF(BTRIM(c.empresa_raw ->> 'NomeFantasia'), '') END,
        CASE WHEN jsonb_typeof(c.empresa_raw) = 'object' THEN NULLIF(BTRIM(c.empresa_raw ->> 'razaoSocial'), '') END,
        CASE WHEN jsonb_typeof(c.empresa_raw) = 'object' THEN NULLIF(BTRIM(c.empresa_raw ->> 'RazaoSocial'), '') END,
        CASE WHEN jsonb_typeof(c.empresa_raw) = 'object' THEN NULLIF(BTRIM(c.empresa_raw ->> 'nome'), '') END
      ) AS nome,
      c.updated_at AS referencia
    FROM public.cadastros AS c
    JOIN codigos_empresa_necessarios AS n
      ON n.codigo = c.empresa_codigo
    WHERE c.empresa_codigo IS NOT NULL

    UNION ALL

    SELECT
      l.empresa_codigo AS codigo,
      NULLIF(BTRIM(l.empresa_nome), '') AS nome,
      l.updated_at AS referencia
    FROM public.cadastro_links AS l
    JOIN codigos_empresa_necessarios AS n
      ON n.codigo = l.empresa_codigo
  ),
  empresas_por_codigo AS (
    SELECT DISTINCT ON (f.codigo)
      f.codigo,
      f.nome
    FROM fontes_empresa AS f
    WHERE f.codigo IS NOT NULL
      AND f.nome IS NOT NULL
    ORDER BY f.codigo, f.referencia DESC NULLS LAST, f.nome
  ),
  resolvidos AS (
    SELECT
      e.*,
      COALESCE(e.vendedor_id_direto, vu.id) AS vendedor_id_resolvido,
      COALESCE(e.vendedor_nome_direto, vu.name) AS vendedor_nome_resolvido,
      COALESCE(
        e.empresa_nome_direto,
        epc.nome,
        CASE
          WHEN e.empresa_codigo_resolvido IS NOT NULL
          THEN 'Empresa código ' || e.empresa_codigo_resolvido::text
          ELSE NULL
        END
      ) AS empresa_nome_resolvido
    FROM enriquecidos AS e
    LEFT JOIN vendedores_unicos AS vu
      ON vu.external_id = e.vendedor_codigo_resolvido
    LEFT JOIN empresas_por_codigo AS epc
      ON epc.codigo = e.empresa_codigo_resolvido
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
IS 'Dashboard canonico Web/Android: resolve vendedor e empresa por fontes confiaveis, preservando RLS e legado.';
