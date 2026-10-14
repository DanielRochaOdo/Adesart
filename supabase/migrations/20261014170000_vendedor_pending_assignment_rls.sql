-- Pendencias da funcao VENDEDOR: somente cadastros atribuidos ao vendedor.
-- Politica restritiva, combinada com as policies permissivas existentes.
-- Os demais papeis e os cadastros enviados permanecem inalterados.
BEGIN;

DROP POLICY IF EXISTS "Vendedor pending only assigned" ON public.cadastros;

CREATE POLICY "Vendedor pending only assigned"
ON public.cadastros
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  NOT (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'VENDEDOR'
    AND status IN ('incompleto', 'adesoes_pendentes')
  )
  OR vendedor_id = auth.uid()
);

COMMIT;
