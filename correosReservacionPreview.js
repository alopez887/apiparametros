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
 *   subject: "Confirmación de compra - Folio ...",
 *   html: "<table>...</table>"
 * }
 */

// ===== i18n (copiado de enviarCorreo.js) ====
const STR = {
  en: {
    hero: '✅ Thank you for your purchase!',
    folio: 'Folio',
    name: 'Name',
    email: 'e-mail',
    phone: 'Phone',
    activity: 'Activity',
    adults: 'Adults',
    children: 'Children',
    time: 'Time',
    packagePurchased: 'Package purchased',
    selectedPackage: 'Selected package',
    quantity: 'Quantity',
    pricePerPackage: 'Price per package',
    customerNote: 'Notes',
    total: 'Total',
    selectionTitle: 'Your selection',
    selectionHint: 'The following activities were selected:',
    providerBlockP1: (provName = 'our partner') =>
      `The <strong>${provName}</strong> representative has been copied on this email and will coordinate scheduling—at the <strong>date</strong> and <strong>time</strong> of your choice—of the activity you purchased through our website. Should you have any questions, please contact us via the <strong>WhatsApp</strong> channel listed on our website.`,
    provider: 'Service Provider',
    recommendationsTitle: '⚠ Recommendations:',
    recommendationsBody:
      ' It is very important that you communicate at least 24 hours before taking the tour to confirm your reservation and avoid inconveniences...',
    sentTo: 'This confirmation was sent to',
    subject: (folio) => `Purchase Confirmation - Folio ${folio}`
  },
  es: {
    hero: '✅ ¡Gracias por tu compra!',
    folio: 'Folio',
    name: 'Nombre',
    email: 'Correo',
    phone: 'Teléfono',
    activity: 'Actividad',
    adults: 'Adultos',
    children: 'Niños',
    time: 'Tiempo',
    packagePurchased: 'Paquetes comprados',
    selectedPackage: 'Paquete seleccionado',
    quantity: 'Cantidad',
    pricePerPackage: 'Precio por paquete',
    customerNote: 'Notas',
    total: 'Total',
    selectionTitle: 'Tu selección',
    selectionHint: 'Se eligieron las siguientes actividades:',
    providerBlockP1: (provName = 'nuestro proveedor') =>
      `En este correo está copiado el representante de <strong>${provName}</strong> que se encargará de coordinar y programar la <strong>fecha</strong> y <strong>hora</strong> de tu preferencia para llevar a cabo la actividad que adquiriste en nuestro sitio web. Si tienes alguna duda o pregunta, por favor contáctanos por el canal de <strong>WhatsApp</strong> publicado en nuestro sitio web.`,
    provider: 'Proveedor del servicio',
    recommendationsTitle: '⚠ Recomendaciones:',
    recommendationsBody:
      ' Es muy importante que te comuniques al menos 24 horas antes de tomar el tour para confirmar tu reservación y evitar contratiempos...',
    sentTo: 'Esta confirmación fue enviada a',
    subject: (folio) => `Confirmación de compra - Folio ${folio}`
  }
};

function pickLang(datos = {}) {
  const raw = String(datos.idioma || datos.lang || datos.language || '').trim().toLowerCase();
  if (raw.startsWith('es')) return 'es';
  if (raw.startsWith('en')) return 'en';
  return 'es'; // fallback
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

  const lis = items
    .map(v => (typeof v === 'string' ? v : (v?.nombre || v?.titulo || v?.name || v?.codigo || '')))
    .map(txt => String(txt || '').trim())
    .filter(Boolean)
    .map(txt => `<li>${txt}</li>`)
    .join('');

  return `
    <div style="margin-top:10px; background:#f6f9ff; border-left:6px solid #1b6ef3; padding:10px 14px; border-radius:6px;">
      <p style="margin:0 0 6px 0; font-weight:700;">${T.selectionTitle}</p>
      <p style="margin:0 0 6px 0; line-height:1.3;">${T.selectionHint}</p>
      <ul style="margin:0; padding-left:18px;">${lis}</ul>
    </div>
  `.trim();
}

