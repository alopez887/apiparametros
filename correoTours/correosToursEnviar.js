// correoTours/correosToursEnviar.js — bilingüe ES/EN + traducción de transporte + idempotencia GAS

import dotenv from 'dotenv';
dotenv.config();

import pool from '../conexion.js';
import { generarQRDestino } from './generarQRTours.js';

const GAS_URL        = process.env.GAS_URL;
const GAS_TOKEN      = process.env.GAS_TOKEN;
const GAS_TIMEOUT_MS = Number(process.env.GAS_TIMEOUT_MS || 15000);

const EMAIL_DEBUG = /^(1|true|yes)$/i.test(String(process.env.EMAIL_DEBUG || ''));
const DBG = (...a) => { if (EMAIL_DEBUG) console.log('[MAIL][destino]', ...a); };

// === ICONOS COMO ENTIDADES (sin emojis directos) ===
const ICO_CHECK = '&#9989;';    // ✅
const ICO_WARN  = '&#9888;';    // ⚠
const ICO_MAIL  = '&#128231;';  // 📧
const ICO_PIN   = '&#128204;';  // 📌

// ---------- utils ----------
const _fmt = (v) => (v === 0 ? '0' : (v ?? '—'));
const GEN_CID = (name) => `${name}@cts`;

function sanitizeUrl(u = '') {
  try {
    let s = String(u || '').trim();
    if (!s) return '';
    if (s.startsWith('//')) s = 'https:' + s;
    if (s.startsWith('http://')) s = s.replace(/^http:\/\//i, 'https://');
    return s;
  } catch { return ''; }
}

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

function moneyNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).replace(/[^0-9.-]/g,'').replace(/,/g,'');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// 🔹 formateo con miles y 2 decimales
function fmtMoney(num) {
  try {
    return Number(num || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  } catch {
    return Number(num || 0).toFixed(2);
  }
}

function fmtDMY(dateLike) {
  try {
    const d = new Date(dateLike);
    if (isNaN(d)) return '—';
    const dd = String(d.getUTCDate()).padStart(2,'0');
    const mm = String(d.getUTCMonth()+1).padStart(2,'0');
    const yyyy = d.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch { return '—'; }
}

function fmtHora12(hhmm) {
  try {
    if (!hhmm) return '—';
    const [h, m='00'] = String(hhmm).split(':');
    const H = Number(h);
    if (!Number.isFinite(H)) return hhmm;
    const suf = H >= 12 ? 'p.m.' : 'a.m.';
    const h12 = (H % 12) || 12;
    return `${h12}:${m.padStart(2,'0')} ${suf}`;
  } catch { return hhmm; }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
function sanitizeEmails(value) {
  const arr = Array.isArray(value) ? value : String(value || '').split(/[,\s]+/).filter(Boolean);
  const valid = []; const invalid = [];
  for (const raw of arr) {
    const e = String(raw || '').trim();
    if (EMAIL_RE.test(e)) valid.push(e); else invalid.push(raw);
  }
  return { valid: Array.from(new Set(valid)), invalid };
}

function firstNonNil(...vals) {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v;
  return null;
}

async function postJSON(url, body, timeoutMs) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } finally {
    clearTimeout(id);
  }
}

// ===== Localización =====
function normLang(v) {
  const s = String(v || '').toLowerCase();
  return s.startsWith('es') ? 'es' : 'en';
}

// Traducción de tipo de transporte cuando el correo va en ES
function labelTransporte(lang, rawCode) {
  const code = String(rawCode || '').trim();
  if (lang === 'es') {
    const mapES = { Private: 'Privado', Limousine: 'Limusina', Sprinter: 'Sprinter' };
    return mapES[code] || code;
  }
  // EN: devolver tal cual
  return code;
}

// Textos ES/EN
const T_ES = {
  title:              `${ICO_CHECK} Confirmación de Reservación de Tours`,
  sectionTitle:       'Información de la Reservación',
  labels: {
    Folio: 'Folio',
    Name: 'Nombre',
    Email: 'Correo',
    Phone: 'Teléfono',
    Destination: 'Destino',
    Transport: 'Transporte',
    Capacity: 'Capacidad',
    TripType: 'Tipo de viaje',
    Hotel: 'Hotel',
    Date: 'Fecha',
    Time: 'Hora',
    Passengers: 'Pasajeros',
    Note: 'Nota',
    Total: 'Total',
  },
  recommendationsTitle: `${ICO_WARN} Recomendaciones:`,
  recommendationsText:  'Por favor, confirma tu reservación con al menos 24 horas de anticipación para evitar inconvenientes.',
  sentTo:               `${ICO_MAIL} Confirmación enviada a`,
  subject: (folio) => `Reservación de Tours - Folio ${_fmt(folio)}`,
  policies: `
    <div style="margin-top:16px;padding-top:10px;border-top:1px solid #e5e9f0;font-size:13px;color:#555;">
      <strong>${ICO_PIN} Políticas de cancelación:</strong><br>
      - Todas las cancelaciones o solicitudes de reembolso están sujetas a una tarifa del 10% del monto total pagado.<br>
      <strong>- No hay reembolsos por cancelaciones con menos de 24 horas de anticipación o en caso de no presentarse.</strong>
    </div>
  `,
};

const T_EN = {
  title:              `${ICO_CHECK} Tours Reservation Confirmed`,
  sectionTitle:       'Reservation Information',
  labels: {
    Folio: 'Folio',
    Name: 'Name',
    Email: 'Email',
    Phone: 'Phone',
    Destination: 'Destination',
    Transport: 'Transport',
    Capacity: 'Capacity',
    TripType: 'Trip Type',
    Hotel: 'Hotel',
    Date: 'Date',
    Time: 'Time',
    Passengers: 'Passengers',
    Note: 'Note',
    Total: 'Total',
  },
  recommendationsTitle: `${ICO_WARN} Recommendations:`,
  recommendationsText:  'Please confirm your reservation at least 24 hours in advance to avoid any inconvenience.',
  sentTo:               `${ICO_MAIL} Confirmation sent to`,
  subject: (folio) => `Tours Reservation - Folio ${_fmt(folio)}`,
  policies: `
    <div style="margin-top:16px;padding-top:10px;border-top:1px solid #e5e9f0;font-size:13px;color:#555;">
      <strong>${ICO_PIN} Cancellation Policy:</strong><br>
      - All cancellations or refund requests are subject to a 10% fee of the total amount paid.<br>
      <strong>- No refunds will be issued for cancellations made less than 24 hours in advance or in case of no-shows.</strong>
    </div>
  `,
};

// ---------- estilos ----------
const EMAIL_CSS = `
<style>
  .body-cts { font-family: Arial, Helvetica, sans-serif; color:#222; }
  .section-title { font-size:13px; letter-spacing:.4px; text-transform:uppercase; color:#000; font-weight:700; }
  .divider { border-top:1px solid #e5e9f0; height:1px; line-height:1px; font-size:0; }
  .logoimg { display:block;height:auto;border:0; }
  @media screen and (max-width:480px){
    .logoimg { width:160px !important; height:auto !important; }
  }
</style>`;

// ---------- logo ----------
let _logoCache = null;
async function inlineLogo() {
  if (_logoCache) return _logoCache;
  const url = 'https://static.wixstatic.com/media/f81ced_636e76aeb741411b87c4fa8aa9219410~mv2.png';
  _logoCache = { url, filename: 'logo.png', cid: GEN_CID('logoEmpresa'), inline: true };
  return _logoCache;
}

/* ============================================================
   MOTOR PRINCIPAL: ENVÍO DE CORREO DE TOURS (igual que original)
   ============================================================ */
export async function enviarCorreoDestino(datos = {}) {
  try {
    if (!GAS_URL || !/^https:\/\/script\.google\.com\/macros\/s\//.test(GAS_URL)) {
      throw new Error('GAS_URL no configurado o inválido');
    }
    if (!GAS_TOKEN) throw new Error('GAS_TOKEN no configurado');

    DBG('payload in:', datos);

    // Idioma: si front no manda, default EN
    const lang = normLang(datos.idioma || datos.lang);
    const T = (lang === 'es') ? T_ES : T_EN;

    const toSan = sanitizeEmails(datos.correo_cliente || datos.to);
    if (!toSan.valid.length) throw new Error('Destinatario inválido (correo_cliente)');

    // ---------- attachments ----------
    const logo = await inlineLogo();
    const logoCid = logo?.cid || GEN_CID('logoEmpresa');

    // 🔹 IMÁGENES DESDE BD (columna "imagen" con url1|url2)
    const destinoCid    = GEN_CID('imagenDestino');
    const transporteCid = GEN_CID('imagenTransporte');

    let urlDestino = '';
    let urlTransporte = '';

    // 1) Preferimos la columna combinada `imagen` si viene con las 2 URLs
    if (datos.imagen) {
      const partes = String(datos.imagen).split('|').filter(Boolean);
      if (partes[0]) urlDestino    = forceJpgIfWix(sanitizeUrl(partes[0]));
      if (partes[1]) urlTransporte = forceJpgIfWix(sanitizeUrl(partes[1]));
    }

    // 2) Fallback: si no hay `imagen`, usamos los campos individuales
    if (!urlDestino && datos.imagenDestino) {
      urlDestino = forceJpgIfWix(sanitizeUrl(datos.imagenDestino));
    }
    if (!urlTransporte && datos.imagenTransporte) {
      urlTransporte = forceJpgIfWix(sanitizeUrl(datos.imagenTransporte));
    }

    const attDestino = urlDestino
      ? { url: urlDestino, filename: 'destino.jpg', cid: destinoCid, inline: true }
      : null;

    const attTransp = urlTransporte
      ? { url: urlTransporte, filename: 'transporte.jpg', cid: transporteCid, inline: true }
      : null;

    // QR opcional (igual que antes, pero usando generarQRDestino de este proyecto)
    let qrAttachment = null;
    const qrCid = GEN_CID('tokenQR');
    if (datos.token_qr) {
      try {
        const dataUrl = await generarQRDestino(datos.token_qr, { size: 320, margin: 1 });
        const base64 = String(dataUrl)
          .replace(/^data:[^;]+;base64,/, '')
          .replace(/\s+/g,'');
        qrAttachment = {
          data: base64,
          mimeType: 'image/png',
          filename: 'qr.png',
          cid: qrCid,
          inline: true
        };
      } catch (e) {
        console.warn('[MAIL][destino] QR error:', e?.message);
      }
    }

    // ---------- datos presentacionales ----------
    const hotel   = firstNonNil(datos.hotel, datos.hotel_llegada);
    const fecha   = firstNonNil(datos.fecha, datos.fecha_llegada);
    const hora    = fmtHora12(firstNonNil(datos.hora, datos.hora_llegada));
    const totalN  = moneyNum(datos.total_pago);
    const transpL = labelTransporte(lang, datos.tipo_transporte);

    // 🔹 moneda desde backend (guardarDestino) -> 'USD' | 'MXN', default 'USD'
    const moneda = (() => {
      const m = String(datos.moneda || 'USD').toUpperCase();
      return (m === 'MXN') ? 'MXN' : 'USD';
    })();

    const totalH = totalN != null
      ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Total}:</strong> $${fmtMoney(totalN)} ${moneda}</p>`
      : '';

    // ---------- HTML (bilingüe) ----------
    const html = `
      ${EMAIL_CSS}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="body-cts">
        <tr>
          <td align="center" style="padding:0;margin:0;">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:600px;max-width:600px;border:2px solid #ccc;border-radius:10px;">
              <tr>
                <td style="padding:20px;border-radius:10px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 8px 0;">
                    <tr>
                      <td align="left" style="vertical-align:middle;">
                        <h2 style="color:green;margin:0;">${T.title}</h2>
                      </td>
                      <td align="right" style="vertical-align:middle;">
                        <img src="cid:${logoCid}" width="180" class="logoimg" alt="Logo" />
                      </td>
                    </tr>
                  </table>

                  <p class="section-title" style="margin:12px 0 6px;"><strong>${T.sectionTitle}</strong></p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr><td style="font-size:14px;color:#222;">
                      <p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Folio}:</strong> ${_fmt(datos.folio)}</p>
                      <p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Name}:</strong> ${_fmt(datos.nombre_cliente || datos.nombre)}</p>
                      ${datos.correo_cliente ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Email}:</strong> ${datos.correo_cliente}</p>` : ``}
                      ${datos.telefono_cliente ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Phone}:</strong> ${datos.telefono_cliente}</p>` : ``}
                      ${datos.destino ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Destination}:</strong> ${datos.destino}</p>` : ``}
                      ${datos.tipo_transporte ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Transport}:</strong> ${transpL}</p>` : ``}
                      ${datos.capacidad ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Capacity}:</strong> ${datos.capacidad}</p>` : ``}
                      ${datos.tipo_viaje ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.TripType}:</strong> ${datos.tipo_viaje}</p>` : ``}
                      ${hotel ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Hotel}:</strong> ${hotel}</p>` : ``}
                      ${fecha ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Date}:</strong> ${fmtDMY(fecha)}</p>` : ``}
                      ${hora  ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Time}:</strong> ${hora}</p>` : ``}
                      ${datos.cantidad_pasajeros ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Passengers}:</strong> ${datos.cantidad_pasajeros}</p>` : ``}
                      ${totalH}
                      ${datos.nota ? `<p style="margin:8px 0 0;line-height:1.45;"><strong>${T.labels.Note}:</strong> ${datos.nota}</p>` : ``}
                    </td></tr>
                  </table>

                  ${(attDestino || attTransp) ? `
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;">
                      <tr>
                        <td>
                          ${attDestino ? `<img src="cid:${destinoCid}" width="400" style="display:block;width:100%;height:auto;border-radius:8px;" alt="Destination image" />` : ``}
                          ${attTransp ? `<div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>
                                         <img src="cid:${transporteCid}" width="400" style="display:block;width:100%;height:auto;border-radius:8px;" alt="Transport image" />` : ``}
                        </td>
                      </tr>
                    </table>
                  ` : ``}

                  ${qrAttachment ? `
                  <table role="presentation" align="center" cellspacing="0" cellpadding="0" style="margin:10px auto 0;">
                    <tr>
                      <td align="center">
                        <img src="cid:${qrCid}" width="110" height="110" style="display:block;border:0;outline:0;text-decoration:none;" alt="QR" />
                      </td>
                    </tr>
                  </table>` : ``}

                  <div class="divider" style="border-top:1px solid #e5e9f0;margin:12px 0;"></div>

                  <div style="background:#fff8e6;border-left:6px solid #ffa500;padding:10px 14px;border-radius:6px;">
                    <strong style="color:#b00000;">${T.recommendationsTitle}</strong>
                    <span style="color:#333;"> ${T.recommendationsText}</span>
                  </div>

                  <p style="margin-top:12px;font-size:14px;color:#555;">
                    ${T.sentTo}: <a href="mailto:${_fmt(datos.correo_cliente)}">${_fmt(datos.correo_cliente)}</a>
                  </p>

                  ${T.policies}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;

    // ---------- payload GAS ----------
    const attachments = [
      ...(logo ? [logo] : []),
      ...(attDestino ? [attDestino] : []),
      ...(attTransp ? [attTransp] : []),
      ...(qrAttachment ? [qrAttachment] : []),
    ];

    const subject = T.subject(datos.folio);
    const payload = {
      token: GAS_TOKEN,
      ts: Date.now(),
      to: toSan.valid,
      cc: [],
      bcc: 'nkmsistemas@gmail.com',
      subject,
      html,
      fromName: process.env.EMAIL_FROMNAME || 'Cabo Travel Solutions',
      attachments,
      // === Idempotencia en GAS (usa folio/clave) ===
      folio: datos.folio || undefined,
      idempotencyKey: (datos.folio || datos.token_qr || undefined),
    };

    DBG('POST → GAS', { to: toSan.valid, subject, lang, moneda });
    const { status, json } = await postJSON(GAS_URL, payload, GAS_TIMEOUT_MS);
    if (!json || json.ok !== true) throw new Error(`Error GAS: ${(json && json.error) || status}`);

    DBG('✔ GAS ok:', json);
    return true;
  } catch (err) {
    console.error('❌ Error al enviar correo de destino (GAS):', err?.message || err);
    throw err;
  }
}

