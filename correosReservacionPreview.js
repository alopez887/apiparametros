// correosReservacionPreview.js
import pool from './conexion.js';

/**
 * Vista previa de correo de reservación.
 *
 * Soporta:
 *   - GET  /api/correos-reservacion-error/preview?folio=XXXX
 *   - POST /api/correos-reservacion-error/preview { folio }
 *
 * Respuesta (ejemplo):
 * {
 *   ok: true,
 *   folio: "ABC123",
 *   tipo_servicio: "actividad",
 *   idioma: "es",
 *   reserva: { ...fila completa... },
 *   subject: "Reservation Confirmation – ...",
 *   html: "<!DOCTYPE html>..."
 * }
 */

// ===== Helpers compartidos (copiados/adaptados del correo real) =====

const EMAIL_CSS = `
<style>
  .body-cts { font-family: Arial, Helvetica, sans-serif; color:#222; }
  .section-title { font-size:13px; letter-spacing:.4px; text-transform:uppercase; color:#000; font-weight:700; }
  .divider { border-top:1px solid #e5e9f0; height:1px; line-height:1px; font-size:0; }
  .img-fluid { display:block; width:100%; height:auto; border-radius:8px; }
  @media screen and (max-width:480px){
    .logoimg { height:45px !important; width:auto !important; }
  }
</style>`;

const LOGO_URL = 'https://static.wixstatic.com/media/f81ced_636e76aeb741411b87c4fa8aa9219410~mv2.png';

const _fmt = (v) => (v === 0 ? '0' : (v ?? '—'));

