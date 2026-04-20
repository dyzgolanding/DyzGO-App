-- Migración para permitir a usuarios no autenticados (anon) visualizar eventos, clubes, etc.
-- Esto soluciona el problema de que el Home y Explore estén vacíos sin haber iniciado sesión.

-- 1. Permiso para Eventos (solo activos)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'anon_can_read_active_events'
    ) THEN
        CREATE POLICY "anon_can_read_active_events"
        ON events FOR SELECT
        TO anon
        USING (is_active = true AND status IN ('active', 'info'));
    END IF;
END $$;

-- 2. Permiso para Clubes
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'clubs' AND policyname = 'anon_can_read_clubs'
    ) THEN
        CREATE POLICY "anon_can_read_clubs"
        ON clubs FOR SELECT
        TO anon
        USING (true);
    END IF;
END $$;

-- 3. Permiso para Productoras / Experiencias
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'experiences' AND policyname = 'anon_can_read_experiences'
    ) THEN
        CREATE POLICY "anon_can_read_experiences"
        ON experiences FOR SELECT
        TO anon
        USING (true);
    END IF;
END $$;

-- 4. Permiso para Tramos de Tickets
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'ticket_tiers' AND policyname = 'anon_can_read_ticket_tiers'
    ) THEN
        CREATE POLICY "anon_can_read_ticket_tiers"
        ON ticket_tiers FOR SELECT
        TO anon
        USING (true);
    END IF;
END $$;
