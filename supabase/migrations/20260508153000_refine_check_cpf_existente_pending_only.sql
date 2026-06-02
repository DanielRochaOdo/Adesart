/*
  # Refine check_cpf_existente to avoid false "pending" positives

  ## Why
  - Some flows were blocking a new adesao because any historical row with the same CPF
    was treated as "existing pending cadastro".
  - We only want to block when there is an active local pending cadastro for titular flow.

  ## Changes
  - Normalizes CPF input inside the function.
  - Only considers `tipo_cadastro = 'cadastro'`.
  - Only considers pending statuses: `incompleto`, `erro_envio`, `adesoes_pendentes`.
  - Keeps ignoring rows present in `cadastros_excluidos`.
  - Preserves role-based can_continue behavior.
*/

CREATE OR REPLACE FUNCTION check_cpf_existente(
  p_cpf text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cadastro record;
  v_user_role text;
  v_user_external_id text;
  v_can_continue boolean := false;
  v_cpf text;
BEGIN
  v_cpf := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');

  IF length(v_cpf) <> 11 THEN
    RETURN jsonb_build_object(
      'exists', false,
      'can_continue', false
    );
  END IF;

  SELECT role, external_id
  INTO v_user_role, v_user_external_id
  FROM profiles
  WHERE id = p_user_id;

  IF v_user_role IS NULL THEN
    RETURN jsonb_build_object(
      'exists', false,
      'error', 'Usuario nao encontrado'
    );
  END IF;

  SELECT
    c.id,
    c.status,
    c.created_at,
    c.empresa_nome,
    c.vendedor_codigo
  INTO v_cadastro
  FROM cadastros c
  WHERE c.cpf = v_cpf
    AND c.tipo_cadastro = 'cadastro'
    AND c.status IN ('incompleto', 'erro_envio', 'adesoes_pendentes')
    AND NOT EXISTS (
      SELECT 1
      FROM cadastros_excluidos ce
      WHERE ce.cadastro_id = c.id
    )
  ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC, c.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'exists', false,
      'can_continue', false
    );
  END IF;

  IF v_user_role IN ('ADMINISTRADOR', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'CADASTRO') THEN
    v_can_continue := true;
  ELSIF v_user_role IN ('VENDEDOR', 'ADESIONISTA') THEN
    v_can_continue := (v_cadastro.vendedor_codigo = v_user_external_id);
  ELSE
    v_can_continue := false;
  END IF;

  RETURN jsonb_build_object(
    'exists', true,
    'can_continue', v_can_continue,
    'status', v_cadastro.status,
    'cadastro_id', CASE WHEN v_can_continue THEN v_cadastro.id ELSE NULL END,
    'created_at', v_cadastro.created_at,
    'empresa_nome', v_cadastro.empresa_nome
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_cpf_existente(text, uuid) TO authenticated;

COMMENT ON FUNCTION check_cpf_existente IS
  'Checks only active pending titular cadastros for a CPF, ignoring deleted rows and preserving role-based continuation rules.';
