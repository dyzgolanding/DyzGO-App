-- ============================================================
-- RLS: tabla tickets
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Activar RLS (idempotente)
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar políticas previas conflictivas (si existen)
DROP POLICY IF EXISTS "ticket_owner_can_select"       ON tickets;
DROP POLICY IF EXISTS "event_creator_can_select"      ON tickets;
DROP POLICY IF EXISTS "event_creator_can_update"      ON tickets;
DROP POLICY IF EXISTS "ticket_owner_can_insert"       ON tickets;
DROP POLICY IF EXISTS "service_role_bypass"           ON tickets;

-- ============================================================
-- SELECT
-- ============================================================

-- 2a. El comprador ve sus propios tickets (app móvil / dyzgo-scan)
CREATE POLICY "ticket_owner_can_select"
ON tickets FOR SELECT
USING (user_id = auth.uid());

-- 2b. El creador del evento ve TODOS los tickets de sus eventos (dyzgo-plus)
CREATE POLICY "event_creator_can_select"
ON tickets FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id    = tickets.event_id
      AND events.organizer_id = auth.uid()
  )
);

-- ============================================================
-- INSERT
-- Sólo el propio usuario puede insertar su ticket
-- (La Edge Function usa service_role y bypasea RLS — correcto)
-- ============================================================
CREATE POLICY "ticket_owner_can_insert"
ON tickets FOR INSERT
WITH CHECK (user_id = auth.uid());

-- ============================================================
-- UPDATE
-- El creador del evento puede validar (used=true) o anular tickets
-- ============================================================
CREATE POLICY "event_creator_can_update"
ON tickets FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id    = tickets.event_id
      AND events.organizer_id = auth.uid()
  )
);

-- ============================================================
-- DELETE
-- Sólo la Edge Function (service_role) puede borrar — no se añade
-- política de DELETE para usuarios normales.
-- ============================================================
