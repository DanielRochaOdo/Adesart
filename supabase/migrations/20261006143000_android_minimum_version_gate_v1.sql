/*
  # Android minimum supported version gate

  ## Objetivo
  - Descontinuar Android com versionCode abaixo de 140.
  - Preservar Web/iOS e chamadas com service_role.
  - Permitir que versões Android atuais se identifiquem por header.
  - Manter fallback para APKs legados que já registram a versão em profiles.
  - Tornar o corte ajustável no banco sem novo APK.
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
  -- A regra é exclusiva para usuários autenticados da aplicação.
  -- anon mantém os fluxos públicos e service_role mantém workers/administrações.
  IF auth.uid() IS NULL OR auth.role() <> 'authenticated' THEN
    RETURN;
  END IF;

  -- Navegadores enviam Origin. Isso preserva o Web e o iOS baseado em WebView.
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
    -- Clientes novos declaram explicitamente a plataforma.
    IF v_platform_header <> 'android' THEN
      RETURN;
    END IF;

    v_platform := 'android';
    IF v_version_header ~ '^[0-9]+$' THEN
      v_version_code := v_version_header::integer;
    ELSE
      -- Um Android novo sem versionCode válido é tratado como não suportado.
      v_version_code := 0;
    END IF;
  ELSE
    -- APKs legados não enviam headers próprios. Neles usamos a última versão
    -- registrada pelo RPC record_profile_app_seen.
    SELECT
      lower(trim(COALESCE(last_app_platform, ''))),
      last_app_version_code
    INTO
      v_platform,
      v_version_code
    FROM public.profiles
    WHERE id = auth.uid();

    -- Perfil sem telemetria conhecida não é bloqueado preventivamente.
    -- Assim que uma versão legada >= 1.0.60 registrar a versão, a regra passa
    -- a valer nas requisições seguintes.
    IF v_platform IS NULL OR v_platform = '' OR v_version_code IS NULL THEN
      RETURN;
    END IF;

    IF v_platform <> 'android' THEN
      RETURN;
    END IF;
  END IF;

  IF v_version_code < v_minimum_version_code THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format(
        'VENDA_MOBILE_UPDATE_REQUIRED|minimum=%s|current=%s|store=%s|message=%s',
        v_minimum_version_code,
        v_version_code,
        COALESCE(v_store_url, ''),
        COALESCE(v_blocked_message, 'Atualização obrigatória.')
      );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_mobile_app_minimum_version() FROM PUBLIC;

-- Executa antes de cada chamada ao Data API (PostgREST).
ALTER ROLE authenticator
  SET pgrst.db_pre_request = 'public.enforce_mobile_app_minimum_version';

NOTIFY pgrst, 'reload config';
