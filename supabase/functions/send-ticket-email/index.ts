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
            tierPrice = tier.price ? `$${tier.price.toLocaleString('es-CL')}` : ''
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

    // --- HTML CLON EXACTO DE PASSLINE ---
    const html = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <title>Passline.com</title>
  <link rel="shortcut icon" href="https://www.passline.com/favicon.ico" type="image/x-icon" />
  <style type="text/css">
	body { background: #f0f1f4; margin-left: 0px; margin-top: 10px; margin-right: 0px; margin-bottom: 10px; font-family:Arial, Helvetica, sans-serif;font-size:12px; }
	a { color:#000; }
	h2{ font-size:24px; font-weight:bold; font-family:Arial, Helvetica, sans-serif; text-align: center; color:#445566;}
	p{ font-size:15px; font-weight:normal; /*text-align: center;*/ color:#445566;/* line-height:22px;*/}
	td.linea{ border-bottom:1px solid #CCC; padding-bottom:4px; text-align:left !important;}
	span{ color:#888a98; font-size:11px;}
	.link-a{ font-size:14px; font-weight:normal; color:#2792ba; text-align: center; line-height:22px; text-decoration:underline;}
	.box-evento{ margin:10px 15px 30px 15px; float:left; border-bottom:3px solid #CCC;}
	.box-evento img{float:left;}
	.btn-verde{ background: #1abc9c; border-bottom: 2px solid #147f51; border-radius: 6px; color: #fff; font-family: Arial,Helvetica,sans-serif; font-size: 14px; font-weight: bold; padding: 10px 20px; text-transform:uppercase; display:block; text-align:center; text-decoration:none;}
	.btn-verde:hover{ background: #147f51; border-bottom: 2px solid #0d623d;}
	.btn-verde1 {background: #1abc9c; border-bottom: 2px solid #147f51; border-radius: 6px; color: #fff; font-family: Arial,Helvetica,sans-serif; font-size: 14px; font-weight: bold; padding: 10px 20px; text-transform:uppercase; display:block; text-align:center; text-decoration:none;}
	.btn-verde2 {background: #1abc9c; border-bottom: 2px solid #147f51; border-radius:0 0 6px 6px; color: #fff; font-family: Arial,Helvetica,sans-serif; font-size: 14px; font-weight: bold; padding: 10px 20px; text-transform:uppercase; display:block; text-align:center; text-decoration:none;}
	.btn-rojo {background: #F00; border-bottom: 2px solid #FFF; border-radius:6px 6px 6px 6px; color: #fff; font-family: Arial,Helvetica,sans-serif; font-size: 14px; font-weight: bold; padding: 10px 20px; text-transform:uppercase; display:block; text-align:center; text-decoration:none;}
	.micro-ticket{ background:#eeeeee; -webkit-border-radius: 5px 5px 0 0; border-radius: 5px 5px 0 0; border:1px solid #ccc;}
  </style>
</head>
<body>
  <table width="640" border="0" align="center" cellpadding="0" cellspacing="0" style="border-left:1px dotted #ccc; border-right:1px dotted #ccc; border-top:1px dotted #ccc; border-bottom:1px dotted #ccc;">
		<tr>
			  <td><img src="https://kovkkdhnmgavnqyjbqzd.supabase.co/storage/v1/object/public/banners/Gemini_Generated_Image_9cucca9cucca9cuc.png" alt="header" border="0" /></td>
			</tr>
				<tr>
		  <td bgcolor="#FFFFFF" style="padding:0;">
		  	<div style="text-align: right;margin: 0">
		  		<h5 style="font-size: 7px; margin:1px; color: grey">IDEM 01</h5>
		  	</div>
		  </td>
		</tr>
		<tr>
		  <td bgcolor="#FFFFFF" style="padding:20px 60px; border-bottom:1px dotted #ccc;">
												<h2>${userName || 'Invitado'}, ¡Aquí tienes tus entradas!</h2>
									  </td>
		</tr>
		<tr>
					<td bgcolor="#FFFFFF" style="padding:20px 40px;  border-bottom:1px dotted #ccc;">
					  <table width="100%" height="172" border="0" cellpadding="10" cellspacing="0" class="micro-ticket" >
							<tr>
							  <td width="100%" height="270" valign="top" align="center" style="vertical-align: initial;">
																<img src="${eventImage}" alt="${event.title}" width="210" height="210" style="vertical-align: top; margin-bottom: 5px; object-fit: cover;" />&nbsp;&nbsp;&nbsp;&nbsp;
																		<img src="${qrImageUrl}" width="210" height="210" alt="eTicket" style="padding: 0px 0px 20px 20px"/>
				              						              									  </td>
							</tr>
							<tr>
								<td>
									<table width="100%" border="0" cellpadding="0" cellspacing="0">
										<tr>
											<td height="0" valign="top" style="text-align: center;">
											    <p style="line-height:16px; margin:0 0 10px 0!important;">
											    	<strong>${event.title}</strong>
											    </p>

												 
												    <p style="margin:0 0 5px 0 !important; font-size: 24px;">${tierName} 
												    ${tierPrice}												    .-</p>

							                         
													    <p style=" margin:0 0 5px 0 !important;"><b>ID Compra</b>: ${shortId} </p> 
													    <p style=" margin:0 0 5px 0 !important;">ID ticket: ${ticket.id} </p> 
																												<p style=" margin:0 0 5px 0 !important;font-size: 20px;">  
															${dateString} a las ${event.hour || '00:00'}</p>
													     
													  <p style=" margin:0 0 5px 0 !important;"> ${event.location || 'Ubicación por confirmar'}</p>
																								</td>
									  	</tr>
																			</table>
							  </td>
							</tr>
					  </table>
					  					</td>
			    </tr>
				<tr>
							<td style="background-color: #fff; padding:15px 40px; border-bottom:1px dotted #ccc;">
								<p style="text-align: center; margin: 0px;">
									<a style="text-decoration: none;" href="https://www.passline.com/add-google-wallet/8d8KCzY_MtT5YZYb3YpdOw@@&b=a6cc626d822dac0631fa637a33b74e54&c=AywsO69rdyKzTCIRczmiCQ@@">
										<span style="text-decoration:none">
											<img src="https://www.passline.com/imagenes/add-google-wallet/esES_add_to_google_wallet_add-wallet-badge_2.png" alt="Add Ticket to Google Wallet">
										</span>	
									</a>
									&nbsp;&nbsp;&nbsp;
									<a style="text-decoration: none;" href="https://www.passline.com/add-apple-wallet/8d8KCzY_MtT5YZYb3YpdOw@@&b=a6cc626d822dac0631fa637a33b74e54&c=AywsO69rdyKzTCIRczmiCQ@@">
										<span style="text-decoration:none">	
											<img width="207px;" height="55px;" src="https://www.passline.com/imagenes/add-apple-wallet/ES_Add_to_Apple_Wallet_2_1.png" alt="Add Ticket to Apple Wallet">
										</span>
									</a>
								</p>
							</td>
						</tr>
									<tr>
				<td bgcolor="#FFFFFF" style="padding:15px 40px; border-bottom:1px dotted #ccc;">                
					<p style="text-align:center;">Produce: DyzGO SpA - Chile</p>
				</td>
		  </tr>
				<tr>
			<td bgcolor="#FFFFFF" style="padding:20px 40px; border-bottom:1px dotted #ccc;">
			  						<h2>Algunos consejos:</h2>
					<ul>
				  					  						        		<li><p style="text-align:left;">Recuerda presentar tu eTicket en el acceso del evento con tu celular.</p></li>
			        				        	<li><p style="text-align:left;">Siempre podrás acceder a tus compras o eTickets desde nuestra web.</p></li>
			        				        		<li><p style="text-align:left;">Recuerda llevar tus eTickets abiertos en tu celular.</p></li>
			        				        	
				  	 
		            	<li><p style="text-align:left;">Descarga tu boleta electrónica <a href="#" target="_blank">aquí.</a></p></li>
		        				</ul>
			</td>
		</tr>
				<tr>
			  <td><img src="https://kovkkdhnmgavnqyjbqzd.supabase.co/storage/v1/object/public/banners/Gemini_Generated_Image_62i9ot62i9ot62i9.png" alt="footer" border="0" style="display:block"/></td>
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