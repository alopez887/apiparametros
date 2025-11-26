// correoTransporte/correosTransporteEnviar.js
// Envío vía Google Apps Script WebApp (sin SMTP) + QR inline (cid: qrReserva)

import dotenv from 'dotenv';
dotenv.config();

import pool from '../conexion.js'; // 🔹 Para leer/actualizar reservaciones
import { generarQRTransporte } from './generarQRTransporte.js'; // 🔹 MISMO que usa el PREVIEW

const GAS_URL         = process.env.GAS_URL;                 // https://script.google.com/macros/s/XXXX/exec
const GAS_TOKEN       = process.env.GAS_TOKEN;               // SECRET en Script Properties
const GAS_TIMEOUT_MS  = Number(process.env.GAS_TIMEOUT_MS || 15000);
const MAIL_FAST_MODE  = /^(1|true|yes)$/i.test(process.env.MAIL_FAST_MODE || '');
const EMAIL_DEBUG     = /^(1|true|yes)$/i.test(process.env.EMAIL_DEBUG || '');
const EMAIL_FROMNAME  = process.env.EMAIL_FROMNAME || 'Cabo Travel Solutions';
const EMAIL_BCC       = process.env.EMAIL_BCC || 'nkmsistemas@gmail.com';
const DBG = (...a) => { if (EMAIL_DEBUG) console.log('[MAIL]', ...a); };

// ---------- Utilidades ----------
function sanitizeUrl(u = '') {
  try {
    let s = String(u || '').trim();
    if (!s) return '';
    if (s.startsWith('//')) s = 'https:' + s;
    if (s.startsWith('http://')) s = s.replace(/^http:\/\//i, 'https://');
    return s;
  } catch { return ''; }
}

// Forzar JPG en Wix para evitar WEBP en clientes (Outlook, etc.)
function forceJpgIfWix(url='') {
  try {
    const u = new URL(url);
    if (/wixstatic\.com$/i.test(u.hostname)) {
      if (!u.searchParams.has('format')) u.searchParams.set('format','jpg');
      if (!u.searchParams.has('width'))  u.searchParams.set('width','1200');
      return u.toString();
    }
  } catch {}
  return url;
}

// POST JSON con timeout (fetch nativo Node 18)
async function postJSON(url, body, timeoutMs) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res  = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } finally { clearTimeout(id); }
}

// ---------- Formateos ----------
const safeToFixed = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0.00';
  // 1,234.56 con 2 decimales fijo
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

function formatoHora12(hora){
  if(!hora) return '';
  const [h,m] = String(hora).split(':');
  const H = parseInt(h,10);
  const suf = H>=12?'p.m.':'a.m.';
  const h12 = (H%12)||12;
  return `${h12}:${m} ${suf}`;
}

function formatCurrency(monto, moneda) {
  const val = safeToFixed(monto);
  // Mantengo el estilo que ya usas: $<monto> <CÓDIGO>
  return `$${val} ${moneda === 'MXN' ? 'MXN' : 'USD'}`;
}

