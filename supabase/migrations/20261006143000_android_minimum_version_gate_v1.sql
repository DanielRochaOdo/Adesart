/*
  # Android minimum supported version gate

  ## Objetivo
  - Descontinuar Android com versionCode abaixo de 140.
  - Preservar Web/iOS e chamadas com service_role.
  - Permitir que versões Android atuais se identifiquem por header.
  - Usar a última versão registrada em profiles para APKs legados.
  - Registrar o pre-request também no escopo do banco para evitar override.
*/

CREATE TABLE IF NOT EXISTS public.mobile_app_release_policy (
  platform text PRIMARY KEY,
  minimum_version_code integer NOT NULL CHECK (minimum_version_code > 0),
  store_url text,
  blocked_message text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.mobile_app_release_policy (
  platform,
  minimum_version_code,
  store_url,
  blocked_message,
  enabled,
  updated_at
)
VALUES (
  'android',
  140,
  'https://play.google.com/store/apps/details?id=br.com.vendamais.mobile',
  'Esta versão do Venda+ foi descontinuada e não pode mais ser utilizada. Atualize o aplicativo pela Google Play para continuar.',
  true,
  now()
)
ON CONFLICT (platform) DO UPDATE
SET
  minimum_version_code = EXCLUDED.minimum_version_code,
  store_url = EXCLUDED.store_url,
  blocked_message = EXCLUDED.blocked_message,
  enabled = EXCLUDED.enabled,
  updated_at = now();

REVOKE ALL ON TABLE public.mobile_app_release_policy FROM PUBLIC;
REVOKE ALL ON TABLE public.mobile_app_release_policy FROM anon;
REVOKE ALL ON TABLE public.mobile_app_release_policy FROM authenticated;

CREATE OR REPLACE FUNCTION public.enforce_mobile_app_minimum_version()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headers jsonb :=
    COALESCE(
      NULLIF(current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
  v_origin text := lower(trim(COALESCE(v_headers ->> 'origin', '')));
  v_platform_header text := lower(trim(COALESCE(v_headers ->> 'x-vendamais-platform', '')));
  v_version_header text := trim(COALESCE(v_headers ->> 'x-vendamais-version-code', ''));
  v_platform text;
  v_version_code integer;
  v_minimum_version_code integer;
  v_store_url text;
  v_blocked_message text;
  v_enabled boolean;
BEGIN
  -- O login do Supabase Auth não passa pelo PostgREST. A trava começa na
  -- primeira chamada autenticada ao Data API.
  IF auth.uid() IS NULL OR auth.role() <> 'authenticated' THEN
    RETURN;
  END IF;

  -- Web e iOS/WebView executam no navegador e enviam Origin nas chamadas CORS.
  -- A trava abaixo é exclusiva para cliente nativo sem Origin.
  IF v_origin <> '' THEN
    RETURN;
  END IF;

  SELECT
    minimum_version_code,
    store_url,
    blocked_message,
    enabled
  INTO
    v_minimum_version_code,
    v_store_url,
    v_blocked_message,
    v_enabled
  FROM public.mobile_app_release_policy
  WHERE platform = 'android';

  IF NOT FOUND OR NOT COALESCE(v_enabled, false) THEN
    RETURN;
  END IF;

  IF v_platform_header <> '' THEN
    -- Builds novos: a versão declarada no request é a fonte de verdade.
    IF v_platform_header <> 'android' THEN
      RETURN;
    END IF;

    v_platform := 'android';
    IF v_version_header ~ '^[0-9]+$' THEN
      v_version_code := v_version_header::integer;
    ELSE
      -- Android que se identifica sem versionCode válido é bloqueado.
      v_version_code := 0;
    END IF;
  ELSE
    -- Builds legados: usam a versão registrada pelo próprio APK em profiles.
    SELECT
      lower(trim(COALESCE(last_app_platform, ''))),
      last_app_version_code
    INTO
      v_platform,
      v_version_code
    FROM public.profiles
    WHERE id = auth.uid();

    -- Se já sabemos que é Android, ausência de versionCode também bloqueia.
    IF v_platform = 'android' AND v_version_code IS NULL THEN
      v_version_code := 0;
    END IF;

    -- Sem evidência de cliente Android, não atingir Web/outros consumidores.
    IF v_platform IS NULL OR v_platform = '' OR v_platform <> 'android' THEN
      RETURN;
    END IF;
  END IF;

  IF COALESCE(v_version_code, 0) < v_minimum_version_code THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format(
        '%s VENDA_MOBILE_UPDATE_REQUIRED|minimum=%s|current=%s|store=%s',
        COALESCE(v_blocked_message, 'Atualização obrigatória.'),
        v_minimum_version_code,
        COALESCE(v_version_code, 0),
        COALESCE(v_store_url, '')
      );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_mobile_app_minimum_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_mobile_app_minimum_version()
  TO authenticator, anon, authenticated, service_role;

-- Configuração em nível de role.
ALTER ROLE authenticator
  SET pgrst.db_pre_request = 'public.enforce_mobile_app_minimum_version';

-- Configuração em nível do banco. Ela prevalece sobre uma configuração
-- genérica da role e evita que outro valor já existente neutralize a trava.
DO $$
BEGIN
  EXECUTE format(
    'ALTER ROLE authenticator IN DATABASE %I SET pgrst.db_pre_request = %L',
    current_database(),
    'public.enforce_mobile_app_minimum_version'
  );
END;
$$;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
