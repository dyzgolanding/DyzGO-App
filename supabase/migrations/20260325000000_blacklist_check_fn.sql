-- RPC: check_blacklist(p_event_id, p_user_id?)
-- SECURITY DEFINER → bypasses RLS on blacklist table
-- Checks both email and RUT so entries without email still work
-- Mobile callers: omit p_user_id (auth.uid() used automatically)
-- Edge Function callers (service role): pass p_user_id explicitly

CREATE OR REPLACE FUNCTION check_blacklist(
  p_event_id uuid,
  p_user_id  uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id     uuid;
  v_user_id    uuid;
  v_user_email text;
  v_user_rut   text;
BEGIN
  -- Resolve user: explicit param takes priority, then authenticated user
  v_user_id := COALESCE(p_user_id, auth.uid());

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Get the experience (org) that owns this event
  SELECT experience_id INTO v_org_id
  FROM events
  WHERE id = p_event_id;

  -- No org attached to event → not in any blacklist
  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  -- Get user email from auth.users (accessible via SECURITY DEFINER)
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = v_user_id;

  -- Get user RUT from profiles
  SELECT rut INTO v_user_rut
  FROM profiles
  WHERE id = v_user_id;

  -- Match by email (case-insensitive) OR by RUT
  RETURN EXISTS (
    SELECT 1
    FROM blacklist
    WHERE org_id = v_org_id
      AND status  = 'active'
      AND (
        (v_user_email IS NOT NULL AND lower(trim(email)) = lower(trim(v_user_email)))
        OR
        (v_user_rut IS NOT NULL AND v_user_rut <> '' AND trim(rut) = trim(v_user_rut))
      )
  );
END;
$$;

-- Allow authenticated users to call the function
GRANT EXECUTE ON FUNCTION check_blacklist(uuid, uuid) TO authenticated;
