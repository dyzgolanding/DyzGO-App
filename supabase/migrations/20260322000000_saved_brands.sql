-- ─────────────────────────────────────────────────────────────────────────────
-- saved_brands: usuarios pueden seguir productoras (experiences)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS saved_brands (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES profiles(id)     ON DELETE CASCADE,
  experience_id uuid        NOT NULL REFERENCES experiences(id)  ON DELETE CASCADE,
  push_enabled  boolean     NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (user_id, experience_id)
);

ALTER TABLE saved_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own saved_brands"
  ON saved_brands FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: notificación IN-APP cuando una productora publica un evento.
-- Las push notifications las maneja la Edge Function notify-brand-event
-- conectada via Database Webhook (ver instrucciones en el README).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION notify_brand_followers_inapp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT (
    (TG_OP = 'INSERT'
      AND NEW.status    = 'active'
      AND NEW.is_active = true
      AND NEW.experience_id IS NOT NULL)
    OR
    (TG_OP = 'UPDATE'
      AND NEW.status    = 'active'
      AND NEW.is_active = true
      AND NEW.experience_id IS NOT NULL
      AND (OLD.is_active = false OR OLD.status != 'active'))
  ) THEN
    RETURN NEW;
  END IF;

  -- Insertar notificación in-app para todos los seguidores
  INSERT INTO notifications (user_id, title, message, type, related_id, is_read)
  SELECT
    sb.user_id,
    'Nuevo evento publicado',
    'Una productora que sigues publicó: ' || NEW.title,
    'new_event',
    NEW.id,
    false
  FROM saved_brands sb
  WHERE sb.experience_id = NEW.experience_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_event_published_inapp ON events;
CREATE TRIGGER on_event_published_inapp
  AFTER INSERT OR UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION notify_brand_followers_inapp();
