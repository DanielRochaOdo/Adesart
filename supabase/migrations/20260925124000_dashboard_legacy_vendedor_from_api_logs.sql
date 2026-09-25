/*
  Recuperacao historica de vendedor para inclusoes de dependente legadas.

  Contexto
  - Alguns registros antigos de tipo_cadastro = 'inclusao_dependente' foram
    gravados apos sucesso no ERP sem vendedor_id/codigo/nome, sem payload_erp
    e sem dependentes/responsavel financeiro no registro gerencial.
  - Os api_logs historicos preservam o request enviado ao endpoint
    erp-novo-dependente e, nesses casos, contem dados.parceiro.codigo.
  - O fluxo atual ja persiste vendedor e payload_erp corretamente; esta regra
    existe apenas como compatibilidade com o legado.

  Estrategia
  - NAO atualiza public.cadastros.
  - Cria um mapa derivado e auditavel para os casos inequivocos.
  - So aceita associacao quando:
      * cadastro enviado;
      * tipo inclusao_dependente;
      * sem vendedor local;
      * sem vendedor no payload_erp;
      * criador nao e VENDEDOR (casos de vendedor ja sao resolvidos por created_by);
      * api_log erp-novo-dependente com success = true;
      * mesmo user_id/created_by;
      * log ocorreu de 0 a 5 segundos antes da criacao do cadastro;
      * existe exatamente 1 log candidato para o cadastro;
      * o mesmo log corresponde a exatamente 1 cadastro elegivel;
      * o codigo do parceiro corresponde a exatamente 1 profile VENDEDOR.
  - O Dashboard apenas consulta esse mapa depois das fontes normais.
*/

CREATE TABLE IF NOT EXISTS public.cadastro_vendedor_legacy_resolution (
  cadastro_id uuid PRIMARY KEY
    REFERENCES public.cadastros(id) ON DELETE CASCADE,
  vendedor_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  vendedor_codigo text NOT NULL,
  vendedor_nome text,
  api_log_id uuid
    REFERENCES public.api_logs(id) ON DELETE SET NULL,
  diferenca_milisegundos integer NOT NULL
    CHECK (diferenca_milisegundos BETWEEN 0 AND 5000),
  fonte text NOT NULL DEFAULT 'api_logs_erp_novo_dependente_5s'
    CHECK (fonte = 'api_logs_erp_novo_dependente_5s'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cadastro_vendedor_legacy_resolution_vendedor_idx
  ON public.cadastro_vendedor_legacy_resolution (vendedor_id);

ALTER TABLE public.cadastro_vendedor_legacy_resolution
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated view visible legacy vendedor resolution"
  ON public.cadastro_vendedor_legacy_resolution;

CREATE POLICY "Authenticated view visible legacy vendedor resolution"
  ON public.cadastro_vendedor_legacy_resolution
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cadastros AS c
      WHERE c.id = cadastro_vendedor_legacy_resolution.cadastro_id
    )
  );

REVOKE ALL ON TABLE public.cadastro_vendedor_legacy_resolution FROM PUBLIC;
GRANT SELECT ON TABLE public.cadastro_vendedor_legacy_resolution TO authenticated;

