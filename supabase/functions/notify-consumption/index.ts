/**
 * Supabase Edge Function: notify-consumption
 *
 * Envía notificaciones push + in-app para todos los eventos del
 * ciclo de vida de un ítem de consumo.
 *
 * Invocado desde:
 *  - webpay/index.ts  (activate_consumption_item)
 *  - dyzgo-scan bartender app  (mark preparing / delivered)
 *
 * Payload esperado:
 * {
 *   user_id?: string          (opcional — se resuelve desde order_item_id si no viene)
 *   type: 'consumption_queued' | 'consumption_preparing' | 'consumption_delivered' | 'consumption_next' | 'consumption_next_up'
 *   order_item_id: string
 *   bar_name?: string
 *   queue_position?: number
 *   item_name?: string
 * }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

interface NotificationConfig {
  title: string;
  body: string;
  data: Record<string, string>;
}

function buildNotification(
  type: string,
  barName: string,
  queuePosition: number,
  itemName: string,
): NotificationConfig {
  switch (type) {
    case 'consumption_queued':
      return {
        title: '🍹 ¡Pedido en cola!',
        body: `Tu ${itemName} está en la fila virtual. Posición #${queuePosition} en ${barName}.`,
        data: { url: '/my-consumptions' },
      };
    case 'consumption_next':
    case 'consumption_next_up':
      return {
        title: '⚡ ¡Prepárate!',
        body: `Están preparando el pedido anterior — eres el siguiente en ${barName}. ¡Acércate ya!`,
        data: { url: '/my-consumptions' },
      };
    case 'consumption_preparing':
      return {
        title: '🔥 ¡Preparando tu pedido!',
        body: `El bartender está preparando tu ${itemName}. Acércate a ${barName}.`,
        data: { url: '/my-consumptions' },
      };
    case 'consumption_delivered':
      return {
        title: '✅ ¡Pedido entregado!',
        body: `Tu ${itemName} fue entregado. ¡Disfruta!`,
        data: { url: '/my-consumptions' },
      };
    case 'consumption_expired':
      return {
        title: '⏰ Pedido expirado',
        body: `Tu ${itemName} expiró porque no fue retirado a tiempo.`,
        data: { url: '/my-consumptions' },
      };
    default:
      return {
        title: 'Actualización de pedido',
        body: `Tu pedido en ${barName} fue actualizado.`,
        data: { url: '/my-consumptions' },
      };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { ...corsHeaders, 'Access-Control-Allow-Methods': 'POST' } });
  }

  try {
    const {
      user_id: userIdFromPayload,
      type,
      order_item_id,
      bar_name = 'Barra',
      queue_position = 1,
      item_name,
    } = await req.json();

    if (!type || !order_item_id) {
      return new Response(JSON.stringify({ error: 'Faltan campos requeridos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Resolver item_name y user_id desde DB si no vienen en el payload
    let resolvedItemName = item_name;
    let user_id = userIdFromPayload;
    if ((!resolvedItemName || !user_id) && order_item_id) {
      const { data: oi } = await supabase
        .from('consumption_order_items')
        .select('item_name, consumption_orders(user_id)')
        .eq('id', order_item_id)
        .single();
      if (!resolvedItemName) resolvedItemName = oi?.item_name ?? 'pedido';
      if (!user_id) user_id = (oi?.consumption_orders as any)?.user_id ?? null;
    }

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'No se pudo resolver user_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { title, body, data } = buildNotification(type, bar_name, queue_position, resolvedItemName ?? 'pedido');

    // 1. Notificación in-app
    await supabase.from('notifications').insert({
      user_id,
      type,
      title,
      message: body,
      related_id: order_item_id ?? null,
      is_read: false,
    });

    // 2. Push notification via Expo
    const { data: profile } = await supabase
      .from('profiles')
      .select('expo_push_token')
      .eq('id', user_id)
      .single();

    if (profile?.expo_push_token) {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: profile.expo_push_token,
          title,
          body,
          data,
          sound: 'default',
          priority: 'high',
        }),
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[notify-consumption ERROR]', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
