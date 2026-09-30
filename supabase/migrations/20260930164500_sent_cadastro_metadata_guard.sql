/*
  Metadados canônicos de adesões enviadas.

  O status "enviado" não pode mais depender de um PATCH posterior do cliente.
  Esta migration também repara registros históricos usando apenas fontes já
  existentes no banco/payload ERP.
*/

CREATE OR REPLACE FUNCTION public.hydrate_sent_cadastro_metadata_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_empresa_codigo integer;
  v_vendedor_codigo text;
  v_adesionista_codigo text;
  v_profile record;
BEGIN
  IF NEW.status <> 'enviado' THEN
    RETURN NEW;
  END IF;

  NEW.nome := COALESCE(
    NULLIF(BTRIM(NEW.nome), ''),
    NULLIF(BTRIM(NEW.payload_erp #>> '{dados,responsavelFinanceiro,nome}'), ''),
    NULLIF(BTRIM(NEW.payload_erp #>> '{dados,dependente,0,nome}'), '')
  );

  BEGIN
    v_empresa_codigo := COALESCE(
      NEW.empresa_codigo,
      NEW.empresa_id,
      NULLIF(BTRIM(NEW.payload_erp ->> 'empresa'), '')::integer,
      NULLIF(BTRIM(NEW.payload_erp #>> '{dados,responsavelFinanceiro,codigoContrato}'), '')::integer
    );
  EXCEPTION WHEN invalid_text_representation THEN
    v_empresa_codigo := COALESCE(NEW.empresa_codigo, NEW.empresa_id);
  END;

  NEW.empresa_codigo := COALESCE(NEW.empresa_codigo, v_empresa_codigo);
  NEW.empresa_id := COALESCE(NEW.empresa_id, v_empresa_codigo);

  NEW.empresa_nome := COALESCE(
    NULLIF(BTRIM(NEW.empresa_nome), ''),
    CASE WHEN jsonb_typeof(NEW.empresa_raw) = 'object'
      THEN COALESCE(
        NULLIF(BTRIM(NEW.empresa_raw ->> 'nomeFantasia'), ''),
        NULLIF(BTRIM(NEW.empresa_raw ->> 'NomeFantazia'), ''),
        NULLIF(BTRIM(NEW.empresa_raw ->> 'NomeFantasia'), ''),
        NULLIF(BTRIM(NEW.empresa_raw ->> 'razaoSocial'), ''),
        NULLIF(BTRIM(NEW.empresa_raw ->> 'RazaoSocial'), ''),
        NULLIF(BTRIM(NEW.empresa_raw ->> 'nome'), '')
      )
    END,
    (
      SELECT NULLIF(BTRIM(l.empresa_nome), '')
      FROM public.cadastro_links l
      WHERE l.id = NEW.origem_link_id
      LIMIT 1
    ),
    (
      SELECT NULLIF(BTRIM(c2.empresa_nome), '')
      FROM public.cadastros c2
      WHERE c2.id <> NEW.id
        AND c2.empresa_codigo = v_empresa_codigo
        AND NULLIF(BTRIM(c2.empresa_nome), '') IS NOT NULL
      ORDER BY c2.updated_at DESC
      LIMIT 1
    ),
    CASE WHEN v_empresa_codigo IS NOT NULL
      THEN 'Empresa código ' || v_empresa_codigo::text
    END
  );

  v_vendedor_codigo := COALESCE(
    NULLIF(NULLIF(BTRIM(NEW.vendedor_codigo), ''), '0'),
    NULLIF(NULLIF(BTRIM(NEW.payload_erp #>> '{dados,parceiro,codigo}'), ''), '0')
  );

  IF v_vendedor_codigo IS NULL THEN
    SELECT p.external_id, p.id, p.name
      INTO v_profile
    FROM public.profiles p
    WHERE p.id = NEW.created_by
      AND p.role = 'VENDEDOR'
    LIMIT 1;

    v_vendedor_codigo := NULLIF(NULLIF(BTRIM(v_profile.external_id), ''), '0');
    NEW.vendedor_id := COALESCE(NEW.vendedor_id, v_profile.id);
    NEW.vendedor_nome := COALESCE(NULLIF(BTRIM(NEW.vendedor_nome), ''), NULLIF(BTRIM(v_profile.name), ''));
  END IF;

  NEW.vendedor_codigo := COALESCE(NULLIF(BTRIM(NEW.vendedor_codigo), ''), v_vendedor_codigo);

  IF NEW.vendedor_id IS NULL OR NULLIF(BTRIM(NEW.vendedor_nome), '') IS NULL THEN
    SELECT p.id, p.name
      INTO v_profile
    FROM public.profiles p
    WHERE p.role = 'VENDEDOR'
      AND NULLIF(BTRIM(p.external_id), '') = v_vendedor_codigo
    ORDER BY p.created_at
    LIMIT 1;

    NEW.vendedor_id := COALESCE(NEW.vendedor_id, v_profile.id);
    NEW.vendedor_nome := COALESCE(NULLIF(BTRIM(NEW.vendedor_nome), ''), NULLIF(BTRIM(v_profile.name), ''));
  END IF;

  v_adesionista_codigo := COALESCE(
    NULLIF(NULLIF(BTRIM(NEW.adesionista_codigo), ''), '0'),
    NULLIF(NULLIF(BTRIM(NEW.payload_erp #>> '{dados,parceiro,adesionista}'), ''), '0')
  );
  NEW.adesionista_codigo := COALESCE(NULLIF(BTRIM(NEW.adesionista_codigo), ''), v_adesionista_codigo);

  IF v_adesionista_codigo IS NOT NULL
     AND (NEW.adesionista_id IS NULL OR NULLIF(BTRIM(NEW.adesionista_nome), '') IS NULL) THEN
    SELECT p.id, p.name
      INTO v_profile
    FROM public.profiles p
    WHERE p.role = 'ADESIONISTA'
      AND NULLIF(BTRIM(p.external_id), '') = v_adesionista_codigo
    ORDER BY p.created_at
    LIMIT 1;

    NEW.adesionista_id := COALESCE(NEW.adesionista_id, v_profile.id);
    NEW.adesionista_nome := COALESCE(NULLIF(BTRIM(NEW.adesionista_nome), ''), NULLIF(BTRIM(v_profile.name), ''));
  END IF;

  BEGIN
    NEW.plano_codigo := COALESCE(
      NEW.plano_codigo,
      NULLIF(BTRIM(NEW.payload_erp #>> '{dados,dependente,0,plano}'), '')::integer
    );
  EXCEPTION WHEN invalid_text_representation THEN
    NULL;
  END;

  IF NEW.nome IS NULL THEN
    RAISE EXCEPTION 'Nao e permitido concluir adesao sem nome do titular';
  END IF;

  IF NEW.empresa_codigo IS NULL THEN
    RAISE EXCEPTION 'Nao e permitido concluir adesao sem codigo da empresa';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hydrate_sent_cadastro_metadata_v1_trigger
ON public.cadastros;

CREATE TRIGGER hydrate_sent_cadastro_metadata_v1_trigger
BEFORE INSERT OR UPDATE OF status, payload_erp, nome, empresa_id, empresa_codigo,
  empresa_nome, vendedor_id, vendedor_codigo, vendedor_nome,
  adesionista_id, adesionista_codigo, adesionista_nome, plano_codigo
ON public.cadastros
FOR EACH ROW
EXECUTE FUNCTION public.hydrate_sent_cadastro_metadata_v1();

-- Repara nome/código de empresa/códigos comerciais dos registros históricos.
UPDATE public.cadastros c
SET
  nome = COALESCE(
    NULLIF(BTRIM(c.nome), ''),
    NULLIF(BTRIM(c.payload_erp #>> '{dados,responsavelFinanceiro,nome}'), ''),
    NULLIF(BTRIM(c.payload_erp #>> '{dados,dependente,0,nome}'), '')
  ),
  empresa_codigo = COALESCE(
    c.empresa_codigo,
    c.empresa_id,
    CASE
      WHEN COALESCE(c.payload_erp ->> 'empresa', '') ~ '^[0-9]+$'
      THEN (c.payload_erp ->> 'empresa')::integer
    END
  ),
  vendedor_codigo = COALESCE(
    NULLIF(NULLIF(BTRIM(c.vendedor_codigo), ''), '0'),
    NULLIF(NULLIF(BTRIM(c.payload_erp #>> '{dados,parceiro,codigo}'), ''), '0')
  ),
  adesionista_codigo = COALESCE(
    NULLIF(NULLIF(BTRIM(c.adesionista_codigo), ''), '0'),
    NULLIF(NULLIF(BTRIM(c.payload_erp #>> '{dados,parceiro,adesionista}'), ''), '0')
  ),
  plano_codigo = COALESCE(
    c.plano_codigo,
    CASE
      WHEN COALESCE(c.payload_erp #>> '{dados,dependente,0,plano}', '') ~ '^[0-9]+$'
      THEN (c.payload_erp #>> '{dados,dependente,0,plano}')::integer
    END
  )
WHERE c.status = 'enviado'
  AND (
    NULLIF(BTRIM(c.nome), '') IS NULL
    OR c.empresa_codigo IS NULL
    OR NULLIF(NULLIF(BTRIM(c.vendedor_codigo), ''), '0') IS NULL
    OR c.plano_codigo IS NULL
  );

WITH empresa_map AS (
  SELECT DISTINCT ON (codigo)
    codigo,
    nome
  FROM (
    SELECT
      c.empresa_codigo AS codigo,
      NULLIF(BTRIM(c.empresa_nome), '') AS nome,
      c.updated_at AS referencia
    FROM public.cadastros c
    WHERE c.empresa_codigo IS NOT NULL
      AND NULLIF(BTRIM(c.empresa_nome), '') IS NOT NULL

    UNION ALL

    SELECT
      l.empresa_codigo,
      NULLIF(BTRIM(l.empresa_nome), ''),
      l.updated_at
    FROM public.cadastro_links l
    WHERE l.empresa_codigo IS NOT NULL
      AND NULLIF(BTRIM(l.empresa_nome), '') IS NOT NULL
  ) fontes
  WHERE codigo IS NOT NULL AND nome IS NOT NULL
  ORDER BY codigo, referencia DESC
)
UPDATE public.cadastros c
SET empresa_nome = COALESCE(
  NULLIF(BTRIM(c.empresa_nome), ''),
  em.nome,
  CASE WHEN c.empresa_codigo IS NOT NULL THEN 'Empresa código ' || c.empresa_codigo::text END
)
FROM empresa_map em
WHERE c.status = 'enviado'
  AND c.empresa_codigo = em.codigo
  AND NULLIF(BTRIM(c.empresa_nome), '') IS NULL;

UPDATE public.cadastros c
SET empresa_nome = 'Empresa código ' || c.empresa_codigo::text
WHERE c.status = 'enviado'
  AND c.empresa_codigo IS NOT NULL
  AND NULLIF(BTRIM(c.empresa_nome), '') IS NULL;

UPDATE public.cadastros c
SET
  vendedor_id = COALESCE(c.vendedor_id, p.id),
  vendedor_nome = COALESCE(NULLIF(BTRIM(c.vendedor_nome), ''), p.name)
FROM public.profiles p
WHERE c.status = 'enviado'
  AND p.role = 'VENDEDOR'
  AND NULLIF(BTRIM(p.external_id), '') = NULLIF(BTRIM(c.vendedor_codigo), '')
  AND (
    c.vendedor_id IS NULL
    OR NULLIF(BTRIM(c.vendedor_nome), '') IS NULL
  );

COMMENT ON FUNCTION public.hydrate_sent_cadastro_metadata_v1()
IS 'Defesa canônica: adesão enviada preserva nome, empresa, vendedor, adesionista e plano independentemente do cliente.';
