-- Add external_ticket_url to events (for 'info' status events)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS external_ticket_url TEXT;

-- Add is_god flag to profiles (god users can set info status + external URL)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_god BOOLEAN DEFAULT false;

-- Analytics table for clicks on info events
CREATE TABLE IF NOT EXISTS info_event_clicks (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id    UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name   TEXT,
  user_email  TEXT,
  action      TEXT        NOT NULL CHECK (action IN ('modal_opened', 'redirect_confirmed')),
  clicked_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE info_event_clicks ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert their own clicks
CREATE POLICY "auth_insert_info_clicks"
  ON info_event_clicks FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Event organizers can read clicks for their events
CREATE POLICY "organizers_read_info_clicks"
  ON info_event_clicks FOR SELECT
  TO authenticated
  USING (
    event_id IN (
      SELECT id FROM events WHERE organizer_id = auth.uid()
    )
  );
