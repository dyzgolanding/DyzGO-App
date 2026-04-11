/**
 * generate-wallet-pass
 *
 * Genera un archivo .pkpass de Apple Wallet para un ticket de DyzGO.
 *
 * Requiere los siguientes Supabase Secrets configurados:
 *   APPLE_TEAM_ID              — Apple Developer Team ID (10 chars)
 *   APPLE_PASS_TYPE_ID         — Pass Type Identifier (ej: pass.com.dyzgo.ticket)
 *   APPLE_WALLET_CERT_P12      — Certificado P12 codificado en base64
 *   APPLE_WALLET_CERT_PASSWORD — Contraseña del P12
 *   APPLE_WWDR_CERT            — Certificado WWDR de Apple en base64 (DER o PEM)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import forge from 'npm:node-forge@1.3.1';
import JSZip from 'npm:jszip@3.10.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

// Background: gradiente vertical negro #030303 → morado #370046 (colores DYZGO)
// PNG 2×480 (1x) y 4×960 (2x) — iOS escala al ancho del pass
const BG_1X_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAHgCAIAAAAALytOAAACIklEQVR42pXF13KqUBQA0L33saJiQ0XBhhULVjBRoyZq/v+TMpcZZhgu5Zz1soC5IKIUYylIsVSKt3SKpQOlWTodXSbNMjxlWCbjL5thWYGyLJdlOaHyWZb3yrF8LjEpx6Tw8kzKh1TIswJPEitIbkWJFYUqSazkVWClAm9ygcmBikwu/ovkIv1fuUjl2EpULvmrlKgikExVmapC1WSqeZWpVk6sXqZ6bBWqV/wpFVIEqpJSdWtUqSFUs0pNqFGzxlurRq1AdWrVo1PrpMamkKr4ayvUFqqjUAca1GkIpjVI82qS1kxMb5IeXov0VkjdFnV5UqmruvVU6gnVV6nv1aZ+O7FBmwbhdWjQCWnYoSFPGg01f4ZGhkA6jXQaCTXWaezVpXE3KZx0cRJbDyc9f9MeTgXq46yPM6HmfZx7DXA+4M0coBloiOYwusUQF7EZuDD8LQ1cCrUycAUjXI14W49wHWiM63F01hit2CZoTfxtJrgRaIqbqdt2iluhdlPcec1wN0tsP8N9eHPcz0M6zPHAk4kH0+1o4lEo20QbFmgvBHMW6Hgt0VkmdlriKbYVnlb+Plb4IdAaP9f4KdR5jWcvC89WYhcLL8HgYsEFNnDZhHTdwJWnLVy3/r628CXUbQs32MFtx9t9B/dAe7jvo3vs4RHbAR4Hf98H+BboCD9H+BHqeYSnlw1Pm7eXDa/wHHg5Ib0dePN0gvfJ7fcEv6H9AdlU+0FlEwMjAAAAAElFTkSuQmCC';

const BG_2X_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAPACAIAAACdAk8WAAAB3UlEQVR42tXHX1dhURiA8b33oUJRCCUhf0IohJk01Uw13/8jzd2who29rOOcs973Wb+bxwT/ZWKdFLYnFaQgb9I4fNJBGvHOEQTMUXCE/ecYeuY4OIGmyWDfOQkyEDFZxDmZIIsoJgdpkw1y2J1TaJozeCYXnEHe5HH4nAZ5+MblEXIKEDBnrgDvnEPp5N0FNE0RoabgikhwSkhszl0JUUwZ0ubClbE7l9A0FXim6CqQN1UcPiVXRbxTg4Apuxq8cwWlc+muoWnqCDUVV0eCc4PEpupuEHIa0DM114CpuVtomiY8c+WaEDEtRDzXroV4pw0BU3dteOcOmqYDc+M60DRdhJqG6yK5sT0kNre2h5DTh55p2j5M095D0wzgmZYdQMQMEee07RCRzwgC5s6O4J0HaJoxTMeOoWkmCDVdO0GCM0Vi07NThJxH6Jm+fYLamcEz93YGETNHnDOwc0QxC0iboV3AO8/QNEtsz8guIW9WOHwe7AoJzhqJzdiuEXJ+QM9M7E+onRd4ZmpfIGI2CDdmA888mg2imFdImyfzCu/8gqZ5w/bMzBvkzTsOn7l5R7zzAQGzMB/Yf35DzzybP9A0n9h3luYTIuYLcc7KfCGK+Ya0WZtv7M5fxDj/AF5v7S5G8fOSAAAAAElFTkSuQmCC';

// Icono DyzGO mínimo — 29x29 PNG negro con "D" blanca
const ICON_29_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAB0AAAAdCAYAAABWk2cPAAAACXBIWXMAAAsTAAALEwEAmpwY' +
  'AAAA3UlEQVRIie2WwQ2DMAxFnxMDsAIDsACb0CkYgCHYgBHYgAFogbNDoFKJSlT8HZAL' +
  'pEiEONi/5Of4ObbsGGMicgEuQAv0wKSqsyTOuRuwAWdVXUVkBNoi4g2oVfUsIl8ROase' +
  'APQisgHQ9wBQ8Z+qqoQQyrIsYwghVFW9qupBVQ/ufkoppcxaCCFk6j+zls1ms+VFa62X' +
  'bdtW27at9t63fd+267pW27battm27bZtO6qqroXAAAAAElFTkSuQmCC';

async function sha1hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Fecha pendiente';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}


Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { ...corsHeaders, 'Access-Control-Allow-Methods': 'POST' } });
  }

  try {
    const { ticket_id } = await req.json();
    if (!ticket_id) {
      return new Response(JSON.stringify({ error: 'ticket_id requerido' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verificar que el usuario autenticado es el dueño del ticket
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verificar secrets de Apple configurados
    const teamId = Deno.env.get('APPLE_TEAM_ID') ?? '';
    const passTypeId = Deno.env.get('APPLE_PASS_TYPE_ID') ?? '';
    const certP12Base64 = Deno.env.get('APPLE_WALLET_CERT_P12') ?? '';
    const certPassword = Deno.env.get('APPLE_WALLET_CERT_PASSWORD') ?? '';
    const wwdrBase64 = Deno.env.get('APPLE_WWDR_CERT') ?? '';

    if (!teamId || !passTypeId || !certP12Base64 || !wwdrBase64) {
      return new Response(
        JSON.stringify({ error: 'Apple Wallet no configurado. Configura los secrets en Supabase Dashboard.' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Obtener datos del ticket
    const { data: ticket, error: ticketErr } = await supabase
      .from('tickets')
      .select('id, user_id, qr_hash, ticket_type, events(title, date, club_name, image_url), ticket_tiers(name)')
      .eq('id', ticket_id)
      .single();

    if (ticketErr || !ticket) {
      return new Response(JSON.stringify({ error: 'Ticket no encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (ticket.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const event = (ticket.events as any);
    const tier = (ticket.ticket_tiers as any);

    // ── 1. Thumbnail: imagen del evento ────────────────────────────────
    let thumbnailBytes: Uint8Array | null = null;
    const imageUrl = event?.image_url ?? null;
    if (imageUrl) {
      try {
        const imgRes = await fetch(imageUrl);
        if (imgRes.ok) {
          thumbnailBytes = new Uint8Array(await imgRes.arrayBuffer());
        }
      } catch { /* sin imagen, no es crítico */ }
    }

    // ── 2. Construir pass.json ──────────────────────────────────────────
    const passJson: any = {
      formatVersion: 1,
      passTypeIdentifier: passTypeId,
      serialNumber: ticket.id,
      teamIdentifier: teamId,
      organizationName: 'DyzGO',
      description: event?.title ?? 'Entrada DyzGO',
      logoText: 'DyzGO',
      foregroundColor: 'rgb(255, 255, 255)',
      backgroundColor: 'rgb(3, 3, 3)',
      labelColor: 'rgb(255, 49, 216)',
      eventTicket: {
        primaryFields: [
          { key: 'event', label: 'EVENTO', value: event?.title ?? 'Evento' },
        ],
        secondaryFields: [
          { key: 'date', label: 'FECHA', value: formatDate(event?.date) },
          { key: 'type', label: 'TIPO TICKET', value: tier?.name ?? ticket.ticket_type ?? 'GENERAL' },
        ],
        auxiliaryFields: [
          { key: 'venue', label: 'LUGAR', value: event?.club_name ?? '' },
          { key: 'activation', label: 'ESTADO', value: 'Ticket Activo' },
        ],
        backFields: [
          { key: 'ticketId', label: 'ID TICKET', value: ticket.id },
          { key: 'app', label: 'PLATAFORMA', value: 'DyzGO — Entradas para eventos' },
        ],
      },
      barcodes: [{
        message: ticket.qr_hash,
        format: 'PKBarcodeFormatQR',
        messageEncoding: 'iso-8859-1',
        altText: ticket.id.slice(0, 8).toUpperCase(),
      }],
      barcode: {
        message: ticket.qr_hash,
        format: 'PKBarcodeFormatQR',
        messageEncoding: 'iso-8859-1',
      },
    };

    // ── 4. Preparar archivos del pass ───────────────────────────────────
    console.log('[gwp] paso 4: preparando bytes');
    const passJsonBytes = new TextEncoder().encode(JSON.stringify(passJson));
    const iconBytes = Uint8Array.from(atob(ICON_29_BASE64), c => c.charCodeAt(0));
    console.log('[gwp] icon ok', iconBytes.length);
    const bgBytes = Uint8Array.from(atob(BG_1X_BASE64), c => c.charCodeAt(0));
    console.log('[gwp] bg1x ok', bgBytes.length);
    const bg2xBytes = Uint8Array.from(atob(BG_2X_BASE64), c => c.charCodeAt(0));
    console.log('[gwp] bg2x ok', bg2xBytes.length);

    // ── 5. Manifest con SHA-1 de cada archivo ───────────────────────────
    const manifest: Record<string, string> = {
      'pass.json': await sha1hex(passJsonBytes),
      'icon.png': await sha1hex(iconBytes),
      'icon@2x.png': await sha1hex(iconBytes),
      'background.png': await sha1hex(bgBytes),
      'background@2x.png': await sha1hex(bg2xBytes),
    };
    if (thumbnailBytes) {
      manifest['thumbnail.png'] = await sha1hex(thumbnailBytes);
      manifest['thumbnail@2x.png'] = await sha1hex(thumbnailBytes);
    }
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
    console.log('[gwp] manifest ok, keys:', Object.keys(manifest).join(','));

    // ── 6. Firma PKCS#7 detached ────────────────────────────────────────
    console.log('[gwp] paso 6: firma');
    const p12Der = forge.util.decode64(certP12Base64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, certPassword);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag];
    const passCert = certBags?.[0]?.cert;
    const passKey = keyBags?.[0]?.key;

    if (!passCert || !passKey) throw new Error('No se pudo extraer cert/key del P12');

    let wwdrCert: forge.pki.Certificate;
    try {
      const wwdrPem = atob(wwdrBase64);
      if (wwdrPem.includes('BEGIN CERTIFICATE')) {
        wwdrCert = forge.pki.certificateFromPem(wwdrPem);
      } else {
        wwdrCert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(wwdrPem));
      }
    } catch {
      const wwdrDer = forge.util.decode64(wwdrBase64);
      wwdrCert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(wwdrDer));
    }

    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(new TextDecoder().decode(manifestBytes));
    p7.addCertificate(passCert);
    p7.addCertificate(wwdrCert);
    p7.addSigner({
      key: passKey,
      certificate: passCert,
      digestAlgorithm: forge.pki.oids.sha1,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: new Date() },
      ],
    });
    p7.sign({ detached: true });

    const sigDer = forge.asn1.toDer(p7.toAsn1()).getBytes();
    const signatureBytes = Uint8Array.from(sigDer, c => c.charCodeAt(0));
    console.log('[gwp] firma ok', signatureBytes.length);

    // ── 7. Empaquetar en ZIP (.pkpass) ──────────────────────────────────
    console.log('[gwp] paso 7: zip');
    const zip = new JSZip();
    zip.file('pass.json', passJsonBytes);
    zip.file('manifest.json', manifestBytes);
    zip.file('signature', signatureBytes);
    zip.file('icon.png', iconBytes);
    zip.file('icon@2x.png', iconBytes);
    zip.file('background.png', bgBytes);
    zip.file('background@2x.png', bg2xBytes);
    if (thumbnailBytes) {
      zip.file('thumbnail.png', thumbnailBytes);
      zip.file('thumbnail@2x.png', thumbnailBytes);
    }

    const zipBuffer = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    console.log('[gwp] zip ok', zipBuffer.length, 'bytes');

    // ── 8. Subir a Supabase Storage y retornar URL firmada ──────────────
    console.log('[gwp] paso 8: upload storage');
    const filename = `${user.id}/${ticket.id}.pkpass`;
    const { error: uploadErr } = await supabase.storage
      .from('wallet-passes')
      .upload(filename, zipBuffer, {
        contentType: 'application/vnd.apple.pkpass',
        upsert: true,
      });

    if (uploadErr) throw uploadErr;

    const { data: signedData } = await supabase.storage
      .from('wallet-passes')
      .createSignedUrl(filename, 300);

    if (!signedData?.signedUrl) throw new Error('No se pudo generar URL del pass');

    return new Response(JSON.stringify({ url: signedData.signedUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[generate-wallet-pass ERROR]', err?.message, err?.stack);
    return new Response(JSON.stringify({
      error: err?.message ?? String(err),
      name: err?.name,
      hint: err?.hint,
      code: err?.code,
      details: err?.details,
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
