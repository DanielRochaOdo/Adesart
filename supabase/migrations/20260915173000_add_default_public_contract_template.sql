-- Contrato-base do fluxo publico por Link/QR.
-- plan_code = 0 representa o template padrao, usado quando nao houver
-- um contrato especifico para o codigo de plano selecionado.

DO $$
DECLARE
  v_next_version integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM contract_templates
    WHERE plan_code = 0
      AND is_active = true
      AND effective_until IS NULL
  ) THEN
    SELECT coalesce(max(version), 0) + 1
      INTO v_next_version
    FROM contract_templates
    WHERE plan_code = 0;

    INSERT INTO contract_templates (
      plan_code,
      title,
      body_text,
      version,
      is_active,
      effective_from,
      effective_until
    )
    VALUES (
      0,
      'CONTRATO DE ADESÃO ODONTOART',
      $contract$Eu, {{NOME_RF}}, portador(a) do CPF {{CPF_RF}}, registrado(a) na empresa {{EMPRESA}}, confirmo, na data de hoje ({{DATA_ACEITE}}), que autorizo a averbação para desconto mensal em minha folha de pagamento, em favor da Odontoart Planos Odontológicos Ltda., no valor de R$ {{VALOR_DO_PLANO}}, referente aos beneficiários: {{BENEFICIARIOS}}, pelo período de 12 (doze) meses, renovável automaticamente por prazo indeterminado, sem necessidade de solicitação expressa.

Declaro ter conhecimento e estar de acordo com as condições regulamentares da Odontoart Planos Odontológicos Ltda., bem como assumo total responsabilidade pelas informações por mim prestadas.

Sr(a). {{NOME_RF}}, confirma?$contract$,
      v_next_version,
      true,
      now(),
      NULL
    );
  END IF;
END
$$;