// ---------- i18n (textos, SIN cambiar diseño) ----------
function pickLang(idioma){
  const es = String(idioma||'').toLowerCase().startsWith('es');
  if (es) {
    return {
      code: 'es',
      header_ok: '✅ Reservación de Transporte Confirmada',
      labels: {
        name:'Nombre', email:'Correo', phone:'Teléfono', passengers:'Pasajeros', note:'Nota',
        folio:'Folio', transport:'Transporte', capacity:'Capacidad', total:'Total',
        tripType:'Tipo de viaje', hotel:'Hotel', date:'Fecha', time:'Hora',
        airline:'Aerolínea', flight:'Vuelo',
        arrivalInfo:'Información de Llegada', departureInfo:'Información de Salida',
        qrLegend:'Muestra este código QR a tu proveedor:',
        sentTo:'Esta confirmación fue enviada a:'
      },
      tripType: { Llegada:'Llegada', Salida:'Salida', Redondo:'Viaje Redondo', Shuttle:'Shuttle' },
      recomendaciones: `
        <div style="background-color:#fff3cd;border-left:6px solid #ffa500;padding:8px 12px;margin-top:14px;border-radius:5px;line-height:1.3;">
          <strong style="color:#b00000;">⚠ Recomendaciones:</strong>
          <span style="color:#333;"> Por favor confirma tu reservación con al menos 24 horas de anticipación para evitar contratiempos.</span>
        </div>
      `,
      politicas: `
        <div style="margin-top:30px;padding-top:15px;border-top:1px solid #ccc;font-size:13px;color:#555;">
          <strong>&#128204; Políticas de cancelación:</strong><br>
          - Toda cancelación o solicitud de reembolso está sujeta a una penalización del 10% del monto pagado.<br>
          <strong>- No hay reembolsos por cancelaciones con menos de 24 horas de anticipación o por inasistencias (no-show).</strong>
        </div>
      `,
      subject: (folio)=>`Confirmación de Transporte - Folio ${folio}`
    };
  }
  // EN (default)
  return {
    code: 'en',
    header_ok: '✅ Transport Reservation Confirmed',
    labels: {
      name:'Name', email:'Email', phone:'Phone', passengers:'Passengers', note:'Note',
      folio:'Folio', transport:'Transport', capacity:'Capacity', total:'Total',
      tripType:'Trip Type', hotel:'Hotel', date:'Date', time:'Time',
      airline:'Airline', flight:'Flight',
      arrivalInfo:'Arrival Information', departureInfo:'Departure Information',
      qrLegend:'Show this QR code to your provider:',
      sentTo:'This confirmation was sent to:'
    },
    tripType: { Llegada:'Arrival', Salida:'Departure', Redondo:'Round Trip', Shuttle:'Shuttle' },
    recomendaciones: `
      <div style="background-color:#fff3cd;border-left:6px solid #ffa500;padding:8px 12px;margin-top:14px;border-radius:5px;line-height:1.3;">
        <strong style="color:#b00000;">⚠ Recommendations:</strong>
        <span style="color:#333;"> Please confirm your reservation at least 24 hours in advance to avoid any inconvenience.</span>
      </div>
    `,
    politicas: `
      <div style="margin-top:30px;padding-top:15px;border-top:1px solid #ccc;font-size:13px;color:#555;">
        <strong>&#128204; Cancellation Policy:</strong><br>
        - All cancellations or refund requests are subject to a 10% fee of the total amount paid.<br>
        <strong>- No refunds will be issued for cancellations made less than 24 hours in advance or in case of no-shows.</strong>
      </div>
    `,
    subject: (folio)=>`Transport Reservation - Folio ${folio}`
  };
}

// ---------- QR: normalización y adjunto ----------
function normalizeQrBase64(qr) {
  if (!qr) return '';
  let s = String(qr).trim();
  if (s.startsWith('data:')) {
    const idx = s.indexOf(',');
    if (idx >= 0) s = s.slice(idx + 1);
  }
  s = s.replace(/\s+/g,'').replace(/[^A-Za-z0-9+/=]/g,'');
  const mod = s.length % 4;
  if (mod === 1) return '';
  if (mod === 2) s += '==';
  else if (mod === 3) s += '=';
  return s;
}

function buildQrAttachmentTransporte(qr) {
  const base64 = normalizeQrBase64(qr);
  if (!base64) return null;
  return {
    data: base64,
    filename: 'qr.png',
    inline: true,
    cid: 'qrReserva',
    mimeType: 'image/png'
  };
}

