import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- CONFIGURACIÓN WEBPAY (LEÍDA DESDE SUPABASE SECRETS) ---
// Configurar en: Supabase Dashboard → Project Settings → Edge Functions → Secrets
const TBK_API_KEY_SECRET = Deno.env.get('TBK_API_KEY_SECRET') ?? '';

// 1. Código para Venta de Tickets (Webpay Plus)
const PLUS_CC = Deno.env.get('TBK_PLUS_CC') ?? '';
// 2. Código para Guardar Tarjeta (OneClick Mall PADRE - Inscripción)
const ONECLICK_CC = Deno.env.get('TBK_ONECLICK_CC') ?? '';
// 3. Código para COBRAR Tarjeta (OneClick Mall HIJA - Transacción)
const ONECLICK_CHILD_CC = Deno.env.get('TBK_ONECLICK_CHILD_CC') ?? '';

const TBK_URL_BASE = Deno.env.get('TBK_URL_BASE') ?? 'https://webpay3gint.transbank.cl';

// URL de retorno real del proyecto — obligatoria en producción
const DYZGO_CALLBACK_URL = Deno.env.get('DYZGO_CALLBACK_URL') ?? '';
if (!DYZGO_CALLBACK_URL) {
  console.error('[CONFIG ERROR] DYZGO_CALLBACK_URL no está definida en Supabase Secrets');
}

