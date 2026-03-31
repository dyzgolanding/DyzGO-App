/**
 * Edge Function: notify-brand-event
 *
 * Conectada via Database Webhook en Supabase Dashboard:
 *   Database → Webhooks → Create Webhook
 *   Table: events | Events: INSERT, UPDATE
 *   URL: https://[ref].supabase.co/functions/v1/notify-brand-event
 *
 * Recibe el payload del webhook de Supabase y envía push notifications
 * a los seguidores de la productora que tienen push_enabled = true.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE';
  table: string;
  record: {
    id: string;
    title: string;
    status: string;
    is_active: boolean;
    experience_id: string | null;
    [key: string]: unknown;
  };
  old_record?: {
    status: string;
    is_active: boolean;
    [key: string]: unknown;
  };
}

Deno.serve(async (req: Request) => {
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
    const payload: WebhookPayload = await req.json();
    const { type, record, old_record } = payload;

    // Solo procesar eventos que se están publicando
    const isNewActive =
      type === 'INSERT' &&
      record.status === 'active' &&
      record.is_active === true &&
      record.experience_id != null;

    const isBecomingActive =
      type === 'UPDATE' &&
      record.status === 'active' &&
      record.is_active === true &&
      record.experience_id != null &&
      (old_record?.is_active === false || old_record?.status !== 'active');

    if (!isNewActive && !isBecomingActive) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Obtener seguidores con push_enabled = true + sus tokens
    const { data: followers, error } = await supabase
      .from('saved_brands')
      .select('user_id, push_enabled, profiles(expo_push_token)')
      .eq('experience_id', record.experience_id!)
      .eq('push_enabled', true);

    if (error) throw error;
    if (!followers || followers.length === 0) {
      return new Response(JSON.stringify({ ok: true, pushed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Construir mensajes push para usuarios con token
    const pushMessages = followers
      .map(f => (f.profiles as any)?.expo_push_token)
      .filter((token): token is string => Boolean(token))
      .map(token => ({
        to: token,
        sound: 'default',
        title: 'Nuevo evento publicado',
        body: `Una productora que sigues publicó: ${record.title}`,
        data: { url: `/event-detail?id=${record.id}` },
      }));

    if (pushMessages.length > 0) {
      // Enviar en lotes de 100 (límite de Expo)
      for (let i = 0; i < pushMessages.length; i += 100) {
        const batch = pushMessages.slice(i, i + 100);
        await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batch),
        });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, pushed: pushMessages.length }),
      { headers: { 'Content-Type': 'application/json' } },
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
