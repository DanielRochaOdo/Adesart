/*
  Resolve e preserva a atribuicao do vendedor sem reescrever o historico.

  Principios:
  - nunca inferir vendedor pela empresa ou pelo CPF;
  - preservar qualquer atribuicao explicita ja existente;
  - usar somente evidencias comerciais do proprio fluxo:
      1) vendedor ja salvo;
      2) cadastro_links, quando houver origem publica;
      3) dados.parceiro.codigo efetivamente enviado ao ERP;
      4) created_by somente quando o criador e, de fato, VENDEDOR;
  - preencher id/nome por external_id apenas quando existir exatamente um
    profile com role VENDEDOR para aquele codigo;
  - a trigger e tolerante a falhas e nao pode bloquear a adesao.

  Para cadastros antigos, o Dashboard passa a resolver a atribuicao em leitura.
  Esta migration NAO executa UPDATE em cadastros historicos.
*/

CREATE OR REPLACE FUNCTION public.fill_cadastro_vendedor_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_codigo text;
  v_link_vendedor_id uuid;
  v_link_vendedor_codigo text;
  v_link_vendedor_nome text;
  v_profile_id uuid;
  v_profile_nome text;
  v_profile_codigo text;
  v_matches integer;
BEGIN
  NEW.vendedor_codigo := NULLIF(BTRIM(NEW.vendedor_codigo), '');
  NEW.vendedor_nome := NULLIF(BTRIM(NEW.vendedor_nome), '');

  -- Se ja existe vendedor_id, completar apenas os campos ausentes.
  IF NEW.vendedor_id IS NOT NULL
     AND (NEW.vendedor_codigo IS NULL OR NEW.vendedor_nome IS NULL) THEN
    SELECT p.external_id, p.name
      INTO v_profile_codigo, v_profile_nome
    FROM public.profiles AS p
    WHERE p.id = NEW.vendedor_id
    LIMIT 1;

    IF FOUND THEN
      NEW.vendedor_codigo := COALESCE(
        NEW.vendedor_codigo,
        NULLIF(BTRIM(v_profile_codigo), '')
      );
      NEW.vendedor_nome := COALESCE(
        NEW.vendedor_nome,
        NULLIF(BTRIM(v_profile_nome), '')
      );
    END IF;
  END IF;

  -- Cadastro publico: cadastro_links e a fonte explicita da atribuicao comercial.
  IF NEW.origem_link_id IS NOT NULL
     AND (
       NEW.vendedor_id IS NULL
       OR NEW.vendedor_codigo IS NULL
       OR NEW.vendedor_nome IS NULL
     ) THEN
    SELECT
      l.vendedor_id,
      NULLIF(BTRIM(l.vendedor_codigo), ''),
      NULLIF(BTRIM(l.vendedor_nome), '')
    INTO
      v_link_vendedor_id,
      v_link_vendedor_codigo,
      v_link_vendedor_nome
    FROM public.cadastro_links AS l
    WHERE l.id = NEW.origem_link_id
    LIMIT 1;

    IF FOUND THEN
      NEW.vendedor_id := COALESCE(NEW.vendedor_id, v_link_vendedor_id);
      NEW.vendedor_codigo := COALESCE(NEW.vendedor_codigo, v_link_vendedor_codigo);
      NEW.vendedor_nome := COALESCE(NEW.vendedor_nome, v_link_vendedor_nome);
    END IF;
  END IF;

  v_codigo := NULLIF(NULLIF(BTRIM(NEW.vendedor_codigo), ''), '0');

  -- O parceiro do payload e o vendedor que efetivamente foi enviado ao ERP.
  IF v_codigo IS NULL
     AND NEW.payload_erp IS NOT NULL
     AND jsonb_typeof(NEW.payload_erp) = 'object' THEN
    v_codigo := NULLIF(
      NULLIF(BTRIM(NEW.payload_erp #>> '{dados,parceiro,codigo}'), ''),
      '0'
    );
  END IF;

  -- created_by so e usado quando o proprio criador possui role VENDEDOR.
  IF v_codigo IS NULL AND NEW.created_by IS NOT NULL THEN
    SELECT NULLIF(BTRIM(p.external_id), '')
      INTO v_codigo
    FROM public.profiles AS p
    WHERE p.id = NEW.created_by
      AND p.role = 'VENDEDOR'
    LIMIT 1;
  END IF;

  IF NEW.vendedor_codigo IS NULL AND v_codigo IS NOT NULL THEN
    NEW.vendedor_codigo := v_codigo;
  END IF;

  -- Converter codigo em id/nome apenas com correspondencia inequivoca.
  IF v_codigo IS NOT NULL
     AND (NEW.vendedor_id IS NULL OR NEW.vendedor_nome IS NULL) THEN
    SELECT COUNT(*)
      INTO v_matches
    FROM public.profiles AS p
    WHERE p.role = 'VENDEDOR'
      AND NULLIF(BTRIM(p.external_id), '') = v_codigo;

    IF v_matches = 1 THEN
      SELECT p.id, p.name
        INTO v_profile_id, v_profile_nome
      FROM public.profiles AS p
      WHERE p.role = 'VENDEDOR'
        AND NULLIF(BTRIM(p.external_id), '') = v_codigo
      LIMIT 1;

      NEW.vendedor_id := COALESCE(NEW.vendedor_id, v_profile_id);
      NEW.vendedor_nome := COALESCE(
        NEW.vendedor_nome,
        NULLIF(BTRIM(v_profile_nome), '')
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING
      '[fill_cadastro_vendedor_metadata] cadastro %, erro %',
      COALESCE(NEW.id::text, '<novo>'),
      SQLERRM;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS fill_cadastro_vendedor_metadata_trigger
  ON public.cadastros;

CREATE TRIGGER fill_cadastro_vendedor_metadata_trigger
BEFORE INSERT OR UPDATE
ON public.cadastros
FOR EACH ROW
EXECUTE FUNCTION public.fill_cadastro_vendedor_metadata();

COMMENT ON FUNCTION public.fill_cadastro_vendedor_metadata()
IS 'Completa metadados do vendedor a partir de fontes comerciais explicitas sem bloquear o fluxo de adesao.';

/*
  Dashboard: resolve vendedor em leitura para o historico sem alterar os registros.

  A ordem de precedencia e a mesma da trigger:
  cadastro -> link -> payload ERP -> criador quando role VENDEDOR.
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
  candidatos AS (
    SELECT
      c.*,
      NULLIF(NULLIF(BTRIM(c.vendedor_codigo), ''), '0') AS vendedor_codigo_salvo,
      NULLIF(BTRIM(c.vendedor_nome), '') AS vendedor_nome_salvo,
      p_vendedor_id.external_id AS vendedor_codigo_por_id,
      p_vendedor_id.name AS vendedor_nome_por_id,
      l.vendedor_id AS link_vendedor_id,
      NULLIF(NULLIF(BTRIM(l.vendedor_codigo), ''), '0') AS link_vendedor_codigo,
      NULLIF(BTRIM(l.vendedor_nome), '') AS link_vendedor_nome,
      CASE
        WHEN c.payload_erp IS NOT NULL
         AND jsonb_typeof(c.payload_erp) = 'object'
        THEN NULLIF(
          NULLIF(BTRIM(c.payload_erp #>> '{dados,parceiro,codigo}'), ''),
          '0'
        )
        ELSE NULL
      END AS payload_vendedor_codigo,
      p_criador.role AS criador_role,
      NULLIF(NULLIF(BTRIM(p_criador.external_id), ''), '0') AS criador_external_id,
      NULLIF(BTRIM(p_criador.name), '') AS criador_nome
    FROM public.cadastros AS c
    CROSS JOIN perfil_atual AS viewer
    LEFT JOIN public.cadastro_links AS l
      ON l.id = c.origem_link_id
    LEFT JOIN public.profiles AS p_criador
      ON p_criador.id = c.created_by
    LEFT JOIN public.profiles AS p_vendedor_id
      ON p_vendedor_id.id = c.vendedor_id
    WHERE c.created_at >= p_inicio
      AND c.created_at < p_fim
  ),
  codigos AS (
    SELECT
      c.*,
      COALESCE(
        c.vendedor_codigo_salvo,
        NULLIF(NULLIF(BTRIM(c.vendedor_codigo_por_id), ''), '0'),
        c.link_vendedor_codigo,
        c.payload_vendedor_codigo,
        CASE
          WHEN c.criador_role = 'VENDEDOR' THEN c.criador_external_id
          ELSE NULL
        END
      ) AS vendedor_codigo_resolvido,
      COALESCE(
        c.vendedor_id,
        c.link_vendedor_id,
        CASE
          WHEN c.criador_role = 'VENDEDOR' THEN c.created_by
          ELSE NULL
        END
      ) AS vendedor_id_direto,
      COALESCE(
        c.vendedor_nome_salvo,
        NULLIF(BTRIM(c.vendedor_nome_por_id), ''),
        c.link_vendedor_nome,
        CASE
          WHEN c.criador_role = 'VENDEDOR' THEN c.criador_nome
          ELSE NULL
        END
      ) AS vendedor_nome_direto
    FROM candidatos AS c
  ),
  resolvidos AS (
    SELECT
      c.*,
      COALESCE(c.vendedor_id_direto, p_codigo.id) AS vendedor_id_resolvido,
      COALESCE(c.vendedor_nome_direto, p_codigo.name) AS vendedor_nome_resolvido
    FROM codigos AS c
    LEFT JOIN LATERAL (
      SELECT p.id, NULLIF(BTRIM(p.name), '') AS name
      FROM public.profiles AS p
      WHERE p.role = 'VENDEDOR'
        AND NULLIF(BTRIM(p.external_id), '') = c.vendedor_codigo_resolvido
        AND (
          SELECT COUNT(*)
          FROM public.profiles AS p2
          WHERE p2.role = 'VENDEDOR'
            AND NULLIF(BTRIM(p2.external_id), '') = c.vendedor_codigo_resolvido
        ) = 1
      LIMIT 1
    ) AS p_codigo ON TRUE
  ),
  visiveis AS (
    SELECT r.*
    FROM resolvidos AS r
    CROSS JOIN perfil_atual AS p
    WHERE
      p.role NOT IN ('SUPERVISOR', 'VENDEDOR', 'ADESIONISTA')
      OR (
        p.role = 'SUPERVISOR'
        AND p.team_id IS NOT NULL
        AND r.team_id = p.team_id
      )
      OR (
        p.role = 'VENDEDOR'
        AND (
          r.created_by = p.id
          OR r.vendedor_id_resolvido = p.id
          OR (
            p.external_id IS NOT NULL
            AND r.vendedor_codigo_resolvido = NULLIF(BTRIM(p.external_id), '')
          )
        )
      )
      OR (
        p.role = 'ADESIONISTA'
        AND (
          r.adesionista_id = p.id
          OR (
            p.external_id IS NOT NULL
            AND r.adesionista_codigo = p.external_id
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
  FROM visiveis AS c;
$function$;

REVOKE ALL ON FUNCTION public.get_dashboard_cadastros_fast_v1(timestamptz, timestamptz)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_dashboard_cadastros_fast_v1(timestamptz, timestamptz)
TO authenticated;

COMMENT ON FUNCTION public.get_dashboard_cadastros_fast_v1(timestamptz, timestamptz)
IS 'Retorna dados compactos do Dashboard e resolve vendedor por atribuicao salva, link, parceiro enviado ao ERP ou criador VENDEDOR, sem reescrever o historico.';