/* ============================================================
   HANDLER HTTP PARA REENVIAR (API-PARAMETROS)
   POST /api/correos-reservacion-error/enviar-tours
   Body esperado: { folio }
   ============================================================ */
export async function reenviarCorreoTours(req, res) {
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

    // Armar objeto "datos" lo más parecido posible al envío original
    const datos = {
      idioma: r.idioma || r.idioma_cliente || r.lenguaje || 'es',
      lang:   r.idioma || r.idioma_cliente || r.lenguaje || 'es',

      folio: r.folio,
      nombre_cliente: r.nombre_cliente,
      nombre: r.nombre_cliente,
      correo_cliente: r.correo_cliente,
      telefono_cliente: r.telefono_cliente,

      destino: r.destino || r.actividad || r.actividad_es || '',
      tipo_transporte: r.tipo_transporte,
      capacidad: r.capacidad,
      tipo_viaje: r.tipo_viaje,

      hotel: r.hotel || r.hotel_llegada,
      hotel_llegada: r.hotel_llegada,
      fecha: r.fecha || r.fecha_llegada,
      fecha_llegada: r.fecha_llegada,
      hora: r.hora || r.hora_llegada,
      hora_llegada: r.hora_llegada,

      cantidad_pasajeros: r.cantidad_pasajeros || r.cantidad_pasajerosok || r.pasajeros,

      nota: r.nota || r.comentarios || r.nota_cliente || '',

      total_pago: r.total_pago || r.importe_total || 0,
      moneda: r.moneda || r.moneda_cobro_real || r.moneda_cobro || 'USD',

      // 🔹 NUEVO: columna combinada con las 2 imágenes
      imagen: r.imagen || r.imagen_tour || r.imagen_destino || '',

      // Fallbacks individuales (por compatibilidad)
      imagenDestino: r.imagen_tour || r.imagen_destino || r.imagen || '',
      imagenTransporte: r.imagen_transporte || '',

      token_qr: r.token_qr || r.token || null,
    };

    // 3) Mandar el correo usando el mismo motor
    await enviarCorreoDestino(datos);

    // 4) Marcar como enviado en la BD solo si el correo se mandó bien
    await pool.query(
      `UPDATE reservaciones
       SET email_reservacion = 'enviado'
       WHERE folio = $1`,
      [folio]
    );

    return res.json({
      ok: true,
      mensaje: 'Correo de tours enviado correctamente',
    });
  } catch (err) {
    console.error('❌ reenviarCorreoTours:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error al enviar el correo de tours',
    });
  }
}

// Default igual que antes: el motor de envío
export default enviarCorreoDestino;
