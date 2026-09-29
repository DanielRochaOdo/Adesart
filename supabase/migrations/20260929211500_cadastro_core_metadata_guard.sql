/*
  Garante metadados minimos de uma adesao concluida independentemente do cliente.

  Objetivo:
  - impedir novos registros enviados sem nome do titular;
  - recuperar nome/empresa a partir do payload ERP quando o cliente nao os persistiu;
  - manter a regra compartilhada entre Web e Android.

  A trigger nao altera registros historicos em massa.
*/

CREATE OR REPLACE FUNCTION public.fill_cadastro_core_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_nome text;
  v_empresa_codigo integer;
  v_empresa_nome text;
BEGIN
  NEW.nome := NULLIF(BTRIM(NEW.nome), '');
  NEW.empresa_nome := NULLIF(BTRIM(NEW.empresa_nome), '');

  IF NEW.payload_erp IS NOT NULL
     AND jsonb_typeof(NEW.payload_erp) = 'object' THEN

    IF NEW.nome IS NULL THEN
      v_nome := COALESCE(
        NULLIF(BTRIM(NEW.payload_erp #>> '{dados,responsavelFinanceiro,nome}'), ''),
        NULLIF(BTRIM(NEW.payload_erp #>> '{dados,dependentes,0,nome}'), '')
      );
      NEW.nome := COALESCE(NEW.nome, v_nome);
    END IF;

    IF NEW.empresa_codigo IS NULL THEN
      BEGIN
        v_empresa_codigo := NULLIF(
          BTRIM(NEW.payload_erp #>> '{dados,empresa}'),
          ''
        )::integer;
      EXCEPTION
        WHEN invalid_text_representation THEN
          v_empresa_codigo := NULL;
      END;
      NEW.empresa_codigo := COALESCE(NEW.empresa_codigo, v_empresa_codigo);
    END IF;
  END IF;

  IF NEW.empresa_nome IS NULL
     AND NEW.empresa_raw IS NOT NULL
     AND jsonb_typeof(NEW.empresa_raw) = 'object' THEN
    v_empresa_nome := COALESCE(
      NULLIF(BTRIM(NEW.empresa_raw ->> 'nomeFantasia'), ''),
      NULLIF(BTRIM(NEW.empresa_raw ->> 'NomeFantazia'), ''),
      NULLIF(BTRIM(NEW.empresa_raw ->> 'NomeFantasia'), ''),
      NULLIF(BTRIM(NEW.empresa_raw ->> 'razaoSocial'), ''),
      NULLIF(BTRIM(NEW.empresa_raw ->> 'RazaoSocial'), ''),
      NULLIF(BTRIM(NEW.empresa_raw ->> 'nome'), '')
    );
    NEW.empresa_nome := COALESCE(NEW.empresa_nome, v_empresa_nome);
  END IF;

  IF NEW.status = 'enviado' AND NEW.nome IS NULL THEN
    RAISE EXCEPTION
      'Nao e permitido concluir uma adesao sem nome do titular.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS fill_cadastro_core_metadata_trigger
  ON public.cadastros;

CREATE TRIGGER fill_cadastro_core_metadata_trigger
BEFORE INSERT OR UPDATE
ON public.cadastros
FOR EACH ROW
EXECUTE FUNCTION public.fill_cadastro_core_metadata();

COMMENT ON FUNCTION public.fill_cadastro_core_metadata()
IS 'Preserva metadados centrais do cadastro e impede status enviado sem nome do titular.';
