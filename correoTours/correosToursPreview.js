// correoTours/correosToursPreview.js
// Builder de PREVIEW para correos de TOURS (ES/EN) con QR visible (dataURL)

import { generarQRDestino } from './generarQRTours.js';

// === ICONOS COMO ENTIDADES (sin emojis directos) ===
const ICO_CHECK = '&#9989;';    // ✅
const ICO_WARN  = '&#9888;';    // ⚠
const ICO_MAIL  = '&#128231;';  // 📧
const ICO_PIN   = '&#128204;';  // 📌

// ---------- utils básicos ----------
const _fmt = (v) => (v === 0 ? '0' : (v ?? '—'));

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

// 👉 dd/mm/aaaa (preview)
function fmtDMY(dateLike) {
  try {
    if (!dateLike) return '—';
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return String(dateLike);
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return String(dateLike || '—');
  }
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

function firstNonNil(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
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

// Textos ES/EN (mismos textos que el correo real de Tours)
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

// ---------- estilos (igual layout 600px) ----------
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

// ---------- PREVIEW PRINCIPAL ----------
export async function buildPreviewToursFromReserva(reserva) {
  if (!reserva) {
    return { subject: null, html: null };
  }

  // Idioma
  const lang = normLang(reserva.idioma || reserva.idioma_cliente || reserva.lenguaje || 'es');
  const T = (lang === 'es') ? T_ES : T_EN;

  // Datos presentacionales (igual filosofía que el envío real)
  const hotel = firstNonNil(reserva.hotel, reserva.hotel_llegada);
  const fecha = firstNonNil(reserva.fecha, reserva.fecha_llegada);
  const hora  = fmtHora12(firstNonNil(reserva.hora, reserva.hora_llegada));

  const totalN = moneyNum(reserva.total_pago || reserva.importe_total);

  // 🔹 moneda: lo mismo que el envío
  const moneda = (() => {
    const m = String(
      reserva.moneda ||
      reserva.moneda_cobro_real ||
      reserva.moneda_cobro ||
      'USD'
    ).toUpperCase();
    return (m === 'MXN') ? 'MXN' : 'USD';
  })();

  const totalH = (totalN != null)
    ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Total}:</strong> $${fmtMoney(totalN)} ${moneda}</p>`
    : '';

  const destino = reserva.destino || reserva.actividad || reserva.actividad_es || '';
  const transpL = labelTransporte(lang, reserva.tipo_transporte);

  // Imagen destino / transporte (solo URLs directas, sin cid, para preview)
  const imgDest0 = sanitizeUrl(reserva.imagen_tour || reserva.imagen || reserva.imagen_destino || '');
  const imgDestino = imgDest0 ? forceJpgIfWix(imgDest0) : '';

  const imgTrans0 = sanitizeUrl(reserva.imagen_transporte || '');
  const imgTransporte = imgTrans0 ? forceJpgIfWix(imgTrans0) : '';

  // Logo directo
  const logoUrl = 'https://static.wixstatic.com/media/f81ced_636e76aeb741411b87c4fa8aa9219410~mv2.png';

  // QR: dataURL igual que transporte preview
  let qr = reserva.qr || '';
  if (!qr) {
    const token = reserva.token_qr || reserva.token || null;
    if (token) {
      try {
        qr = await generarQRDestino(token, { size: 320, margin: 1 });
      } catch (err) {
        console.warn('[PREVIEW-TOURS] No se pudo generar QR:', err?.message);
      }
    }
  }

  const qrHTML = qr
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;">
        <tr>
          <td align="center">
            <img src="${qr}" width="110" height="110"
                 style="display:block;border-radius:8px;border:0;outline:0;text-decoration:none;"
                 alt="QR" />
          </td>
        </tr>
      </table>
    `
    : '';

  // Bloque imágenes
  const imagenesHTML = (imgDestino || imgTransporte)
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;">
        <tr>
          <td>
            ${
              imgDestino
                ? `<img src="${imgDestino}" width="400"
                        style="display:block;width:100%;height:auto;border-radius:8px;"
                        alt="Destination image" />`
                : ``
            }
            ${
              imgTransporte
                ? `<div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>
                   <img src="${imgTransporte}" width="400"
                        style="display:block;width:100%;height:auto;border-radius:8px;"
                        alt="Transport image" />`
                : ``
            }
          </td>
        </tr>
      </table>
    `
    : '';

  // Cuerpo textos
  const html = `
    ${EMAIL_CSS}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="body-cts">
      <tr>
        <td align="center" style="padding:0;margin:0;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0"
                 style="width:600px;max-width:600px;border:2px solid #ccc;border-radius:10px;">
            <tr>
              <td style="padding:20px;border-radius:10px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 8px 0;">
                  <tr>
                    <td align="left" style="vertical-align:middle;">
                      <h2 style="color:green;margin:0;">${T.title}</h2>
                    </td>
                    <td align="right" style="vertical-align:middle;">
                      <img src="${logoUrl}" width="180" class="logoimg" alt="Logo" />
                    </td>
                  </tr>
                </table>

                <p class="section-title" style="margin:12px 0 6px;"><strong>${T.sectionTitle}</strong></p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr><td style="font-size:14px;color:#222;">
                    <p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Folio}:</strong> ${_fmt(reserva.folio)}</p>
                    <p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Name}:</strong> ${_fmt(reserva.nombre_cliente || reserva.nombre)}</p>
                    ${reserva.correo_cliente ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Email}:</strong> ${reserva.correo_cliente}</p>` : ``}
                    ${reserva.telefono_cliente ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Phone}:</strong> ${reserva.telefono_cliente}</p>` : ``}
                    ${destino ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Destination}:</strong> ${destino}</p>` : ``}
                    ${reserva.tipo_transporte ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Transport}:</strong> ${transpL}</p>` : ``}
                    ${reserva.capacidad ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Capacity}:</strong> ${reserva.capacidad}</p>` : ``}
                    ${reserva.tipo_viaje ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.TripType}:</strong> ${reserva.tipo_viaje}</p>` : ``}
                    ${hotel ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Hotel}:</strong> ${hotel}</p>` : ``}
                    ${fecha ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Date}:</strong> ${fmtDMY(fecha)}</p>` : ``}
                    ${hora  ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Time}:</strong> ${hora}</p>` : ``}
                    ${reserva.cantidad_pasajeros
                      ? `<p style="margin:2px 0;line-height:1.35;"><strong>${T.labels.Passengers}:</strong> ${reserva.cantidad_pasajeros}</p>`
                      : ``}
                    ${totalH}
                    ${
                      (reserva.nota || reserva.comentarios)
                        ? `<p style="margin:8px 0 0;line-height:1.45;"><strong>${T.labels.Note}:</strong> ${reserva.nota || reserva.comentarios}</p>`
                        : ``
                    }
                  </td></tr>
                </table>

                ${imagenesHTML}
                ${qrHTML}

                <div class="divider" style="border-top:1px solid #e5e9f0;margin:12px 0;"></div>

                <div style="background:#fff8e6;border-left:6px solid #ffa500;padding:10px 14px;border-radius:6px;">
                  <strong style="color:#b00000;">${T.recommendationsTitle}</strong>
                  <span style="color:#333;"> ${T.recommendationsText}</span>
                </div>

                <p style="margin-top:12px;font-size:14px;color:#555;">
                  ${T.sentTo}: <a href="mailto:${_fmt(reserva.correo_cliente)}">${_fmt(reserva.correo_cliente)}</a>
                </p>

                ${T.policies}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `.trim();

  const subject = T.subject(reserva.folio);

  return { subject, html };
}

export default buildPreviewToursFromReserva;
