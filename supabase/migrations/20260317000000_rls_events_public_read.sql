-- ============================================================
-- RLS: tabla events — lectura pública de eventos activos
-- Problema: la política anterior solo permitía ver los eventos
-- propios (organizer_id = auth.uid()), bloqueando eventos de
-- otras productoras para usuarios normales.
-- ============================================================

-- 1. Activar RLS (idempotente)
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar políticas de SELECT previas que restringían por organizador
DROP POLICY IF EXISTS "events_select_own"              ON events;
DROP POLICY IF EXISTS "organizer_can_select"           ON events;
DROP POLICY IF EXISTS "event_creator_can_select"       ON events;
DROP POLICY IF EXISTS "users_can_view_own_events"      ON events;
DROP POLICY IF EXISTS "select_own_events"              ON events;
DROP POLICY IF EXISTS "events_select_policy"           ON events;

-- 3. Política pública: cualquier usuario autenticado puede leer
--    eventos que estén activos y publicados
CREATE POLICY "authenticated_can_read_active_events"
ON events FOR SELECT
TO authenticated
USING (is_active = true AND status = 'active');

-- 4. El organizador puede leer TODOS sus eventos (incluso borradores)
CREATE POLICY "organizer_can_read_own_events"
ON events FOR SELECT
TO authenticated
USING (organizer_id = auth.uid());

-- 5. INSERT / UPDATE / DELETE: solo el organizador (sin cambios)
DROP POLICY IF EXISTS "organizer_can_insert" ON events;
DROP POLICY IF EXISTS "organizer_can_update" ON events;
DROP POLICY IF EXISTS "organizer_can_delete" ON events;

CREATE POLICY "organizer_can_insert"
ON events FOR INSERT
TO authenticated
WITH CHECK (organizer_id = auth.uid());

CREATE POLICY "organizer_can_update"
ON events FOR UPDATE
TO authenticated
USING (organizer_id = auth.uid());

CREATE POLICY "organizer_can_delete"
ON events FOR DELETE
TO authenticated
USING (organizer_id = auth.uid());
