import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  try {
    const payload = await req.json()

    // Aceptar INSERT y UPDATE; ignorar otros tipos
    if (payload.type !== 'INSERT' && payload.type !== 'UPDATE') {
      return new Response('Not a relevant event', { status: 200 })
    }

    const ticket = payload.record

    // Solo enviar correo cuando el ticket está confirmado (pago completado)
    if (ticket.status !== 'valid') {
      return new Response('Ticket pendiente — correo omitido', { status: 200 })
    }
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    const { data: event } = await supabase
      .from('events')
      .select('title, date, hour, location, image_url')
      .eq('id', ticket.event_id)
      .single()

    let tierName = ticket.ticket_type || 'GENERAL'
    let tierPrice = ''
    if (ticket.tier_id) {
        const { data: tier } = await supabase
          .from('ticket_tiers')
          .select('name, price')
          .eq('id', ticket.tier_id)
          .single()
        if (tier) {
            tierName = tier.name.toUpperCase()
            tierPrice = tier.price ? `$${tier.price.toLocaleString('es-CL')} CLP` : '$0 CLP'
        }
    }

    let userEmail = ticket.guest_email || null;
    let userName = ticket.guest_name || null;

    if (ticket.user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', ticket.user_id)
          .single()
          
        if (profile) {
            if (!userEmail) userEmail = profile.email;
            if (!userName) userName = profile.full_name;
        }
    }

    if (!userEmail || !event) {
      throw new Error("Faltan datos críticos (email o evento) para enviar el correo")
    }

    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=210x210&margin=0&data=${encodeURIComponent(ticket.qr_hash)}`
    const eventImage = event.image_url || 'https://www.passline.com/imagenes/eventos/tickets/oficial-sublime-maite2475142.jpg'

    let dateString = event.date
    try {
        const d = new Date(event.date)
        dateString = d.toLocaleDateString('es-CL', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
        dateString = dateString.charAt(0).toUpperCase() + dateString.slice(1)
    } catch(e) {}

    const shortId = ticket.id.split('-')[0].toUpperCase()

    // --- HTML DISEÑO RENOVADO DYZGO ---
    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style>
    body { margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, sans-serif; -webkit-font-smoothing: antialiased; }
    .ticket-wrapper { max-width: 540px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
    .neon-text { color: #ec4899; }
    @media (max-width: 600px) {
      .ticket-wrapper { border-radius: 0; border-left: none; border-right: none; width: 100%; box-shadow: none; }
      td.p-wrap { padding-left: 20px !important; padding-right: 20px !important; }
      body { background-color: #ffffff !important; }
    }
  </style>
</head>
<body style="background-color: #f4f4f5; margin: 0; padding: 40px 0;">
  <table width="100%" bgcolor="#f4f4f5" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding: 0 10px;">
        <!-- TICKET CARD ENVELOPE -->
        <table class="ticket-wrapper" width="100%" cellpadding="0" cellspacing="0" border="0">
          
          <!-- IMAGE HEADER -->
          <tr>
            <td>
              <img src="${eventImage}" alt="${event.title}" style="width: 100%; max-width: 540px; display: block; border-bottom: 4px solid #ec4899;" />
            </td>
          </tr>

          <!-- TICKET HEADLINE -->
          <tr>
            <td class="p-wrap" style="padding: 40px 30px 10px 30px; text-align: center;">
              <div style="font-weight: 900; font-size: 14px; letter-spacing: 5px; color: #ec4899; margin-bottom: 24px;">DYZGO</div>
              <div style="font-size: 14px; color: #71717a; text-transform: uppercase; letter-spacing: 1.5px;">Hola ${userName || 'Invitado'},</div>
              <h1 style="margin: 8px 0 30px 0; font-size: 38px; font-weight: 900; line-height: 1.05; color: #18181b; letter-spacing: -1px; text-transform: uppercase;">
                ESTÁS <span class="neon-text" style="color: #ec4899;">DENTRO.</span>
              </h1>
              <div style="width: 32px; height: 3px; background-color: #e4e4e7; margin: 0 auto; border-radius: 2px;"></div>
            </td>
          </tr>

          <!-- KEY DETAILS -->
          <tr>
            <td class="p-wrap" style="padding: 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fafafa; border-radius: 12px; border: 1px solid #e4e4e7;">
                <tr>
                  <td width="33%" align="center" style="padding: 20px 10px;">
                    <div style="font-size: 10px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-weight: 700;">Fecha</div>
                    <div style="font-size: 13px; color: #18181b; font-weight: 800;">${dateString}</div>
                  </td>
                  <td width="33%" align="center" style="padding: 20px 10px; border-left: 1px dashed #e4e4e7; border-right: 1px dashed #e4e4e7;">
                    <div style="font-size: 10px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-weight: 700;">Hora</div>
                    <div style="font-size: 13px; color: #18181b; font-weight: 800;">${event.hour || '00:00'}</div>
                  </td>
                  <td width="33%" align="center" style="padding: 20px 10px;">
                    <div style="font-size: 10px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-weight: 700;">Lugar</div>
                    <div style="font-size: 13px; color: #18181b; font-weight: 800;">${event.location || 'Por confirmar'}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- SEPARADOR PERFORADO SIMPLE -->
          <tr>
            <td class="p-wrap" style="padding: 0 30px;">
              <div style="border-top: 2px dashed #d4d4d8; width: 100%;"></div>
            </td>
          </tr>

          <!-- SCAN QR SECTION -->
          <tr>
            <td align="center" class="p-wrap" style="padding: 40px 30px 40px 30px;">
              
              <div style="font-size: 12px; color: #ec4899; text-transform: uppercase; letter-spacing: 2px; font-weight: 800; margin-bottom: 24px;">TU LLAVE DE ACCESO</div>
              
              <div style="display: inline-block; background-color: #ffffff; padding: 14px; border-radius: 16px; border: 1px solid #e4e4e7; margin-bottom: 24px;">
                <img src="${qrImageUrl}" alt="Código QR" style="width: 220px; height: 220px; display: block; border-radius: 6px;" />
              </div>
              
              <div style="font-size: 20px; font-weight: 900; color: #18181b; text-transform: uppercase; letter-spacing: 1.5px;">${tierName}</div>
              <div style="font-size: 12px; color: #a1a1aa; margin-top: 10px; font-family: monospace; letter-spacing: 1px;">ID: ${ticket.id}</div>
              
              <!-- WALLET -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin-top: 32px; width: 100%; text-align: center;">
                <tr>
                  <td align="center">
                    <a href="https://www.passline.com/add-apple-wallet/8d8KCzY_MtT5YZYb3YpdOw@@&b=a6cc626d822dac0631fa637a33b74e54&c=AywsO69rdyKzTCIRczmiCQ@@" style="text-decoration: none; display: inline-block; margin: 0 4px;">
                      <img src="https://www.passline.com/imagenes/add-apple-wallet/ES_Add_to_Apple_Wallet_2_1.png" alt="Apple Wallet" style="height: 44px; border-radius: 6px;" />
                    </a>
                    <a href="https://www.passline.com/add-google-wallet/8d8KCzY_MtT5YZYb3YpdOw@@&b=a6cc626d822dac0631fa637a33b74e54&c=AywsO69rdyKzTCIRczmiCQ@@" style="text-decoration: none; display: inline-block; margin: 0 4px;">
                      <img src="https://www.passline.com/imagenes/add-google-wallet/esES_add_to_google_wallet_add-wallet-badge_2.png" alt="Google Wallet" style="height: 44px; border-radius: 6px;" />
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- RECEIPT -->
          <tr>
            <td class="p-wrap" style="padding: 0 30px 40px 30px;">
              <table width="100%" style="background-color: #fafafa; border-radius: 12px; border: 1px solid #e4e4e7; padding: 24px;" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 800; color: #a1a1aa; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 24px;">Recibo #${shortId}</div>
                    
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 14px; color: #52525b;">
                      <tr>
                        <td width="70%" style="padding-bottom: 12px; font-weight: 500;">1x ${tierName}</td>
                        <td width="30%" align="right" style="padding-bottom: 12px; color: #18181b; font-weight: 700;">${tierPrice || '$0 CLP'}</td>
                      </tr>
                      <tr>
                        <td width="70%" style="padding-bottom: 20px; font-weight: 500;">Cargo por servicio</td>
                        <td width="30%" align="right" style="padding-bottom: 20px; color: #18181b; font-weight: 700;">Incluido</td>
                      </tr>
                      <tr>
                        <td width="70%" style="border-top: 1px dashed #e4e4e7; padding-top: 20px; color: #18181b; font-weight: 800; font-size: 15px; letter-spacing: 1px;">TOTAL</td>
                        <td width="30%" align="right" style="border-top: 1px dashed #e4e4e7; padding-top: 20px; color: #ec4899; font-weight: 900; font-size: 18px;">${tierPrice || '$0 CLP'}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
        </table>

        <!-- TICKET FOOTER EXTERNAL -->
        <table width="100%" style="max-width: 540px;" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" style="padding: 30px 20px 0 20px;">
               <div style="font-size: 11px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 2px; font-weight: 800; margin-bottom: 16px;">PRODUCIDO POR DYZGO SPA</div>
               <div style="font-size: 13px; color: #a1a1aa; margin-bottom: 24px; max-width: 400px; line-height: 1.5;">¿Tuviste algún problema con tu ticket? No hay de qué preocuparse, nuestro equipo está aquí para ayudarte.</div>
               <a href="mailto:soporte@dyzgo.app" style="display:inline-block; color: #18181b; background-color: #e4e4e7; padding: 12px 24px; border-radius: 8px; font-size: 12px; font-weight: 800; text-decoration: none; border: 1px solid #d4d4d8; text-transform: uppercase; letter-spacing: 1px;">Contactar Soporte Urgente</a>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'DyzGO. <tickets@dyzgo.com>',
        to: userEmail,
        subject: `🎟️ Tus eTickets DyzGO.`,
        html: html,
      }),
    });

    const data = await res.json()
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})