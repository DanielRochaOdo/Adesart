/*
  # Harden Android minimum version gate v2

  Esta migration de correção deve ser aplicada mesmo se a v1 já tiver sido
  executada no ambiente. O principal reforço é registrar pgrst.db_pre_request
  no escopo do banco e conceder EXECUTE explicitamente aos roles do Data API.
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

  -- Browser/WebView possui Origin; Android nativo legado não possui.
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
