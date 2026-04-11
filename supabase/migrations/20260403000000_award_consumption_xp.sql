-- ============================================================
-- Award 40 XP per consumption item purchased through the app
-- ============================================================

-- 1. Track whether XP has been awarded for each consumption order
ALTER TABLE consumption_orders
  ADD COLUMN IF NOT EXISTS xp_awarded_at timestamptz;

-- 2. Secure RPC: only the order's owner can trigger it,
--    only for paid orders, and only once (idempotent).
CREATE OR REPLACE FUNCTION award_consumption_xp(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid;
  v_status     text;
  v_awarded_at timestamptz;
  v_item_count int;
  v_xp_amount  int;
  v_cur_xp     int;
  v_new_xp     int;
  v_new_level  int;
BEGIN
  -- Lock the row to prevent race conditions
  SELECT user_id, status, xp_awarded_at
    INTO v_user_id, v_status, v_awarded_at
    FROM consumption_orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  -- Only the authenticated owner can award XP for their order
  IF v_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Only award for confirmed paid orders
  IF v_status <> 'paid' THEN
    RAISE EXCEPTION 'order_not_paid';
  END IF;

  -- Idempotency: return false (not an error) if already awarded
  IF v_awarded_at IS NOT NULL THEN
    RETURN false;
  END IF;

  -- Count purchased items to calculate XP (40 XP per item)
  SELECT COUNT(*)
    INTO v_item_count
    FROM consumption_order_items
   WHERE order_id = p_order_id;

  v_item_count := GREATEST(v_item_count, 1); -- minimum 1 item
  v_xp_amount  := v_item_count * 40;

  -- Read current XP, compute new total
  SELECT COALESCE(xp, 0)
    INTO v_cur_xp
    FROM profiles
   WHERE id = v_user_id;

  v_new_xp := v_cur_xp + v_xp_amount;

  -- Determine new level from XP thresholds
  SELECT COALESCE(MAX(lvl), 1)
    INTO v_new_level
    FROM (VALUES
      (1,      0), (2,   1000), (3,   3500), (4,   8000),
      (5,  15000), (6,  25000), (7,  40000), (8,  65000),
      (9, 100000), (10, 150000)
    ) AS t(lvl, min_xp)
   WHERE min_xp <= v_new_xp;

  -- Award XP and update level
  UPDATE profiles
     SET xp    = v_new_xp,
         level = v_new_level
   WHERE id = v_user_id;

  -- Mark order as XP awarded (prevents re-award)
  UPDATE consumption_orders
     SET xp_awarded_at = now()
   WHERE id = p_order_id;

  RETURN true;
END;
$$;

-- Only authenticated users can execute this function
REVOKE ALL ON FUNCTION award_consumption_xp(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION award_consumption_xp(uuid) TO authenticated;
