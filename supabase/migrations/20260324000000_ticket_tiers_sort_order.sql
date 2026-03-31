-- Agrega columna sort_order a ticket_tiers para respetar el orden del drag-and-drop del dashboard
ALTER TABLE ticket_tiers ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Inicializa sort_order con el orden actual por precio para no romper eventos existentes
UPDATE ticket_tiers t
SET sort_order = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY price ASC, created_at ASC) - 1 AS rn
  FROM ticket_tiers
) sub
WHERE t.id = sub.id;
