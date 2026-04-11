-- ============================================================
-- Level 1 reward: 10% discount on first ticket purchase
-- Unlocked automatically at account creation (level = 1)
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS level1_promo_reserved  text,        -- buy_order of the pending discounted order
  ADD COLUMN IF NOT EXISTS level1_promo_used_at   timestamptz; -- set when discount is confirmed used

-- ----------------------------------------------------------------
-- reserve_level1_promo
-- Called at order creation. Atomically reserves the promo for a
-- specific buy_order. Returns TRUE if reserved, FALSE if ineligible.
-- Uses FOR UPDATE to prevent race conditions.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION reserve_level1_promo(p_user_id uuid, p_buy_order text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eligible boolean;
BEGIN
  SELECT (level1_promo_reserved IS NULL AND level1_promo_used_at IS NULL)
    INTO v_eligible
    FROM profiles
   WHERE id = p_user_id
     FOR UPDATE;

  IF v_eligible IS NULL THEN RETURN false; END IF;

  IF v_eligible THEN
    UPDATE profiles
       SET level1_promo_reserved = p_buy_order
     WHERE id = p_user_id;
  END IF;

  RETURN v_eligible;
END;
$$;

-- ----------------------------------------------------------------
-- confirm_level1_promo
-- Called when Webpay payment is confirmed. Looks up by buy_order
-- so the commit handler doesn't need to pass user_id separately.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION confirm_level1_promo(p_buy_order text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
     SET level1_promo_used_at = now(),
         level1_promo_reserved = NULL
   WHERE level1_promo_reserved = p_buy_order;
END;
$$;

-- ----------------------------------------------------------------
-- release_level1_promo
-- Called when Webpay payment fails or expires. Frees the reservation
-- so the user can try again. Safety guard: never clears if already confirmed.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION release_level1_promo(p_buy_order text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
     SET level1_promo_reserved = NULL
   WHERE level1_promo_reserved = p_buy_order
     AND level1_promo_used_at IS NULL;
END;
$$;

-- ----------------------------------------------------------------
-- confirm_level1_promo_by_user
-- Used by OneClick flow (has user_id but a different buy_order).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION confirm_level1_promo_by_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
     SET level1_promo_used_at = now(),
         level1_promo_reserved = NULL
   WHERE id = p_user_id
     AND level1_promo_reserved IS NOT NULL
     AND level1_promo_used_at IS NULL;
END;
$$;

-- ----------------------------------------------------------------
-- release_level1_promo_by_user
-- Used by OneClick failure and cancel action.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION release_level1_promo_by_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
     SET level1_promo_reserved = NULL
   WHERE id = p_user_id
     AND level1_promo_used_at IS NULL;
END;
$$;

-- These functions are called exclusively by the service_role key
-- inside Edge Functions. Regular users (authenticated) cannot call them.
REVOKE EXECUTE ON FUNCTION reserve_level1_promo(uuid, text)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION confirm_level1_promo(text)         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION release_level1_promo(text)         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION confirm_level1_promo_by_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION release_level1_promo_by_user(uuid) FROM PUBLIC;
