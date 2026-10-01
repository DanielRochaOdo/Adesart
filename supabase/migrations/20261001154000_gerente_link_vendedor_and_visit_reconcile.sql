-- Regras do GERENTE na geracao de links publicos e reconciliacao
-- da metrica "visitas por sessao".

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_cadastro_link_manager_seller()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_role text;
  v_seller record;
BEGIN
  SELECT p.role
  INTO v_creator_role
  FROM public.profiles p
  WHERE p.id = NEW.created_by;

  IF coalesce(v_creator_role, '') <> 'GERENTE' THEN
    RETURN NEW;
  END IF;

  IF NEW.vendedor_id IS NULL THEN
    RAISE EXCEPTION 'Gerente deve selecionar um vendedor para gerar o link.'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.vendedor_id = NEW.created_by THEN
    RAISE EXCEPTION 'Gerente nao pode gerar link para si proprio.'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    p.id,
    p.name,
    p.email,
    p.external_id,
    p.team_id,
    p.role,
    p.is_active
  INTO v_seller
  FROM public.profiles p
  WHERE p.id = NEW.vendedor_id;

  IF NOT FOUND
     OR v_seller.role <> 'VENDEDOR'
     OR v_seller.is_active IS DISTINCT FROM TRUE
     OR NULLIF(BTRIM(v_seller.external_id), '') IS NULL
     OR v_seller.team_id IS NULL THEN
    RAISE EXCEPTION 'Vendedor indisponivel. Selecione um vendedor ativo com equipe e ID Externo.'
      USING ERRCODE = '22023';
  END IF;

  -- Para links gerados por GERENTE, vendedor/equipe sempre sao derivados
  -- do perfil selecionado. O cliente nao pode forjar esses metadados.
  NEW.vendedor_codigo := BTRIM(v_seller.external_id);
  NEW.vendedor_nome := COALESCE(
    NULLIF(BTRIM(v_seller.name), ''),
    NULLIF(BTRIM(v_seller.email), ''),
    'Vendedor'
  );
  NEW.team_id := v_seller.team_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cadastro_links_validate_manager_seller
  ON public.cadastro_links;

CREATE TRIGGER cadastro_links_validate_manager_seller
BEFORE INSERT OR UPDATE OF vendedor_id, vendedor_codigo, vendedor_nome, team_id
ON public.cadastro_links
FOR EACH ROW
EXECUTE FUNCTION public.validate_cadastro_link_manager_seller();

COMMENT ON FUNCTION public.validate_cadastro_link_manager_seller() IS
  'Exige que links criados por GERENTE sejam vinculados a um VENDEDOR ativo, com equipe e ID Externo, e canonicaliza os metadados do vendedor.';

-- A fonte canonica de "visitas por sessao" e um evento com visit_id nao nulo.
-- Reconciliamos os contadores agregados com a fonte detalhada para corrigir
-- divergencias historicas entre o card e o modal de historico.
WITH visit_totals AS (
  SELECT
    e.link_id,
    count(*)::bigint AS visit_count,
    max(e.accessed_at) AS last_visit_at
  FROM public.cadastro_link_access_events e
  WHERE e.visit_id IS NOT NULL
  GROUP BY e.link_id
)
UPDATE public.cadastro_links l
SET
  unique_visit_count = COALESCE(v.visit_count, 0),
  last_unique_visit_at = v.last_visit_at
FROM (
  SELECT
    l2.id AS link_id,
    COALESCE(t.visit_count, 0) AS visit_count,
    t.last_visit_at
  FROM public.cadastro_links l2
  LEFT JOIN visit_totals t ON t.link_id = l2.id
) v
WHERE v.link_id = l.id
  AND (
    l.unique_visit_count IS DISTINCT FROM v.visit_count
    OR l.last_unique_visit_at IS DISTINCT FROM v.last_visit_at
  );

COMMIT;