const LOGO_URL = 'https://static.wixstatic.com/media/f81ced_636e76aeb741411b87c4fa8aa9219410~mv2.png';

/**
 * 🔹 Enriquecer reserva con datos del proveedor desde tabla actividades_proveedor
 *
 *  - Usamos reservaciones.proveedor / proveedor_nombre
 *  - Lo buscamos en actividades_proveedor.nombre (case-insensitive, trim, ILIKE)
 *  - Tomamos actividades_proveedor.email_contacto y telefono_contacto
 *  - SIN romper nada si no encuentra / hay error
 */
async function enriquecerReservaConProveedor(reserva) {
  if (!reserva) return reserva;

  const nombreProv = reserva.proveedor || reserva.proveedor_nombre || null;
  if (!nombreProv) return reserva;

  try {
    console.log('[PREVIEW] Buscando proveedor para folio', reserva.folio, '→', nombreProv);

    const sqlProv = `
      SELECT
        nombre,
        email_contacto,
        telefono_contacto
      FROM actividades_proveedor
      WHERE TRIM(LOWER(nombre)) = TRIM(LOWER($1))
         OR nombre ILIKE $2
      LIMIT 1
    `;
    const paramExact = nombreProv;
    const paramLike  = `%${nombreProv}%`;

    const { rows } = await pool.query(sqlProv, [paramExact, paramLike]);

    if (!rows.length) {
      console.warn('[PREVIEW] No se encontró proveedor en actividades_proveedor para:', nombreProv);
      return reserva;
    }

    const prov = rows[0];
    console.log('[PREVIEW] Proveedor encontrado:', prov);

    const enriquecida = {
      ...reserva,
      proveedor_nombre:   reserva.proveedor_nombre   || prov.nombre || reserva.proveedor,
      proveedor_email:    reserva.proveedor_email    || prov.email_contacto,
      proveedor_telefono: reserva.proveedor_telefono || prov.telefono_contacto,
    };

    console.log('[PREVIEW] Reserva enriquecida proveedor:', {
      folio: enriquecida.folio,
      proveedor_nombre:   enriquecida.proveedor_nombre,
      proveedor_email:    enriquecida.proveedor_email,
      proveedor_telefono: enriquecida.proveedor_telefono,
    });

    return enriquecida;
  } catch (err) {
    console.error('⚠ Error buscando proveedor en actividades_proveedor para preview:', err.message);
    return reserva;
  }
}

