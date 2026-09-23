-- Adesionista opcional escolhido ao gerar um link publico.
-- A vinculação é feita no servidor para impedir códigos/nomes arbitrários no link.
ALTER TABLE public.cadastro_links
  ADD COLUMN IF NOT EXISTS adesionista_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS adesionista_codigo text,
  ADD COLUMN IF NOT EXISTS adesionista_nome text;

CREATE INDEX IF NOT EXISTS cadastro_links_adesionista_id_idx
  ON public.cadastro_links (adesionista_id)
  WHERE adesionista_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_cadastro_link_adesionista()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
BEGIN
  IF NEW.adesionista_id IS NULL THEN
    NEW.adesionista_codigo := NULL;
    NEW.adesionista_nome := NULL;
    RETURN NEW;
  END IF;

  SELECT p.id, p.name, p.external_id, p.role, p.is_active
  INTO v_profile
  FROM public.profiles p
  WHERE p.id = NEW.adesionista_id;

  IF NOT FOUND OR v_profile.role <> 'ADESIONISTA'
    OR v_profile.is_active IS DISTINCT FROM TRUE
    OR NULLIF(BTRIM(v_profile.external_id), '') IS NULL THEN
    RAISE EXCEPTION 'Adesionista indisponivel. Atualize a lista e selecione novamente.'
      USING ERRCODE = '22023';
  END IF;

  -- Apenas valores confirmados na tabela de usuarios sao persistidos.
  NEW.adesionista_codigo := BTRIM(v_profile.external_id);
  NEW.adesionista_nome := COALESCE(NULLIF(BTRIM(v_profile.name), ''), 'Adesionista');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cadastro_links_validate_adesionista ON public.cadastro_links;
CREATE TRIGGER cadastro_links_validate_adesionista
BEFORE INSERT OR UPDATE OF adesionista_id, adesionista_codigo, adesionista_nome
ON public.cadastro_links
FOR EACH ROW EXECUTE FUNCTION public.validate_cadastro_link_adesionista();

COMMENT ON COLUMN public.cadastro_links.adesionista_id IS
  'Adesionista opcional vinculado na geracao do link. Nao substitui o vendedor do link.';
COMMENT ON COLUMN public.cadastro_links.adesionista_codigo IS
  'Codigo conferido pelo banco a partir do perfil ativo do adesionista selecionado.';
