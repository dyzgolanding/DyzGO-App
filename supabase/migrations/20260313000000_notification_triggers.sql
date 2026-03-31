-- =============================================================================
-- NOTIFICATION TRIGGERS — DyzGO
-- Requiere extensiones: pg_net y pg_cron
-- Habilitarlas en: Supabase Dashboard → Database → Extensions
--
-- ANTES DE EJECUTAR: reemplaza las dos constantes de abajo con tus valores reales
--   SUPABASE_URL      → Dashboard → Settings → API → Project URL
--   SERVICE_ROLE_KEY  → Dashboard → Settings → API → service_role (secret)
-- =============================================================================

-- ⚙️  CONSTANTES — EDITAR AQUÍ
DO $$ BEGIN
  -- Estas variables se usan solo para verificar que las extensiones estén activas
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'Extensión pg_net no está habilitada. Actívala en Dashboard → Database → Extensions';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'Extensión pg_cron no está habilitada. Actívala en Dashboard → Database → Extensions';
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 1. NUEVO EVENTO EN CLUB GUARDADO
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_saved_club_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user            RECORD;
  v_notify_url      CONSTANT TEXT := 'https://kovkkdhnmgavnqyjbqzd.supabase.co/functions/v1/notify';
  v_service_key     CONSTANT TEXT := 'REEMPLAZA_CON_TU_SERVICE_ROLE_KEY';
  v_body            JSONB;
BEGIN
  -- Solo actuar cuando el evento se publica (is_active = TRUE)
  IF NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  -- En UPDATE, solo si recién se activó (estaba FALSE antes)
  IF TG_OP = 'UPDATE' AND (OLD.is_active IS TRUE) THEN
    RETURN NEW;
  END IF;

  -- Notificar a cada usuario que tiene guardado este club
  FOR v_user IN
    SELECT sc.user_id
    FROM   saved_clubs sc
    WHERE  sc.club_id = NEW.club_id
  LOOP
    v_body := jsonb_build_object(
      'user_id',    v_user.user_id,
      'type',       'new_event_in_club',
      'title',      '¡Nuevo evento en tu club!',
      'message',    COALESCE(NEW.title, 'Hay un nuevo evento en un club que seguís.'),
      'related_id', NEW.id::text
    );

    PERFORM net.http_post(
      url     := v_notify_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := v_body
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_event_notify_insert ON events;
CREATE TRIGGER trg_new_event_notify_insert
  AFTER INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION notify_saved_club_users();

DROP TRIGGER IF EXISTS trg_new_event_notify_update ON events;
CREATE TRIGGER trg_new_event_notify_update
  AFTER UPDATE OF is_active ON events
  FOR EACH ROW EXECUTE FUNCTION notify_saved_club_users();


-- -----------------------------------------------------------------------------
-- 2. RECORDATORIO DE EVENTO PRÓXIMO
--    Job diario a las 10:00 AM UTC (7:00 AM Chile verano)
--    Notifica a usuarios con alerta activa cuando un evento está a 1 o 3 días
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION send_event_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec             RECORD;
  v_notify_url      CONSTANT TEXT := 'https://kovkkdhnmgavnqyjbqzd.supabase.co/functions/v1/notify';
  v_service_key     CONSTANT TEXT := 'REEMPLAZA_CON_TU_SERVICE_ROLE_KEY';
  v_body            JSONB;
  v_days            INT;
  v_msg             TEXT;
BEGIN
  FOR v_rec IN
    SELECT
      se.user_id,
      e.id                           AS event_id,
      e.title                        AS event_title,
      (e.date::date - CURRENT_DATE)  AS days_left
    FROM saved_events se
    JOIN events       e  ON e.id = se.event_id
    -- Solo si el usuario tiene la alerta activada (registro tipo 'reminder')
    JOIN notifications n
      ON  n.user_id    = se.user_id
      AND n.related_id = se.event_id::text
      AND n.type       = 'reminder'
    WHERE
      e.is_active = true
      AND e.date IS NOT NULL
      AND (e.date::date - CURRENT_DATE) IN (1, 3)
    -- Evitar duplicados: ignorar si ya se envió un recordatorio en las últimas 48h
    AND NOT EXISTS (
      SELECT 1
      FROM   notifications nx
      WHERE  nx.user_id    = se.user_id
        AND  nx.related_id = e.id::text
        AND  nx.type       = 'event_reminder'
        AND  nx.created_at >= NOW() - INTERVAL '2 days'
    )
  LOOP
    v_days := v_rec.days_left;

    IF v_days = 1 THEN
      v_msg := '¡' || v_rec.event_title || ' es mañana! Asegúrate de tener tu entrada lista.';
    ELSE
      v_msg := v_rec.event_title || ' es en ' || v_days || ' días. ¡No te lo pierdas!';
    END IF;

    v_body := jsonb_build_object(
      'user_id',    v_rec.user_id,
      'type',       'event_reminder',
      'title',      '⏰ Recordatorio de evento',
      'message',    v_msg,
      'related_id', v_rec.event_id::text
    );

    PERFORM net.http_post(
      url     := v_notify_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := v_body
    );
  END LOOP;
END;
$$;

-- Programar el job diario
SELECT cron.schedule(
  'dyzgo-event-reminders',
  '0 10 * * *',
  $$SELECT send_event_reminders()$$
);