WITH vendedores_unicos AS (
  SELECT
    NULLIF(BTRIM(p.external_id), '') AS codigo,
    MIN(p.id::text)::uuid AS vendedor_id,
    MIN(NULLIF(BTRIM(p.name), '')) AS vendedor_nome
  FROM public.profiles AS p
  WHERE p.role = 'VENDEDOR'
    AND NULLIF(BTRIM(p.external_id), '') IS NOT NULL
  GROUP BY NULLIF(BTRIM(p.external_id), '')
  HAVING COUNT(*) = 1
),
elegiveis AS (
  SELECT
    c.id AS cadastro_id,
    c.created_at AS cadastro_created_at,
    c.created_by
  FROM public.cadastros AS c
  LEFT JOIN public.profiles AS criador
    ON criador.id = c.created_by
  WHERE c.status = 'enviado'
    AND c.tipo_cadastro = 'inclusao_dependente'
    AND c.vendedor_id IS NULL
    AND NULLIF(NULLIF(BTRIM(c.vendedor_codigo), ''), '0') IS NULL
    AND (
      c.payload_erp IS NULL
      OR jsonb_typeof(c.payload_erp) <> 'object'
      OR NULLIF(
        NULLIF(BTRIM(c.payload_erp #>> '{dados,parceiro,codigo}'), ''),
        '0'
      ) IS NULL
    )
    AND criador.role IS DISTINCT FROM 'VENDEDOR'
),
logs_sucesso AS (
  SELECT
    l.id AS api_log_id,
    l.user_id,
    l.created_at AS log_created_at,
    NULLIF(
      NULLIF(BTRIM(l.request_body #>> '{dados,parceiro,codigo}'), ''),
      '0'
    ) AS vendedor_codigo
  FROM public.api_logs AS l
  WHERE l.endpoint = 'erp-novo-dependente'
    AND l.success IS TRUE
    AND NULLIF(
      NULLIF(BTRIM(l.request_body #>> '{dados,parceiro,codigo}'), ''),
      '0'
    ) IS NOT NULL
),
matches_brutos AS (
  SELECT
    e.cadastro_id,
    e.cadastro_created_at,
    l.api_log_id,
    l.log_created_at,
    l.vendedor_codigo,
    ROUND(
      EXTRACT(EPOCH FROM (e.cadastro_created_at - l.log_created_at)) * 1000
    )::integer AS diferenca_milisegundos
  FROM elegiveis AS e
  JOIN logs_sucesso AS l
    ON l.user_id = e.created_by
   AND l.log_created_at <= e.cadastro_created_at
   AND l.log_created_at >= e.cadastro_created_at - INTERVAL '5 seconds'
),
stats_cadastro AS (
  SELECT
    m.cadastro_id,
    COUNT(*) AS quantidade_logs,
    COUNT(DISTINCT m.vendedor_codigo) AS quantidade_vendedores
  FROM matches_brutos AS m
  GROUP BY m.cadastro_id
),
stats_log AS (
  SELECT
    m.api_log_id,
    COUNT(DISTINCT m.cadastro_id) AS quantidade_cadastros
  FROM matches_brutos AS m
  GROUP BY m.api_log_id
),
seguros AS (
  SELECT
    m.cadastro_id,
    vu.vendedor_id,
    m.vendedor_codigo,
    vu.vendedor_nome,
    m.api_log_id,
    m.diferenca_milisegundos
  FROM matches_brutos AS m
  JOIN stats_cadastro AS sc
    ON sc.cadastro_id = m.cadastro_id
   AND sc.quantidade_logs = 1
   AND sc.quantidade_vendedores = 1
  JOIN stats_log AS sl
    ON sl.api_log_id = m.api_log_id
   AND sl.quantidade_cadastros = 1
  JOIN vendedores_unicos AS vu
    ON vu.codigo = m.vendedor_codigo
)
INSERT INTO public.cadastro_vendedor_legacy_resolution (
  cadastro_id,
  vendedor_id,
  vendedor_codigo,
  vendedor_nome,
  api_log_id,
  diferenca_milisegundos
)
SELECT
  s.cadastro_id,
  s.vendedor_id,
  s.vendedor_codigo,
  s.vendedor_nome,
  s.api_log_id,
  s.diferenca_milisegundos
FROM seguros AS s
ON CONFLICT (cadastro_id) DO NOTHING;

/*
  Mantem a RPC rapida: o trabalho de correlacionar api_logs acontece apenas
  durante a migration. Em runtime o Dashboard faz somente um LEFT JOIN no
  pequeno mapa derivado.
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
      ) AS vendedor_nome_direto
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

COMMENT ON TABLE public.cadastro_vendedor_legacy_resolution
IS 'Mapa derivado de atribuicao de vendedor para inclusoes de dependente legadas, sem alterar public.cadastros.';

COMMENT ON FUNCTION public.get_dashboard_cadastros_fast_v1(timestamptz, timestamptz)
IS 'Dashboard compacto com resolucao de vendedor por fontes locais, link, payload ERP, criador VENDEDOR e mapa legado auditavel derivado de api_logs.';
