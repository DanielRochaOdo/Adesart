-- Preserva links excluidos para auditoria administrativa.
-- A exclusao comum passa a ser logica; exclusao fisica fica restrita ao ADMINISTRADOR.

BEGIN;

ALTER TABLE public.cadastro_links
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cadastro_links_vendedor_empresa_created_idx
  ON public.cadastro_links(vendedor_id, empresa_codigo, created_at DESC);

CREATE INDEX IF NOT EXISTS cadastro_links_deleted_at_idx
  ON public.cadastro_links(deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_cadastro_link_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT p.role
    INTO v_role
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    NEW.is_active := false;
    NEW.deleted_by := COALESCE(auth.uid(), NEW.deleted_by);
    RETURN NEW;
  END IF;

  IF OLD.deleted_at IS NOT NULL THEN
    IF COALESCE(v_role, '') <> 'ADMINISTRADOR' AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'Link excluido nao pode ser alterado.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cadastro_links_protect_soft_delete
  ON public.cadastro_links;

CREATE TRIGGER cadastro_links_protect_soft_delete
BEFORE UPDATE ON public.cadastro_links
FOR EACH ROW
EXECUTE FUNCTION public.protect_cadastro_link_soft_delete();

-- Nenhuma role, exceto ADMINISTRADOR, pode remover fisicamente o registro.
DROP POLICY IF EXISTS "Admin/Gerente/Cadastro/Adesionista delete cadastro links"
  ON public.cadastro_links;
DROP POLICY IF EXISTS "Supervisor delete team cadastro links"
  ON public.cadastro_links;
DROP POLICY IF EXISTS "Vendedor delete own cadastro links"
  ON public.cadastro_links;
DROP POLICY IF EXISTS "Authenticated users can delete own cadastro links"
  ON public.cadastro_links;
DROP POLICY IF EXISTS "Administrator permanently delete cadastro links"
  ON public.cadastro_links;

CREATE POLICY "Administrator permanently delete cadastro links"
  ON public.cadastro_links
  FOR DELETE
  TO authenticated
  USING (
    deleted_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'ADMINISTRADOR'
        AND p.is_active = true
    )
  );

COMMENT ON COLUMN public.cadastro_links.deleted_at IS
  'Data/hora da exclusao logica. O registro e o historico permanecem ate exclusao fisica por ADMINISTRADOR.';

COMMENT ON COLUMN public.cadastro_links.deleted_by IS
  'Usuario que realizou a exclusao logica do link.';

COMMIT;
