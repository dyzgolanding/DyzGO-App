-- Fix check_level2_promo: no bloquear verificación mientras haya una reserva pendiente.
-- La reserva (level2_promo_reserved) es un estado transitorio que se libera en cancel.
-- El check solo debe confirmar que el código no fue usado de forma permanente (used_at IS NULL).
-- La protección contra doble uso ya la tiene reserve_level2_promo (UPDATE atómico con reserved IS NULL).

CREATE OR REPLACE FUNCTION check_level2_promo(p_code text, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_row RECORD;
BEGIN
  SELECT level2_promo_code, level2_promo_used_at
    INTO v_row FROM profiles WHERE id = p_user_id;
  RETURN (
    v_row.level2_promo_code IS NOT NULL
    AND upper(v_row.level2_promo_code) = upper(p_code)
    AND v_row.level2_promo_used_at IS NULL
  );
END;
$$;
