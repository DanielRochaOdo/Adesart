-- O texto-base antigo continha um prazo fixo de 12 meses.
-- Publica nova versao do modelo padrao, sem alterar documentos ja assinados
-- nem modelos personalizados. O texto e preenchido com a vigencia do ERP
-- pela Edge Function cadastro-public-contract-prepare.
DO $$
DECLARE
  old_template contract_templates%ROWTYPE;
  next_version integer;
BEGIN
  SELECT * INTO old_template
  FROM contract_templates
  WHERE plan_code = 0
    AND is_active = true
    AND effective_until IS NULL
    AND title = 'CONTRATO DE ADESÃO ODONTOART'
    AND body_text LIKE 'Eu, {{NOME_RF}}, portador(a) do CPF {{CPF_RF}}%'
    AND position('pelo período de 12 (doze) meses' IN body_text) > 0
  FOR UPDATE;

  IF FOUND THEN
    SELECT coalesce(max(version), 0) + 1 INTO next_version
    FROM contract_templates WHERE plan_code = 0;

    UPDATE contract_templates
    SET is_active = false, effective_until = now(), updated_at = now()
    WHERE id = old_template.id;

    INSERT INTO contract_templates (
      plan_code, title, body_text, version, is_active,
      effective_from, effective_until, created_by, content_hash
    )
    VALUES (
      0,
      old_template.title,
      replace(
        old_template.body_text,
        'pelo período de 12 (doze) meses',
        'pelo período de {{PERIODO_CONTRATO}}'
      ),
      next_version,
      true,
      now(),
      NULL,
      old_template.created_by,
      NULL
    );
  END IF;
END $$;
