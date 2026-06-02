/*
  # Add last known app usage fields to profiles

  ## Summary
  Stores the last known app version/platform for each user profile. The
  timestamp is controlled by the database through the RPC below.
*/

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS last_app_version_name text,
ADD COLUMN IF NOT EXISTS last_app_version_code integer,
ADD COLUMN IF NOT EXISTS last_app_platform text,
ADD COLUMN IF NOT EXISTS last_app_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_last_app_seen_at
  ON profiles(last_app_seen_at DESC)
  WHERE last_app_seen_at IS NOT NULL;

CREATE OR REPLACE FUNCTION record_profile_app_seen(
  p_version_name text,
  p_version_code integer,
  p_platform text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_platform text := lower(trim(p_platform));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_platform IS NULL OR v_platform = '' THEN
    RAISE EXCEPTION 'Platform is required';
  END IF;

  UPDATE profiles
  SET
    last_app_version_name = nullif(trim(p_version_name), ''),
    last_app_version_code = p_version_code,
    last_app_platform = v_platform,
    last_app_seen_at = now()
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION record_profile_app_seen(text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_profile_app_seen(text, integer, text) TO authenticated;
