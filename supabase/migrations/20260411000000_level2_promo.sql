-- ============================================================
-- NIVEL 2: CÓDIGO PROMOCIONAL ÚNICO POR USUARIO (-10%)
-- ============================================================

-- 1. Columnas en profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS level2_promo_code     text UNIQUE,
  ADD COLUMN IF NOT EXISTS level2_promo_reserved text,
  ADD COLUMN IF NOT EXISTS level2_promo_used_at  timestamptz;

-- 2. Función para generar código único (DYZ-XXXXXXXX)
CREATE OR REPLACE FUNCTION generate_unique_level2_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code   text;
  v_exists boolean;
BEGIN
  LOOP
    v_code := 'DYZ-' || upper(substring(encode(gen_random_bytes(4), 'hex'), 1, 8));
    SELECT EXISTS(SELECT 1 FROM profiles WHERE level2_promo_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$;

-- 3. Trigger: asignar código al alcanzar nivel 2
CREATE OR REPLACE FUNCTION assign_level2_promo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.level >= 2 AND (OLD.level IS NULL OR OLD.level < 2) AND NEW.level2_promo_code IS NULL THEN
    NEW.level2_promo_code := generate_unique_level2_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_level2_promo ON profiles;
CREATE TRIGGER trg_assign_level2_promo
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION assign_level2_promo();

-- 4. Backfill: usuarios ya en nivel >= 2 sin código
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM profiles WHERE level >= 2 AND level2_promo_code IS NULL LOOP
    UPDATE profiles SET level2_promo_code = generate_unique_level2_code() WHERE id = r.id;
  END LOOP;
END;
$$;

-- 5. check_level2_promo: valida que el código es del usuario y no fue usado
CREATE OR REPLACE FUNCTION check_level2_promo(p_code text, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_row RECORD;
BEGIN
  SELECT level2_promo_code, level2_promo_used_at, level2_promo_reserved
    INTO v_row FROM profiles WHERE id = p_user_id;
  RETURN (
    v_row.level2_promo_code IS NOT NULL
    AND upper(v_row.level2_promo_code) = upper(p_code)
    AND v_row.level2_promo_used_at IS NULL
    AND v_row.level2_promo_reserved IS NULL
  );
END;
$$;

-- 6. reserve_level2_promo: reserva atómica (previene doble uso)
CREATE OR REPLACE FUNCTION reserve_level2_promo(p_user_id uuid, p_code text, p_buy_order text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
    SET level2_promo_reserved = p_buy_order
  WHERE id = p_user_id
    AND upper(level2_promo_code) = upper(p_code)
    AND level2_promo_used_at IS NULL
    AND level2_promo_reserved IS NULL;
  RETURN FOUND;
END;
$$;

-- 7. confirm_level2_promo: marca como usado al confirmar pago (Webpay Plus)
CREATE OR REPLACE FUNCTION confirm_level2_promo(p_buy_order text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
    SET level2_promo_used_at  = now(),
        level2_promo_reserved = NULL
  WHERE level2_promo_reserved = p_buy_order;
END;
$$;

-- 8. release_level2_promo: libera reserva en fallo de pago (Webpay Plus)
CREATE OR REPLACE FUNCTION release_level2_promo(p_buy_order text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
    SET level2_promo_reserved = NULL
  WHERE level2_promo_reserved = p_buy_order;
END;
$$;

-- 9. confirm_level2_promo_by_user: OneClick — confirmar si hay reserva activa
CREATE OR REPLACE FUNCTION confirm_level2_promo_by_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
    SET level2_promo_used_at  = now(),
        level2_promo_reserved = NULL
  WHERE id = p_user_id
    AND level2_promo_reserved IS NOT NULL;
END;
$$;

-- 10. release_level2_promo_by_user: OneClick — liberar en fallo
CREATE OR REPLACE FUNCTION release_level2_promo_by_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
    SET level2_promo_reserved = NULL
  WHERE id = p_user_id;
END;
$$;

-- Grants para que las funciones sean accesibles desde la app
GRANT EXECUTE ON FUNCTION check_level2_promo(text, uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION reserve_level2_promo(uuid, text, text)  TO service_role;
GRANT EXECUTE ON FUNCTION confirm_level2_promo(text)              TO service_role;
GRANT EXECUTE ON FUNCTION release_level2_promo(text)              TO service_role;
GRANT EXECUTE ON FUNCTION confirm_level2_promo_by_user(uuid)      TO service_role;
GRANT EXECUTE ON FUNCTION release_level2_promo_by_user(uuid)      TO service_role;
