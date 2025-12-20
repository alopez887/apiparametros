// correoActividadesPreview.js
// PREVIEW para ACTIVIDADES usando el MISMO layout que enviarCorreo.js
// (¡Gracias por tu compra! / Thanks for your purchase!)

/* ===== i18n copiado de enviarCorreo.js (solo textos) ===== */
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

function pickLang(reserva = {}) {
  const raw = String(reserva.idioma || reserva.lang || reserva.language || '').trim().toLowerCase();
  if (raw.startsWith('es')) return 'es';
  if (raw.startsWith('en')) return 'en';
  return 'es';
}

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
const money = (v) => Number(v || 0).toFixed(2);

// === Bloque “Tu selección / Your selection” para COMBO (igual que enviarCorreo.js) ===
function buildComboSelectionHTML(datos, T) {
  if (!datos || String(datos.tipo_precio || '').toLowerCase() !== 'combo') return '';
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

/**
 * Builder de PREVIEW para ACTIVIDADES.
 * Toma la fila `reserva` de la tabla `reservaciones` y arma el MISMO layout
 * que enviarCorreo.js (hero verde, contenedor 600px, borde 2px, etc.).
 */
export function buildPreviewActividadesFromReserva(reserva) {
  if (!reserva) {
    return { subject: null, html: null };
  }

  const LANG = pickLang(reserva);
  const T    = STR[LANG] || STR.es;

  // ========= Mapear `reserva` a un objeto `datos` parecido al enviarCorreo.js =========
  const datos = {
    folio:            reserva.folio,
    idioma:           reserva.idioma,
    nombre_cliente:   reserva.nombre_cliente || '',
    correo_cliente:   reserva.correo_cliente || '',
    telefono_cliente: reserva.telefono_cliente || '',
    nombre_tour:      reserva.nombre_tour || reserva.actividad || reserva.tour || '',
    // PAX / combo
    tipo_precio:        (reserva.tipo_precio || '').toLowerCase(),
    actividades:        reserva.actividades || null,
    combo_actividades:  reserva.combo_actividades || '',
    paquete:            reserva.paquete || reserva.capacidad || '',
    cantidad_paquete:   reserva.cantidad_paquete || reserva.cantidad_pax || 0,
    // precios adultos/niños
    cantidad_adulto:    reserva.cantidad_adulto || reserva.num_adultos || 0,
    cantidad_nino:      reserva.cantidad_nino   || reserva.num_ninos  || 0,
    precio_adulto:      reserva.precio_adulto   || 0,
    precio_nino:        reserva.precio_nino     || 0,
    duracion:           reserva.duracion || '',
    // totales
    total_pago:       reserva.total_pago || reserva.total || reserva.precio || 0,
    moneda:           reserva.moneda || 'USD',
    nota:             reserva.nota || reserva.comentarios || '',
    // proveedor enriquecido
    proveedor_nombre:   reserva.proveedor_nombre || '',
    proveedor_email:    reserva.proveedor_email || '',
    proveedor_telefono: reserva.proveedor_telefono || '',
    // imagen
    imagen:           reserva.imagen || reserva.img_tour || '',
  };

  const imgTourUrl0 = sanitizeUrl(datos.imagen);
  const imgTourUrl  = imgTourUrl0 ? forceJpgIfWix(imgTourUrl0) : '';
  const logoUrl     = 'https://static.wixstatic.com/media/f81ced_636e76aeb741411b87c4fa8aa9219410~mv2.png';

  // ====== Detectar PAX (misma lógica que enviarCorreo.js) ======
  const paqueteLabel = (datos.paquete || '').toString().trim();
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

  const precioAdultoHTML =
    isPAX ? '' :
    (isAdults
      ? `<p style="margin:2px 0;"><strong>${T.adults}:</strong> ${datos.cantidad_adulto} × $${money(datos.precio_adulto)} ${datos.moneda}</p>`
      : '');
  const precioNinoHTML =
    isPAX ? '' :
    (isKids
      ? `<p style="margin:2px 0;"><strong>${T.children}:</strong> ${datos.cantidad_nino} × $${money(datos.precio_nino)} ${datos.moneda}</p>`
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
              : '')
        );
  const pricePerPkgLine = (isPAX && pricePerPkg)
    ? `<p style="margin:2px 0;"><strong>${T.pricePerPackage}:</strong> $${money(pricePerPkg)} ${datos.moneda}</p>`
    : '';

  const paxBlockHTML = isPAX ? `${pkgPurchasedLine}${pricePerPkgLine}` : '';

  const activityLine = isPAX && paqueteLabel
    ? `${datos.nombre_tour} — ${paqueteLabel}`
    : `${datos.nombre_tour}`;

  const comboSelectionHTML = buildComboSelectionHTML(datos, T);

  const provName = (datos.proveedor_nombre || '').toString().trim()
    || (LANG === 'es' ? 'nuestro proveedor' : 'our partner');

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

  // ✅ NUEVO: firma oculta CTS para que el scanner de rebotes lo detecte también en reenvíos
  const firmaCTS = `
    <div style="display:none!important;opacity:0;color:transparent;height:0;max-height:0;overflow:hidden;">
      CTS_MAIL=1|FOLIO=${String(datos.folio || '').trim()}|TO=${String(datos.correo_cliente || '').trim().toLowerCase()}
    </div>
  `.trim();

  // ====== Inner ======
  const mensajeInner = `
    <table style="width:100%;margin-bottom:10px;border-collapse:collapse;">
      <tr>
        <td style="text-align:left;"><h2 style="color:green;margin:0;">${T.hero}</h2></td>
        <td style="text-align:right;">
          <img src="${logoUrl}" alt="Logo" style="height:45px;display:block;" />
        </td>
      </tr>
    </table>

    <div style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;line-height:1.4;">
      <p style="margin:2px 0;"><strong>${T.folio}:</strong> ${datos.folio}</p>
      <p style="margin:2px 0;"><strong>${T.name}:</strong> ${datos.nombre_cliente}</p>
      <p style="margin:2px 0;"><strong>${T.email}:</strong> ${datos.correo_cliente}</p>
      <p style="margin:2px 0;"><strong>${T.phone}:</strong> ${datos.telefono_cliente || '-'}</p>

      <p style="margin:2px 0;"><strong>${T.activity}:</strong> ${activityLine}</p>

      ${isPAX ? paxBlockHTML : `${precioAdultoHTML}${precioNinoHTML}${duracionHTML}`}

      ${comboSelectionHTML}

      <p style="margin:2px 0;"><strong>${T.total}:</strong> $${money(datos.total_pago)} ${datos.moneda}</p>
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

    <div style="background-color:#fff3cd;border-left:6px solid #ffa500;padding:8px 12px;margin-top:14px;border-radius:5px;line-height:1.3;">
      <strong style="color:#b00000;">${T.recommendationsTitle}</strong>
      <span style="color:#333;">${T.recommendationsBody}</span>
    </div>

    <p style="margin-top:14px;font-size:14px;color:#555;line-height:1.3;">
      &#128231; ${T.sentTo}: <a href="mailto:${datos.correo_cliente}" style="color:#1b6ef3;text-decoration:none;">${datos.correo_cliente}</a>
    </p>

    ${firmaCTS}
  `.trim();

  const mensajeHTML = `
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

  const subject = (T.subject || STR.es.subject)(datos.folio || '');

  // HTML básico SIN fondo gris
  const htmlDoc = `
<!DOCTYPE html>
<html lang="${LANG}">
<head>
  <meta charset="UTF-8" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;">
  ${mensajeHTML}
</body>
</html>
  `.trim();

  return { subject, html: htmlDoc };
}
