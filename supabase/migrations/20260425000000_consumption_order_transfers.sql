-- =============================================================================
-- CONSUMPTION ORDER TRANSFERS
-- Permite transferir un pedido de consumo pagado (todos los ítems inactive)
-- a otro usuario, igual que la lógica de ticket_transfers.
-- =============================================================================

-- ─── Tabla ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consumption_order_transfers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID        NOT NULL REFERENCES consumption_orders(id) ON DELETE CASCADE,
  sender_id  UUID        NOT NULL REFERENCES auth.users(id),
  token      TEXT        NOT NULL UNIQUE,
  is_used    BOOLEAN     NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE consumption_order_transfers ENABLE ROW LEVEL SECURITY;

-- El emisor puede insertar y leer sus propios registros de transferencia
CREATE POLICY "sender_can_insert" ON consumption_order_transfers
  FOR INSERT WITH CHECK (sender_id = auth.uid());

CREATE POLICY "sender_can_select" ON consumption_order_transfers
  FOR SELECT USING (sender_id = auth.uid());

-- ─── RPC: Transferencia directa a amigo ──────────────────────────────────────
CREATE OR REPLACE FUNCTION transfer_consumption_order_direct(
  p_order_id     UUID,
  p_recipient_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_non_inactive INT;
BEGIN
  -- Verificar que el pedido existe, pertenece al caller y está pagado
  IF NOT EXISTS (
    SELECT 1 FROM consumption_orders
    WHERE id = p_order_id
      AND user_id = auth.uid()
      AND status = 'paid'
  ) THEN
    RAISE EXCEPTION 'Pedido no encontrado, no te pertenece, o no está pagado';
  END IF;

  -- Verificar que ningún ítem fue activado todavía
  SELECT COUNT(*) INTO v_non_inactive
  FROM consumption_order_items
  WHERE order_id = p_order_id AND status <> 'inactive';

  IF v_non_inactive > 0 THEN
    RAISE EXCEPTION 'No se puede transferir: % ítem(s) ya fueron activados', v_non_inactive;
  END IF;

  -- Transferir
  UPDATE consumption_orders
  SET user_id = p_recipient_id
  WHERE id = p_order_id;
END;
$$;

-- ─── RPC: Reclamar transferencia por token/link ───────────────────────────────
CREATE OR REPLACE FUNCTION claim_consumption_order_transfer(
  p_token        TEXT,
  p_new_owner_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_t          consumption_order_transfers%ROWTYPE;
  v_non_inactive INT;
  v_item_count INT;
  v_event_title TEXT;
BEGIN
  -- Buscar token
  SELECT * INTO v_t FROM consumption_order_transfers WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Enlace inválido o no encontrado');
  END IF;

  IF v_t.is_used THEN
    RETURN jsonb_build_object('success', false, 'message', 'Este enlace ya fue reclamado');
  END IF;

  IF v_t.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Este enlace ha expirado');
  END IF;

  -- Verificar que el pedido aún está pagado
  IF NOT EXISTS (
    SELECT 1 FROM consumption_orders WHERE id = v_t.order_id AND status = 'paid'
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'El pedido ya no está disponible');
  END IF;

  -- Verificar que ningún ítem fue activado
  SELECT COUNT(*) INTO v_non_inactive
  FROM consumption_order_items
  WHERE order_id = v_t.order_id AND status <> 'inactive';

  IF v_non_inactive > 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Parte de este pedido ya fue activada');
  END IF;

  -- Marcar token como usado y transferir
  UPDATE consumption_order_transfers SET is_used = true WHERE id = v_t.id;
  UPDATE consumption_orders SET user_id = p_new_owner_id WHERE id = v_t.order_id;

  -- Datos para la respuesta
  SELECT e.title INTO v_event_title
  FROM events e
  JOIN consumption_orders co ON co.event_id = e.id
  WHERE co.id = v_t.order_id;

  SELECT COUNT(*) INTO v_item_count
  FROM consumption_order_items WHERE order_id = v_t.order_id;

  RETURN jsonb_build_object(
    'success',     true,
    'order_id',    v_t.order_id,
    'event_title', v_event_title,
    'sender_id',   v_t.sender_id,
    'item_count',  v_item_count
  );
END;
$$;
