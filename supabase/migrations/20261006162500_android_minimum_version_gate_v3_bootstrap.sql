/*
  # Android minimum version gate v3 - bootstrap compatibility

  Corrige o bloqueio dos builds 1.0.140 a 1.0.145 já distribuídos antes da
  inclusão dos headers X-VendaMais-*. Esses builds registram a versão somente
  depois do bootstrap inicial. O pre-request agora libera apenas as rotas
  mínimas necessárias para esse bootstrap e mantém o restante bloqueado para
  Android abaixo do versionCode 140.
*/

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
  v_request_path text := ltrim(trim(COALESCE(current_setting('request.path', true), '')), '/');
  v_platform text;
  v_version_code integer;
  v_minimum_version_code integer;
  v_store_url text;
  v_blocked_message text;
  v_enabled boolean;
BEGIN
  IF auth.uid() IS NULL OR auth.role() <> 'authenticated' THEN
    RETURN;
  END IF;

  -- Web e iOS/WebView executam no navegador e enviam Origin.
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

  -- Compatibilidade com os builds 140-145 já publicados antes dos headers.
  -- O AppViewModel desses builds só chama record_profile_app_seen depois de:
  -- profiles -> teams -> stats/overview.
  -- Liberamos exclusivamente esse bootstrap para que o app consiga registrar
  -- seu versionCode real. Nenhuma rota operacional de cadastro fica liberada.
  IF v_platform_header = '' AND v_request_path = ANY (
    ARRAY[
      'profiles',
      'teams',
      'rpc/get_cadastros_stats',
      'rpc/get_stats_from_cache',
      'rpc/record_profile_app_seen'
    ]
  ) THEN
    RETURN;
  END IF;

  IF v_platform_header <> '' THEN
    IF v_platform_header <> 'android' THEN
      RETURN;
    END IF;

    v_platform := 'android';
    IF v_version_header ~ '^[0-9]+$' THEN
      v_version_code := v_version_header::integer;
    ELSE
      v_version_code := 0;
    END IF;
  ELSE
    SELECT
      lower(trim(COALESCE(last_app_platform, ''))),
      last_app_version_code
    INTO
      v_platform,
      v_version_code
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_platform = 'android' AND v_version_code IS NULL THEN
      v_version_code := 0;
    END IF;

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

ALTER ROLE authenticator
  SET pgrst.db_pre_request = 'public.enforce_mobile_app_minimum_version';

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
