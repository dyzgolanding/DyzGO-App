/**
 * Supabase Edge Function: notify
 *
 * Propósito: Crear notificaciones in-app y enviar push notifications
 * desde triggers de base de datos o llamadas directas.
 *
 * Invocación (desde trigger via pg_net o directamente desde el cliente):
 *   POST /functions/v1/notify
 *   Body: NotifyPayload
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface NotifyPayload {
  /** ID del usuario receptor */
  user_id: string;
  /** Tipo de notificación */
  type: string;
  /** Título */
  title: string;
  /** Mensaje */
  message: string;
  /** ID relacionado (event_id, club_id, ticket_id, etc.) */
  related_id?: string;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  try {
    const payload: NotifyPayload = await req.json();
    const { user_id, type, title, message, related_id } = payload;

    if (!user_id || !type || !title || !message) {
      return new Response(JSON.stringify({ error: 'Faltan campos requeridos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Crear notificación in-app
    const { error: notifError } = await supabase.from('notifications').insert({
      user_id,
      type,
      title,
      message,
      related_id: related_id ?? null,
      is_read: false,
    });

    if (notifError) throw notifError;

    // 2. Obtener push token del usuario
    const { data: profile } = await supabase
      .from('profiles')
      .select('expo_push_token')
      .eq('id', user_id)
      .single();

    if (profile?.expo_push_token) {
      // 3. Enviar push notification via Expo
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: profile.expo_push_token,
          sound: 'default',
          title,
          body: message,
          data: { url: '/notifications' },
        }),
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