// ===== Construcción de subject + HTML para ACTIVIDADES (basado en enviarCorreo.js) =====
function buildPreviewActividadesFromReserva(reserva = {}) {
  // Mapear fila de reservaciones → estructura "datos" del correo
  const datos = {
    idioma:           reserva.idioma,
    folio:            reserva.folio,
    nombre_cliente:   reserva.nombre_cliente,
    correo_cliente:   reserva.correo_cliente,
    telefono_cliente: reserva.telefono_cliente || reserva.telefono || null,

    nombre_tour:      reserva.nombre_tour || reserva.actividad || reserva.tour || '',
    imagen:           reserva.imagen || reserva.imagenCorreo || '',

    // PAX / cantidades
    tipo_precio:      reserva.tipo_precio,
    capacidad:        reserva.capacidad || reserva.cpacidad,
    cantidad_paquete: reserva.cantidad_paquete,
    cantidad_adulto:  reserva.cantidad_adulto,
    cantidad_nino:    reserva.cantidad_nino,
    precio_adulto:    reserva.precio_adulto,
    precio_nino:      reserva.precio_nino,
    duracion:         reserva.duracion,

    // Notas
    nota:             reserva.nota || reserva.notas,

    // Totales
    total_pago:       reserva.total_pago,
    moneda:           reserva.moneda || 'USD',

    // Combo
    actividades:       reserva.actividades,
    combo_actividades: reserva.combo_actividades,

    // Proveedor (ya “enriquecido” si la función anterior llenó algo)
    proveedor_nombre:   reserva.proveedor_nombre || reserva.proveedor,
    proveedor_email:    reserva.proveedor_email,
    proveedor_telefono: reserva.proveedor_telefono
  };

  const LANG = pickLang(datos);
  const T    = STR[LANG] || STR.es;

  const imgTourUrl0 = sanitizeUrl(datos.imagen);
  const imgTourUrl  = imgTourUrl0 ? forceJpgIfWix(imgTourUrl0) : '';

  // ====== Detectar PAX ======
  const paqueteLabel = (datos.paquete || datos.capacidad || '').toString().trim();
  const cantPaquete  = Number(datos.cantidad_paquete || 0);
  const tipoPrecio   = (datos.tipo_precio || '').toString().toLowerCase();
  const isAdults     = Number(datos.cantidad_adulto) > 0;
  const isKids       = Number(datos.cantidad_nino)   > 0;

  const isPAX = (
    tipoPrecio === 'pax' ||
    (!!paqueteLabel && !isAdults && !isKids) ||
    cantPaquete > 0
  );

  const pricePerPkg  = Number(datos.precio_adulto || 0);

  // ====== Líneas de detalle ======
  const precioAdultoHTML =
    isPAX ? '' :
    (isAdults
      ? `<p style="margin:2px 0;"><strong>${T.adults}:</strong> ${datos.cantidad_adulto} × $${money(datos.precio_adulto)} ${datos.moneda} ${datos.edad_adulto ? `(${datos.edad_adulto})` : ''}</p>`
      : '');

  const precioNinoHTML =
    isPAX ? '' :
    (isKids
      ? `<p style="margin:2px 0;"><strong>${T.children}:</strong> ${datos.cantidad_nino} × $${money(datos.precio_nino)} ${datos.moneda} ${datos.edad_nino ? `(${datos.edad_nino})` : ''}</p>`
      : '');

  const duracionHTML =
    isPAX ? '' :
    (datos.duracion ? `<p style="margin:2px 0;"><strong>${T.time}:</strong> ${datos.duracion}</p>` : '');

  const qtyText = cantPaquete
    ? `${cantPaquete} ${LANG === 'es' ? `paquete${cantPaquete>1?'s':''}` : `package${cantPaquete>1?'s':''}`}`
    : '';

  const pkgPurchasedLine =
    isPAX && paqueteLabel && qtyText
      ? `<p style="margin:2px 0;"><strong>${T.packagePurchased}:</strong> ${qtyText} (${paqueteLabel})</p>`
      : (isPAX && paqueteLabel
          ? `<p style="margin:2px 0;"><strong>${T.selectedPackage}:</strong> ${paqueteLabel}</p>`
          : (isPAX && qtyText
              ? `<p style="margin:2px 0;"><strong>${T.quantity}:</strong> ${qtyText}</p>`
              : ''));

  const pricePerPkgLine = (isPAX && pricePerPkg)
    ? `<p style="margin:2px 0;"><strong>${T.pricePerPackage}:</strong> $${money(pricePerPkg)} ${datos.moneda}</p>`
    : '';

  const paxBlockHTML = isPAX ? `${pkgPurchasedLine}${pricePerPkgLine}` : '';

  const activityLine = isPAX && paqueteLabel
    ? `${datos.nombre_tour} — ${paqueteLabel}`
    : `${datos.nombre_tour || ''}`;

  const comboSelectionHTML = buildComboSelectionHTML(datos, T);

  const provName = (datos.proveedor_nombre || '').toString().trim() || (LANG === 'es' ? 'nuestro proveedor' : 'our partner');
  const bloqueProveedorHTML = `
    <div style="background:#f6f9ff;border-left:6px solid #1b6ef3;padding:10px 15px;margin-top:14px;border-radius:6px;">
      <p style="margin:0; line-height:1.28; text-align:justify;">
        ${T.providerBlockP1(provName)}
      </p>
      <div style="margin-top:10px; line-height:1.22;">
        <p style="margin:0 0 2px 0;"><strong>${T.provider}:</strong> ${datos.proveedor_nombre || '-'}</p>
        <p style="margin:0 0 2px 0;"><strong>Email:</strong> ${datos.proveedor_email || '-'}</p>
        <p style="margin:0;"><strong>${T.phone}:</strong> ${datos.proveedor_telefono || '-'}</p>
      </div>
    </div>
  `.trim();

  const mensajeInner = `
      <table style="width:100%;margin-bottom:10px;border-collapse:collapse;">
        <tr>
          <td style="text-align:left;"><h2 style="color:green;margin:0;">${T.hero}</h2></td>
          <td style="text-align:right;"><img src="${LOGO_URL}" alt="Logo" style="height:45px;display:block;" /></td>
        </tr>
      </table>

      <div style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;line-height:1.4;">
        <p style="margin:2px 0;"><strong>${T.folio}:</strong> ${datos.folio || ''}</p>
        <p style="margin:2px 0;"><strong>${T.name}:</strong> ${datos.nombre_cliente || ''}</p>
        <p style="margin:2px 0;"><strong>${T.email}:</strong> ${datos.correo_cliente || ''}</p>
        <p style="margin:2px 0;"><strong>${T.phone}:</strong> ${datos.telefono_cliente || '-'}</p>

        <p style="margin:2px 0;"><strong>${T.activity}:</strong> ${activityLine}</p>

        ${isPAX ? paxBlockHTML : `${precioAdultoHTML}${precioNinoHTML}${duracionHTML}`}

        ${comboSelectionHTML}

        <p style="margin:2px 0;"><strong>${T.total}:</strong> $${money(datos.total_pago)} ${datos.moneda || ''}</p>
        ${datos.nota && String(datos.nota).trim() !== '' ? `<p style="margin:2px 0;"><strong>${T.customerNote}:</strong> ${datos.nota}</p>` : ''}

        ${imgTourUrl ? `
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;">
            <tr><td>
              <img src="${imgTourUrl}" width="400" alt="Tour image"
                   style="display:block;width:100%;height:auto;max-width:100%;border-radius:8px;" />
            </td></tr>
          </table>
        ` : ``}
      </div>

      ${bloqueProveedorHTML}

      <div style="background-color:#fff3cd;border-left:6px solid #ffa500;padding:8px 12px;margin-top:14px;border-radius:5px;line-height:1.3%;">
        <strong style="color:#b00000;">${T.recommendationsTitle}</strong>
        <span style="color:#333;">${T.recommendationsBody}</span>
      </div>

      <p style="margin-top:14px;font-size:14px;color:#555;line-height:1.3;">
        &#128231; ${T.sentTo}: <a href="mailto:${datos.correo_cliente || ''}" style="color:#1b6ef3;text-decoration:none;">${datos.correo_cliente || ''}</a>
      </p>
  `.trim();

  const html = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center" style="padding:0;margin:0;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0"
                 style="width:600px;max-width:600px;border:2px solid #ccc;border-radius:10px;">
            <tr><td style="padding:24px 26px 32px;border-radius:10px;">
              ${mensajeInner}
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
  `.trim();

  const subject = (STR[LANG] || STR.es).subject(datos.folio || '');

  return { subject, html };
}

// ===== Handler principal =====

export async function previewCorreoReservacion(req, res) {
  try {
    const folio =
      (req.query && req.query.folio) ||
      (req.body  && req.body.folio);

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

    let reserva = rows[0];

    // 🔹 Enriquecemos la reserva con datos del proveedor (tabla actividades_proveedor)
    reserva = await enriquecerReservaConProveedor(reserva);

    console.log('[PREVIEW] Reserva final usada para build:', {
      folio: reserva.folio,
      proveedor: reserva.proveedor,
      proveedor_nombre: reserva.proveedor_nombre,
      proveedor_email: reserva.proveedor_email,
      proveedor_telefono: reserva.proveedor_telefono,
    });

    const tipoServicio = (reserva.tipo_servicio || '').toLowerCase();

    let subject = null;
    let html    = null;

    // Por ahora, preview "bonita" solo para Actividades / Tours.
    if (
      tipoServicio === 'actividad'   ||
      tipoServicio === 'actividades' ||
      tipoServicio === 'tour'        ||
      tipoServicio === 'tours'
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