// --- CONFIGURACIÓN TELEGRAM ADMIN ---
const TG_BOT_TOKEN = Deno.env.get('TG_BOT_TOKEN') ?? '';
const TG_CHAT_ID = Deno.env.get('TG_CHAT_ID') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper para elegir la credencial correcta según la acción
function getTbkHeaders(type: 'PLUS' | 'ONECLICK') {
    return {
        'Content-Type': 'application/json',
        'Tbk-Api-Key-Id': type === 'PLUS' ? PLUS_CC : ONECLICK_CC,
        'Tbk-Api-Key-Secret': TBK_API_KEY_SECRET,
        // ¡EL TRUCO MAESTRO! Le decimos a Transbank que somos un navegador Chrome, no un bot de servidor.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { action } = body;

    console.log(`--- INICIO REQUEST: ${action} ---`); 

    // =================================================================
    // 1. VENTA PRIMARIA (Usa WEBPAY PLUS)
    // =================================================================
    if (action === 'create') {
      const { cart, user_id, event_id } = body;

      if (!cart || cart.length === 0) throw new Error("Carrito vacío");

      // --- BLACKLIST CHECK (RPC SECURITY DEFINER — bypassa RLS, chequea email y RUT) ---
      const { data: blocked } = await supabaseClient
        .rpc('check_blacklist', { p_event_id: event_id, p_user_id: user_id });
      if (blocked) throw new Error("No puedes adquirir entradas de este organizador.");
      // --- FIN BLACKLIST CHECK ---

      const tierIds = cart.map((c: any) => c.tier_id || c.id);
      const { data: tiersDB } = await supabaseClient.from('ticket_tiers').select('id, name, price, total_stock, tickets_included').in('id', tierIds);

      // Validar que todos los tier_id del carrito existen en la DB
      for (const item of cart) {
        if (!item.quantity || item.quantity <= 0) throw new Error("Cantidad inválida");
        const itemId = item.tier_id || item.id;
        const tier = tiersDB?.find((t: any) => t.id === itemId);
        if (!tier) throw new Error(`Tier de ticket no reconocido: ${itemId}`);
        const ticketsIncludedReal = tier.tickets_included || 1;
        const { count } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('tier_id', itemId).or(`status.eq.valid,status.eq.used,and(status.eq.pending,expires_at.gt.${new Date().toISOString()})`);
        if (((count || 0) + (item.quantity * ticketsIncludedReal)) > tier.total_stock) throw new Error(`Sin stock suficiente para ${tier.name}.`);
      }

      const buyOrder = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
      const sessionId = `S-${user_id.substring(0, 5)}-${Date.now()}`;
      let totalAmount = 0;
      const ticketsToReserve = [];
      const expiresAt = new Date(Date.now() + 15 * 60000).toISOString();

      for (const item of cart) {
        const itemId = item.tier_id || item.id;
        const tier = tiersDB!.find((t: any) => t.id === itemId)!;
        // El precio se obtiene EXCLUSIVAMENTE de la base de datos; se ignora cualquier valor enviado por el cliente
        totalAmount += (tier.price * item.quantity);
        const ticketsIncluded = tier.tickets_included || 1;
        const totalTickets = item.quantity * ticketsIncluded;
        const unitPrice = Math.round(tier.price / ticketsIncluded);

        for (let i = 0; i < totalTickets; i++) {
           ticketsToReserve.push({
             id: crypto.randomUUID(), user_id, event_id, tier_id: itemId, qr_hash: crypto.randomUUID(),
             status: 'pending', paid_price: unitPrice, ticket_type: 'paid', purchase_date: new Date().toISOString(),
             session_id: sessionId, buy_order: buyOrder, expires_at: expiresAt
           });
        }
      }

      if (totalAmount <= 0) throw new Error("El monto calculado es inválido.");

      await supabaseClient.from('tickets').insert(ticketsToReserve);
      const finalAmount = Math.round(totalAmount * 1.10);

      // Usa Headers PLUS
      const tbkRes = await fetch(`${TBK_URL_BASE}/rswebpaytransaction/api/webpay/v1.2/transactions`, {
        method: 'POST',
        headers: getTbkHeaders('PLUS'),
        body: JSON.stringify({ 
            buy_order: buyOrder,
            session_id: sessionId,
            amount: finalAmount,
            return_url: `${DYZGO_CALLBACK_URL}?callback=dyzgo_final`
        })
      });

      // BLINDAJE CONTRA HTML: Leemos la respuesta como texto primero
      const rawText = await tbkRes.text();
      let tbkData;
      
      try {
          // Intentamos convertir a JSON
          tbkData = JSON.parse(rawText);
      } catch (e) {
          console.error("[WAF ERROR] Transbank devolvió HTML:", rawText);
          throw new Error("El Firewall de Transbank bloqueó la solicitud.");
      }

      // Si Transbank responde con un error interno (ej. monto inválido)
      if (!tbkRes.ok) {
          throw new Error(tbkData.error_message || "Error en Transbank");
      }
      
      // [MODIFICADO]: Ahora devolvemos también el session_id para que el frontend lo guarde
      return new Response(JSON.stringify({ 
          ...tbkData, 
          expires_at: expiresAt,
          session_id: sessionId 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // =================================================================
    // 2. REVENTA (Usa WEBPAY PLUS)
    // =================================================================
    if (action === 'create_resale') {
        const { listing_id, buyer_id } = body;
        
        const { data: listing, error: listError } = await supabaseClient
            .from('resale_listings')
            .select('price, status, current_highest_bid')
            .eq('id', listing_id)
            .single();

        if (listError || !listing) throw new Error("Publicación no encontrada");
        if (listing.status === 'sold' || listing.status === 'cancelled') throw new Error("Este ticket ya no está disponible");

        let amountToPay = listing.price;
        if (listing.status === 'reserved' && listing.current_highest_bid > 0) {
            amountToPay = listing.current_highest_bid;
        }

        const finalAmount = Math.round(amountToPay * 1.05); // FEE 5%
        const buyOrder = `RESALE-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
        const sessionId = `RS-${buyer_id.substring(0, 5)}-${Date.now()}`;

        // Usa Headers PLUS
        const tbkRes = await fetch(`${TBK_URL_BASE}/rswebpaytransaction/api/webpay/v1.2/transactions`, {
            method: 'POST',
            headers: getTbkHeaders('PLUS'),
            body: JSON.stringify({ 
                buy_order: buyOrder,
                session_id: sessionId,
                amount: finalAmount,
                return_url: `${DYZGO_CALLBACK_URL}?callback=dyzgo_final`
            })
        });

        const tbkData = await tbkRes.json();

        if (!tbkData.token) throw new Error("Error iniciando Webpay Resale");

        await supabaseClient.from('resale_transactions').insert({
            listing_id: listing_id,
            buyer_id: buyer_id,
            buy_order: buyOrder,
            token_ws: tbkData.token,
            amount: finalAmount,
            status: 'pending'
        });

        return new Response(JSON.stringify(tbkData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // =================================================================
    // 3. COMMIT (CONFIRMACIÓN) (Usa WEBPAY PLUS)
    // =================================================================
    if (action === 'commit') {
      const { token_ws } = body;
      console.log(`[DEBUG] COMMIT iniciado para token: ${token_ws}`);

      // Usa Headers PLUS
      const tbkRes = await fetch(`${TBK_URL_BASE}/rswebpaytransaction/api/webpay/v1.2/transactions/${token_ws}`, {
        method: 'PUT',
        headers: getTbkHeaders('PLUS')
      });
      const tbkData = await tbkRes.json();
      
      const isApproved = (tbkData.status === 'AUTHORIZED' && tbkData.response_code === 0);
      const buyOrder = tbkData.buy_order;

      if (!buyOrder) throw new Error("Respuesta inválida de Transbank");

      console.log(`[DEBUG] Orden: ${buyOrder}, Aprobada: ${isApproved}`);

      if (buyOrder.startsWith('RESALE-')) {
          // --- REVENTA ---
          if (isApproved) {
              const { error: rpcError } = await supabaseClient.rpc('execute_resale_transfer', { p_buy_order: buyOrder });
              
              if (rpcError) return new Response(JSON.stringify({ ...tbkData, status: 'FAILED_DB', db_error: rpcError.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

              // ============================================
              // NOTIFICACIÓN IN-APP + PUSH AL VENDEDOR
              // ============================================
              try {
                  const { data: listingData } = await supabaseClient
                      .from('resale_transactions')
                      .select('listing_id, amount, resale_listings(seller_id, price, tickets(events(title)))')
                      .eq('buy_order', buyOrder)
                      .single();

                  if (listingData?.listing_id) {
                      const sellerId = (listingData.resale_listings as any)?.seller_id;
                      const eventTitle = (listingData.resale_listings as any)?.tickets?.events?.title;
                      const price = (listingData.resale_listings as any)?.price;

                      if (sellerId) {
                          await supabaseClient.from('notifications').insert({
                              user_id: sellerId,
                              type: 'ticket_sold',
                              title: '¡Tu entrada fue vendida!',
                              message: `Tu entrada${eventTitle ? ` de ${eventTitle}` : ''} fue vendida por $${price?.toLocaleString('es-CL')}. Te transferiremos el monto pronto.`,
                              related_id: listingData.listing_id,
                              is_read: false,
                          });

                          const { data: profile } = await supabaseClient
                              .from('profiles')
                              .select('expo_push_token')
                              .eq('id', sellerId)
                              .single();

                          if (profile?.expo_push_token) {
                              await fetch('https://exp.host/--/api/v2/push/send', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                      to: profile.expo_push_token,
                                      title: '🎉 ¡Tu entrada fue vendida!',
                                      body: `Tu entrada${eventTitle ? ` de ${eventTitle}` : ''} fue vendida. Te transferiremos el dinero pronto.`,
                                      data: { url: '/notifications' },
                                  }),
                              });
                          }
                      }
                  }
              } catch (sellerNotifErr) {
                  console.error("[ERROR SELLER NOTIF]", sellerNotifErr);
              }

              // ============================================
              // 4. NOTIFICACIÓN TELEGRAM AL DUEÑO (INFALIBLE)
              // ============================================
              try {
                  const { data: txData } = await supabaseClient
                    .from('resale_transactions')
                    .select(`amount, resale_listings ( bank_data )`)
                    .eq('buy_order', buyOrder)
                    .single();

                  if (txData && txData.resale_listings && txData.resale_listings.bank_data) {
                      const totalPaid = txData.amount;
                      const sellerReceive = Math.round(totalPaid / 1.05); // Cálculo del 5%
                      const bd = txData.resale_listings.bank_data;

                      // Formatear mensaje para Telegram (Soporta HTML básico)
                      const msgText = 
`💰 <b>NUEVA VENTA MARKETPLACE</b> 💰

🆔 <b>Orden:</b> ${buyOrder}
💵 <b>Total Pagado:</b> $${totalPaid.toLocaleString('es-CL')}
💸 <b>Transferir al Vendedor:</b> $${sellerReceive.toLocaleString('es-CL')}

🏦 <b>DATOS BANCARIOS:</b>
👤 <b>Nombre:</b> ${bd.holderName || 'N/A'}
🔢 <b>RUT:</b> ${bd.rut || 'N/A'}
🏛 <b>Banco:</b> ${bd.bank || 'N/A'}
💳 <b>Tipo:</b> ${bd.type || 'N/A'}
#️⃣ <b>Cuenta:</b> ${bd.number || 'N/A'}

✅ <i>Transferir lo antes posible.</i>`;

                      if (TG_BOT_TOKEN && TG_CHAT_ID && TG_BOT_TOKEN !== 'TU_TOKEN_AQUI') {
                          await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                  chat_id: TG_CHAT_ID,
                                  text: msgText,
                                  parse_mode: 'HTML'
                              })
                          });
                          console.log("[DEBUG] Telegram enviado exitosamente.");
                      } else {
                          console.log("[WARN] Telegram no configurado.");
                      }
                  }
              } catch (tgError) {
                  console.error("[ERROR TELEGRAM]", tgError);
              }

          } else {
              await supabaseClient.from('resale_transactions').update({ status: 'rejected' }).eq('buy_order', buyOrder);
          }
      } else {
          // --- VENTA NORMAL ---
          if (isApproved) {
            const { error: dbError } = await supabaseClient.from('tickets')
              .update({ status: 'valid', purchased_at: new Date().toISOString() })
              .eq('buy_order', buyOrder).eq('status', 'pending');
            if (dbError) return new Response(JSON.stringify({ ...tbkData, db_error: dbError.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

            // Enviar correo con QR a cada ticket confirmado
            try {
              const SBURL = Deno.env.get('SUPABASE_URL') ?? '';
              const SBKEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
              const { data: confirmedTickets } = await supabaseClient
                .from('tickets').select('*')
                .eq('buy_order', buyOrder).eq('status', 'valid');
              if (confirmedTickets && confirmedTickets.length > 0) {
                await Promise.all(confirmedTickets.map((ticket: any) =>
                  fetch(`${SBURL}/functions/v1/send-ticket-email`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SBKEY}` },
                    body: JSON.stringify({ type: 'UPDATE', record: ticket }),
                  })
                ));
              }
            } catch (emailErr) {
              console.error('[ERROR EMAIL WEBPAY]', emailErr);
            }
          } else {
             await supabaseClient.from('tickets').update({ status: 'failed' }).eq('buy_order', buyOrder);
          }
      }

      return new Response(JSON.stringify(tbkData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // =================================================================
    // 4. CANCEL
    // =================================================================
    if (action === 'cancel') {
        const { user_id, event_id } = body;
        await supabaseClient.from('tickets').delete().eq('user_id', user_id).eq('event_id', event_id).eq('status', 'pending');
        return new Response(JSON.stringify({ message: "Liberado" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // =================================================================
    // 5. ONECLICK: INICIAR INSCRIPCIÓN (Guardar Tarjeta) (Usa ONECLICK PADRE)
    // =================================================================
    if (action === 'oneclick_enroll_start') {
        const { user_id, email } = body;
        
        // Usa Headers ONECLICK
        const tbkRes = await fetch(`${TBK_URL_BASE}/rswebpaytransaction/api/oneclick/v1.0/inscriptions`, {
            method: 'POST',
            headers: getTbkHeaders('ONECLICK'),
            body: JSON.stringify({ 
                username: user_id, 
                email: email, 
                response_url: `${DYZGO_CALLBACK_URL}?callback=dyzgo_oneclick`
            })
        });

        const tbkData = await tbkRes.json();
        return new Response(JSON.stringify(tbkData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // =================================================================
    // 6. ONECLICK: FINALIZAR INSCRIPCIÓN (Guardar en DB) (Usa ONECLICK PADRE)
    // =================================================================
    if (action === 'oneclick_enroll_finish') {
        const { token, user_id } = body;

        // Usa Headers ONECLICK
        const tbkRes = await fetch(`${TBK_URL_BASE}/rswebpaytransaction/api/oneclick/v1.0/inscriptions/${token}`, {
            method: 'PUT',
            headers: getTbkHeaders('ONECLICK')
        });
        const tbkData = await tbkRes.json();

        if (tbkData.response_code === 0 && tbkData.tbk_user) {
            
            const { count } = await supabaseClient
                .from('user_payment_methods')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user_id)
                .eq('card_number', `**** **** **** ${tbkData.card_number}`);

            if (!count) {
                await supabaseClient.from('user_payment_methods').insert({
                    user_id: user_id,
                    tbk_user: tbkData.tbk_user, 
                    card_type: tbkData.card_type,
                    card_number: `**** **** **** ${tbkData.card_number}`,
                    is_default: false
                });
            }
            return new Response(JSON.stringify({ status: 'SUCCESS', card: tbkData.card_number }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } else {
            return new Response(JSON.stringify({ status: 'FAILED', error: 'Inscripción rechazada por el banco' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
    }

    // =================================================================
    // 7. ONECLICK: COBRAR (AUTHORIZE)
    // =================================================================
    if (action === 'authorize_oneclick') {
        const { user_id, card_id, event_id, session_id } = body;

        // --- BLACKLIST CHECK (RPC SECURITY DEFINER — bypassa RLS, chequea email y RUT) ---
        const { data: blocked2 } = await supabaseClient
          .rpc('check_blacklist', { p_event_id: event_id, p_user_id: user_id });
        if (blocked2) throw new Error("No puedes adquirir entradas de este organizador.");
        // --- FIN BLACKLIST CHECK ---

        const { data: tickets, error: ticketError } = await supabaseClient
            .from('tickets')
            .select('id, paid_price')
            .eq('user_id', user_id)
            .eq('event_id', event_id)
            .eq('status', 'pending')
            .eq('session_id', session_id); 

        if (ticketError || !tickets || tickets.length === 0) {
            throw new Error("No hay tickets pendientes para esta sesión de compra.");
        }

        const totalAmount = tickets.reduce((sum: number, t: any) => sum + t.paid_price, 0);

        // B. Obtener Token de la Tarjeta (tbk_user)
        const { data: cardMethod } = await supabaseClient
            .from('user_payment_methods')
            .select('tbk_user')
            .eq('id', card_id)
            .single();

        if (!cardMethod?.tbk_user) throw new Error("Método de pago no válido o no encontrado.");

        // C. Generar Órdenes de Compra
        const buyOrderParent = `OC-${Date.now().toString().slice(-6)}`;
        const buyOrderChild = `OC-C-${Date.now().toString().slice(-6)}`;

        // D. Llamar a Transbank OneClick Authorize
        const tbkRes = await fetch(`${TBK_URL_BASE}/rswebpaytransaction/api/oneclick/v1.0/transactions`, {
            method: 'POST',
            headers: getTbkHeaders('ONECLICK'), // Headers del PADRE (...41)
            body: JSON.stringify({
                username: user_id,
                tbk_user: cardMethod.tbk_user,
                buy_order: buyOrderParent,
                details: [
                    {
                        commerce_code: ONECLICK_CHILD_CC, // Tienda HIJA (...42) es la que cobra
                        buy_order: buyOrderChild,
                        amount: totalAmount,
                        installments_number: 1 // Sin cuotas
                    }
                ]
            })
        });

        const tbkData = await tbkRes.json();
        
        // E. Verificar Resultado
        const detail = tbkData.details ? tbkData.details[0] : null;

        if (detail && detail.status === 'AUTHORIZED' && detail.response_code === 0) {
            // ÉXITO: Marcar tickets como válidos
            await supabaseClient
                .from('tickets')
                .update({
                    status: 'valid',
                    purchased_at: new Date().toISOString(),
                    buy_order: buyOrderParent
                })
                .in('id', tickets.map((t: any) => t.id));

            // Enviar correo con QR a cada ticket confirmado
            try {
              const SBURL = Deno.env.get('SUPABASE_URL') ?? '';
              const SBKEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
              const { data: confirmedTickets } = await supabaseClient
                .from('tickets').select('*')
                .in('id', tickets.map((t: any) => t.id));
              if (confirmedTickets && confirmedTickets.length > 0) {
                await Promise.all(confirmedTickets.map((ticket: any) =>
                  fetch(`${SBURL}/functions/v1/send-ticket-email`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SBKEY}` },
                    body: JSON.stringify({ type: 'UPDATE', record: ticket }),
                  })
                ));
              }
            } catch (emailErr) {
              console.error('[ERROR EMAIL ONECLICK]', emailErr);
            }

            return new Response(JSON.stringify({ status: 'SUCCESS', buy_order: buyOrderParent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } else {
            return new Response(JSON.stringify({ status: 'FAILED', error: 'Pago rechazado por el banco', details: tbkData }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
    }

    // =================================================================
    // 8. ONECLICK: COBRAR REVENTA
    // =================================================================
    if (action === 'authorize_oneclick_resale') {
        const { listing_id, buyer_id, card_id } = body;

        const { data: listing, error: listError } = await supabaseClient
            .from('resale_listings')
            .select('price, status, current_highest_bid, seller_id, tickets(events(title))')
            .eq('id', listing_id)
            .single();

        if (listError || !listing) throw new Error("Publicación no encontrada");
        if (listing.status === 'sold' || listing.status === 'cancelled') throw new Error("Este ticket ya no está disponible");

        let amountToPay = listing.price;
        if (listing.status === 'reserved' && listing.current_highest_bid > 0) {
            amountToPay = listing.current_highest_bid;
        }
        const finalAmount = Math.round(amountToPay * 1.05);

        const { data: cardMethod } = await supabaseClient
            .from('user_payment_methods')
            .select('tbk_user')
            .eq('id', card_id)
            .single();

        if (!cardMethod?.tbk_user) throw new Error("Método de pago no válido");

        const buyOrderParent = `RESALE-OC-${Date.now().toString().slice(-6)}`;
        const buyOrderChild = `RESALE-OCC-${Date.now().toString().slice(-6)}`;

        const tbkRes = await fetch(`${TBK_URL_BASE}/rswebpaytransaction/api/oneclick/v1.0/transactions`, {
            method: 'POST',
            headers: getTbkHeaders('ONECLICK'),
            body: JSON.stringify({
                username: buyer_id,
                tbk_user: cardMethod.tbk_user,
                buy_order: buyOrderParent,
                details: [{ commerce_code: ONECLICK_CHILD_CC, buy_order: buyOrderChild, amount: finalAmount, installments_number: 1 }]
            })
        });
        const tbkData = await tbkRes.json();
        const detail = tbkData.details ? tbkData.details[0] : null;

        if (detail && detail.status === 'AUTHORIZED' && detail.response_code === 0) {
            // Insertar transacción DESPUÉS de que Transbank apruebe
            await supabaseClient.from('resale_transactions').insert({
                listing_id, buyer_id, buy_order: buyOrderParent,
                token_ws: `OC-${buyOrderChild}`, amount: finalAmount, status: 'pending'
            });

            const { error: rpcError } = await supabaseClient.rpc('execute_resale_transfer', { p_buy_order: buyOrderParent });
            if (rpcError) return new Response(JSON.stringify({ status: 'FAILED_DB', error: rpcError.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

            // Notificar al vendedor
            try {
                const eventTitle = (listing.tickets as any)?.events?.title;
                if (listing.seller_id) {
                    await supabaseClient.from('notifications').insert({
                        user_id: listing.seller_id, type: 'ticket_sold',
                        title: '¡Tu entrada fue vendida!',
                        message: `Tu entrada${eventTitle ? ` de ${eventTitle}` : ''} fue vendida. Te transferiremos el monto pronto.`,
                        related_id: listing_id, is_read: false,
                    });
                    const { data: profile } = await supabaseClient.from('profiles').select('expo_push_token').eq('id', listing.seller_id).single();
                    if (profile?.expo_push_token) {
                        await fetch('https://exp.host/--/api/v2/push/send', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ to: profile.expo_push_token, title: '🎉 ¡Tu entrada fue vendida!', body: `Tu entrada fue vendida. Te transferiremos el dinero pronto.`, data: { url: '/notifications' } }),
                        });
                    }
                }
            } catch (e) { console.error("[SELLER NOTIF OC]", e); }

            return new Response(JSON.stringify({ status: 'SUCCESS', buy_order: buyOrderParent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } else {
            return new Response(JSON.stringify({ status: 'FAILED', error: 'Pago rechazado por el banco', details: tbkData }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
    }

    // =================================================================
    // 9. RECHAZAR OFERTA (service_role bypassa RLS)
    // =================================================================
    if (action === 'reject_offer') {
        const { offer_id, seller_id } = body;

        // Verificar que el vendedor es dueño del listing relacionado
        const { data: offer } = await supabaseClient
            .from('resale_offers')
            .select('listing_id')
            .eq('id', offer_id)
            .single();

        if (!offer) throw new Error('Oferta no encontrada');

        const { data: listing } = await supabaseClient
            .from('resale_listings')
            .select('seller_id')
            .eq('id', offer.listing_id)
            .single();

        if (!listing || listing.seller_id !== seller_id) throw new Error('No autorizado');

        const { error } = await supabaseClient
            .from('resale_offers')
            .update({ status: 'rejected' })
            .eq('id', offer_id)
            .eq('status', 'pending');

        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // =================================================================
    // 10. CANCELAR OFERTA (service_role bypassa RLS)
    // =================================================================
    if (action === 'cancel_offer') {
        const { offer_id, buyer_id } = body;

        const { error } = await supabaseClient
            .from('resale_offers')
            .update({ status: 'cancelled' })
            .eq('id', offer_id)
            .eq('buyer_id', buyer_id)
            .eq('status', 'pending');

        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: "Acción desconocida" }), { status: 400, headers: corsHeaders });

  } catch (err: any) {
    console.error("[SERVER ERROR CATCH]:", err);
    return new Response(JSON.stringify({ error: `SERVER ERROR: ${err.message}` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});