// ===============================================================
//                       ENVÍO PRINCIPAL (diseño intacto)
// ===============================================================
async function enviarCorreoTransporte(datos){
  try{
    if (!GAS_URL || !/^https:\/\/script\.google\.com\/macros\/s\//.test(GAS_URL)) {
      throw new Error('GAS_URL no configurado o inválido');
    }
    if (!GAS_TOKEN) throw new Error('GAS_TOKEN no configurado');

    const L = pickLang(datos.idioma);
    const logoUrl = 'https://static.wixstatic.com/media/f81ced_636e76aeb741411b87c4fa8aa9219410~mv2.png';
    const img0    = sanitizeUrl(datos.imagen);
    const imgUrl  = img0 ? forceJpgIfWix(img0) : '';
    const tripType = (L.tripType[datos.tipo_viaje] || datos.tipo_viaje);
    const nota     = datos.nota || datos.cliente?.nota || '';
    const esShuttle= datos.tipo_viaje === 'Shuttle';

    /* ===== Nombre del transporte según idioma del correo ===== */
    const catEN = String((datos.categoria ?? datos.nombreEN) || '').trim();
    const catES = String((datos.categoria_es ?? datos.nombreES) || '').trim();
    const categoria_i18n = (L.code === 'es')
      ? (catES || catEN || datos.tipo_transporte || '')
      : (catEN || catES || datos.tipo_transporte || '');

    /* ===== MONEDA y MONTO a mostrar ===== */
    const moneda = (String(
      datos.moneda || datos.moneda_cobro_real || datos.moneda_cobro || 'USD'
    ).toUpperCase() === 'MXN') ? 'MXN' : 'USD';

    const totalMostrar = Number(
      Number.isFinite(datos.total_cobrado) ? datos.total_cobrado : datos.total_pago
    ) || 0;

    // Header (h2 izq + logo der)
    const headerHTML = `
      <table style="width:100%;margin-bottom:10px;border-collapse:collapse;" role="presentation" cellspacing="0" cellpadding="0">
        <tr>
          <td style="text-align:left;vertical-align:middle;">
            <h2 style="color:green;margin:0;font-family:Arial,Helvetica,sans-serif;">${L.header_ok}</h2>
          </td>
          <td style="text-align:right;vertical-align:middle;">
            <img src="cid:logoEmpresa" alt="Logo" style="height:45px;display:block;" />
          </td>
        </tr>
      </table>
    `.trim();

    const p = (label, value) => {
      if (value === undefined || value === null || String(value).trim() === '') return '';
      return `<p style="margin:2px 0;font-family:Arial,Helvetica,sans-serif;line-height:1.4;"><strong>${label}:</strong> ${value}</p>`;
    };

    // ======== Cuerpo (mismo orden/diseño) ========
    let cuerpoHTML = '';
    if (datos.tipo_viaje === 'Redondo') {
      cuerpoHTML += `
        <table style="width:100%;margin-bottom:10px;border-collapse:collapse;" role="presentation" cellspacing="0" cellpadding="0">
          <tr>
            <td style="vertical-align:top;width:48%;padding-right:10px;">
              ${p(L.labels.name,  datos.nombre_cliente)}
              ${p(L.labels.email, datos.correo_cliente)}
              ${p(L.labels.phone, datos.telefono_cliente)}
              ${p(L.labels.passengers, datos.cantidad_pasajeros || datos.pasajeros)}
              ${nota && nota.trim() !== '' ? p(L.labels.note, nota) : ''}
            </td>
            <td style="vertical-align:top;width:48%;">
              ${p(L.labels.folio, datos.folio)}
              ${!esShuttle ? p(L.labels.transport, categoria_i18n) : ''}
              ${!esShuttle ? p(L.labels.capacity,  datos.capacidad) : ''}
              ${p(L.labels.tripType, tripType)}
              ${p(L.labels.total, formatCurrency(totalMostrar, moneda))}
            </td>
          </tr>
        </table>

        <table style="width:100%;border-collapse:collapse;margin-top:6px;" role="presentation" cellspacing="0" cellpadding="0">
          <tr>
            <th style="text-align:left;border-bottom:1px solid #ddd;padding:0 0 5px 0;width:48%;font-family:Arial,Helvetica,sans-serif;">${L.labels.arrivalInfo}</th>
            <th style="text-align:left;border-bottom:1px solid #ddd;padding:0 0 5px 0;width:48%;font-family:Arial,Helvetica,sans-serif;">${L.labels.departureInfo}</th>
          </tr>
          <tr>
            <td style="vertical-align:top;padding-right:15px;width:48%;">
              ${p(L.labels.hotel,   datos.hotel_llegada)}
              ${p(L.labels.date,    datos.fecha_llegada)}
              ${p(L.labels.time,    formatoHora12(datos.hora_llegada))}
              ${p(L.labels.airline, datos.aerolinea_llegada)}
              ${p(L.labels.flight,  datos.vuelo_llegada)}
            </td>
            <td style="vertical-align:top;width:48%;">
              ${p(L.labels.hotel,   datos.hotel_salida)}
              ${p(L.labels.date,    datos.fecha_salida)}
              ${p(L.labels.time,    formatoHora12(datos.hora_salida))}
              ${p(L.labels.airline, datos.aerolinea_salida)}
              ${p(L.labels.flight,  datos.vuelo_salida)}
            </td>
          </tr>
        </table>
      `.trim();
    } else {
      cuerpoHTML += `
        ${p(L.labels.folio, datos.folio)}
        ${p(L.labels.name,  datos.nombre_cliente)}
        ${p(L.labels.email, datos.correo_cliente)}
        ${p(L.labels.phone, datos.telefono_cliente)}
        ${!esShuttle ? p(L.labels.transport, categoria_i18n) : ''}
        ${!esShuttle ? p(L.labels.capacity,  datos.capacidad) : ''}
        ${(datos.cantidad_pasajeros || datos.pasajeros) ? p(L.labels.passengers, (datos.cantidad_pasajeros || datos.pasajeros)) : ''}
        ${datos.hotel_llegada   ? p(L.labels.hotel,   datos.hotel_llegada)   : ''}
        ${datos.fecha_llegada   ? p(L.labels.date,    datos.fecha_llegada)   : ''}
        ${datos.hora_llegada    ? p(L.labels.time,    formatoHora12(datos.hora_llegada)) : ''}
        ${datos.aerolinea_llegada ? p(L.labels.airline, datos.aerolinea_llegada) : ''}
        ${datos.vuelo_llegada   ? p(L.labels.flight,  datos.vuelo_llegada)   : ''}
        ${datos.hotel_salida    ? p(L.labels.hotel,   datos.hotel_salida)    : ''}
        ${datos.fecha_salida    ? p(L.labels.date,    datos.fecha_salida)    : ''}
        ${datos.hora_salida     ? p(L.labels.time,    formatoHora12(datos.hora_salida)) : ''}
        ${datos.aerolinea_salida ? p(L.labels.airline, datos.aerolinea_salida) : ''}
        ${datos.vuelo_salida    ? p(L.labels.flight,  datos.vuelo_salida)    : ''}
        ${p(L.labels.tripType, tripType)}
        ${p(L.labels.total, formatCurrency(totalMostrar, moneda))}
        ${nota && nota.trim() !== '' ? p(L.labels.note, nota) : ''}
      `.trim();
    }

    const imagenHTML = imgUrl ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;border-collapse:collapse;">
        <tr>
          <td>
            <img src="cid:imagenTransporte" width="400" alt="Transport image"
                 style="display:block;width:100%;height:auto;max-width:100%;border-radius:8px;" />
          </td>
        </tr>
      </table>
    ` : '';

    // QR debajo de la imagen, centrado, 180px
    const qrAttachment = buildQrAttachmentTransporte(datos.qr);
    const qrHTML = qrAttachment ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;border-collapse:collapse;">
        <tr>
          <td align="center">
            <p style="font-weight:bold;margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;">${L.labels.qrLegend}</p>
            <img src="cid:qrReserva" alt="QR Code" style="width:180px;display:block;border-radius:8px;" />
          </td>
        </tr>
      </table>
    ` : '';

    const destinatarioHTML = `
      <p style="margin-top:14px;font-size:14px;color:#555;line-height:1.3;font-family:Arial,Helvetica,sans-serif;">
        &#128231; ${L.labels.sentTo}
        <a href="mailto:${datos.correo_cliente}" style="color:#1b6ef3;text-decoration:none;">${datos.correo_cliente}</a>
      </p>
    `;

    const mensajeInner = `
      ${headerHTML}
      <div style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;line-height:1.4;">
        ${cuerpoHTML}
        ${imagenHTML}
        ${qrHTML}
        ${L.recomendaciones}
        ${destinatarioHTML}
        ${L.politicas}
      </div>
    `.trim();

    const mensajeHTML = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        <tr>
          <td align="center" style="padding:0;margin:0;">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0"
                   style="width:600px;max-width:600px;border:2px solid #ccc;border-radius:10px;border-collapse:separate;">
              <tr>
                <td style="padding:24px 26px 32px;border-radius:10px;">
                  ${mensajeInner}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `.trim();

    const attachments = [{ url: logoUrl, filename: 'logo.png', inline: true, cid: 'logoEmpresa' }];
    if (imgUrl) attachments.push({ url: imgUrl, filename: 'transporte.jpg', inline: true, cid: 'imagenTransporte' });
    if (qrAttachment) attachments.push(qrAttachment);

    const payload = {
      token: GAS_TOKEN,
      ts: Date.now(),
      to: datos.correo_cliente,
      bcc: EMAIL_BCC,
      subject: L.subject(datos.folio),
      html: mensajeHTML,
      fromName: EMAIL_FROMNAME,
      attachments
    };

    DBG('POST → GAS', { to: datos.correo_cliente, subject: payload.subject, hasQR: !!qrAttachment });

    if (MAIL_FAST_MODE) {
      postJSON(GAS_URL, payload, GAS_TIMEOUT_MS).catch(err => console.error('Error envío async GAS:', err.message));
      return true;
    }

    const { status, json } = await postJSON(GAS_URL, payload, GAS_TIMEOUT_MS);
    if (!json || json.ok !== true) {
      throw new Error(`Error al enviar correo: ${(json && json.error) || status}`);
    }

    DBG('✔ GAS ok:', json);
    return true;
  } catch (err) {
    console.error('❌ Error al enviar correo de transporte (GAS):', err.message);
    throw err;
  }
}

/* ============================================================
   Handler HTTP para usar en server.js
   POST /api/correos-reservacion-error/enviar-transporte
   Body esperado: { folio }
   ============================================================ */
async function reenviarCorreoTransporte(req, res) {
  try {
    const { folio } = req.body || {};
    if (!folio) {
      return res.status(400).json({
        ok: false,
        error: 'Falta el folio en el body',
      });
    }

    const sql = `
      SELECT *
      FROM reservaciones
      WHERE folio = $1
      LIMIT 1
    `;
    const { rows } = await pool.query(sql, [folio]);
    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        error: 'No se encontró una reservación con ese folio',
      });
    }

    const r = rows[0];

    // 🔹 AQUÍ generamos el QR IGUAL que en el PREVIEW
    let qr = '';
    try {
      const token = r.token_qr || r.token || null;
      if (token) {
        qr = await generarQRTransporte(token);
      }
    } catch (err) {
      console.warn('[MAIL-TRANS] No se pudo generar QR:', err?.message);
    }

    const datos = {
      idioma: r.idioma || r.idioma_cliente || r.lenguaje || 'es',
      folio: r.folio,
      nombre_cliente: r.nombre_cliente,
      correo_cliente: r.correo_cliente,
      telefono_cliente: r.telefono_cliente,

      cantidad_pasajeros: r.cantidad_pasajeros || r.cantidad_pasajerosok || r.pasajeros,
      pasajeros: r.pasajeros,

      nota: r.nota || r.comentarios || r.nota_cliente || '',
      cliente: { nota: r.nota_cliente || '' },

      tipo_viaje: r.tipo_viaje || r.tipo_servicio,
      tipo_transporte: r.tipo_transporte,

      categoria: r.categoria,
      categoria_es: r.categoria_es,
      nombreEN: r.nombre_tour_en || r.actividad || '',
      nombreES: r.nombre_tour_es || r.actividad_es || '',

      capacidad: r.capacidad,

      hotel_llegada: r.hotel_llegada,
      fecha_llegada: r.fecha_llegada,
      hora_llegada: r.hora_llegada,
      aerolinea_llegada: r.aerolinea_llegada,
      vuelo_llegada: r.vuelo_llegada,

      hotel_salida: r.hotel_salida,
      fecha_salida: r.fecha_salida,
      hora_salida: r.hora_salida,
      aerolinea_salida: r.aerolinea_salida,
      vuelo_salida: r.vuelo_salida,

      total_cobrado: r.total_cobrado,
      total_pago: r.total_pago,
      moneda: r.moneda || r.moneda_cobro_real || r.moneda_cobro,
      moneda_cobro_real: r.moneda_cobro_real,
      moneda_cobro: r.moneda_cobro,

      imagen: r.imagen_transporte || r.imagen || '',
      qr
    };

    await enviarCorreoTransporte(datos);

    await pool.query(
      `UPDATE reservaciones
       SET email_reservacion = 'enviado'
       WHERE folio = $1`,
      [folio]
    );

    return res.json({
      ok: true,
      mensaje: 'Correo de transporte enviado correctamente',
    });
  } catch (err) {
    console.error('❌ reenviarCorreoTransporte:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error al enviar el correo de transporte',
    });
  }
}

export { enviarCorreoTransporte, reenviarCorreoTransporte };
export default enviarCorreoTransporte;

