import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const extractRutFromQr = (qrData: string): string | null => {
  try {
    if (qrData.includes('RUN=') || qrData.includes('run=')) {
      const match = qrData.match(/[?&](?:RUN|run)=([^&]+)/);
      if (match && match[1]) {
        const clean = match[1].replace(/\./g, '').replace(/-/g, '').toUpperCase();
        if (clean.length > 1) return clean.slice(0, -1);
      }
    }
    const clean = qrData.replace(/\./g, '').replace(/-/g, '').toUpperCase();
    if (/^[0-9]+[0-9K]$/.test(clean) || /^[0-9]+$/.test(clean)) {
      return clean.replace('K', '').slice(0, -1);
    }
  } catch (_) { return null; }
  return null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const respond = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const { rawContent, eventId, staffId } = await req.json();

    if (!rawContent || !eventId || !staffId) {
      return respond({ result: 'ERROR', message: 'Faltan parámetros' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Verificar staff activo
    const { data: staffData } = await admin
      .from('event_staff')
      .select('is_active')
      .eq('id', staffId)
      .single();

    if (!staffData || staffData.is_active === false) {
      return respond({ result: 'STAFF_INACTIVE', message: 'Staff desactivado' }, 403);
    }

    // 2. Buscar ticket por QR hash o ID
    const cleanCode = rawContent.replace('DYZ-', '').replace('DYZ', '');

    const { data: ticketsFound, error: selectErr } = await admin
      .from('tickets')
      .select(`id, used, status, guest_name, event_id, user_rut, ticket_tiers ( name, nominative, description ), profiles ( full_name )`)
      .or(`qr_hash.eq.${rawContent},qr_hash.eq.${cleanCode},id.eq.${rawContent}`)
      .limit(1);

    if (selectErr) console.error('[scan-ticket] select error:', selectErr.message);

    if (ticketsFound && ticketsFound.length > 0) {
      const ticket = ticketsFound[0];

      if ((ticket.ticket_tiers as any)?.nominative === true) {
        return respond({
          result: 'NOMINATIVE',
          message: 'Se necesita el QR del carnet.',
          subMessage: 'Este ticket es personal.',
        });
      }

      return await processTicket(admin, respond, ticket, eventId, staffId, false);
    }

    // 3. Buscar por RUT (carnet)
    const rutBody = extractRutFromQr(rawContent);

    if (rutBody) {
      const { data: userTickets } = await admin
        .from('tickets')
        .select(`id, used, status, guest_name, event_id, user_rut, ticket_tiers!inner ( name, nominative ), profiles ( full_name )`)
        .eq('event_id', eventId)
        .ilike('user_rut', `%${rutBody}%`)
        .eq('used', false);

      if (!userTickets || userTickets.length === 0) {
        return respond({
          result: 'NO_TICKETS',
          message: `RUT ...${rutBody.slice(-4)} no encontrado`,
        });
      }

      const nominativeTicket = userTickets.find((t: any) => (t.ticket_tiers as any)?.nominative === true);

      if (nominativeTicket) {
        return await processTicket(admin, respond, nominativeTicket, eventId, staffId, true);
      }

      return respond({
        result: 'NOT_NOMINATIVE',
        message: 'No tienes tickets nominativos.',
        subMessage: 'Usa el QR del ticket para ingresar.',
      });
    }

    // 4. Fallback
    return respond({
      result: 'UNKNOWN_QR',
      message: 'No encontrado en base de datos',
      subMessage: `Leído: ${rawContent.substring(0, 15)}...`,
    });

  } catch (e: any) {
    console.error('[scan-ticket] fatal error:', e?.message);
    return respond({ result: 'ERROR', message: 'Error interno del servidor' }, 500);
  }
});

async function processTicket(
  admin: ReturnType<typeof createClient>,
  respond: (b: object, s?: number) => Response,
  ticket: any,
  eventId: string,
  staffId: string,
  isCarnet: boolean
): Promise<Response> {
  if (ticket.event_id !== eventId) {
    return respond({ result: 'WRONG_EVENT', message: 'Ticket de otro evento' });
  }

  const realName = ticket.profiles?.full_name || ticket.guest_name || 'Invitado';

  if (ticket.used || ticket.status === 'used') {
    return respond({ result: 'ALREADY_USED', message: `${realName} ya ingresó` });
  }

  const { error: updateError } = await admin
    .from('tickets')
    .update({ used: true, status: 'used', scanned_at: new Date().toISOString() })
    .eq('id', ticket.id);

  if (updateError) {
    console.error('[scan-ticket] update error:', updateError.message);
    return respond({ result: 'ERROR', message: 'Error al marcar ticket' }, 500);
  }

  // Registrar scan (fire and forget)
  admin.from('scans').insert({
    event_id: eventId,
    staff_id: staffId,
    ticket_id: ticket.id,
    valid: true,
    result_message: isCarnet ? 'Acceso por Carnet' : 'Acceso por Ticket',
  }).then(({ error }: any) => { if (error) console.error('[scan-ticket] scan log:', error.message); });

  const tierName = (ticket.ticket_tiers as any)?.name || 'General';
  const description = (ticket.ticket_tiers as any)?.description || null;
  const mode = isCarnet ? 'VALIDADO POR CARNET' : 'VALIDADO POR QR';

  return respond({
    result: 'ACCESS_GRANTED',
    message: realName,
    subMessage: `${tierName.toUpperCase()} • ${mode}`,
    description,
  });
}
