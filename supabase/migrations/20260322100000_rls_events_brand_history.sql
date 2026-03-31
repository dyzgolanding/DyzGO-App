-- ============================================================
-- RLS: permitir lectura pública de eventos finalizados
-- que pertenezcan a una experiencia (brand profile).
-- Problema: la política anterior solo exponía eventos activos,
-- bloqueando el historial de eventos pasados en brand-profile
-- para usuarios que no son el organizador.
-- ============================================================

-- Permitir a cualquier usuario autenticado ver eventos finalizados
-- que pertenezcan a una experiencia (experience_id NOT NULL)
CREATE POLICY "authenticated_can_read_brand_past_events"
ON events FOR SELECT
TO authenticated
USING (
  experience_id IS NOT NULL
  AND status IN ('active', 'finished', 'inactive')
  AND status != 'draft'
);