function firstNonNil(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

function fmtDMY(dateLike) {
  try {
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return '—';
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return '—';
  }
}

function sanitizeUrl(u = '') {
  try {
    let s = String(u || '').trim();
    if (!s) return '';
    if (s.startsWith('//')) s = 'https:' + s;
    if (s.startsWith('http://')) s = s.replace(/^http:\/\//i, 'https://');
    return s;
  } catch {
    return '';
  }
}

function forceJpgIfWix(url = '') {
  try {
    const u = new URL(url);
    if (/wixstatic\.com$/i.test(u.hostname)) {
      if (!u.searchParams.has('format')) u.searchParams.set('format', 'jpg');
      if (!u.searchParams.has('width'))  u.searchParams.set('width', '1200');
      return u.toString();
    }
  } catch {
    // ignore
  }
  return url;
}

function moneyNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).replace(/[^0-9.-]/g, '').replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Construye subject + html para un correo de ACTIVIDADES,
 * usando solo la fila de `reservaciones`.
 *
 * NOTA: Para vista previa se usan URLs directas para logo/imagen
 *       (no CIDs), así se ve bien dentro del iframe HTML.
 */
function buildPreviewActividades(reservaRaw = {}) {
  const reserva = reservaRaw || {};
  const compra  = reserva; // para preview usamos la misma fila como "compra" y "reserva"

  // -------- Campos básicos --------
  const emailLine = compra?.correo_cliente
    ? `<p style="margin:2px 0;line-height:1.35;"><strong>e-mail:</strong> ${compra.correo_cliente}</p>`
    : '';

  const phoneLine = compra?.telefono_cliente
    ? `<p style="margin:2px 0;line-height:1.35;"><strong>Phone:</strong> ${compra.telefono_cliente}</p>`
    : '';

  const totalPago = moneyNum(firstNonNil(compra.total_pago, reserva.total_pago));
  const totalHTML = totalPago != null
    ? `<p style="margin:2px 0;line-height:1.35;"><strong>Total:</strong> $${totalPago}</p>`
    : '';

  // capacidad
  const capacidadVal = firstNonNil(
    reserva.capacidad, reserva.cpacidad,
    compra.capacidad, compra.cpacidad
  );
  const capacidadHTML = capacidadVal
    ? `<p style="margin:2px 0;line-height:1.35;"><strong>Capacity:</strong> ${capacidadVal}</p>`
    : '';

  // cantidad de paquetes + etiqueta
  const cantPaqueteNum = Number(firstNonNil(
    reserva.cantidad_paquete, compra.cantidad_paquete, compra.paquetes, compra.cantidad_paquetes
  ) || 0);
  const paqueteLabel = firstNonNil(
    compra.paquete, reserva.paquete, compra.etiqueta, reserva.etiqueta,
    (capacidadVal && firstNonNil(reserva.duracion, compra.duracion))
      ? `${capacidadVal} · ${firstNonNil(reserva.duracion, compra.duracion)}`
      : ''
  );
  const paquetesHTML = cantPaqueteNum
    ? `<p style="margin:2px 0;line-height:1.35;"><strong>Package purchased:</strong> ${cantPaqueteNum} package${cantPaqueteNum > 1 ? 's' : ''}${paqueteLabel ? ` (${paqueteLabel})` : ''}</p>`
    : (paqueteLabel
        ? `<p style="margin:2px 0;line-height:1.35;"><strong>Selected package:</strong> ${paqueteLabel}</p>`
        : '');

  // duración
  const duracionVal = firstNonNil(reserva.duracion, compra.duracion);
  const duracionHTML = duracionVal
    ? `<p style="margin:2px 0;line-height:1.35;"><strong>Duration:</strong> ${duracionVal}</p>`
    : '';

  // notas del cliente
  const notasVal = firstNonNil(reserva.notas, compra.notas, compra.nota, reserva.nota);
  const notaHTML = (notasVal && String(notasVal).trim() !== '')
    ? `<p style="margin:2px 0;line-height:1.35;"><strong>Customer note:</strong> ${notasVal}</p>`
    : '';

  // imagen del tour
  const imgUrlRaw = firstNonNil(
    compra.imagen, reserva.imagen,
    compra.imagenCorreo, reserva.imagenCorreo
  );
  const imgUrl = imgUrlRaw ? forceJpgIfWix(sanitizeUrl(imgUrlRaw)) : '';

  const htmlImagen = imgUrl
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;">
        <tr>
          <td>
            <img src="${imgUrl}" width="400" style="display:block;width:100%;height:auto;border-radius:8px;" alt="Tour image" />
          </td>
        </tr>
      </table>`
    : '';

  // proveedor (usamos campos de la misma fila)
  const provNombre = firstNonNil(
    reserva.proveedor_nombre,
    reserva.provider_name,
    '—'
  );
  const provEmail = firstNonNil(
    reserva.proveedor_email,
    reserva.proveedor_correo,
    '—'
  );
  const provPhone = firstNonNil(
    reserva.proveedor_telefono,
    reserva.proveedor_phone,
    '—'
  );
  const provAviso = firstNonNil(
    reserva.proveedor_aviso,
    'We recommend arriving on time on the day of the activity so that you can receive satisfactory service.'
  );

  const providerBlock = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;background:#f6f9ff;border-radius:8px;">
        <tr>
          <td width="6" style="background:#1b6ef3;border-radius:8px 0 0 8px;font-size:0;line-height:0;">&nbsp;</td>
          <td style="padding:10px 14px;">
            <p style="margin:0 0 2px 0;line-height:1.45;"><strong>Service Provider:</strong> ${provNombre}</p>
            <p style="margin:0 0 2px 0;line-height:1.45;"><strong>Email:</strong> ${
              provEmail !== '—'
                ? `<a href="mailto:${provEmail}">${provEmail}</a>`
                : '—'
            }</p>
            <p style="margin:0 0 6px 0;line-height:1.45;"><strong>Phone:</strong> ${provPhone}</p>
            <p style="margin:0;line-height:1.45;">&#9888; ${provAviso}</p>
          </td>
        </tr>
      </table>`;

  // Construimos el HTML completo (sin QR ni CIDs en preview)
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
                      <h2 style="color:green;margin:0;">✅ Reservation Confirmation</h2>
                    </td>
                    <td align="right" style="vertical-align:middle;">
                      <img src="${LOGO_URL}" class="logoimg" style="display:block;height:45px;width:auto;border:0;" alt="Logo" />
                    </td>
                  </tr>
                </table>

                <p class="section-title" style="margin:12px 0 6px;">Purchase Information</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr><td style="font-size:14px;color:#222;">
                    <p style="margin:2px 0;line-height:1.35;"><strong>Folio:</strong> ${_fmt(firstNonNil(compra.folio, reserva.folio))}</p>
                    <p style="margin:2px 0;line-height:1.35;"><strong>Name:</strong> ${_fmt(firstNonNil(compra.nombre_cliente, reserva.nombre_cliente))}</p>
                    ${emailLine}
                    ${phoneLine}
                    <p style="margin:2px 0;line-height:1.35;"><strong>Activitie:</strong> ${_fmt(firstNonNil(compra.nombre_tour, reserva.nombre_tour))}</p>
                    ${capacidadHTML}
                    ${
                      firstNonNil(compra.fecha_compra, reserva.fecha_compra)
                        ? `<p style="margin:2px 0;line-height:1.35;"><strong>Purchase Date:</strong> ${fmtDMY(firstNonNil(compra.fecha_compra, reserva.fecha_compra))}</p>`
                        : ``
                    }
                    ${paquetesHTML}
                    ${duracionHTML}
                    ${totalHTML}
                    ${notaHTML}
                  </td></tr>
                </table>
                ${htmlImagen}

                <div class="divider" style="margin:12px 0;"></div>

                <p class="section-title" style="margin:12px 0 6px;">Reservation Information</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr><td style="font-size:14px;color:#222;">
                    <p style="margin:2px 0;line-height:1.35;"><strong>Reservation Folio:</strong> ${_fmt(reserva.folio_reservacion)}</p>
                    ${
                      reserva?.fecha_reservacion
                        ? `<p style="margin:2px 0;line-height:1.35;"><strong>Date:</strong> ${fmtDMY(reserva.fecha_reservacion)}</p>`
                        : ``
                    }
                    ${
                      reserva?.hora_reservacion
                        ? `<p style="margin:2px 0;line-height:1.35;"><strong>Hour:</strong> ${reserva.hora_reservacion}</p>`
                        : ``
                    }
                  </td></tr>
                </table>

                ${providerBlock}

                <p style="font-size:12px;color:#666;margin-top:12px;">This is an automated message. Please do not reply to this address.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  const subject = `Reservation Confirmation – ${
    _fmt(firstNonNil(compra.nombre_tour, reserva.nombre_tour))
  } – ${
    _fmt(reserva.folio_reservacion)
  }`;

  return { subject, html };
}

// ===== Handler principal =====

export async function previewCorreoReservacion(req, res) {
  try {
    const folio =
      (req.query && req.query.folio) ||
      (req.body && req.body.folio);

    if (!folio) {
      return res.status(400).json({
        ok: false,
        error: 'Falta parámetro: folio',
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

    const reserva = rows[0];
    const tipoServicio = (reserva.tipo_servicio || '').toLowerCase();

    let subject = null;
    let html    = null;

    // Por ahora solo construimos vista previa "bonita" para Actividades.
    // (Luego podemos ir agregando transporte, tours combo, etc.)
    if (
      tipoServicio === 'actividad'   ||
      tipoServicio === 'actividades' ||
      tipoServicio === 'tour'        ||
      tipoServicio === 'tours'
    ) {
      const built = buildPreviewActividades(reserva);
      subject = built.subject;
      html    = built.html;
    }

    return res.json({
      ok: true,
      folio,
      tipo_servicio: reserva.tipo_servicio || null,
      idioma: reserva.idioma || null,
      reserva,
      subject,
      html,
    });
  } catch (err) {
    console.error('❌ previewCorreoReservacion:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error al obtener datos para vista previa del correo',
    });
  }
}
