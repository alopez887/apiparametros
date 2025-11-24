// correosReservacionPreview.js
import pool from './conexion.js';


const isBlank = (v) => !String(v ?? '').trim();

/**
 * Normaliza idioma a 'es' | 'en' (por defecto 'es').
 */
function normalizarIdioma(idiomaCrudo) {
  const lang = String(idiomaCrudo || '').toLowerCase();
  if (lang.startsWith('en')) return 'en';
  return 'es';
}

/**
 * Convierte una URL de imagen de Wix a una HTTPS pública usable en correos.
 * Si ya es https normal, la deja igual.
 */
function sanitizeUrl(url) {
  try {
    if (!url) return '';
    let s = String(url).trim();
    if (!s) return '';
    if (s.startsWith('//')) s = 'https:' + s;
    if (s.startsWith('http://')) s = s.replace(/^http:\/\//i, 'https://');
    return s;
  } catch {}
  return url;
}

const money = (v) => Number(v || 0).toFixed(2);

// ===== Bloque “Tu selección / Your selection” para COMBO =====
function buildComboSelectionHTML(datos, T) {
  if (!datos || String(datos.tipo_precio || '').toLowerCase() !== 'combo') return '';
  // Preferir arreglo `actividades`; si no, partir `combo_actividades`
  let items = Array.isArray(datos.actividades) ? datos.actividades.slice() : [];
  if (!items.length && typeof datos.combo_actividades === 'string') {
    items = datos.combo_actividades.split(',').map(s => s.trim()).filter(Boolean);
  }

  if (!items.length) return '';

  const li = items.map(act => `<li>${act}</li>`).join('');

  return `
    <tr>
      <td colspan="2" style="padding: 16px 24px 0 24px;">
        <h2 style="margin:0 0 8px 0;font-size:18px;font-weight:600;color:#111827;font-family:Arial,Helvetica,sans-serif;">
          ${T('tu_seleccion')}
        </h2>
        <ul style="margin:4px 0 0 18px;padding:0;font-size:14px;line-height:1.5;color:#111827;font-family:Arial,Helvetica,sans-serif;">
          ${li}
        </ul>
      </td>
    </tr>
  `;
}

// ===== Bloque de “políticas / importarte” =====

const IMPORTANTE_EN = [
  ' It is very important that you communicate at least 24 hours before the tour to confirm your reservation and avoid inconveniences...',
  ' For shared transportation services, pick-up times may vary by 10 to 15 minutes due to traffic or operational reasons...',
  ' We recommend being ready 10 minutes before the scheduled pick-up time at the hotel lobby or the designated meeting point.',
];

const IMPORTANTE_ES = [
  ' Es muy importante que te comuniques al menos 24 horas antes del tour para confirmar tu reservación y evitar contratiempos...',
  ' Para servicios de transporte compartido, el horario de recogida puede variar de 10 a 15 minutos por tráfico o razones operativas...',
  ' Te recomendamos estar listo 10 minutos antes de la hora programada en el lobby del hotel o punto de encuentro indicado.',
];

function buildImportanteHTML(T, idioma) {
  const items = idioma === 'en' ? IMPORTANTE_EN : IMPORTANTE_ES;
  if (!items || !items.length) return '';
  const li = items.map(t => `<li>${t}</li>`).join('');
  return `
    <tr>
      <td colspan="2" style="padding: 16px 24px 24px 24px;">
        <h2 style="margin:0 0 8px 0;font-size:18px;font-weight:600;color:#111827;font-family:Arial,Helvetica,sans-serif;">
          ${T('importante')}
        </h2>
        <ul style="margin:4px 0 0 18px;padding:0;font-size:14px;line-height:1.5;color:#111827;font-family:Arial,Helvetica,sans-serif;">
          ${li}
        </ul>
      </td>
    </tr>
  `;
}

// ===== i18n súper simple para este correo de ACTIVIDADES =====

function getTranslations(idioma) {
  const lang = normalizarIdioma(idioma);
  if (lang === 'en') {
    return {
      lang: 'en',
      t: (key) => {
        const map = {
          titulo: 'Your Activity Reservation',
          intro: 'Thank you for choosing Cabo Travel & Activities. Below is the summary of your reservation.',
          datos_reserva: 'Reservation Details',
          nombre_cliente: 'Client name',
          email_cliente: 'Client email',
          telefono_cliente: 'Client phone',
          fecha_servicio: 'Service date',
          hotel: 'Hotel',
          num_personas: 'Number of people',
          tipo_servicio: 'Service type',
          folio: 'Reservation ID (folio)',
          proveedor: 'Provider',
          precio: 'Price',
          precio_regular: 'Regular price',
          ahorro: 'You save',
          moneda: 'Currency',
          tu_seleccion: 'Your selection',
          importante: 'Important information',
          // ...
        };
        return map[key] || key;
      },
    };
  }

  // Español por defecto
  return {
    lang: 'es',
    t: (key) => {
      const map = {
        titulo: 'Tu reservación de actividad',
        intro: 'Gracias por elegir Cabo Travel & Activities. A continuación encontrarás el resumen de tu reservación.',
        datos_reserva: 'Datos de la reservación',
        nombre_cliente: 'Nombre del cliente',
        email_cliente: 'Correo electrónico',
        telefono_cliente: 'Teléfono',
        fecha_servicio: 'Fecha del servicio',
        hotel: 'Hotel',
        num_personas: 'Número de personas',
        tipo_servicio: 'Tipo de servicio',
        folio: 'Folio de reservación',
        proveedor: 'Proveedor',
        precio: 'Precio',
        precio_regular: 'Precio regular',
        ahorro: 'Tu ahorro',
        moneda: 'Moneda',
        tu_seleccion: 'Tu selección',
        importante: 'Información importante',
        // ...
      };
      return map[key] || key;
    },
  };
}

// ============================================================================
// Builder principal SOLO para ACTIVIDADES
// ============================================================================

/**
 * Enriquecer reserva con datos del proveedor (si existe).
 * Lo separamos para reuso en preview + envío.
 */
export async function enriquecerReservaConProveedor(reserva) {
  if (!reserva || !reserva.proveedor_codigo) return reserva;
  try {
    const { rows } = await pool.query(
      `
      SELECT
        codigo,
        nombre       AS proveedor_nombre,
        email        AS proveedor_email,
        telefono     AS proveedor_telefono
      FROM proveedores
      WHERE codigo = $1
      LIMIT 1
      `,
      [reserva.proveedor_codigo]
    );
    if (rows && rows.length > 0) {
      const prov = rows[0];
      return {
        ...reserva,
        proveedor_nombre: prov.proveedor_nombre,
        proveedor_email: prov.proveedor_email,
        proveedor_telefono: prov.proveedor_telefono,
      };
    }
  } catch (err) {
    console.warn('⚠️ No se pudo enriquecer reserva con proveedor:', err?.message);
  }
  return reserva;
}

/**
 * Construye el subject + html del correo para ACTIVIDADES,
 * usando los campos de la tabla `reservaciones`.
 */
export function buildPreviewActividadesFromReserva(reserva) {
  if (!reserva) {
    return { subject: null, html: null };
  }

  const idioma = normalizarIdioma(reserva.idioma);
  const { t: T } = getTranslations(idioma);

  // Datos principales
  const datos = {
    folio:           reserva.folio,
    nombre_cliente:  reserva.nombre_cliente || '',
    correo_cliente:  reserva.correo_cliente || '',
    telefono_cliente: reserva.telefono_cliente || '',
    fecha_servicio:  reserva.fecha_servicio || reserva.fecha || '',
    hotel:           reserva.hotel || '',
    num_personas:    reserva.num_personas || reserva.cantidad_personas || 1,
    tipo_servicio:   reserva.tipo_servicio || '',
    nombre_tour:     reserva.nombre_tour || reserva.actividad || reserva.tour || '',
    proveedor_nombre: reserva.proveedor_nombre || '',
    precio:          reserva.precio || reserva.precio_adulto || 0,
    precio_regular:  reserva.precio_regular || reserva.precio_normal || 0,
    ahorro_calc:     0,
    moneda:          reserva.moneda || 'USD',
    tipo_precio:     (reserva.tipo_precio || '').toLowerCase(),
    // Campos especiales para COMBO/PAX
    actividades:       reserva.actividades || null,
    combo_actividades: reserva.combo_actividades || '',
    imagen:            reserva.imagen || reserva.img_tour || '',
  };

  const p   = Number(datos.precio || 0);
  const pr  = Number(datos.precio_regular || 0);
  const ah  = pr > p ? (pr - p) : 0;
  datos.ahorro_calc = ah;

  const imgTourUrl0 = sanitizeUrl(datos.imagen);
  const imgTourUrl  = imgTourUrl0 ? forceJpgIfWix(imgTourUrl0) : '';

  const paqueteLabel = datos.tipo_precio === 'combo'
    ? (idioma === 'en' ? 'Combo Package' : 'Paquete combo')
    : (idioma === 'en' ? 'Activity' : 'Actividad');

  const subject = idioma === 'en'
    ? `Your reservation - ${datos.nombre_tour || 'Activity'} (Folio ${datos.folio})`
    : `Tu reservación - ${datos.nombre_tour || 'Actividad'} (Folio ${datos.folio})`;

  const tituloPrincipal = idioma === 'en'
    ? 'Thanks for your reservation!'
    : '¡Gracias por tu reservación!';

  const nombreActividadLine = datos.nombre_tour
    ? `${datos.nombre_tour} — ${paqueteLabel}`
    : `${datos.nombre_tour || ''}`;

  // HTML principal (igual que lo traías, solo reorganizado)
  const html = `
<!DOCTYPE html>
<html lang="${idioma}">
<head>
  <meta charset="UTF-8" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#f3f4f6">
    <tr>
      <td align="center" style="padding:24px 8px;">
        <table width="600" border="0" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:10px;border:1px solid #d1d5db;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
          <!-- Encabezado -->
          <tr>
            <td colspan="2" style="padding:16px 24px;border-bottom:1px solid #e5e7eb;background:linear-gradient(90deg,#111827,#1f2937);color:#f9fafb;">
              <h1 style="margin:0;font-size:20px;font-weight:600;">${tituloPrincipal}</h1>
              <p style="margin:4px 0 0 0;font-size:13px;opacity:0.9;">${T('intro')}</p>
            </td>
          </tr>

          <!-- Bloque principal de la actividad -->
          <tr>
            <td style="padding:16px 24px;vertical-align:top;">
              <h2 style="margin:0 0 8px 0;font-size:18px;font-weight:600;color:#111827;">
                ${nombreActividadLine}
              </h2>

              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size:14px;color:#111827;">
                <tr>
                  <td style="padding:4px 0;font-weight:bold;width:130px;">${T('nombre_cliente')}</td>
                  <td style="padding:4px 0;">${datos.nombre_cliente}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-weight:bold;">${T('email_cliente')}</td>
                  <td style="padding:4px 0;">${datos.correo_cliente}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-weight:bold;">${T('telefono_cliente')}</td>
                  <td style="padding:4px 0;">${datos.telefono_cliente}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-weight:bold;">${T('fecha_servicio')}</td>
                  <td style="padding:4px 0;">${datos.fecha_servicio}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-weight:bold;">${T('hotel')}</td>
                  <td style="padding:4px 0;">${datos.hotel}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-weight:bold;">${T('num_personas')}</td>
                  <td style="padding:4px 0;">${datos.num_personas}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-weight:bold;">${T('tipo_servicio')}</td>
                  <td style="padding:4px 0;">${datos.tipo_servicio}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-weight:bold;">${T('folio')}</td>
                  <td style="padding:4px 0;">${datos.folio}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-weight:bold;">${T('proveedor')}</td>
                  <td style="padding:4px 0;">${datos.proveedor_nombre || '-'}</td>
                </tr>
              </table>
            </td>

            <!-- Imagen del tour -->
            <td style="padding:16px 24px;vertical-align:top;width:220px;">
              ${imgTourUrl ? `
                <img src="${imgTourUrl}" width="400" alt="Tour image"
                  style="display:block;width:100%;max-width:240px;border-radius:8px;border:1px solid #e5e7eb;">
              ` : ''}
            </td>
          </tr>

          <!-- Bloque de precios -->
          <tr>
            <td colspan="2" style="padding:8px 24px 16px 24px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size:14px;color:#111827;">
                <tr>
                  <td style="padding:4px 0;font-weight:bold;width:130px;">${T('precio')}</td>
                  <td style="padding:4px 0;">${datos.moneda} $${money(datos.precio)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-weight:bold;">${T('precio_regular')}</td>
                  <td style="padding:4px 0;">${datos.moneda} $${money(datos.precio_regular)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-weight:bold;">${T('ahorro')}</td>
                  <td style="padding:4px 0;">${datos.moneda} $${money(datos.ahorro_calc)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-weight:bold;">${T('moneda')}</td>
                  <td style="padding:4px 0;">${datos.moneda}</td>
                </tr>
              </table>
            </td>
          </tr>

          ${buildComboSelectionHTML(datos, T)}
          ${buildImportanteHTML(T, idioma)}

          <!-- Footer -->
          <tr>
            <td colspan="2" style="padding:16px 24px 20px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
              <p style="margin:0 0 4px 0;">
                Cabo Travel & Activities
              </p>
              <p style="margin:0;">This email was generated automatically, please do not reply directly.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return { subject, html };
}

// Forzar .jpg para imágenes de Wix
function forceJpgIfWix(url='') {
  try {
    const u = new URL(url);
    if (/wixstatic\.com$/i.test(u.hostname)) {
      if (!u.searchParams.has('format')) u.searchParams.set('format','jpg');
      if (!u.searchParams.has('width'))  u.searchParams.set('width','1200');
    }
    return u.toString();
  } catch {
    return url;
  }
}

// ============================================================================
// Handler HTTP: previewCorreoReservacion
// ============================================================================

export async function previewCorreoReservacion(req, res) {
  try {
    const folio =
      req.method === 'GET'
        ? (req.query.folio || req.query.id || '').trim()
        : (req.body.folio || '').trim();

    if (!folio) {
      return res.status(400).json({
        ok: false,
        error: 'Falta parámetro folio',
      });
    }

    const { rows } = await pool.query(
      `
      SELECT
        *
      FROM reservaciones
      WHERE folio = $1
      LIMIT 1
      `,
      [folio]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'No se encontró reservación con ese folio',
      });
    }

    let reserva = rows[0];

    // Enriquecer con datos del proveedor
    reserva = await enriquecerReservaConProveedor(reserva);

    const tipoServicio = (reserva.tipo_servicio || '').toLowerCase();

    let subject = null;
    let html    = null;

    // Por ahora, preview "bonita" solo para Actividades.
    if (
      tipoServicio === 'actividad'   ||
      tipoServicio === 'actividades'
    ) {
      const built = buildPreviewActividadesFromReserva(reserva);
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
